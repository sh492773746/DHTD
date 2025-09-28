#!/usr/bin/env node

/**
 * Migration script: sync tenant profile stats from global profiles.
 *
 * Summary
 * -------
 *   - Scans all tenant Turso databases via listAllDatabases (requires TURSO_API_TOKEN).
 *   - Skips the global DB (id 0) and any database without tenant metadata.
 *   - For each tenant profile row, copies the identity + points from the global
 *     profiles table. If a global profile is missing, logs and skips.
 *   - Writes a verification report (before/after snapshot) into the target dir.
 *
 * Usage
 * -----
 *   TURSO_GLOBAL_URL=libsql://... \
 *   TURSO_GLOBAL_AUTH_TOKEN=... \
 *   TURSO_API_TOKEN=... TURSO_ORG=... \
 *   node tools/migrate-tenant-profiles.js --outDir=./migration-logs
 *
 * Environment
 * -----------
 *   TURSO_GLOBAL_URL           libsql URL for tenantId=0 (global DB)
 *   TURSO_GLOBAL_AUTH_TOKEN    auth token for the global DB
 *   TURSO_DATABASE_URL         (optional) overriding base URL for tenants
 *   TURSO_DATABASE_AUTH_TOKEN  (optional) token for tenants (if shared)
 *   TURSO_API_TOKEN            Turso API token for discovering tenant DBs
 *   TURSO_ORG                  (optional) org slug for the API (improves lookup)
 *
 * Command Flags
 * -------------
 *   --outDir=./logs           Where to write JSON reports (default: ./migration-logs)
 *   --tenant=3                Only migrate specific tenantId(s) (comma-separated)
 *   --dry-run=true            Do not persist changes; only produce diff report
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { createClient } from '@libsql/client';
import 'dotenv/config';

import { listAllDatabases } from '../server/tursoApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const map = {};
  for (const arg of args) {
    const [rawKey, rawValue] = arg.split('=');
    const key = rawKey.replace(/^--/, '');
    map[key] = rawValue === undefined ? true : rawValue;
  }
  return map;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function isGlobalDatabase(dbName = '') {
  if (!dbName) return false;
  return /tenant0/i.test(dbName) || /global/i.test(dbName) || /main/i.test(dbName);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mapRowToCamel(row = {}) {
  const out = {};
  for (const key of Object.keys(row)) {
    const camel = key.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
    out[camel] = row[key];
  }
  return out;
}

function sanitizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function main() {
  const args = parseArgs();
  const outDir = path.resolve(process.cwd(), args.outDir || 'migration-logs');
  const dryRun = args['dry-run'] === 'true' || args['dryRun'] === 'true' || args['dry-run'] === true;
  const onlyTenantArg = args.tenant || args.tenants || '';
  const onlyTenants = onlyTenantArg
    ? new Set(String(onlyTenantArg).split(',').map(x => Number(x.trim())).filter(n => Number.isInteger(n) && n >= 0))
    : null;

  ensureDir(outDir);

  const globalUrl = process.env.TURSO_GLOBAL_URL || process.env.TURSO_DATABASE_URL;
  const globalToken = process.env.TURSO_GLOBAL_AUTH_TOKEN || process.env.TURSO_DATABASE_AUTH_TOKEN;
  if (!globalUrl || !globalToken) {
    console.error('[x] Missing TURSO_GLOBAL_URL or TURSO_GLOBAL_AUTH_TOKEN');
    process.exit(1);
  }

  const globalClient = createClient({ url: globalUrl, authToken: globalToken });

  const dbList = await listAllDatabases();
  if (!Array.isArray(dbList) || dbList.length === 0) {
    console.error('[x] listAllDatabases() returned empty; ensure TURSO_API_TOKEN/TURSO_ORG are set');
    process.exit(2);
  }

  let processed = 0;
  let written = 0;
  let skipped = 0;
  const summary = [];

  for (const db of dbList) {
    const name = db?.name || db?.Name || '';
    const hostname = db?.hostname || db?.Hostname || '';
    if (!name || !hostname) continue;

    if (isGlobalDatabase(name)) {
      console.log(`[skip] ${name} appears to be the global database`);
      skipped++;
      continue;
    }

    const tenantMatch = name.match(/tenant[-_]?([0-9]+)/i);
    const tenantId = tenantMatch ? Number(tenantMatch[1]) : null;
    if (!tenantId || tenantId === 0) {
      console.log(`[skip] ${name} has no tenantId pattern`);
      skipped++;
      continue;
    }
    if (onlyTenants && !onlyTenants.has(tenantId)) {
      console.log(`[skip] ${name} not in filter list`);
      skipped++;
      continue;
    }

    const tenantUrl = `libsql://${hostname}`;
    const tenantToken = process.env[`TURSO_TENANT_${tenantId}_AUTH_TOKEN`] || process.env.TURSO_DATABASE_AUTH_TOKEN;
    if (!tenantToken) {
      console.warn(`[warn] Missing auth token for tenant ${tenantId} (${name}); skipping`);
      skipped++;
      continue;
    }

    console.log(`
[tenant ${tenantId}] ${tenantUrl}`);
    processed++;

    const tenantClient = createClient({ url: tenantUrl, authToken: tenantToken });

    const beforeRows = await tenantClient.execute(`
      SELECT id, username, points, virtual_currency, free_posts_count, updated_at
      FROM profiles
      ORDER BY id ASC
    `);
    const before = beforeRows.rows.map(mapRowToCamel);

    if (before.length === 0) {
      console.log('  -> no profiles in tenant; skipping');
      summary.push({ tenantId, rowsMigrated: 0, missingGlobal: 0, skipped: true });
      continue;
    }

    const migrated = [];
    let missingGlobalCount = 0;

    for (const row of before) {
      const userId = row.id;
      if (!userId) continue;

      const res = await globalClient.execute({
        sql: `SELECT id, username, avatar_url, points, virtual_currency, free_posts_count, updated_at, invitation_points FROM profiles WHERE id = ? LIMIT 1`,
        args: [userId],
      });
      const global = res.rows.length ? mapRowToCamel(res.rows[0]) : null;
      if (!global) {
        missingGlobalCount++;
        console.warn(`  [warn] user ${userId} has no global profile; leaving tenant row unchanged`);
        continue;
      }

      const updates = {
        username: global.username ?? row.username ?? '用户',
        avatar_url: global.avatarUrl ?? row.avatarUrl ?? null,
        points: sanitizeNumber(global.points, 0),
        virtual_currency: sanitizeNumber(global.virtualCurrency, 0),
        invitation_points: sanitizeNumber(global.invitationPoints, row.invitationPoints ?? 0),
        free_posts_count: sanitizeNumber(global.freePostsCount, row.freePostsCount ?? 0),
        updated_at: new Date().toISOString(),
      };

      migrated.push({ id: userId, updates, previous: row });

      if (!dryRun) {
        await tenantClient.execute({
          sql: `
            UPDATE profiles
            SET username = ?, avatar_url = ?, points = ?, virtual_currency = ?, invitation_points = ?, free_posts_count = ?, updated_at = ?
            WHERE id = ?
          `,
          args: [
            updates.username,
            updates.avatar_url,
            updates.points,
            updates.virtual_currency,
            updates.invitation_points,
            updates.free_posts_count,
            updates.updated_at,
            userId,
          ],
        });
      }
    }

    const afterRows = dryRun
      ? beforeRows
      : await tenantClient.execute(`
          SELECT id, username, points, virtual_currency, free_posts_count, updated_at
          FROM profiles
          ORDER BY id ASC
        `);
    const after = afterRows.rows.map(mapRowToCamel);

    const report = {
      tenantId,
      dryRun,
      processed: before.length,
      migrated: migrated.length,
      missingGlobal: missingGlobalCount,
      before,
      after,
    };

    const reportPath = path.join(outDir, `tenant-${tenantId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    written++;
    summary.push({ tenantId, rowsMigrated: migrated.length, missingGlobal: missingGlobalCount, reportPath });

    await tenantClient.close();
    await sleep(100);
  }

  await globalClient.close();

  const summaryPath = path.join(outDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ processed, written, skipped, summary }, null, 2));

  console.log('\n=== Migration summary ===');
  console.log(JSON.stringify({ processed, written, skipped, summary }, null, 2));
  console.log(`Reports written to: ${summaryPath}`);

  if (dryRun) {
    console.log('\nDry run completed. Rerun with --dry-run=false to apply changes.');
  }
}

main().catch((err) => {
  console.error('[x] Migration failed:', err);
  process.exit(1);
});


