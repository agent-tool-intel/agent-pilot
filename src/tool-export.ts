import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';
import { ToolExportInput, toMCPResponse, type ToolRow } from './types.js';

export async function handleToolExport(args: unknown) {
  const input = ToolExportInput.parse(args);
  const db = getDb();

  let rows: ToolRow[];
  if (input.include_deprecated) {
    rows = db.prepare('SELECT * FROM tools ORDER BY name').all() as ToolRow[];
  } else {
    rows = db.prepare(
      "SELECT * FROM tools WHERE description NOT LIKE '[DEPRECATED]%' ORDER BY name"
    ).all() as ToolRow[];
  }

  const tools = rows.map(r => ({
    name: r.name,
    description: r.description,
    schema: r.schema,
    provider: r.provider,
    tags: (r.tags || '').split(',').filter(Boolean),
    created_at: r.created_at,
  }));

  const absPath = path.resolve(input.filepath);
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(tools, null, 2), 'utf-8');

  return toMCPResponse({
    exported_to: absPath,
    tool_count: tools.length,
  });
}
