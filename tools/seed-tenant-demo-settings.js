#!/usr/bin/env node

/**
 * Seed demo settings for a tenant: site_name + site_logo
 * Usage:
 *   node tools/seed-tenant-demo-settings.js --host=https://your-domain --tenantId=123 --token=JWT \
 *     [--name="演示站点名"] [--logo=https://picsum.photos/300/100]
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

function parseArgs() {
  const args = process.argv.slice(2);
  const map = {};
  for (const a of args) {
    const [k, v] = a.split('=');
    map[k.replace(/^--/, '')] = v || true;
  }
  return map;
}

function requestJson(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, text: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const args = parseArgs();
  const host = (args.host || 'http://localhost:5173').replace(/\/?$/, '');
  const token = args.token || '';
  const tenantId = Number(args.tenantId || 0);
  const name = args.name || '演示站点名';
  const logo = args.logo || 'https://picsum.photos/320/120';
  if (!tenantId) {
    console.error('[x] tenantId is required');
    process.exit(1);
  }
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const postUrl = `${host}/api/admin/settings`;
  console.log(`[i] POST ${postUrl}`);
  const res = await requestJson('POST', postUrl, {
    headers,
    body: {
      tenantId,
      updates: [
        { key: 'site_name', value: name, type: 'text', name: '站点名称' },
        { key: 'site_logo', value: logo, type: 'image', name: '站点 Logo' },
      ],
    },
  });
  console.log('[i] status:', res.status);
  console.log('[i] body:', res.json || res.text);

  const getUrl = `${host}/api/admin/settings?tenantId=${tenantId}`;
  const verify = await requestJson('GET', getUrl, { headers });
  console.log('\n--- verify ---');
  console.log('status:', verify.status);
  if (verify.json) {
    const map = Object.fromEntries((verify.json || []).map(r => [r.key, r.value]));
    console.log('site_name:', map.site_name);
    console.log('site_logo:', map.site_logo);
  } else {
    console.log(verify.text);
  }
})(); 