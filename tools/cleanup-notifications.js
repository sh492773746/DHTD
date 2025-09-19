import { createClient } from '@libsql/client';

function safeParseJSON(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizeContent(raw) {
  // Returns { fixed: string | null, reason: string | null }
  // fixed is a JSON string for the normalized object, or null if no change.
  if (raw == null) {
    const obj = { type: 'system', message: '' };
    return { fixed: JSON.stringify(obj), reason: 'null->object' };
  }
  if (typeof raw !== 'string') {
    // Unexpected non-string: stringify object if possible
    try {
      const obj = raw && typeof raw === 'object' ? raw : { type: 'system', message: String(raw) };
      return { fixed: JSON.stringify(obj), reason: 'non-string->object' };
    } catch {
      return { fixed: JSON.stringify({ type: 'system', message: '' }), reason: 'non-string-fallback' };
    }
  }
  const s = raw.trim();
  if (s.length === 0) {
    return { fixed: JSON.stringify({ type: 'system', message: '' }), reason: 'empty->object' };
  }
  if (s === '[object Object]' || s === 'object Object' || s === 'Object object') {
    return { fixed: JSON.stringify({ type: 'system', message: '' }), reason: 'object-toString' };
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    const parsed = safeParseJSON(s);
    if (!parsed) {
      return { fixed: JSON.stringify({ type: 'system', message: s }), reason: 'invalid-json' };
    }
    if (typeof parsed === 'string') {
      return { fixed: JSON.stringify({ type: 'system', message: parsed }), reason: 'json-string->object' };
    }
    // Already an object, keep as-is
    return { fixed: null, reason: null };
  }
  // Try parse JSON string of string
  const maybe = safeParseJSON(s);
  if (typeof maybe === 'string') {
    return { fixed: JSON.stringify({ type: 'system', message: maybe }), reason: 'stringified-string->object' };
  }
  // Treat as plain message
  return { fixed: JSON.stringify({ type: 'system', message: s }), reason: 'plain->object' };
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const url = process.env.TURSO_PRIMARY_URL || process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error('Missing TURSO_PRIMARY_URL/TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
    process.exit(1);
  }
  const client = createClient({ url, authToken });

  // Fetch notifications
  const res = await client.execute("select id, content from notifications order by id asc");
  const rows = res?.rows || [];

  let total = 0;
  let toFix = 0;
  let applied = 0;

  for (const row of rows) {
    total++;
    const id = row.id;
    const content = row.content;
    const { fixed, reason } = normalizeContent(content);
    if (fixed !== null) {
      toFix++;
      if (APPLY) {
        await client.execute({ sql: "update notifications set content = ? where id = ?", args: [fixed, id] });
        applied++;
      } else {
        // Dry-run: print minimal preview
        let preview = '';
        try { preview = JSON.stringify(JSON.parse(fixed)); } catch { preview = fixed; }
        console.log(`[DRY-RUN] id=${id} reason=${reason} -> ${preview}`);
      }
    }
  }

  if (APPLY) {
    console.log(`Processed ${total} rows, fixed ${applied}.`);
  } else {
    console.log(`Dry-run complete. Total ${total}, needs-fix ${toFix}. Use --apply to write changes.`);
  }
}

main().catch((e) => {
  console.error('Cleanup failed:', e);
  process.exit(1);
}); 