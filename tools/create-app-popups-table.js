#!/usr/bin/env node

/**
 * Migration script: Create app_popups table in Turso databases
 * 
 * This script creates the app_popups table in all tenant databases (including global).
 * 
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node tools/create-app-popups-table.js
 * 
 * Or with API token to migrate all tenants:
 *   TURSO_API_TOKEN=... TURSO_ORG=... node tools/create-app-popups-table.js
 */

import 'dotenv/config';
import { createClient } from '@libsql/client';
import { listAllDatabases } from '../server/tursoApi.js';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_popups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 0,
  title TEXT,
  content TEXT,
  background_image TEXT,
  button_text TEXT,
  button_url TEXT,
  "order" INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
`;

async function createTableInDatabase(url, token, dbName = 'database') {
  console.log(`\n📦 Processing ${dbName}...`);
  
  try {
    const client = createClient({ url, authToken: token });
    
    // Check if table exists
    const checkResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='app_popups'"
    );
    
    if (checkResult.rows.length > 0) {
      console.log(`  ✅ Table 'app_popups' already exists in ${dbName}`);
      return { success: true, existed: true };
    }
    
    // Create table
    await client.execute(CREATE_TABLE_SQL);
    console.log(`  ✅ Successfully created 'app_popups' table in ${dbName}`);
    
    // Verify creation
    const verifyResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='app_popups'"
    );
    
    if (verifyResult.rows.length === 0) {
      throw new Error('Table creation verification failed');
    }
    
    return { success: true, existed: false };
  } catch (error) {
    console.error(`  ❌ Error in ${dbName}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Starting app_popups table migration...\n');
  
  const results = [];
  
  // Method 1: Use direct database URL (for single database)
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    console.log('📍 Mode: Single database (using TURSO_DATABASE_URL)');
    const result = await createTableInDatabase(
      process.env.TURSO_DATABASE_URL,
      process.env.TURSO_AUTH_TOKEN,
      'Primary Database'
    );
    results.push({ name: 'Primary Database', ...result });
  }
  
  // Also try primary URL if exists
  if (process.env.TURSO_PRIMARY_URL && process.env.TURSO_AUTH_TOKEN) {
    console.log('📍 Mode: Primary database (using TURSO_PRIMARY_URL)');
    const result = await createTableInDatabase(
      process.env.TURSO_PRIMARY_URL,
      process.env.TURSO_AUTH_TOKEN,
      'Primary Database (TURSO_PRIMARY_URL)'
    );
    results.push({ name: 'Primary Database (TURSO_PRIMARY_URL)', ...result });
  }
  
  // Method 2: Use API to find all tenant databases
  if (process.env.TURSO_API_TOKEN) {
    console.log('\n📍 Mode: All tenant databases (using TURSO_API_TOKEN)');
    
    try {
      const databases = await listAllDatabases();
      console.log(`Found ${databases.length} databases\n`);
      
      for (const db of databases) {
        const dbName = db.name || `tenant-${db.tenantId || 'unknown'}`;
        
        if (!db.url || !db.token) {
          console.log(`  ⚠️  Skipping ${dbName}: missing credentials`);
          continue;
        }
        
        const result = await createTableInDatabase(db.url, db.token, dbName);
        results.push({ name: dbName, tenantId: db.tenantId, ...result });
      }
    } catch (error) {
      console.error('\n❌ Error listing databases:', error.message);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY\n');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const existed = successful.filter(r => r.existed);
  const created = successful.filter(r => !r.existed);
  
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`  📋 Already existed: ${existed.length}`);
  console.log(`  🆕 Newly created: ${created.length}`);
  console.log(`❌ Failed: ${failed.length}\n`);
  
  if (created.length > 0) {
    console.log('🆕 Newly created tables in:');
    created.forEach(r => console.log(`  - ${r.name}`));
    console.log('');
  }
  
  if (failed.length > 0) {
    console.log('❌ Failed databases:');
    failed.forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    console.log('');
  }
  
  console.log('='.repeat(60));
  
  if (results.length === 0) {
    console.log('\n⚠️  No databases were processed!');
    console.log('\nPlease set one of the following environment variable sets:');
    console.log('  1. TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (for single database)');
    console.log('  2. TURSO_API_TOKEN (+ optional TURSO_ORG) (for all tenant databases)');
    console.log('\nExample:');
    console.log('  TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node tools/create-app-popups-table.js');
    process.exit(1);
  }
  
  if (failed.length > 0) {
    process.exit(1);
  }
  
  console.log('\n✅ Migration completed successfully!');
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});

