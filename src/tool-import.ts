import fs from 'fs';
import { getDb } from './db.js';
import { ToolImportInput, toMCPResponse, type ToolImportEntry } from './types.js';

function validateEntry(entry: unknown, index: number): { valid: true; entry: ToolImportEntry } | { valid: false; error: string } {
  if (!entry || typeof entry !== 'object') {
    return { valid: false, error: `Entry at index ${index}: not a valid object` };
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.name !== 'string' || !e.name) {
    return { valid: false, error: `Entry at index ${index}: missing or invalid "name"` };
  }
  if (typeof e.description !== 'string' || !e.description) {
    return { valid: false, error: `Entry at index ${index}: missing or invalid "description"` };
  }
  if (typeof e.schema !== 'string' || !e.schema) {
    return { valid: false, error: `Entry at index ${index}: missing or invalid "schema"` };
  }
  if (typeof e.provider !== 'string' || !e.provider) {
    return { valid: false, error: `Entry at index ${index}: missing or invalid "provider"` };
  }
  return {
    valid: true,
    entry: {
      name: e.name,
      description: e.description,
      schema: e.schema,
      provider: e.provider,
      tags: Array.isArray(e.tags) ? e.tags.filter((t: unknown) => typeof t === 'string' && !(t as string).includes(',')) : undefined,
      created_at: typeof e.created_at === 'string' ? e.created_at : undefined,
    },
  };
}

export async function handleToolImport(args: unknown) {
  const input = ToolImportInput.parse(args);

  let raw: unknown;
  try {
    const content = fs.readFileSync(input.filepath, 'utf-8');
    raw = JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return toMCPResponse({ imported: 0, skipped: 0, errors: [`Failed to read or parse file: ${message}`] });
  }

  if (!Array.isArray(raw)) {
    return toMCPResponse({ imported: 0, skipped: 0, errors: ['File content is not a JSON array'] });
  }

  const entries: { entry: ToolImportEntry; index: number }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const result = validateEntry(raw[i], i);
    if (result.valid) {
      entries.push({ entry: result.entry, index: i });
    } else {
      errors.push(result.error);
    }
  }

  if (entries.length === 0) {
    return toMCPResponse({ imported: 0, skipped: errors.length, errors });
  }

  const db = getDb();

  const runImport = db.transaction((items: { entry: ToolImportEntry; index: number }[]) => {
    if (input.mode === 'replace') {
      try {
        db.prepare('DELETE FROM tools_fts').run();
      } catch {
        // FTS5 not available
      }
      db.prepare('DELETE FROM tools').run();
    }

    const upsert = db.prepare(
      'INSERT OR REPLACE INTO tools (name, description, schema, provider, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );

    let imported = 0;
    for (const { entry } of items) {
      const tags = (entry.tags || []).join(',');
      const created_at = entry.created_at || new Date().toISOString();
      upsert.run(entry.name, entry.description, entry.schema, entry.provider, tags, created_at);

      try {
        db.prepare(
          'DELETE FROM tools_fts WHERE rowid = (SELECT rowid FROM tools WHERE name = ?)'
        ).run(entry.name);
        db.prepare(
          'INSERT INTO tools_fts (rowid, name, description, tags) VALUES ((SELECT rowid FROM tools WHERE name = ?), ?, ?, ?)'
        ).run(entry.name, entry.name, entry.description, tags);
      } catch {
        // FTS5 not available
      }

      imported++;
    }
    return imported;
  });

  const imported = runImport(entries);

  return toMCPResponse({ imported, skipped: errors.length, errors });
}
