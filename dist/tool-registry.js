import { getDb } from './db.js';
import { ToolRegisterInput, ToolSearchInput, ToolUpdateInput, ToolDeprecateInput, toMCPResponse } from './types.js';
export async function handleToolRegister(args) {
    const input = ToolRegisterInput.parse(args);
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('INSERT OR REPLACE INTO tools (name, description, schema, provider, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(input.name, input.description, input.schema, input.provider, input.tags.join(','), now);
    try {
        db.prepare('INSERT INTO tools_fts (rowid, name, description, tags) VALUES ((SELECT rowid FROM tools WHERE name = ?), ?, ?, ?)').run(input.name, input.description, input.tags.join(','));
    }
    catch {
        // FTS5 not available
    }
    return toMCPResponse({
        name: input.name,
        description: input.description,
        provider: input.provider,
        tags: input.tags,
        created_at: now,
    });
}
export async function handleToolUpdate(args) {
    const input = ToolUpdateInput.parse(args);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM tools WHERE name = ?').get(input.name);
    if (!existing) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Tool not found: ' + input.name }) }], isError: true };
    }
    const description = input.description ?? existing.description;
    const schema = input.schema ?? existing.schema;
    const provider = input.provider ?? existing.provider;
    const tags = input.tags ?? (existing.tags || '').split(',').filter(Boolean);
    db.prepare('INSERT OR REPLACE INTO tools (name, description, schema, provider, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(input.name, description, schema, provider, tags.join(','), existing.created_at);
    const searchableChanged = input.description !== undefined || input.tags !== undefined;
    if (searchableChanged) {
        try {
            db.prepare('DELETE FROM tools_fts WHERE rowid = (SELECT rowid FROM tools WHERE name = ?)').run(input.name);
            db.prepare('INSERT INTO tools_fts (rowid, name, description, tags) VALUES ((SELECT rowid FROM tools WHERE name = ?), ?, ?, ?)').run(input.name, description, tags.join(','));
        }
        catch {
            // FTS5 not available
        }
    }
    return toMCPResponse({
        name: input.name,
        description,
        schema,
        provider,
        tags,
        created_at: existing.created_at,
    });
}
export async function handleToolSearch(args) {
    const input = ToolSearchInput.parse(args);
    const db = getDb();
    let results;
    try {
        const ftsQuery = input.query
            .replace(/[^a-zA-Z0-9_ -]/g, ' ')
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 0)
            .map((w) => '"' + w + '"')
            .join(' OR ');
        if (!ftsQuery) {
            return toMCPResponse({ results: [] });
        }
        results = db.prepare('SELECT t.*, f.rank AS relevance_score FROM tools_fts f JOIN tools t ON t.rowid = f.rowid WHERE tools_fts MATCH ? ORDER BY rank LIMIT ?').all(ftsQuery, input.limit);
        const maxRank = results.length > 0 ? Math.max(...results.map((r) => r.relevance_score || 0)) : 1;
        results.forEach((r) => {
            r.relevance_score = maxRank > 0 ? Math.round((r.relevance_score || 0) / maxRank * 100) / 100 : 1.0;
        });
    }
    catch {
        const like = '%' + input.query + '%';
        results = db.prepare('SELECT *, 1.0 AS relevance_score FROM tools WHERE name LIKE ? OR description LIKE ? OR tags LIKE ? LIMIT ?').all(like, like, like, input.limit);
    }
    if (input.tags && input.tags.length > 0) {
        results = results.filter((r) => {
            const toolTags = (r.tags || '').split(',').map((t) => t.trim().toLowerCase());
            return input.tags.some((reqTag) => toolTags.includes(reqTag.toLowerCase()));
        });
    }
    return toMCPResponse({
        results: results.slice(0, input.limit).map((r) => ({
            name: r.name,
            description: r.description,
            schema: r.schema,
            provider: r.provider,
            tags: (r.tags || '').split(',').filter(Boolean),
            relevance_score: r.relevance_score || 1.0,
        })),
    });
}
export async function handleToolDeprecate(args) {
    const input = ToolDeprecateInput.parse(args);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM tools WHERE name = ?').get(input.name);
    if (!existing) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Tool not found: ' + input.name }) }], isError: true };
    }
    const deprecationPrefix = '[DEPRECATED]';
    let newDescription = existing.description;
    if (!newDescription.startsWith(deprecationPrefix)) {
        newDescription = `${deprecationPrefix} ${newDescription}`;
    }
    if (input.replacement) {
        const replacementSuffix = `Replacement: ${input.replacement}`;
        if (!newDescription.includes(replacementSuffix)) {
            newDescription = `${newDescription} ${replacementSuffix}`;
        }
    }
    db.prepare('UPDATE tools SET description = ? WHERE name = ?').run(newDescription, input.name);
    try {
        db.prepare('DELETE FROM tools_fts WHERE rowid = (SELECT rowid FROM tools WHERE name = ?)').run(input.name);
    }
    catch {
        // FTS5 not available
    }
    const tags = (existing.tags || '').split(',').filter(Boolean);
    return toMCPResponse({
        name: existing.name,
        description: newDescription,
        schema: existing.schema,
        provider: existing.provider,
        tags,
        created_at: existing.created_at,
        ...(input.replacement ? { replacement: input.replacement } : {}),
    });
}
export async function handleToolStats(_args) {
    const db = getDb();
    const statsRow = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN description LIKE '[DEPRECATED]%' THEN 1 ELSE 0 END) as deprecated FROM tools").get();
    const total = Number(statsRow.total);
    const deprecated = Number(statsRow.deprecated);
    const active = total - deprecated;
    const perProvider = db.prepare('SELECT provider, COUNT(*) as count FROM tools GROUP BY provider ORDER BY count DESC').all();
    const allTags = db.prepare('SELECT tags FROM tools').all();
    const tagCounts = new Map();
    for (const row of allTags) {
        const tags = (row.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
        for (const tag of tags) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
    }
    const topTags = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    const recentlyAdded = db.prepare('SELECT name, provider, tags, created_at FROM tools ORDER BY created_at DESC LIMIT 5').all();
    return toMCPResponse({
        total,
        deprecated,
        active,
        per_provider: perProvider,
        top_tags: topTags,
        recently_added: recentlyAdded.map((r) => ({
            name: r.name,
            provider: r.provider,
            tags: (r.tags || '').split(',').filter(Boolean),
            created_at: r.created_at,
        })),
    });
}
