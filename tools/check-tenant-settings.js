#!/usr/bin/env node

/**
 * Quick checker for tenant settings visibility
 * Usage:
 *   node tools/check-tenant-settings.js --host=https://your-tenant-domain --token=SUPABASE_JWT --tenantId=123
 * Notes:
 *   - host: base URL that serves the app (defaults to http://localhost:5173)
 *   - token: bearer JWT for an admin/tenant-admin session
 *   - tenantId: numeric tenant id to check
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

function parseArgs() {
  const args = process.argv.slice(2);
  const map = {};
  for (const a of args) {
    const [k, v] = a.split("=");
    const key = k.replace(/^--/, '');
    map[key] = v || true;
  }
  return map;
}

function fetchJson(url, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'GET',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return resolve({ __error: `${res.statusCode} ${data}` });
        }
        try { resolve(JSON.parse(data)); } catch { resolve({ __error: 'invalid-json', raw: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const args = parseArgs();
  const host = (args.host || 'http://localhost:5173').replace(/\/?$/, '');
  const token = args.token || '';
  const tenantId = Number(args.tenantId || 0);
  if (!tenantId) {
    console.error('[x] tenantId is required');
    process.exit(1);
  }

  const base = host;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const url = `${base}/api/admin/settings?tenantId=${tenantId}`;
  console.log(`[i] GET ${url}`);
  const rows = await fetchJson(url, { headers });
  if (rows.__error) {
    console.error('[x] settings fetch failed:', rows.__error);
    process.exit(2);
  }

  const map = {};
  for (const r of rows || []) map[r.key] = r;
  const keys = ['site_name','site_logo','site_description'];
  const report = keys.map(k => `${k}: ${map[k] ? (map[k].value || '(empty)') : '(missing)'}`).join('\n');
  console.log('--- settings snapshot ---');
  console.log(report);

  const faviconUrl = map.site_favicon?.value || map.site_logo?.value || '';
  console.log('favicon candidate:', faviconUrl || '(none)');

  console.log('\nTroubleshooting:');
  console.log('- 如果 site_name/site_logo 缺失，确认后端 defaultSettingsDefs 是否包含它们');
  console.log('- 若返回正常但前端仍不显示，确认组件使用优先级：site_logo > logo_url');
  console.log("- 在浏览器控制台运行: document.querySelector(\"link[rel='icon']\")?.href 查看 Favicon 是否被动态注入");
})(); 