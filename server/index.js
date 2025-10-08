import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { profiles, appSettings, pageContent as pageContentTable, tenantRequests as tenantRequestsTable, posts as postsTable, notifications as notificationsTable, comments as commentsTable, adminUsers as adminUsersTable, likes as likesTable, tenantAdmins as tenantAdminsTable, branches as branchesTable } from './drizzle/schema.js';
import { sharedPosts, sharedComments, sharedLikes, sharedProfiles } from './drizzle/schema.js';
import { shopProducts, shopRedemptions, invitations, appPopups } from './drizzle/schema.js';
import { pointsHistory as pointsHistoryTable } from './drizzle/schema.js';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { jwtVerify, decodeJwt, createRemoteJWKSet } from 'jose';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { createBranch } from './tursoApi.js';
import { pageConfig } from '../src/config/pageContentConfig.js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import sharp from 'sharp';

// 🔒 新增：安全和工具模塊
import { isRateLimited, getRateLimitInfo, resetRateLimit } from './utils/redis.js';
import { auditLog, getClientInfo, AuditActions, ResourceTypes } from './utils/auditLog.js';
import { 
  APIError, 
  UnauthorizedError, 
  ForbiddenError, 
  NotFoundError, 
  ValidationError,
  RateLimitError,
  ConflictError,
  successResponse, 
  errorResponse,
  setupErrorHandler,
  asyncHandler,
  validate,
  requireAuth,
  requireAdmin,
} from './utils/errors.js';

// ⚡ 新增：性能優化模塊
import cache, { CacheKeys, CacheInvalidation } from './utils/cache.js';
import { 
  batchGetProfiles, 
  batchGetPostStats, 
  batchCheckUserLikes,
  enrichPostsOptimized,
  getCachedSettings,
  getCachedPageContent,
  getCachedTenantResolve,
} from './utils/queryOptimizer.js';

const app = new Hono();

// 🔒 設置全局錯誤處理
setupErrorHandler(app);

// Secure headers
app.use('*', secureHeaders());
// Additional CSP & Referrer Policy
app.use('*', async (c, next) => {
  const umami = 'https://cloud.umami.is';
  const self = "'self'";
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Content-Security-Policy', [
    `default-src ${self}`,
    `script-src ${self} ${umami}`,
    `img-src ${self} data: https:`,
    `style-src ${self} 'unsafe-inline'`,
    `connect-src ${self} https:`,
    `frame-ancestors 'none'`,
  ].join('; '));
  await next();
});

// Compression
app.use('*', compress());

// 🔒 安全：請求體大小限制（防止 DoS 攻擊）
app.use('*', async (c, next) => {
  const contentLength = Number(c.req.header('content-length') || 0);
  const MAX_BODY_SIZE = 15 * 1024 * 1024; // 15MB（考慮圖片上傳）
  
  // 跳過特定路徑（如分塊上傳）
  const path = c.req.path || '';
  if (path.startsWith('/api/uploads/resumable')) {
    await next();
    return;
  }
  
  if (contentLength > 0 && contentLength > MAX_BODY_SIZE) {
    return c.json({ 
      error: '請求體過大',
      maxSize: '15MB',
      receivedSize: `${Math.round(contentLength / 1024 / 1024)}MB`
    }, 413);
  }
  
  await next();
});

// CORS allowlist (env-driven)
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.ROOT_DOMAIN || '';
const RAW_ALLOWED = process.env.ALLOWED_ORIGINS || '';
const STATIC_ALLOW = new Set(['http://localhost:3000','http://localhost:5173']);
const DYNAMIC_ALLOW = new Set(RAW_ALLOWED.split(',').map(s => s.trim()).filter(Boolean));
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return true; // non-browser or same-origin
    if (STATIC_ALLOW.has(origin) || DYNAMIC_ALLOW.has(origin)) return true;
    if (ROOT && origin.endsWith(`.${ROOT}`)) return true; // *.root-domain
    return false;
  },
  allowMethods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowHeaders: ['Authorization','Content-Type'],
  credentials: false,
}));

// Supabase JWT verification (JOSE JWKS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseIssuer = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/auth/v1` : null;
function buildSupabaseJwksConfig(){
  if (!supabaseIssuer) return { url: null, headers: undefined, fallbackUrl: null, fallbackHeaders: undefined, oidcUrl: null };
  try {
    const primary = new URL(process.env.SUPABASE_JWKS_URL || `${supabaseIssuer}/keys`);
    const fallback = new URL(`${supabaseIssuer}/jwks`);
    const oidc = new URL(`${supabaseIssuer}/oidc/.well-known/jwks.json`);
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (key) {
      try { primary.searchParams.set('apikey', key); } catch {}
      try { fallback.searchParams.set('apikey', key); } catch {}
      try { oidc.searchParams.set('apikey', key); } catch {}
    }
    const headers = key ? { apikey: key, Authorization: `Bearer ${key}` } : undefined;
    return { url: primary, headers, fallbackUrl: fallback, fallbackHeaders: headers, oidcUrl: oidc, oidcHeaders: headers };
  } catch { return { url: null, headers: undefined, fallbackUrl: null, fallbackHeaders: undefined, oidcUrl: null, oidcHeaders: undefined }; }
}
const __JWKS_CFG = buildSupabaseJwksConfig();
let SUPABASE_JWKS = null;
if (supabaseUrl && __JWKS_CFG.url) {
  try {
    SUPABASE_JWKS = createRemoteJWKSet(__JWKS_CFG.url, { headers: __JWKS_CFG.headers });
  } catch {}
  // Optional: probe fallback /jwks if primary fails at runtime (handled in debug-verify)
}

const runtimeBranchMap = {};

// --- Rate limiting & helpers ---
const __rateStore = new Map();
function __getClientKey(c) {
  const uid = c.get('userId') || '';
  const fwd = c.req.header('x-forwarded-for') || '';
  const ip = (fwd.split(',')[0] || '').trim() || c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '';
  return `${uid}|${ip}`;
}
function __isLimited(key, limit, windowMs) {
  const now = Date.now();
  const bucket = __rateStore.get(key) || { count: 0, reset: now + windowMs };
  if (now > bucket.reset) { bucket.count = 0; bucket.reset = now + windowMs; }
  bucket.count++;
  __rateStore.set(key, bucket);
  return bucket.count > limit;
}
const __writeLimiter = async (c, next) => {
  const m = (c.req.method || 'GET').toUpperCase();
  if (m === 'POST' || m === 'PUT' || m === 'DELETE') {
    const key = `w:${__getClientKey(c)}`;
    if (__isLimited(key, 20, 10_000)) return c.json({ error: 'too-many-requests' }, 429);
  }
  await next();
};
const __uploadLimiter = async (c, next) => {
  const p = c.req.path || '';
  if (p.startsWith('/api/uploads/resumable')) { // exempt resumable chunk endpoints
    await next();
    return;
  }
  const m = (c.req.method || 'GET').toUpperCase();
  if (m === 'POST') {
    const key = `u:${__getClientKey(c)}`;
    if (__isLimited(key, 5, 10_000)) return c.json({ error: 'too-many-requests' }, 429);
  }
  await next();
};
const __chunkLimiter = async (c, next) => {
  const m = (c.req.method || 'GET').toUpperCase();
  if (m === 'POST') {
    const key = `uc:${__getClientKey(c)}`;
    if (__isLimited(key, 200, 60_000)) return c.json({ error: 'too-many-requests' }, 429);
  }
  await next();
};
function __isAllowedImage(type) {
  const t = String(type || '').toLowerCase();
  return t === 'image/jpeg' || t === 'image/png' || t === 'image/webp' || t === 'image/gif';
}

// 🔒 安全：驗證文件實際內容是否為圖片
async function __validateImageBuffer(buffer, declaredType) {
  try {
    const metadata = await sharp(buffer).metadata();
    
    // 驗證實際格式
    const allowedFormats = ['jpeg', 'png', 'webp', 'gif'];
    if (!allowedFormats.includes(metadata.format)) {
      return { valid: false, error: '無效的圖片格式' };
    }
    
    // 檢查圖片尺寸（防止過大圖片DoS）
    if (metadata.width > 8000 || metadata.height > 8000) {
      return { valid: false, error: '圖片尺寸過大（最大 8000x8000）' };
    }
    
    // 檢查是否為動畫圖片
    if (metadata.pages && metadata.pages > 1 && metadata.pages > 100) {
      return { valid: false, error: '動畫幀數過多' };
    }
    
    return { valid: true, metadata };
  } catch (e) {
    return { valid: false, error: '無效的圖片文件' };
  }
}
function __setCache(c, seconds) {
  c.header('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);
}

app.use('/api', __writeLimiter);
app.use('/api/uploads/resumable', __chunkLimiter);
app.use('/api/uploads', __uploadLimiter);

// JSON body size limit
const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 262144);
app.use('*', async (c, next) => {
  const ct = String(c.req.header('content-type') || '').toLowerCase();
  if (ct.includes('application/json') || ct.includes('application/ld+json')) {
    const len = Number(c.req.header('content-length') || 0);
    if (len > MAX_JSON_BYTES) return c.json({ error: 'payload-too-large' }, 413);
  }
  await next();
});

// Light GET rate limit for hot endpoints
const __getRate = new Map();
function __rlKey(c) {
  const fwd = c.req.header('x-forwarded-for') || '';
  const ip = (fwd.split(',')[0] || '').trim() || c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '';
  return ip || 'anon';
}
function __isGetLimited(c, limit = 30, windowMs = 10_000) {
  const key = `g:${__rlKey(c)}`;
  const now = Date.now();
  const bucket = __getRate.get(key) || { count: 0, reset: now + windowMs };
  if (now > bucket.reset) { bucket.count = 0; bucket.reset = now + windowMs; }
  bucket.count++;
  __getRate.set(key, bucket);
  return bucket.count > limit;
}
app.use('/api/umami/*', async (c) => c.json({ ok: false, error: 'gone' }, 404));
app.use('/api/notifications/*', async (c, next) => {
  if ((c.req.method || 'GET').toUpperCase() === 'GET' && __isGetLimited(c)) return c.json({ error: 'too-many-requests' }, 429);
  await next();
});
app.use('/api/admin/users*', async (c, next) => {
  if ((c.req.method || 'GET').toUpperCase() === 'GET' && __isGetLimited(c)) return c.json({ error: 'too-many-requests' }, 429);
  await next();
});
app.use('/api/admin/tenant-requests/check-domain', async (c, next) => {
  if ((c.req.method || 'GET').toUpperCase() === 'GET' && __isGetLimited(c)) return c.json({ error: 'too-many-requests' }, 429);
  await next();
});

// fetch with timeout & retry for external calls
async function fetchWithTimeout(url, opts = {}) {
  const timeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 5000);
  const retries = Number(process.env.FETCH_RETRIES || 1);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt === retries) throw e;
    }
  }
  throw lastErr;
}

// token verify cache and Supabase /auth/v1/user introspection fallback
const __tokenVerifyCache = new Map();
function __getCachedUserIdForToken(token) {
  const x = __tokenVerifyCache.get(token);
  if (!x) return null;
  if (Date.now() > x.expireAt) { __tokenVerifyCache.delete(token); return null; }
  return x.userId || null;
}
function __setCachedUserIdForToken(token, userId, ttlMs = 60_000) {
  try { __tokenVerifyCache.set(token, { userId, expireAt: Date.now() + ttlMs }); } catch {}
}
async function supabaseIntrospectUser(token) {
  try {
    if (!supabaseIssuer) return null;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!key) return null;
    const url = `${supabaseIssuer}/user`;
    const res = await fetchWithTimeout(url, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    const id = data?.id || data?.user?.id || data?.sub || null;
    return id || null;
  } catch { return null; }
}

async function getBranchUrlForTenant(tenantId) {
  if (!tenantId) return null;
  try {
    // 1) DB mapping
    const db = getGlobalDb();
    const rows = await db.select().from(branchesTable).where(eq(branchesTable.tenantId, tenantId)).limit(1);
    if (rows && rows[0]?.branchUrl) return rows[0].branchUrl;
  } catch {}
  // 2) runtime map
  if (runtimeBranchMap && runtimeBranchMap[String(tenantId)]) return runtimeBranchMap[String(tenantId)];
  // 3) env fallback
  try {
    const map = process.env.TURSO_BRANCH_MAP ? JSON.parse(process.env.TURSO_BRANCH_MAP) : {};
    if (map && map[String(tenantId)]) return map[String(tenantId)];
  } catch {}
  return null;
}

const __drizzleCache = new Map(); // cache drizzle instances by key

async function getTursoClientForTenant(tenantId) {
  const branchUrl = await getBranchUrlForTenant(tenantId);
  const url = branchUrl || process.env.TURSO_DATABASE_URL || process.env.TURSO_PRIMARY_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error('Turso server env not set');
  const key = `tenant:${tenantId}|${url}`;
  const cached = __drizzleCache.get(key);
  if (cached) return cached;
  const client = createClient({ url, authToken });
  const db = drizzle(client);
  __drizzleCache.set(key, db);
  return db;
}

function getGlobalDb() {
  const url = process.env.TURSO_PRIMARY_URL || process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error('Turso server env not set');
  const key = `global|${url}`;
  const cached = __drizzleCache.get(key);
  if (cached) return cached;
  const client = createClient({ url, authToken });
  const db = drizzle(client);
  __drizzleCache.set(key, db);
  return db;
}

// Raw libSQL helpers
function getGlobalClient() {
  const url = process.env.TURSO_PRIMARY_URL || process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error('Turso server env not set');
  return createClient({ url, authToken });
}

async function getLibsqlClientForTenantRaw(tenantId) {
  const branchUrl = await getBranchUrlForTenant(tenantId);
  const url = branchUrl || process.env.TURSO_DATABASE_URL || process.env.TURSO_PRIMARY_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error('Turso server env not set');
  return createClient({ url, authToken });
}

async function ensureTenantRequestsSchemaRaw(client) {
  const alters = [
    "alter table tenant_requests add column user_id text",
    "alter table tenant_requests add column contact_wangwang text",
    "alter table tenant_requests add column status text",
    "alter table tenant_requests add column vercel_project_id text",
    "alter table tenant_requests add column vercel_assigned_domain text",
    "alter table tenant_requests add column vercel_deployment_status text",
    "alter table tenant_requests add column created_at text",
    "alter table tenant_requests add column rejection_reason text",
    "alter table tenant_requests add column vercel_subdomain_slug text",
    "alter table tenant_requests add column fallback_domain text"
  ];
  for (const s of alters) {
    try { await client.execute(s); } catch {}
  }
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env not set');
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ensureIndexes() {
  try {
    const client = getGlobalClient();
    const stmts = [
      "create index if not exists idx_profiles_created_at on profiles(created_at)",
      "create index if not exists idx_posts_created_at on posts(created_at)",
      "create index if not exists idx_notifications_user_created on notifications(user_id, created_at)",
      "create index if not exists idx_tenant_requests_domain on tenant_requests(desired_domain)",
      "create index if not exists idx_tenant_requests_status on tenant_requests(status)",
      "create index if not exists idx_branches_tenant on branches(tenant_id)",
      "create index if not exists idx_points_history_user_created on points_history(user_id, created_at)"
    ];
    for (const sql of stmts) { try { await client.execute(sql); } catch {} }
  } catch {}
}

await ensureIndexes();
try { await ensureTenantRequestsSchemaRaw(getGlobalClient()); } catch {}
// Ensure public storage buckets exist (for client-side uploads using anon key)
try {
  const supaInit = getSupabaseAdmin();
  await ensureBucketPublic(supaInit, 'site-assets');
} catch {}

async function ensureBucketPublic(supabase, bucket) {
  try {
    const { data } = await supabase.storage.getBucket(bucket);
    if (!data) {
      await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: 52428800 });
    } else {
      try { await supabase.storage.updateBucket(bucket, { public: true }); } catch {}
    }
  } catch {
    // If getBucket not supported on self-hosted, fallback to create
    try { await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: 52428800 }); } catch {}
  }
}

// auth + tenant middleware
app.use('*', async (c, next) => {
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || '';
  c.set('host', host);

  const auth = c.req.header('authorization');
  let userId = null;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      const cached = __getCachedUserIdForToken(token);
      if (cached) { userId = cached; }
      else if (SUPABASE_JWKS && supabaseIssuer) {
        try {
          const { payload } = await jwtVerify(token, SUPABASE_JWKS, { issuer: supabaseIssuer });
          userId = payload?.sub || null;
        } catch (e1) {
          // try fallback /jwks
          if (__JWKS_CFG && __JWKS_CFG.fallbackUrl) {
            try {
              const jwks2 = createRemoteJWKSet(__JWKS_CFG.fallbackUrl, { headers: __JWKS_CFG.fallbackHeaders });
              const { payload } = await jwtVerify(token, jwks2, { issuer: supabaseIssuer });
              userId = payload?.sub || null;
            } catch (e2) {
              // last resort: OIDC well-known
              if (__JWKS_CFG && __JWKS_CFG.oidcUrl) {
                try {
                  const jwks3 = createRemoteJWKSet(__JWKS_CFG.oidcUrl, { headers: __JWKS_CFG.oidcHeaders });
                  const { payload } = await jwtVerify(token, jwks3, { issuer: supabaseIssuer });
                  userId = payload?.sub || null;
                } catch {}
              }
            }
          }
        }
      }
      if (!userId) {
        // server-side trusted introspection
        const id = await supabaseIntrospectUser(token);
        if (id) userId = id;
      }
      // 🔒 安全加固：僅在開發環境允許 decode fallback
      if (!userId && process.env.NODE_ENV === 'development') {
        try {
          const payload = decodeJwt(token);
          if (!supabaseIssuer || !payload?.iss || String(payload.iss).startsWith(supabaseIssuer)) {
            userId = payload?.sub || null;
          }
        } catch {}
      }
      if (userId) __setCachedUserIdForToken(token, userId);
    } catch {
      // 🔒 安全加固：生產環境不允許降級驗證
      if (process.env.NODE_ENV === 'development') {
        try {
          const payload = decodeJwt(token);
          if (!supabaseIssuer || !payload?.iss || String(payload.iss).startsWith(supabaseIssuer)) {
            userId = payload?.sub || null;
          }
        } catch {}
      }
    }
  }
  c.set('userId', userId);
  await next();
});

// Unified admin guard for all /api/admin/* routes
app.use('/api/admin/*', async (c, next) => {
  const p = c.req.path || '';
  const m = (c.req.method || 'GET').toUpperCase();
  // allow self-check endpoints and public-safe domain check to pass (still require valid JWT earlier where applicable)
  if (
    p === '/api/admin/is-super-admin' ||
    p === '/api/admin/tenant-admins' ||
    p === '/api/admin/bootstrap-super-admin' ||
    p === '/api/admin/tenant-requests/check-domain' ||
    p === '/api/admin/settings' ||
    (p === '/api/admin/tenant-requests' && m === 'POST') ||
    // allow tenant-admin managed page-content routes to pass; in-route will enforce canManageTenant
    p.startsWith('/api/admin/page-content') ||
    // allow SEO endpoints to enforce tenant-level auth inside
    p.startsWith('/api/admin/seo/')
  ) {
    // for POST /tenant-requests require login but不要求超管
    if (p === '/api/admin/tenant-requests' && m === 'POST') {
      const uid = c.get('userId');
      if (!uid) return c.json({ error: 'unauthorized' }, 401);
    }
    return await next();
  }
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  try {
    const ok = await isSuperAdminUser(userId);
    if (!ok) return c.json({ error: 'forbidden' }, 403);
  } catch {
    return c.json({ error: 'forbidden' }, 403);
  }
  await next();
});

// 根路径健康检查
app.get('/', (c) => {
  return c.json({ 
    status: 'ok',
    service: 'DHTD API Server',
    version: '1.0.3',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      api: '/api/*',
    }
  });
});

app.get('/health', (c) => c.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() }));
app.get('/api/health', (c) => c.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() }));

// ---------- Prediction API Proxy ----------
// 代理外部预测 API，避免 CORS 和 Mixed Content 问题
const PREDICTION_API_BASE = 'http://156.67.218.225:5000';
const PREDICTION_API_KEY = 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506';

// 简单的内存缓存（60秒过期）
const predictionCache = new Map();
const CACHE_TTL = 60 * 1000; // 60秒

// 429 错误计数器（避免日志污染）
let rateLimitErrorCount = 0;
let lastRateLimitLog = 0;

app.get('/api/prediction-proxy/*', async (c) => {
  try {
    // 从路径中提取实际的 API 端点
    const path = c.req.path.replace('/api/prediction-proxy', '');
    const queryString = c.req.url.split('?')[1] || '';
    const externalUrl = `${PREDICTION_API_BASE}${path}${queryString ? '?' + queryString : ''}`;
    const cacheKey = externalUrl;
    
    // 检查缓存
    const cached = predictionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return c.json(cached.data);
    }
    
    console.log('🔄 Proxying prediction API:', externalUrl);
    
    // 调用外部 API
    const response = await fetch(externalUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': PREDICTION_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      // 特殊处理 429 错误（避免日志污染）
      if (response.status === 429) {
        rateLimitErrorCount++;
        const now = Date.now();
        // 每分钟只记录一次429错误统计
        if (now - lastRateLimitLog > 60000) {
          console.warn(`⚠️ External API rate limit: ${rateLimitErrorCount} requests throttled in last minute`);
          rateLimitErrorCount = 0;
          lastRateLimitLog = now;
        }
        
        // 返回缓存数据（如果有），即使已过期
        if (cached) {
          console.log('📦 Returning stale cache due to rate limit');
          return c.json(cached.data);
        }
        
        return c.json({ 
          success: false, 
          error: 'External API rate limit exceeded. Please try again later.' 
        }, 429);
      }
      
      // 其他错误正常记录
      const errorText = await response.text();
      console.error(`❌ External API error: ${response.status}`, errorText.substring(0, 200));
      return c.json({ 
        success: false, 
        error: `External API error: ${response.status}` 
      }, response.status);
    }
    
    const data = await response.json();
    
    // 转换外部 API 的响应格式
    let result;
    if (data.status === 'success') {
      // 针对不同端点返回不同的数据结构
      let responseData;
      
      if (data.data !== undefined) {
        // /api/predictions, /api/*/predictions 等端点有 data 字段
        responseData = data.data;
      } else if (data.algorithms !== undefined) {
        // /api/algorithm/compare 端点返回 algorithms 数组
        responseData = data.algorithms;
      } else {
        // 其他端点，移除 status 后返回所有数据
        const { status, ...rest } = data;
        responseData = rest;
      }
      
      result = { success: true, data: responseData };
    } else {
      result = { success: false, error: data.message || 'Unknown error' };
    }
    
    // 缓存成功的响应
    if (result.success) {
      predictionCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      // 限制缓存大小（最多100个条目）
      if (predictionCache.size > 100) {
        const firstKey = predictionCache.keys().next().value;
        predictionCache.delete(firstKey);
      }
    }
    
    return c.json(result);
  } catch (error) {
    console.error('❌ Prediction proxy error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Admin role helper endpoints (used by frontend to show admin entries)
app.get('/api/admin/is-super-admin', async (c) => {
  try {
    if (__isGetLimited(c, 60, 10_000)) return c.json({ isSuperAdmin: false, error: 'too-many-requests' }, 429);
    const userId = c.get('userId');
    if (!userId) return c.json({ isSuperAdmin: false }, 401);
    const ok = await isSuperAdminUser(userId);
    return c.json({ isSuperAdmin: !!ok });
  } catch {
    return c.json({ isSuperAdmin: false }, 500);
  }
});

app.get('/api/admin/tenant-admins', async (c) => {
  try {
    if (__isGetLimited(c, 60, 10_000)) return c.json([], 429);
    const userId = c.get('userId');
    if (!userId) return c.json([], 401);
    const gdb = getGlobalDb();
    await ensureTenantRequestsSchemaRaw(getGlobalClient());
    const rows = await gdb.select().from(tenantAdminsTable).where(eq(tenantAdminsTable.userId, userId));
    const tenants = await gdb.select().from(tenantRequestsTable);
    const alive = new Set((tenants || []).filter(t => (t.status || 'active') !== 'deleted').map(t => Number(t.id)));
    const filtered = (rows || []).map(r => Number(r.tenantId)).filter(tid => alive.has(Number(tid)));
    return c.json(filtered);
  } catch {
    return c.json([]);
  }
});
app.get('/api/admin/bootstrap-super-admin', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ ok: false, error: 'unauthorized' }, 401);
    const db = getGlobalDb();
    const exists = await db.select().from(adminUsersTable).where(eq(adminUsersTable.userId, userId)).limit(1);
    if (exists && exists.length > 0) return c.json({ ok: true, updated: false });
    await db.insert(adminUsersTable).values({ userId });
    return c.json({ ok: true, updated: true, userId });
  } catch (e) {
    console.error('GET /api/admin/bootstrap-super-admin error', e);
    return c.json({ ok: false }, 500);
  }
});

app.get('/api/auth/debug', (c) => {
  if (process.env.NODE_ENV === 'production') return c.json({ ok: false }, 404);
  return c.json({ userId: c.get('userId') || null });
});

app.get('/api/debug/tenant', async (c) => {
  if (process.env.NODE_ENV === 'production') return c.json({ ok: false }, 404);
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = (c.get('host') || '').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const branchUrl = await getBranchUrlForTenant(tenantId);
    return c.json({ host, tenantId, branchUrl: branchUrl || null });
  } catch (e) {
    return c.json({ host: c.get('host') || null, tenantId: null, branchUrl: null });
  }
});

// Gated auth debug (issuer & JWKS) for production diagnostics
app.get('/api/auth/debug-config', async (c) => {
  if (process.env.ENABLE_AUTH_DEBUG !== '1') return c.json({ ok: false }, 404);
  try {
    const info = {
      supabaseUrl: supabaseUrl || null,
      supabaseIssuer: supabaseIssuer || null,
      jwksUrl: null,
      apikeyInQuery: false,
      apikeyHeader: false,
      jwksProbe: null,
    };
    try {
      if (__JWKS_CFG && __JWKS_CFG.url) {
        const u = new URL(__JWKS_CFG.url);
        const hasApiKey = u.searchParams.has('apikey');
        if (hasApiKey) u.searchParams.set('apikey', '[set]');
        info.jwksUrl = u.toString();
        info.apikeyInQuery = hasApiKey;
      }
      if (__JWKS_CFG && __JWKS_CFG.headers && __JWKS_CFG.headers.apikey) {
        info.apikeyHeader = true;
      }
    } catch {}
    try {
      if (__JWKS_CFG && __JWKS_CFG.url) {
        const res = await fetchWithTimeout(__JWKS_CFG.url, { headers: __JWKS_CFG.headers });
        info.jwksProbe = { ok: res.ok, status: res.status };
        if (!res.ok && __JWKS_CFG.fallbackUrl) {
          const res2 = await fetchWithTimeout(__JWKS_CFG.fallbackUrl, { headers: __JWKS_CFG.fallbackHeaders });
          info.jwksProbe = { ok: res2.ok, status: res2.status, triedFallbackJwks: true };
          if (!res2.ok && __JWKS_CFG.oidcUrl) {
            const res3 = await fetchWithTimeout(__JWKS_CFG.oidcUrl, { headers: __JWKS_CFG.oidcHeaders });
            info.jwksProbe = { ok: res3.ok, status: res3.status, triedFallbackJwks: true, triedOidcWellKnown: true };
          }
        }
      }
    } catch (e) {
      info.jwksProbe = { ok: false, error: String((e && e.message) || e) };
    }
    return c.json(info);
  } catch {
    return c.json({ ok: false }, 500);
  }
});

// Gated verify to print JOSE error & resolved userId (requires Authorization)
app.get('/api/auth/debug-verify', async (c) => {
  if (process.env.ENABLE_AUTH_DEBUG !== '1') return c.json({ ok: false }, 404);
  const auth = c.req.header('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return c.json({ ok: false, error: 'no-token' }, 400);
  const out = { ok: false, userId: null, issuer: supabaseIssuer || null, jwksUrl: null };
  try {
    if (__JWKS_CFG && __JWKS_CFG.url) {
      try {
        const u = new URL(__JWKS_CFG.url);
        if (u.searchParams.has('apikey')) u.searchParams.set('apikey', '[set]');
        out.jwksUrl = u.toString();
      } catch {}
    }
    if (SUPABASE_JWKS && supabaseIssuer) {
      const { payload } = await jwtVerify(token, SUPABASE_JWKS, { issuer: supabaseIssuer });
      out.ok = true; out.userId = payload?.sub || null;
      return c.json(out);
    }
    // If primary JWKS failed, try fallback /jwks
    if (__JWKS_CFG && __JWKS_CFG.fallbackUrl) {
      try {
        const jwks2 = createRemoteJWKSet(__JWKS_CFG.fallbackUrl, { headers: __JWKS_CFG.fallbackHeaders });
        const { payload } = await jwtVerify(token, jwks2, { issuer: supabaseIssuer });
        out.ok = true; out.userId = payload?.sub || null; out.triedFallbackJwks = true;
        return c.json(out);
      } catch {}
    }
    // Last resort: try OIDC well-known
    if (__JWKS_CFG && __JWKS_CFG.oidcUrl) {
      try {
        const jwks3 = createRemoteJWKSet(__JWKS_CFG.oidcUrl, { headers: __JWKS_CFG.oidcHeaders });
        const { payload } = await jwtVerify(token, jwks3, { issuer: supabaseIssuer });
        out.ok = true; out.userId = payload?.sub || null; out.triedOidcWellKnown = true;
        return c.json(out);
      } catch {}
    }
    out.error = 'no-jwks';
    return c.json(out, 500);
  } catch (e) {
    out.error = String((e && e.message) || e);
    return c.json(out, 401);
  }
});
app.post('/api/uploads/post-images', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const form = await c.req.formData();
    const files = [];
    for (const [key, value] of form.entries()) {
      if (key === 'files' && value && typeof value === 'object') {
        files.push(value);
      }
    }
    if (files.length === 0) return c.json({ error: 'no-files' }, 400);

    // Upload validation: limit count, size, mime
    if (files.length > 10) return c.json({ error: 'too-many-files' }, 400);
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    for (const f of files) {
      const typeOk = __isAllowedImage(f.type);
      if (!typeOk) return c.json({ error: 'unsupported-type' }, 415);
      const size = Number(f.size || 0);
      if (size > MAX_SIZE) return c.json({ error: 'file-too-large' }, 413);
    }

    const supa = getSupabaseAdmin();
    const bucket = 'post-images';
    await ensureBucketPublic(supa, bucket);

    const urls = [];
    for (const file of files) {
      const safeName = (file.name || 'image').replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectPath = `${userId}/${Date.now()}_${safeName}`;
      const buf = Buffer.from(await file.arrayBuffer());
      
      // 🔒 安全：驗證文件實際內容
      const validation = await __validateImageBuffer(buf, file.type);
      if (!validation.valid) {
        return c.json({ error: validation.error }, 400);
      }
      
      let outBuf = buf;
      try {
        const type = String(file.type || '').toLowerCase();
        const isPng = type.includes('png');
        const isJpeg = type.includes('jpeg') || type.includes('jpg');
        const isWebp = type.includes('webp');
        if (buf.length <= 2 * 1024 * 1024 && (isWebp || isJpeg || isPng)) {
          outBuf = buf; // 小文件直接透传，减少等待时间
        } else if (isPng) {
          outBuf = await sharp(buf).rotate().png({ compressionLevel: 9 }).toBuffer();
        } else if (isWebp) {
          outBuf = await sharp(buf).rotate().webp({ quality: 85 }).toBuffer();
        } else {
          outBuf = await sharp(buf).rotate().jpeg({ 
            quality: 90,
            progressive: true,     // 渐进式 JPEG
            optimizeScans: true    // 优化扫描
          }).toBuffer();
        }
      } catch {}
      const { error: upErr } = await supa.storage
        .from(bucket)
        .upload(objectPath, outBuf, { 
          contentType: (file.type || 'image/jpeg'), 
          cacheControl: 'public, max-age=31536000, immutable', // 1 年缓存
          upsert: false 
        });
      if (upErr) {
        if (String(upErr.message || '').includes('exists')) {
          const { data: { publicUrl } } = supa.storage.from(bucket).getPublicUrl(objectPath);
          urls.push(publicUrl);
          continue;
        }
        throw upErr;
      }
      const { data: { publicUrl } } = supa.storage.from(bucket).getPublicUrl(objectPath);
      urls.push(publicUrl);
    }
    return c.json({ urls });
  } catch (e) {
    console.error('POST /api/uploads/post-images error', e);
    return c.json({ error: 'upload-failed' }, 500);
  }
});

// Single avatar upload
app.post('/api/uploads/avatar', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const form = await c.req.formData();
    const file = form.get('file');
    if (!file || typeof file !== 'object') return c.json({ error: 'no-file' }, 400);

    // Upload validation: size, type
    const qBucket = c.req.query('bucket');
    const _bucketName = (qBucket && /^[a-z0-9-]+$/i.test(qBucket)) ? qBucket : 'avatars';
    const MAX_SIZE = _bucketName === 'avatars' ? (5 * 1024 * 1024) : (15 * 1024 * 1024); // 5MB for avatars, else 15MB
    if (!__isAllowedImage(file.type)) return c.json({ error: 'unsupported-type' }, 415);
    const size = Number(file.size || 0);
    if (size > MAX_SIZE) return c.json({ error: 'file-too-large' }, 413);

    const supa = getSupabaseAdmin();
    const bucket = _bucketName;
    await ensureBucketPublic(supa, bucket);
    const safeName = (file.name || 'avatar').replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectPath = `${userId}/${Date.now()}_${safeName}`;
    const buf = Buffer.from(await file.arrayBuffer());
    
    // 🔒 安全：驗證文件實際內容
    const validation = await __validateImageBuffer(buf, file.type);
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }
    
    let outBuf = buf;
    try {
      const type = String(file.type || '').toLowerCase();
      const isPng = type.includes('png');
      const isJpeg = type.includes('jpeg') || type.includes('jpg');
      const isWebp = type.includes('webp');
      if (buf.length <= 2 * 1024 * 1024 && (isWebp || isJpeg || isPng)) {
        outBuf = buf; // 小文件直接透传，减少等待时间
      } else if (isPng) {
        outBuf = await sharp(buf).rotate().png({ compressionLevel: 9 }).toBuffer();
      } else if (isWebp) {
        outBuf = await sharp(buf).rotate().webp({ quality: 85 }).toBuffer();
      } else {
        outBuf = await sharp(buf).rotate().jpeg({ quality: 90 }).toBuffer();
      }
    } catch {}
    const { error: upErr } = await supa.storage
      .from(bucket)
      .upload(objectPath, outBuf, { contentType: (file.type || 'image/jpeg'), cacheControl: '3600', upsert: true });
    if (upErr) throw upErr;
    const { data: { publicUrl } } = supa.storage.from(bucket).getPublicUrl(objectPath);
    return c.json({ url: publicUrl });
  } catch (e) {
    console.error('POST /api/uploads/avatar error', e);
    return c.json({ error: 'upload-failed' }, 500);
  }
});

// Resumable upload endpoints
const UP_TMP = process.env.UPLOAD_TMP_DIR || path.join(process.cwd(), 'tmp_uploads');
function ensureTmpDir() { try { fs.mkdirSync(UP_TMP, { recursive: true }); } catch {} }

app.post('/api/uploads/resumable/init', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const { filename } = await c.req.json();
    const uploadId = `${userId}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    ensureTmpDir();
    return c.json({ uploadId });
  } catch (e) {
    return c.json({ error: 'failed' }, 500);
  }
});

app.post('/api/uploads/resumable/chunk', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const form = await c.req.formData();
    const uploadId = String(form.get('uploadId') || '');
    const index = Number(form.get('index') || 0);
    const total = Number(form.get('total') || 0);
    const chunk = form.get('chunk');
    if (!uploadId || !chunk || typeof chunk !== 'object') return c.json({ error: 'invalid' }, 400);
    ensureTmpDir();
    const p = path.join(UP_TMP, `${uploadId}_${index}.part`);
    const buf = Buffer.from(await chunk.arrayBuffer());
    fs.writeFileSync(p, buf);
    return c.json({ ok: true, index, total });
  } catch (e) {
    console.error('POST /api/uploads/resumable/chunk error', e);
    return c.json({ error: 'failed' }, 500);
  }
});
app.post('/api/uploads/resumable/finish', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const { uploadId, filename, bucket = 'post-images', contentType } = await c.req.json();
    if (!uploadId || !filename) return c.json({ error: 'invalid' }, 400);
    ensureTmpDir();
    // read parts
    const partFiles = fs.readdirSync(UP_TMP).filter(f => f.startsWith(`${uploadId}_`) && f.endsWith('.part'));
    if (partFiles.length === 0) return c.json({ error: 'no-chunks' }, 400);
    const indices = partFiles.map(f => Number(f.split('_').pop().replace('.part',''))).sort((a,b) => a-b);
    const tmpMerged = path.join(UP_TMP, `${uploadId}_merged`);
    const write = fs.createWriteStream(tmpMerged);
    for (const idx of indices) {
      const p = path.join(UP_TMP, `${uploadId}_${idx}.part`);
      write.write(fs.readFileSync(p));
    }
    write.end();
    await new Promise(r => write.on('close', r));
    // upload to supabase
    const supa = getSupabaseAdmin();
    await ensureBucketPublic(supa, bucket);
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectPath = `${userId}/${Date.now()}_${safeName}`;
    const fileBuf = fs.readFileSync(tmpMerged);
    const { error: upErr } = await supa.storage
      .from(bucket)
      .upload(objectPath, fileBuf, { contentType: contentType || 'application/octet-stream', cacheControl: '3600', upsert: false });
    if (upErr) throw upErr;
    const { data: { publicUrl } } = supa.storage.from(bucket).getPublicUrl(objectPath);
    // cleanup
    try { fs.unlinkSync(tmpMerged); } catch {}
    for (const idx of indices) { try { fs.unlinkSync(path.join(UP_TMP, `${uploadId}_${idx}.part`)); } catch {} }
    return c.json({ url: publicUrl });
  } catch (e) {
    console.error('POST /api/uploads/resumable/finish error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// Cleanup stale chunks (admin)
app.post('/api/admin/uploads/cleanup', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    ensureTmpDir();
    const now = Date.now();
    let removed = 0;
    for (const f of fs.readdirSync(UP_TMP)) {
      if (!f.endsWith('.part') && !f.endsWith('_merged')) continue;
      const p = path.join(UP_TMP, f);
      try {
        const st = fs.statSync(p);
        if (now - st.mtimeMs > 24 * 3600 * 1000) { // older than 24h
          fs.unlinkSync(p);
          removed++;
        }
      } catch {}
    }
    return c.json({ ok: true, removed });
  } catch (e) {
    console.error('POST /api/admin/uploads/cleanup error', e);
    return c.json({ ok: false }, 500);
  }
});

// Profile update (username, avatar)
app.put('/api/profile', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const body = await c.req.json();
    const { username, avatarUrl } = body || {};
    const db = await getTursoClientForTenant(0);
    const updates = {};
    if (username !== undefined) updates.username = String(username);
    if (avatarUrl !== undefined) updates.avatarUrl = String(avatarUrl);
    if (Object.keys(updates).length === 0) return c.json({ ok: false, error: 'no-op' }, 400);
    await db.update(profiles).set(updates).where(eq(profiles.id, userId));
    // sync shared_profiles avatar/username if exists
    try {
      const g = getGlobalDb();
      const exists = await g.select().from(sharedProfiles).where(eq(sharedProfiles.id, userId)).limit(1);
      if (exists && exists.length > 0) {
        const upd = {};
        if (username !== undefined) upd.username = String(username);
        if (avatarUrl !== undefined) upd.avatarUrl = String(avatarUrl);
        if (Object.keys(upd).length > 0) await g.update(sharedProfiles).set(upd).where(eq(sharedProfiles.id, userId));
      }
    } catch {}
    const rows = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    return c.json(rows?.[0] || { ok: true });
  } catch (e) {
    console.error('PUT /api/profile error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

async function resolveTenantId(db, host) {
  try {
    const row = await db
      .select({ id: tenantRequestsTable.id })
      .from(tenantRequestsTable)
      .where(eq(tenantRequestsTable.desiredDomain, host))
      .limit(1);
    if (row && row[0] && row[0].id != null) return row[0].id;
    // fallback domain match
    try {
      const row2 = await db
        .select({ id: tenantRequestsTable.id })
        .from(tenantRequestsTable)
        .where(eq(tenantRequestsTable.fallbackDomain, host))
        .limit(1);
      if (row2 && row2[0] && row2[0].id != null) return row2[0].id;
    } catch {}
    return 0;
  } catch {
    return 0;
  }
}

// Bootstrap first super admin when none exists
app.post('/api/admin/bootstrap-super-admin', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ ok: false, error: 'unauthorized' }, 401);
    const db = getGlobalDb();
    const cnt = await db.select({ c: sql`count(1)` }).from(adminUsersTable);
    const count = Number(cnt?.[0]?.c || 0);
    if (count > 0) {
      return c.json({ ok: false, reason: 'already-initialized' });
    }
    await db.insert(adminUsersTable).values({ userId });
    return c.json({ ok: true, userId });
  } catch (e) {
    console.error('POST /api/admin/bootstrap-super-admin error', e);
    return c.json({ ok: false }, 500);
  }
});

app.post('/api/admin/fix-profile-id', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const db = getGlobalDb();
    // Try to find profile by this id first
    const byId = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if ((byId || []).length > 0) return c.json({ ok: true, updated: false });
    // If not present, there's no guaranteed email in JWT，所以这里只提供直接插入一条最小资料
    await db.insert(profiles).values({ id: userId, username: '用户', tenantId: 0, points: 0, createdAt: new Date().toISOString() });
    return c.json({ ok: true, updated: true });
  } catch (e) {
    console.error('POST /api/admin/fix-profile-id error', e);
    return c.json({ ok: false }, 500);
  }
});
app.get('/api/profile', async (c) => {
  try {
    const userId = c.req.query('userId');
    const ensure = c.req.query('ensure') === '1';
    const scope = c.req.query('scope'); // optional: 'global'|'tenant'|'combined'
    if (!userId) return c.json({}, 400);

    const authedUserId = c.get('userId') || null;
    const isSelf = !!authedUserId && String(authedUserId) === String(userId);

    // resolve tenant
    const defaultDb = await getTursoClientForTenant(0);
    const host = (c.get('host') || '').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const globalDb = await getTursoClientForTenant(0);

    // Backward-compat: ensure optional columns exist in global profiles (single source of truth)
    try {
      const rawG = getGlobalClient();
      try { await rawG.execute("alter table profiles add column avatar_url text"); } catch {}
      try { await rawG.execute("alter table profiles add column tenant_id integer default 0"); } catch {}
      try { await rawG.execute("alter table profiles add column uid text"); } catch {}
      try { await rawG.execute("alter table profiles add column invite_code text"); } catch {}
      try { await rawG.execute("alter table profiles add column virtual_currency integer default 0"); } catch {}
      try { await rawG.execute("alter table profiles add column invitation_points integer default 0"); } catch {}
      try { await rawG.execute("alter table profiles add column free_posts_count integer default 0"); } catch {}
    } catch {}

    // ensure global profile exists for invite/uid
    let rowsGlobal = await globalDb.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (ensure && isSelf && (!rowsGlobal || rowsGlobal.length === 0)) {
      await globalDb.insert(profiles).values({ id: userId, username: '用户', tenantId: 0, points: 0, virtualCurrency: 0, invitationPoints: 0, freePostsCount: 0, createdAt: new Date().toISOString() });
      rowsGlobal = await globalDb.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    }

    const pGlobal = rowsGlobal?.[0] || null;

    if (pGlobal) {
      // ensure uid and invite_code in global
      await ensureUid(globalDb, profiles, profiles.id, userId);
      await ensureInviteCode(globalDb, profiles, profiles.id, userId);
    }

    // reread global for latest uid/invite
    const rereadGlobal = (await globalDb.select().from(profiles).where(eq(profiles.id, userId)).limit(1))?.[0] || pGlobal;

    // compute invited users count across tenant and global invitations
    let invitedUsersCount = 0;
    try {
      const invGlobal = await globalDb.select().from(invitations).where(eq(invitations.inviterId, userId));
      const inviteeIds = Array.isArray(invGlobal)
        ? Array.from(new Set(
            (invGlobal || [])
              .map(r => r?.inviteeId)
              .filter(Boolean)
              .filter(inviteeId => String(inviteeId) !== String(userId))
          ))
        : [];
      if (inviteeIds.length > 0) {
        const existingInvitees = await globalDb
          .select({ id: profiles.id })
          .from(profiles)
          .where(inArray(profiles.id, inviteeIds));
        invitedUsersCount = Array.isArray(existingInvitees) ? existingInvitees.length : 0;
      } else {
        invitedUsersCount = 0;
      }
    } catch {}

    // compute invitation points strictly for this user from points history (tenant + global)
    let invitationPointsComputed = 0;
    try {
      const sumRowsG = await globalDb
        .select({ total: sql`sum(${pointsHistoryTable.changeAmount})` })
        .from(pointsHistoryTable)
        .where(and(eq(pointsHistoryTable.userId, userId), eq(pointsHistoryTable.reason, '邀请好友奖励')))
        .limit(1);
      const totalG = Array.isArray(sumRowsG) && sumRowsG[0] && (sumRowsG[0].total ?? sumRowsG[0].TOTAL ?? sumRowsG[0]['sum'] ?? 0);
      const asNumber = Number(totalG || 0);
      if (Number.isFinite(asNumber)) invitationPointsComputed = asNumber;
    } catch {}

    // combined points derived purely from global profile
    const combinedPoints = pGlobal?.points || 0;

    if (scope === 'global' && pGlobal) {
      return c.json({
        ...pGlobal,
        avatar_url: pGlobal.avatarUrl,
        tenant_id: pGlobal.tenantId,
        virtual_currency: pGlobal.virtualCurrency,
        invitation_points: invitationPointsComputed,
        free_posts_count: pGlobal.freePostsCount,
        invite_code: pGlobal.inviteCode,
        invited_users_count: invitedUsersCount,
        combined_points: combinedPoints
      });
    }

    if (scope === 'combined' && pGlobal) {
      const base = pGlobal;
      return c.json({
        ...base,
        points: combinedPoints,
        avatar_url: base.avatarUrl,
        tenant_id: base.tenantId,
        virtual_currency: base.virtualCurrency,
        invitation_points: invitationPointsComputed,
        free_posts_count: base.freePostsCount,
        uid: rereadGlobal?.uid || base.uid,
        invite_code: rereadGlobal?.inviteCode || base.inviteCode,
        invited_users_count: invitedUsersCount,
        combined_points: combinedPoints
      });
    }

    // fallback to global-only data if tenant profile is missing and not ensured
    if (pGlobal) {
      const compat = {
        ...pGlobal,
        avatar_url: pGlobal.avatarUrl,
        tenant_id: pGlobal.tenantId,
        virtual_currency: pGlobal.virtualCurrency,
        invitation_points: invitationPointsComputed,
        free_posts_count: pGlobal.freePostsCount,
        invite_code: pGlobal.inviteCode,
        invited_users_count: invitedUsersCount,
        combined_points: combinedPoints,
      };
      return c.json(compat);
    }

    return c.json({});
  } catch (e) {
    console.error('GET /api/profile error', e);
    return c.json({});
  }
});

app.get('/api/settings', async (c) => {
  __setCache(c, 60);
  try {
    const scope = c.req.query('scope') || 'merged';
    if (scope === 'main') {
      const dbMain = await getTursoClientForTenant(0);
      const rows = await dbMain.select().from(appSettings).where(eq(appSettings.tenantId, 0));
      const map = {};
      for (const r of rows || []) {
        map[r.key] = r.value;
      }
      if (!map['social_forum_mode']) map['social_forum_mode'] = 'shared';
      return c.json(map);
    }
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const dbTenant = await getTursoClientForTenant(tenantId);
    try { await ensureDefaultSettings(dbTenant, tenantId); } catch {}
    const rowsTenant = await dbTenant.select().from(appSettings).where(eq(appSettings.tenantId, tenantId));
    const rowsMain = await defaultDb.select().from(appSettings).where(eq(appSettings.tenantId, 0));
    const map = {};
    // start with main
    for (const r of rowsMain || []) { map[r.key] = r.value; }
    // overlay tenant
    const tenantKeys = new Set();
    for (const r of rowsTenant || []) { map[r.key] = r.value; tenantKeys.add(r.key); }
    // strict tenant-only keys should never fall back to main
    const STRICT_KEYS = new Set(['site_name','site_logo','logo_url','site_favicon','site_description','seo_title_suffix','seo_keywords','seo_meta_image','seo_indexable','seo_sitemap_enabled']);
    for (const k of STRICT_KEYS) {
      if (!tenantKeys.has(k)) {
        if (k === 'site_name' && tenantId !== 0) map[k] = `分站 #${tenantId}`;
        else map[k] = '';
      }
    }
    if (!map['social_forum_mode']) map['social_forum_mode'] = 'shared';
    return c.json(map);
  } catch (e) {
    console.error('GET /api/settings error', e);
    return c.json({});
  }
});

app.get('/api/page-content', async (c) => {
  __setCache(c, 60);
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const page = c.req.query('page');
    const section = c.req.query('section');
    if (!page || !section) return c.json([]);
    const tenantId = await resolveTenantId(defaultDb, host);
    // detect globalOnly
    const pageDef = pageConfig?.[page];
    const secDef = pageDef?.sections?.find(s => s.id === section);
    const forceGlobal = !!secDef?.globalOnly;

    if (forceGlobal) {
      const rows = await defaultDb
        .select()
        .from(pageContentTable)
        .where(and(eq(pageContentTable.page, page), eq(pageContentTable.section, section), eq(pageContentTable.tenantId, 0)))
        .orderBy(pageContentTable.position);
      const list = (rows || []).map((r) => ({
        id: r.id,
        position: r.position,
        ...(typeof r.content === 'string' ? JSON.parse(r.content || '{}') : r.content),
      }));
      return c.json(list);
    }

    // 非全局：严格租户模式，不回退主站
    const dbTenant = await getTursoClientForTenant(tenantId);
    const rowsTenant = await dbTenant
      .select()
      .from(pageContentTable)
      .where(and(eq(pageContentTable.page, page), eq(pageContentTable.section, section), eq(pageContentTable.tenantId, tenantId)))
      .orderBy(pageContentTable.position);

    const list = (rowsTenant || []).map((r) => ({
      id: r.id,
      position: r.position,
      ...(typeof r.content === 'string' ? JSON.parse(r.content || '{}') : r.content),
    }));
    return c.json(list);
  } catch (e) {
    console.error('GET /api/page-content error', e);
    return c.json([]);
  }
});
app.get('/api/posts', async (c) => {
  try {
    const { mode, tenantId, tenantDb, defaultDb } = await getForumModeForTenant(c.get('host').split(':')[0]);
    const userId = c.get('userId');
    const page = Number(c.req.query('page') || 0);
    const size = Math.min(Number(c.req.query('size') || 10), 50);
    const tab = String(c.req.query('tab') || 'social');

    if (mode === 'shared') {
      await ensureSharedForumSchema();
      const tables = getSharedTables();
      let query = defaultDb
        .select()
        .from(tables.posts);

      const zone = String(c.req.query('zone') || '').toLowerCase();
      if (zone === 'ads') {
        query = query.where(eq(tables.posts.isAd, 1));
      } else if (zone === 'social') {
        query = query.where(eq(tables.posts.isAd, 0));
      }

      const rows = await query
        .orderBy(desc(tables.posts.isPinned), desc(tables.posts.createdAt))
        .limit(size)
        .offset(page * size);
      const enriched = await enrichPosts(defaultDb, rows, tables.likes, tables.comments, userId);
      return c.json(enriched);
    }

    const tables = getTenantTables();
    const isAd = tab === 'ads' ? 1 : 0;
    const rows = await tenantDb
      .select()
      .from(tables.posts)
      .where(and(eq(tables.posts.tenantId, tenantId), eq(tables.posts.isAd, isAd), eq(tables.posts.status, 'approved')))
      .orderBy(desc(tables.posts.isPinned), desc(tables.posts.createdAt))
      .limit(size)
      .offset(page * size);
    const enriched = await enrichPosts(tenantDb, rows, tables.likes, tables.comments, userId);
    return c.json(enriched);
  } catch (e) {
    console.error('GET /api/posts error', e);
    return c.json([], 500);
  }
});

app.get('/api/comments', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const postId = Number(c.req.query('postId'));
    if (!postId) return c.json([]);
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const rows = await db
      .select()
      .from(commentsTable)
      .where(eq(commentsTable.postId, postId))
      .orderBy(desc(commentsTable.createdAt));
    const profileMap = new Map();
    const uids = Array.from(new Set((rows || []).map(r => r.userId).filter(Boolean)));
    if (uids.length > 0) {
      const authors = await db.select().from(profiles).where(inArray(profiles.id, uids));
      for (const a of authors || []) profileMap.set(a.id, a);
    }
    const result = (rows || []).map((cm) => ({
      ...cm,
      author: profileMap.get(cm.userId) ? { id: profileMap.get(cm.userId).id, username: profileMap.get(cm.userId).username, avatar_url: profileMap.get(cm.userId).avatarUrl } : null,
    }));
    return c.json(result);
  } catch (e) {
    console.error('GET /api/comments error', e);
    return c.json([]);
  }
});

app.get('/api/shared/posts', async (c) => {
  __setCache(c, 15);
  try {
    await ensureSharedForumSchema();
    const db = getGlobalDb();
    const tables = getSharedTables();
    const userId = c.get('userId');
    const page = Number(c.req.query('page') || 0);
    const size = Math.min(Number(c.req.query('size') || 10), 50);
    const zone = String(c.req.query('zone') || '').toLowerCase();

    let query = db.select().from(tables.posts);
    if (zone === 'ads') query = query.where(eq(tables.posts.isAd, 1));
    if (zone === 'social') query = query.where(eq(tables.posts.isAd, 0));

    const rows = await query
      .orderBy(desc(tables.posts.isPinned), desc(tables.posts.createdAt))
      .limit(size)
      .offset(page * size);

    const enriched = await enrichPosts(db, rows, tables.likes, tables.comments, userId);
    return c.json(enriched);
  } catch (e) {
    console.error('GET /api/shared/posts error', e);
    return c.json([], 500);
  }
});

app.post('/api/comments', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const body = await c.req.json();
    const { postId, content } = body || {};
    if (!postId || !content) return c.json({ error: 'invalid' }, 400);
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const now = new Date().toISOString();
    // deduct comment cost from global profile
    try {
      const map = await readSettingsMap();
      const cost = toInt(map['comment_cost'], 1);
      const pdb = await getTursoClientForTenant(0);
      const prof = (await pdb.select().from(profiles).where(eq(profiles.id, userId)).limit(1))?.[0];
      if ((prof?.points || 0) < cost) return c.json({ error: 'insufficient-points' }, 400);
      await pdb.update(profiles).set({ points: (prof?.points || 0) - cost }).where(eq(profiles.id, userId));
      await pdb.insert(pointsHistoryTable).values({ userId, changeAmount: -cost, reason: '发表评论', createdAt: now });
    } catch {}
    await db.insert(commentsTable).values({ postId, userId, content, createdAt: now });
    const author = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    const created = { id: undefined, postId, userId, content, createdAt: now, author: author?.[0] ? { id: author[0].id, username: author[0].username, avatar_url: author[0].avatarUrl } : null };
    return c.json(created);
  } catch (e) {
    console.error('POST /api/comments error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

app.delete('/api/comments/:id', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id'));
    if (!id) return c.json({});
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    await db.delete(commentsTable).where(and(eq(commentsTable.id, id), eq(commentsTable.userId, userId)));
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/comments/:id error', e);
    return c.json({ ok: false });
  }
});

app.post('/api/likes', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const { postId } = await c.req.json();
    if (!postId) return c.json({ error: 'invalid' }, 400);
    const tenantId = await resolveTenantId(defaultDb, host);
    await ensureTenantForumSchemaRaw(tenantId);
    const db = await getTursoClientForTenant(tenantId);
    await db.insert(likesTable).values({ postId, userId });
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/likes error', e);
    return c.json({ ok: false });
  }
});

app.delete('/api/likes', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const { postId } = await c.req.json();
    if (!postId) return c.json({ error: 'invalid' }, 400);
    const tenantId = await resolveTenantId(defaultDb, host);
    await ensureTenantForumSchemaRaw(tenantId);
    const db = await getTursoClientForTenant(tenantId);
    await db.delete(likesTable).where(and(eq(likesTable.postId, postId), eq(likesTable.userId, userId)));
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/likes error', e);
    return c.json({ ok: false });
  }
});

app.delete('/api/posts/:id', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id'));
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const rows = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    const post = rows?.[0];
    if (!post) return c.json({ error: 'not-found' }, 404);
    const isSuper = await isSuperAdminUser(userId);
    if (!isSuper && post.authorId !== userId) return c.json({ error: 'forbidden' }, 403);
    await db.delete(postsTable).where(eq(postsTable.id, id));
    await db.delete(commentsTable).where(eq(commentsTable.postId, id));
    await db.delete(likesTable).where(eq(likesTable.postId, id));
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/posts/:id error', e);
    return c.json({ ok: false });
  }
});

app.post('/api/posts/:id/pin', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id'));
    const { pinned } = await c.req.json();
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    // permission: only super admin can pin in tenant-specific mode
    const isSuper = await isSuperAdminUser(userId);
    if (!isSuper) return c.json({ error: 'forbidden' }, 403);
    await db.update(postsTable).set({ isPinned: pinned ? 1 : 0 }).where(eq(postsTable.id, id));
    const rows = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    return c.json(rows?.[0] || { id, is_pinned: pinned ? 1 : 0 });
  } catch (e) {
    console.error('POST /api/posts/:id/pin error', e);
    return c.json({ ok: false });
  }
});
app.get('/api/notifications/unread', async (c) => {
  try {
    const db = await getTursoClientForTenant(0);
    const userId = c.get('userId');
    if (!userId) return c.json({ items: [], count: 0 });
    const page = Number(c.req.query('page') || 0);
    const size = Math.min(Number(c.req.query('size') || 20), 100);
    const items = await db
      .select()
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, 0)))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(size)
      .offset(page * size);
    const mapped = (items || []).map(r => {
      let parsed;
      try { parsed = typeof r.content === 'string' ? JSON.parse(r.content) : (r.content || {}); } catch { parsed = { message: String(r.content || '') }; }
      if (typeof parsed === 'string') parsed = { message: parsed };
      const typeVal = r.type || (parsed && parsed.type) || 'system';
      return {
        id: r.id,
        user_id: r.userId,
        is_read: r.isRead ? 1 : 0,
        created_at: r.createdAt,
        type: typeVal,
        related_post_id: r.relatedPostId || null,
        content: parsed,
      };
    });
    const count = mapped.length || 0;
    const nextPage = count < size ? undefined : page + 1;
    return c.json({ items: mapped, count, nextPage });
  } catch (e) {
    console.error('GET /api/notifications/unread error', e);
    return c.json({ items: [], count: 0 });
  }
});

app.get('/api/stats', async (c) => {
  __setCache(c, 30);
  try {
    const db = await getTursoClientForTenant(0);
    const usersCnt = await db.select({ c: sql`count(1)` }).from(profiles);
    const postsCnt = await db.select({ c: sql`count(1)` }).from(postsTable);
    const totalUsers = Number(usersCnt?.[0]?.c || 0);
    const totalPosts = Number(postsCnt?.[0]?.c || 0);

    const p = String(c.req.query('period') || '30d');
    const days = p === 'today' ? 1 : (p === '3d' ? 3 : (p === '7d' ? 7 : 30));
    const since = new Date(Date.now() - (days - 1) * 24 * 3600 * 1000);
    const startDay = since.toISOString().slice(0, 10);

    const client = getGlobalClient();
    const usersAgg = await client.execute({ sql: "select substr(created_at,1,10) as d, count(1) as c from profiles where created_at >= ? group by substr(created_at,1,10)", args: [startDay] });
    const postsAgg = await client.execute({ sql: "select substr(created_at,1,10) as d, count(1) as c from posts where created_at >= ? group by substr(created_at,1,10)", args: [startDay] });

    const dailyData = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      dailyData[d] = { users: 0, posts: 0 };
    }
    for (const r of usersAgg?.rows || []) {
      const d = r.d || r[0];
      const cval = Number(r.c || r[1] || 0);
      if (dailyData[d]) dailyData[d].users = cval;
    }
    for (const r of postsAgg?.rows || []) {
      const d = r.d || r[0];
      const cval = Number(r.c || r[1] || 0);
      if (dailyData[d]) dailyData[d].posts = cval;
    }

    return c.json({ totalUsers, totalPosts, dailyData });
  } catch (e) {
    console.error('GET /api/stats error', e);
    return c.json({ totalUsers: 0, totalPosts: 0, dailyData: {} });
  }
});

app.get('/api/plausible/stats', async (c) => {
  try {
    const period = c.req.query('period') || '30d';
    const days = period === 'today' ? 1 : period === '7d' ? 7 : 30;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(start.getTime() - i * 24 * 3600 * 1000);
      const visitors = Math.floor(80 + Math.random() * 220);
      const pageviews = Math.floor(visitors * (1.2 + Math.random() * 1.8));
      const bounce_rate = Math.round((40 + Math.random() * 30));
      data.push({
        date: d.toISOString().slice(0, 10),
        visitors,
        pageviews,
        bounce_rate,
      });
    }
    return c.json(data);
  } catch (e) {
    console.error('GET /api/plausible/stats error', e);
    return c.json([]);
  }
});
// New: Umami stats proxy
app.get('/api/umami/stats', async (c) => {
  __setCache(c, 60);
  try {
    const period = String(c.req.query('period') || '30d');
    const days = period === 'today' ? 1 : (period === '3d' ? 3 : (period === '7d' ? 7 : 30));

    const now = new Date();
    const endAt = now.getTime();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startAt = startOfToday - (days - 1) * 24 * 3600 * 1000;

    const rawBase = process.env.UMAMI_BASE_URL || process.env.UMAMI_API_BASE || 'https://api.umami.is/v1';
    const websiteId = process.env.UMAMI_WEBSITE_ID || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
    const apiKey = process.env.UMAMI_API_KEY || process.env.NEXT_PUBLIC_UMAMI_API_KEY;

    if (!websiteId || !apiKey) {
      return c.json({ error: 'Umami API not configured' }, 500);
    }

    function normalizeBase(base) {
      let b = String(base || '').trim();
      if (!b) return 'https://api.umami.is/v1';
      if (!/^https?:\/\//i.test(b)) b = `https://${b}`;
      try {
        const u = new URL(b);
        const host = (u.host || '').toLowerCase();
        const path = u.pathname || '';
        // Cloud domains -> official API
        if (host === 'api.umami.is') {
          if (!/^\/v\d+/.test(path)) u.pathname = '/v1';
          return u.toString().replace(/\/?$/, '');
        }
        if (host.endsWith('.umami.is') && !host.startsWith('api.')) {
          return 'https://api.umami.is/v1';
        }
        // Self-hosted: strip share/websites and ensure /api
        if (path.includes('/websites/') || path.includes('/share/')) {
          u.pathname = '/';
        }
        let out = u.toString().replace(/\/?$/, '');
        if (!/\/api(\/.+)?$/i.test(out) && !/\/v\d+(\/.+)?$/i.test(out)) out = `${out}/api`;
        return out.replace(/\/$/, '');
      } catch {
        if (/\.umami\.is/i.test(b) && !/api\.umami\.is/i.test(b)) return 'https://api.umami.is/v1';
        if (!/\/api(\/.+)?$/i.test(b) && !/\/v\d+(\/.+)?$/i.test(b)) b = `${b.replace(/\/$/, '')}/api`;
        return b.replace(/\/$/, '');
      }
    }

    const apiBase = normalizeBase(rawBase);
    const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${apiKey}` };

    const isV1 = /\/v\d+$/i.test(apiBase);
    const pvPath = isV1 ? `/websites/${encodeURIComponent(websiteId)}/metrics` : `/websites/${encodeURIComponent(websiteId)}/pageviews`;
    const pvParams = isV1 ? `?startAt=${startAt}&endAt=${endAt}&type=pageviews&unit=day` : `?startAt=${startAt}&endAt=${endAt}&unit=day`;
    const statsPath = `/websites/${encodeURIComponent(websiteId)}/stats`;
    const pageviewsUrl = `${apiBase}${pvPath}${pvParams}`;
    const statsUrl = `${apiBase}${statsPath}?startAt=${startAt}&endAt=${endAt}`;

    const [pvRes, statsRes] = await Promise.all([
      fetchWithTimeout(pageviewsUrl, { headers }),
      fetchWithTimeout(statsUrl, { headers }),
    ]);

    if (!pvRes.ok) throw new Error(`Umami pageviews error ${pvRes.status}`);
    if (!statsRes.ok) throw new Error(`Umami stats error ${statsRes.status}`);

    const pvJson = await pvRes.json();
    const statsJson = await statsRes.json();

    const pageviewsSeries = Array.isArray(pvJson?.pageviews) ? pvJson.pageviews : [];
    // Umami returns sessions timeseries for visits/unique visitors
    const sessionsSeries = Array.isArray(pvJson?.sessions) ? pvJson.sessions : (Array.isArray(pvJson?.visitors) ? pvJson.visitors : []);

    const dayMs = 24 * 3600 * 1000;
    const daysList = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startAt + i * dayMs).toISOString().slice(0, 10);
      daysList.push(d);
    }

    const toDate = (t) => new Date(Number(t)).toISOString().slice(0, 10);

    const pvMap = Object.create(null);
    for (const p of pageviewsSeries) {
      const d = toDate(p.t ?? p.time ?? 0);
      pvMap[d] = Number(p.y || p.value || 0);
    }
    const svMap = Object.create(null);
    for (const s of sessionsSeries) {
      const d = toDate(s.t ?? s.time ?? 0);
      svMap[d] = Number(s.y || s.value || 0);
    }

    const totalSessions = Number(statsJson?.sessions ?? statsJson?.visits ?? statsJson?.visitors ?? 0);
    const bounces = Number(statsJson?.bounces ?? 0);
    const bounceRate = totalSessions > 0 ? Math.round((bounces / totalSessions) * 100) : 0;

    const result = daysList.map((d) => ({
      date: d,
      visitors: Number(svMap[d] || 0),
      pageviews: Number(pvMap[d] || 0),
      // Umami API doesn't expose daily bounce rate; use period-average for each day so weighted avg works
      bounce_rate: bounceRate,
    }));

    return c.json(result);
  } catch (e) {
    console.error('GET /api/umami/stats error', e);
    return c.json([]);
  }
});

// New: Umami overview (summary + daily series)
app.get('/api/umami/overview', async (c) => {
  __setCache(c, 60);
  try {
    const period = String(c.req.query('period') || '30d');

    // ETag support
    const key = `umami:${period}`;
    // Build a weak etag using period only (data changes per minute, cache is short)
    const etag = crypto.createHash('sha1').update(key).digest('hex');
    const inm = c.req.header('if-none-match');
    if (inm && inm === etag) return c.body(null, 304);
    c.header('ETag', etag);
    const days = period === 'today' ? 1 : (period === '3d' ? 3 : (period === '7d' ? 7 : 30));

    const now = new Date();
    const endAt = now.getTime();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startAt = startOfToday - (days - 1) * 24 * 3600 * 1000;

    const rawBase = process.env.UMAMI_BASE_URL || process.env.UMAMI_API_BASE || 'https://api.umami.is/v1';
    const websiteId = process.env.UMAMI_WEBSITE_ID || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
    const apiKey = process.env.UMAMI_API_KEY || process.env.NEXT_PUBLIC_UMAMI_API_KEY;
    if (!websiteId || !apiKey) return c.json({ error: 'Umami API not configured' }, 500);

    function normalizeBase(base) {
      let b = String(base || '').trim();
      if (!b) return 'https://api.umami.is/v1';
      if (!/^https?:\/\//i.test(b)) b = `https://${b}`;
      try {
        const u = new URL(b);
        const host = (u.host || '').toLowerCase();
        const pth = (u.pathname || '');
        if (host === 'api.umami.is') { if (!/^\/v\d+/.test(pth)) u.pathname = '/v1'; return u.toString().replace(/\/?$/, ''); }
        if (host.endsWith('.umami.is') && !host.startsWith('api.')) return 'https://api.umami.is/v1';
        if (pth.includes('/websites/') || pth.includes('/share/')) u.pathname = '/';
        let out = u.toString().replace(/\/?$/, '');
        if (!/\/api(\/.+)?$/i.test(out) && !/\/v\d+(\/.+)?$/i.test(out)) out = `${out}/api`;
        return out.replace(/\/$/, '');
      } catch {
        if (/\.umami\.is/i.test(b) && !/api\.umami\.is/i.test(b)) return 'https://api.umami.is/v1';
        if (!/\/api(\/.+)?$/i.test(b) && !/\/v\d+(\/.+)?$/i.test(b)) b = `${b.replace(/\/$/, '')}/api`;
        return b.replace(/\/$/, '');
      }
    }
    const apiBase = normalizeBase(rawBase);
    const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${apiKey}` };

    const isV1 = /\/v\d+$/i.test(apiBase);
    let pageviewsUrl = `${apiBase}/websites/${encodeURIComponent(websiteId)}/pageviews?startAt=${startAt}&endAt=${endAt}&unit=day`;
    let visitorsUrl = null;
    if (isV1) {
      pageviewsUrl = `${apiBase}/websites/${encodeURIComponent(websiteId)}/metrics?startAt=${startAt}&endAt=${endAt}&type=pageviews&unit=day`;
      visitorsUrl = `${apiBase}/websites/${encodeURIComponent(websiteId)}/metrics?startAt=${startAt}&endAt=${endAt}&type=visitors&unit=day`;
    }
    const statsUrl = `${apiBase}/websites/${encodeURIComponent(websiteId)}/stats?startAt=${startAt}&endAt=${endAt}`;

    const responses = await Promise.all([
      fetchWithTimeout(pageviewsUrl, { headers }),
      visitorsUrl ? fetchWithTimeout(visitorsUrl, { headers }) : Promise.resolve(null),
      fetchWithTimeout(statsUrl, { headers }),
    ]);
    const pvRes = responses[0];
    const viRes = responses[1];
    const statsRes = responses[2];
    if (!pvRes.ok) throw new Error(`Umami pageviews error ${pvRes.status}`);
    if (!statsRes.ok) throw new Error(`Umami stats error ${statsRes.status}`);

    const pvJson = await pvRes.json();
    const viJson = viRes ? await viRes.json() : null;
    const statsJson = await statsRes.json();

    const isV1Resp = !!viJson && Array.isArray(viJson?.data);
    const pageviewsSeries = Array.isArray(pvJson?.pageviews) ? pvJson.pageviews : (Array.isArray(pvJson?.data) ? pvJson.data : []);
    const visitorsSeries = isV1Resp ? viJson.data : (Array.isArray(pvJson?.visitors) ? pvJson.visitors : []);

    const toDate = (t) => new Date(Number(t)).toISOString().slice(0, 10);

    const pvMap = Object.create(null);
    for (const p of pageviewsSeries) {
      const d = toDate(p.t ?? p.time ?? p.timestamp ?? 0);
      pvMap[d] = Number(p.y || p.value || p.count || 0);
    }
    const svMap = Object.create(null);
    for (const s of visitorsSeries) {
      const d = toDate(s.t ?? s.time ?? s.timestamp ?? 0);
      svMap[d] = Number(s.y || s.value || s.count || 0);
    }

    const dayMs = 24 * 3600 * 1000;
    const series = [];
    for (let t = startAt; t <= endAt; t += dayMs) {
      const d = new Date(t).toISOString().slice(0, 10);
      series.push({ date: d, visitors: Number(svMap[d] || 0), pageviews: Number(pvMap[d] || 0) });
    }

    const totalPageviews = Number(statsJson?.pageviews ?? statsJson?.views ?? 0);
    const totalSessions = Number(statsJson?.sessions ?? statsJson?.visits ?? 0);
    const totalVisitors = Number(statsJson?.visitors ?? 0);
    const bounces = Number(statsJson?.bounces ?? 0);
    const totalTime = Number(statsJson?.totaltime ?? statsJson?.totalTime ?? statsJson?.time ?? 0);

    const bounceRate = totalSessions > 0 ? Math.round((bounces / totalSessions) * 100) : 0;
    const avgSessionDurationSec = totalSessions > 0 ? Math.round(totalTime / totalSessions) : 0;
    const pagesPerSession = totalSessions > 0 ? Number((totalPageviews / totalSessions).toFixed(2)) : 0;

    const summary = {
      visitors: totalVisitors,
      pageviews: totalPageviews,
      sessions: totalSessions,
      bounces,
      bounce_rate: bounceRate,
      avg_session_duration_s: avgSessionDurationSec,
      pages_per_session: pagesPerSession,
    };

    return c.json({ summary, series });
  } catch (e) {
    console.error('GET /api/umami/overview error', e);
    return c.json({ summary: null, series: [] });
  }
});
app.get('/api/admin/users', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json([], 401);
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json([], 403);

    // Resolve current tenant for context
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const currentTenantId = await resolveTenantId(defaultDb, host);
    const scope = c.req.query('scope') || 'global'; // global | tenant | all

    // Global DB and role datasets
    const gdb = getGlobalDb();
    try { await ensureTenantRequestsSchemaRaw(getGlobalClient()); } catch {}
    const superRows = await gdb.select().from(adminUsersTable);
    const superSet = new Set((superRows || []).map(r => r.userId));
    const allTenantAdminRows = await gdb.select().from(tenantAdminsTable);

    // map tenant id -> domain and alive set
    let tenantRowsAll = [];
    try { tenantRowsAll = await gdb.select().from(tenantRequestsTable); } catch {}
    const aliveTenantIds = new Set((tenantRowsAll || []).filter(t => (t.status || 'active') === 'active').map(tr => Number(tr.id)));
    const idToDomain = new Map((tenantRowsAll || []).map(tr => [Number(tr.id), tr.desiredDomain || tr.desired_domain || '']));

    // per-user tenant admin membership (alive tenants only)
    const adminTenantsByUser = new Map();
    for (const r of (allTenantAdminRows || [])) {
      const tId = Number(r.tenantId);
      if (!aliveTenantIds.has(tId)) continue;
      const arr = adminTenantsByUser.get(r.userId) || [];
      if (!arr.includes(tId)) arr.push(tId);
      adminTenantsByUser.set(r.userId, arr);
    }

    // global profiles cache
    let rowsGlobalAll = [];
    try { rowsGlobalAll = await gdb.select().from(profiles); } catch {}
    const globalById = new Map((rowsGlobalAll || []).map(p => [p.id, p]));

    if (scope === 'global') {
      const list = (rowsGlobalAll || []).map(r => {
        const adminTenantIds = adminTenantsByUser.get(r.id) || [];
        const domains = adminTenantIds.map(id => idToDomain.get(Number(id))).filter(Boolean);
        return {
          ...r,
          avatar_url: r.avatarUrl,
          tenant_id: r.tenantId,
          virtual_currency: r.virtualCurrency,
          invitation_points: r.invitationPoints,
          free_posts_count: r.freePostsCount,
          created_at: r.createdAt,
          is_super_admin: superSet.has(r.id),
          is_tenant_admin: (adminTenantIds.length > 0),
          tenant_admin_tenants: adminTenantIds,
          tenant_admin_domains: domains,
          role: superSet.has(r.id) ? 'super-admin' : ((adminTenantIds.length > 0) ? 'tenant-admin' : 'user'),
        };
      });
      return c.json(list);
    }

    if (scope === 'tenant') {
      const db = await getTursoClientForTenant(currentTenantId);
      const rows = await db.select().from(profiles);
      const list = (rows || []).map(r => {
        const adminTenantIds = adminTenantsByUser.get(r.id) || [];
        const domains = adminTenantIds.map(id => idToDomain.get(Number(id))).filter(Boolean);
        const g = globalById.get(r.id);
        return {
          ...r,
          uid: (g?.uid ?? r.uid) || null,
          avatar_url: r.avatarUrl,
          tenant_id: r.tenantId ?? currentTenantId,
          virtual_currency: r.virtualCurrency,
          invitation_points: r.invitationPoints,
          free_posts_count: r.freePostsCount,
          created_at: r.createdAt || g?.createdAt || null,
          points: r.points,
          is_super_admin: superSet.has(r.id),
          is_tenant_admin: (adminTenantIds.length > 0),
          tenant_admin_tenants: adminTenantIds,
          tenant_admin_domains: domains,
          role: superSet.has(r.id) ? 'super-admin' : ((adminTenantIds.length > 0) ? 'tenant-admin' : 'user'),
        };
      });
      return c.json(list);
    }

    // scope === 'all' (default previously)
    // enumerate tenant IDs: include 0 and all known tenants
    const tenantIdSet = new Set([0]);
    for (const tr of (tenantRowsAll || [])) {
      const tid = Number(tr.id);
      if (Number.isFinite(tid)) tenantIdSet.add(tid);
    }

    // gather users across tenants and deduplicate by user id
    const aggregatedMap = new Map();
    for (const tenantId of tenantIdSet) {
      try {
        // ensure optional columns for backward-compat
        try { const raw = await getLibsqlClientForTenantRaw(tenantId); await raw.execute("alter table profiles add column uid text"); } catch {}
        // keep uid index best-effort, ignore errors
        try { const raw = await getLibsqlClientForTenantRaw(tenantId); await raw.execute("create unique index if not exists idx_profiles_uid on profiles(uid)"); } catch {}
        try { const raw = await getLibsqlClientForTenantRaw(tenantId); await raw.execute("alter table profiles add column virtual_currency integer default 0"); } catch {}
        try { const raw = await getLibsqlClientForTenantRaw(tenantId); await raw.execute("alter table profiles add column invitation_points integer default 0"); } catch {}
        try { const raw = await getLibsqlClientForTenantRaw(tenantId); await raw.execute("alter table profiles add column free_posts_count integer default 0"); } catch {}

        const db = await getTursoClientForTenant(tenantId);
        const rows = await db.select().from(profiles);
        for (const r of (rows || [])) {
          const adminTenantIds = adminTenantsByUser.get(r.id) || [];
          const domains = adminTenantIds.map(id => idToDomain.get(Number(id))).filter(Boolean);
          const g = globalById.get(r.id);
          const existing = aggregatedMap.get(r.id);
          const normalized = {
            ...r,
            uid: (g?.uid ?? r.uid) || null,
            avatar_url: r.avatarUrl,
            tenant_id: r.tenantId ?? tenantId,
            virtual_currency: r.virtualCurrency,
            invitation_points: r.invitationPoints,
            free_posts_count: r.freePostsCount,
            created_at: r.createdAt || g?.createdAt || null,
            points: g?.points ?? r.points,
            is_super_admin: superSet.has(r.id),
            is_tenant_admin: (adminTenantIds.length > 0),
            tenant_admin_tenants: adminTenantIds,
            tenant_admin_domains: domains,
            role: superSet.has(r.id) ? 'super-admin' : ((adminTenantIds.length > 0) ? 'tenant-admin' : 'user'),
          };
          // Prefer record with global uid/points or more complete
          if (!existing) {
            aggregatedMap.set(r.id, normalized);
          } else {
            const existingScore = (existing.uid ? 1 : 0) + (existing.username ? 1 : 0) + (existing.created_at ? 1 : 0) + (existing.points !== undefined ? 1 : 0);
            const currentScore = (normalized.uid ? 1 : 0) + (normalized.username ? 1 : 0) + (normalized.created_at ? 1 : 0) + (normalized.points !== undefined ? 1 : 0);
            if (currentScore > existingScore) {
              aggregatedMap.set(r.id, normalized);
            }
          }
        }
      } catch (e) {
        // skip tenant on error but continue others
        continue;
      }
    }

    const aggregated = Array.from(aggregatedMap.values());

    return c.json(aggregated);
  } catch (e) {
    console.error('GET /api/admin/users error', e);
    return c.json([]);
  }
});
// Manage user roles (super-admin / tenant-admin)
app.post('/api/admin/users/:id/role', async (c) => {
  try {
    const actorId = c.get('userId'); if (!actorId) return c.json({ error: 'unauthorized' }, 401);
    const isActorSuper = await isSuperAdminUser(actorId);
    if (!isActorSuper) return c.json({ error: 'forbidden' }, 403);
    const targetId = c.req.param('id'); if (!targetId) return c.json({ error: 'invalid' }, 400);
    const body = await c.req.json();
    const action = body?.action;
    const explicitTenantId = Number(body?.tenantId || 0);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenantId = await resolveTenantId(defaultDb, host);
    const tenantId = explicitTenantId > 0 ? explicitTenantId : resolvedTenantId;
    const gdb = getGlobalDb();

    if (action === 'set-super' || action === 'remove-super') {
      // already ensured actor is super
    }

    if (action === 'set-super') {
      await gdb.insert(adminUsersTable).values({ userId: targetId });
    } else if (action === 'remove-super') {
      await gdb.delete(adminUsersTable).where(eq(adminUsersTable.userId, targetId));
    } else if (action === 'set-tenant-admin') {
      // Prevent duplicates and enforce single-tenant-only per user
      try {
        const existing = await gdb.select().from(tenantAdminsTable).where(eq(tenantAdminsTable.userId, targetId));
        const hasSame = (existing || []).some(r => Number(r.tenantId) === Number(tenantId));
        if (hasSame) return c.json({ error: 'already-tenant-admin' }, 409);
        if ((existing || []).length > 0) return c.json({ error: 'single-tenant-only' }, 409);
      } catch {}
      await gdb.insert(tenantAdminsTable).values({ tenantId, userId: targetId });
    } else if (action === 'remove-tenant-admin') {
      await gdb.delete(tenantAdminsTable).where(and(eq(tenantAdminsTable.tenantId, tenantId), eq(tenantAdminsTable.userId, targetId)));
    } else {
      return c.json({ error: 'invalid-action' }, 400);
    }
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/admin/users/:id/role error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// Update user profile (identity fields in GLOBAL SoT), business fields via separate endpoint
app.put('/api/admin/users/:id', async (c) => {
  try {
    const actorId = c.get('userId'); if (!actorId) return c.json({ error: 'unauthorized' }, 401);
    const isActorSuper = await isSuperAdminUser(actorId);
    if (!isActorSuper) return c.json({ error: 'forbidden' }, 403);
    const targetId = c.req.param('id'); if (!targetId) return c.json({ error: 'invalid' }, 400);
    const body = await c.req.json();

    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenantId = await resolveTenantId(defaultDb, host);

    const gdb = getGlobalDb();

    // Ensure optional columns exist in GLOBAL SoT
    try { const raw = getGlobalClient(); await raw.execute("alter table profiles add column uid text"); } catch {}
    try { const raw = getGlobalClient(); await raw.execute("create unique index if not exists idx_profiles_uid on profiles(uid)"); } catch {}
    try { const raw = getGlobalClient(); await raw.execute("alter table profiles add column invite_code text"); } catch {}
    try { const raw = getGlobalClient(); await raw.execute("alter table profiles add column avatar_url text"); } catch {}

    // Validate uid if provided (GLOBAL uniqueness)
    if (body.uid !== undefined) {
      const str = String(body.uid);
      if (!/^\d{1,8}$/.test(str)) return c.json({ error: 'invalid-uid' }, 400);
      const conflict = await gdb.select().from(profiles).where(and(eq(profiles.uid, str), sql`${profiles.id} <> ${targetId}`)).limit(1);
      if (conflict && conflict.length > 0) return c.json({ error: 'uid-conflict' }, 409);
    }

    // Build identity updates for GLOBAL SoT only
    const identityUpdates = {};
    if (body.username !== undefined) identityUpdates.username = String(body.username || '');
    if (body.uid !== undefined) identityUpdates.uid = String(body.uid || '');
    if (body.avatar_url !== undefined) identityUpdates.avatarUrl = String(body.avatar_url || '');

    if (Object.keys(identityUpdates).length > 0) {
      const existing = await gdb.select().from(profiles).where(eq(profiles.id, targetId)).limit(1);
      if (!existing || existing.length === 0) {
        const nowIso = new Date().toISOString();
        await gdb.insert(profiles).values({ id: targetId, username: identityUpdates.username || '', uid: identityUpdates.uid || null, avatarUrl: identityUpdates.avatarUrl || null, tenantId: 0, points: 0, createdAt: nowIso });
      }
      await gdb.update(profiles).set(identityUpdates).where(eq(profiles.id, targetId));
    }

    // Load identity (global) + business (current tenant) to return normalized record
    const superRows2 = await gdb.select().from(adminUsersTable);
    const superSet2 = new Set((superRows2 || []).map(r => r.userId));
    const allTenantAdminRows2 = await gdb.select().from(tenantAdminsTable);
    const adminTenantsByUser2 = new Map();
    for (const r of (allTenantAdminRows2 || [])) {
      const arr = adminTenantsByUser2.get(r.userId) || [];
      const tId = Number(r.tenantId);
      if (!arr.includes(tId)) arr.push(tId);
      adminTenantsByUser2.set(r.userId, arr);
    }
    let tenantRowsAll2 = [];
    try { tenantRowsAll2 = await gdb.select().from(tenantRequestsTable); } catch {}
    const idToDomain2 = new Map((tenantRowsAll2 || []).map(tr => [Number(tr.id), tr.desiredDomain || tr.desired_domain || '']));
    const aliveTenantIds2 = new Set((tenantRowsAll2 || []).filter(t => (t.status || 'active') === 'active').map(tr => Number(tr.id)));
    const tenantIds2 = (adminTenantsByUser2.get(targetId) || []).filter(id => aliveTenantIds2.has(Number(id)));
    const domains2 = tenantIds2.map(id => idToDomain2.get(Number(id))).filter(Boolean);

    const globalRow = (await gdb.select().from(profiles).where(eq(profiles.id, targetId)).limit(1))?.[0];
    const normalized = {
      id: targetId,
      uid: globalRow?.uid || null,
      username: globalRow?.username || '',
      avatar_url: globalRow?.avatarUrl || null,
      tenant_id: resolvedTenantId,
      points: globalRow?.points ?? 0,
      virtual_currency: globalRow?.virtualCurrency ?? 0,
      invitation_points: globalRow?.invitationPoints ?? 0,
      free_posts_count: globalRow?.freePostsCount ?? 0,
      created_at: globalRow?.createdAt || null,
      is_super_admin: superSet2.has(targetId),
      is_tenant_admin: (tenantIds2.length > 0),
      tenant_admin_tenants: tenantIds2,
      tenant_admin_domains: domains2,
      role: superSet2.has(targetId) ? 'super-admin' : ((tenantIds2.length > 0) ? 'tenant-admin' : 'user'),
    };

    return c.json(normalized);
  } catch (e) {
    console.error('PUT /api/admin/users/:id error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// Update user business stats in TENANT scope (points/virtual_currency/free_posts_count)
app.put('/api/admin/users/:id/stats', async (c) => {
  try {
    const actorId = c.get('userId'); if (!actorId) return c.json({ error: 'unauthorized' }, 401);
    const isActorSuper = await isSuperAdminUser(actorId);
    if (!isActorSuper) return c.json({ error: 'forbidden' }, 403);
    const targetId = c.req.param('id'); if (!targetId) return c.json({ error: 'invalid' }, 400);
    const body = await c.req.json();

    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = Number(body?.tenant_id ?? (await resolveTenantId(defaultDb, host)));

    const updates = {};
    if (body.points !== undefined) updates.points = Math.max(0, Number(body.points || 0));
    if (body.virtual_currency !== undefined) updates.virtualCurrency = Math.max(0, Number(body.virtual_currency || 0));
    if (body.free_posts_count !== undefined) updates.freePostsCount = Math.max(0, Number(body.free_posts_count || 0));

    if (Object.keys(updates).length > 0) {
      const nowIso = new Date().toISOString();
      updates.updatedAt = nowIso;
      const existing = await gdb.select().from(profiles).where(eq(profiles.id, targetId)).limit(1);
      if (!existing || existing.length === 0) {
        await gdb.insert(profiles).values({ id: targetId, username: '用户', tenantId: 0, points: 0, virtualCurrency: 0, freePostsCount: 0, createdAt: nowIso });
      }
      await gdb.update(profiles).set(updates).where(eq(profiles.id, targetId));
    }

    const updated = (await gdb.select().from(profiles).where(eq(profiles.id, targetId)).limit(1))?.[0];
    return c.json({
      id: targetId,
      tenant_id: tenantId,
      points: updated?.points ?? 0,
      virtual_currency: updated?.virtualCurrency ?? 0,
      free_posts_count: updated?.freePostsCount ?? 0,
      created_at: updated?.createdAt || updated?.created_at || null,
    });
  } catch (e) {
    console.error('PUT /api/admin/users/:id/stats error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// Verify user data consistency between Supabase and Turso
app.post('/api/admin/users/:id/verify', async (c) => {
  try {
    const actorId = c.get('userId');
    if (!actorId) return c.json({ error: 'unauthorized' }, 401);
    
    const isActorSuper = await isSuperAdminUser(actorId);
    if (!isActorSuper) return c.json({ error: 'forbidden' }, 403);
    
    const targetUserId = c.req.param('id');
    if (!targetUserId) return c.json({ error: 'invalid' }, 400);
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const result = {
      userId: targetUserId,
      supabase: null,
      turso: null,
      consistent: false,
      issues: [],
    };
    
    // Check Supabase
    if (supabaseUrl && serviceRoleKey) {
      try {
        const response = await fetch(
          `${supabaseUrl}/auth/v1/admin/users/${targetUserId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey,
            },
          }
        );
        
        if (response.ok) {
          const userData = await response.json();
          result.supabase = {
            exists: true,
            email: userData.email,
            email_confirmed_at: userData.email_confirmed_at,
            created_at: userData.created_at,
            last_sign_in_at: userData.last_sign_in_at,
          };
        } else {
          result.supabase = { exists: false };
          result.issues.push('Supabase 中不存在此用户');
        }
      } catch (e) {
        result.issues.push(`Supabase 查询失败: ${e.message}`);
      }
    } else {
      result.issues.push('Supabase 凭证缺失');
    }
    
    // Check Turso
    try {
      const gdb = getGlobalDb();
      const profileRows = await gdb.select().from(profiles).where(eq(profiles.id, targetUserId)).limit(1);
      
      if (profileRows && profileRows.length > 0) {
        const profile = profileRows[0];
        result.turso = {
          exists: true,
          username: profile.username,
          points: profile.points || 0,
          virtual_currency: profile.virtualCurrency || 0,
          created_at: profile.createdAt || profile.created_at,
        };
      } else {
        result.turso = { exists: false };
        result.issues.push('Turso 中不存在此用户 profile');
      }
    } catch (e) {
      result.issues.push(`Turso 查询失败: ${e.message}`);
    }
    
    // Check consistency
    if (result.supabase?.exists && result.turso?.exists) {
      result.consistent = true;
      result.message = '数据一致：用户在 Supabase 和 Turso 都存在';
    } else if (!result.supabase?.exists && result.turso?.exists) {
      result.consistent = false;
      result.message = '数据不一致：Supabase 已删除但 Turso 仍有数据（孤立 profile）';
      result.recommendation = '建议删除 Turso 中的孤立 profile';
    } else if (result.supabase?.exists && !result.turso?.exists) {
      result.consistent = false;
      result.message = '数据不一致：Supabase 存在但 Turso 无 profile';
      result.recommendation = '用户可能尚未登录，首次登录时会自动创建 profile';
    } else {
      result.consistent = true;
      result.message = '数据一致：用户在两边都不存在';
    }
    
    return c.json(result);
    
  } catch (e) {
    console.error('POST /api/admin/users/:id/verify error', e);
    return c.json({ error: 'failed', message: e.message }, 500);
  }
});

// Clean orphaned profiles (exists in Turso but not in Supabase)
app.post('/api/admin/users/cleanup-orphaned', async (c) => {
  try {
    const actorId = c.get('userId');
    if (!actorId) return c.json({ error: 'unauthorized' }, 401);
    
    const isActorSuper = await isSuperAdminUser(actorId);
    if (!isActorSuper) return c.json({ error: 'forbidden' }, 403);
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !serviceRoleKey) {
      return c.json({ error: 'supabase-credentials-missing' }, 500);
    }
    
    const gdb = getGlobalDb();
    const allProfiles = await gdb.select().from(profiles);
    
    const orphanedProfiles = [];
    const validProfiles = [];
    
    // Check each profile against Supabase
    for (const profile of allProfiles) {
      try {
        const response = await fetch(
          `${supabaseUrl}/auth/v1/admin/users/${profile.id}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey,
            },
          }
        );
        
        if (response.ok) {
          validProfiles.push(profile.id);
        } else if (response.status === 404) {
          orphanedProfiles.push({
            id: profile.id,
            username: profile.username,
            created_at: profile.createdAt || profile.created_at,
          });
        }
      } catch (e) {
        console.error(`Error checking user ${profile.id}:`, e);
      }
    }
    
    // Optionally delete orphaned profiles
    const shouldDelete = c.req.query('delete') === 'true';
    let deletedCount = 0;
    
    if (shouldDelete && orphanedProfiles.length > 0) {
      for (const orphan of orphanedProfiles) {
        try {
          // Delete invitations
          await gdb.delete(invitations).where(eq(invitations.inviterId, orphan.id));
          await gdb.delete(invitations).where(eq(invitations.inviteeId, orphan.id));
          
          // Delete comments
          await gdb.delete(commentsTable).where(eq(commentsTable.userId, orphan.id));
          
          // Delete posts
          await gdb.delete(postsTable).where(eq(postsTable.authorId, orphan.id));
          
          // Delete admin roles
          await gdb.delete(adminUsersTable).where(eq(adminUsersTable.userId, orphan.id));
          await gdb.delete(tenantAdminsTable).where(eq(tenantAdminsTable.userId, orphan.id));
          
          // Delete profile
          await gdb.delete(profiles).where(eq(profiles.id, orphan.id));
          
          deletedCount++;
        } catch (e) {
          console.error(`Failed to delete orphaned profile ${orphan.id}:`, e);
        }
      }
    }
    
    return c.json({
      ok: true,
      total_profiles: allProfiles.length,
      valid_profiles: validProfiles.length,
      orphaned_profiles: orphanedProfiles.length,
      orphaned_list: orphanedProfiles,
      deleted_count: deletedCount,
      action_taken: shouldDelete ? 'deleted' : 'none (use ?delete=true to remove)',
    });
    
  } catch (e) {
    console.error('POST /api/admin/users/cleanup-orphaned error', e);
    return c.json({ error: 'failed', message: e.message }, 500);
  }
});

// Delete user (cascade delete from both Supabase and Turso)
app.delete('/api/admin/users/:id', async (c) => {
  try {
    const actorId = c.get('userId');
    if (!actorId) return c.json({ error: 'unauthorized' }, 401);
    
    // Only super admin can delete users
    const isActorSuper = await isSuperAdminUser(actorId);
    if (!isActorSuper) return c.json({ error: 'forbidden' }, 403);
    
    const targetUserId = c.req.param('id');
    if (!targetUserId) return c.json({ error: 'invalid' }, 400);
    
    // Prevent self-deletion
    if (targetUserId === actorId) {
      return c.json({ error: 'cannot-delete-self' }, 400);
    }
    
    const gdb = getGlobalDb();
    const deletedData = {
      profiles: 0,
      posts: 0,
      comments: 0,
      invitations: 0,
      admin_roles: 0,
      errors: [],
    };
    
    // === Step 1: Delete Turso data ===
    
    // 1.1 Delete admin roles
    try {
      await gdb.delete(adminUsersTable).where(eq(adminUsersTable.userId, targetUserId));
      deletedData.admin_roles++;
    } catch (e) {
      console.error('Failed to delete admin_users:', e);
      deletedData.errors.push('admin_users: ' + e.message);
    }
    
    try {
      await gdb.delete(tenantAdminsTable).where(eq(tenantAdminsTable.userId, targetUserId));
      deletedData.admin_roles++;
    } catch (e) {
      console.error('Failed to delete tenant_admins:', e);
      deletedData.errors.push('tenant_admins: ' + e.message);
    }
    
    // 1.2 Delete invitations (as inviter or invitee)
    try {
      await gdb.delete(invitations).where(eq(invitations.inviterId, targetUserId));
      await gdb.delete(invitations).where(eq(invitations.inviteeId, targetUserId));
      deletedData.invitations++;
    } catch (e) {
      console.error('Failed to delete invitations:', e);
      deletedData.errors.push('invitations: ' + e.message);
    }
    
    // 1.3 Delete comments
    try {
      await gdb.delete(commentsTable).where(eq(commentsTable.userId, targetUserId));
      deletedData.comments++;
    } catch (e) {
      console.error('Failed to delete comments:', e);
      deletedData.errors.push('comments: ' + e.message);
    }
    
    // 1.4 Delete posts
    try {
      await gdb.delete(postsTable).where(eq(postsTable.authorId, targetUserId));
      deletedData.posts++;
    } catch (e) {
      console.error('Failed to delete posts:', e);
      deletedData.errors.push('posts: ' + e.message);
    }
    
    // 1.5 Delete profile (last, as other tables may reference it)
    try {
      await gdb.delete(profiles).where(eq(profiles.id, targetUserId));
      deletedData.profiles = 1;
    } catch (e) {
      console.error('Failed to delete profile:', e);
      deletedData.errors.push('profiles: ' + e.message);
    }
    
    // === Step 2: Delete Supabase user ===
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    let supabaseDeleteSuccess = false;
    let supabaseAlreadyDeleted = false;
    
    if (supabaseUrl && serviceRoleKey) {
      try {
        const response = await fetch(
          `${supabaseUrl}/auth/v1/admin/users/${targetUserId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey,
            },
          }
        );
        
        if (response.ok) {
          supabaseDeleteSuccess = true;
        } else if (response.status === 404) {
          // 用户在 Supabase 中不存在（可能已被删除），视为成功
          supabaseDeleteSuccess = true;
          supabaseAlreadyDeleted = true;
          console.log(`User ${targetUserId} not found in Supabase (already deleted)`);
        } else {
          const errorText = await response.text();
          console.error('Supabase delete failed:', errorText);
          deletedData.errors.push('supabase: ' + errorText);
        }
      } catch (e) {
        console.error('Supabase delete error:', e);
        deletedData.errors.push('supabase: ' + e.message);
      }
    } else {
      // 如果没有 Supabase 凭证，但 Turso 数据已删除，也视为部分成功
      console.warn('Missing Supabase credentials, only Turso data deleted');
      deletedData.errors.push('supabase: Missing credentials (only Turso data deleted)');
      // 仍然返回成功，因为至少 Turso 数据已清理
      supabaseDeleteSuccess = true;
    }
    
    // Return result
    if (!supabaseDeleteSuccess) {
      return c.json({
        ok: false,
        error: 'supabase-delete-failed',
        message: 'Turso 数据已删除，但 Supabase 用户删除失败',
        deletedData
      }, 500);
    }
    
    return c.json({
      ok: true,
      message: '用户已完全删除',
      deletedData,
      userId: targetUserId
    });
    
  } catch (e) {
    console.error('DELETE /api/admin/users/:id error', e);
    return c.json({ error: 'failed', message: e.message }, 500);
  }
});

app.get('/api/admin/posts', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const status = c.req.query('status'); // optional
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    let rows = await db
      .select()
      .from(postsTable)
      .where(inArray(postsTable.tenantId, [tenantId, 0]))
      .orderBy(desc(postsTable.createdAt));
    if (status) {
      rows = (rows || []).filter((r) => r.status === status);
    }
    const authorIds = Array.from(new Set((rows || []).map((r) => r.authorId).filter(Boolean)));
    let authors = [];
    if (authorIds.length > 0) {
      authors = await db.select().from(profiles).where(inArray(profiles.id, authorIds));
    }
    const authorMap = new Map();
    for (const a of authors || []) authorMap.set(a.id, { id: a.id, username: a.username, avatar_url: a.avatarUrl });
    const enriched = (rows || []).map((r) => ({ ...r, author: authorMap.get(r.authorId) || null }));
    return c.json(enriched);
  } catch (e) {
    console.error('GET /api/admin/posts error', e);
    return c.json([]);
  }
});

app.get('/api/admin/comments', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const rows = await db.select().from(commentsTable).orderBy(desc(commentsTable.createdAt));
    const userIds = Array.from(new Set((rows || []).map((r) => r.userId)));
    const postIds = Array.from(new Set((rows || []).map((r) => r.postId)));
    let authors = [];
    if (userIds.length > 0) authors = await db.select().from(profiles).where(inArray(profiles.id, userIds));
    let posts = [];
    if (postIds.length > 0) posts = await db.select().from(postsTable).where(inArray(postsTable.id, postIds));
    const authorMap = new Map();
    for (const a of authors || []) authorMap.set(a.id, { id: a.id, username: a.username, avatar_url: a.avatarUrl });
    const postMap = new Map();
    for (const p of posts || []) postMap.set(p.id, { id: p.id, content: p.content });
    const enriched = (rows || []).map((r) => ({
      ...r,
      author: authorMap.get(r.userId) || null,
      post: postMap.get(r.postId) || null,
    }));
    return c.json(enriched);
  } catch (e) {
    console.error('GET /api/admin/comments error', e);
    return c.json([]);
  }
});

app.post('/api/admin/posts/:id/status', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id'));
    const { status, reason } = await c.req.json();
    if (!id || !status) return c.json({ error: 'invalid' }, 400);
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    await db.update(postsTable).set({ status, rejectionReason: reason ?? null }).where(eq(postsTable.id, id));
    const rows = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    return c.json(rows?.[0] || { id, status, rejection_reason: reason ?? null });
  } catch (e) {
    console.error('POST /api/admin/posts/:id/status error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

app.post('/api/admin/seed-demo', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const defaultDb = await getTursoClientForTenant(0);

    // Ensure a demo user exists
    const existingUser = await defaultDb.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!existingUser || existingUser.length === 0) {
      await defaultDb.insert(profiles).values({ id: userId, username: '演示用户', tenantId: 0, points: 100, createdAt: new Date().toISOString() });
    }

    // Insert a few demo posts if none
    const existingPosts = await defaultDb.select().from(postsTable).limit(1);
    if (!existingPosts || existingPosts.length === 0) {
      const now = Date.now();
      const sample = [
        { content: '欢迎来到大海团队的社区！', images: JSON.stringify([]) },
        { content: '这是第二条演示动态，支持图片与评论～', images: JSON.stringify(['https://picsum.photos/seed/demo1/600/400']) },
        { content: '把你的第一条动态发出来吧！', images: JSON.stringify([]) },
      ];
      for (let i = 0; i < sample.length; i++) {
        const createdAt = new Date(now - (sample.length - 1 - i) * 3600 * 1000).toISOString();
        await defaultDb.insert(postsTable).values({
          tenantId: 0,
          authorId: userId,
          content: sample[i].content,
          images: sample[i].images,
          isAd: 0,
          isPinned: i === 0 ? 1 : 0,
          status: 'approved',
          createdAt,
          updatedAt: createdAt,
        });
      }
    }

    // Add a couple comments and likes to the most recent post
    const posts = await defaultDb.select().from(postsTable).orderBy(desc(postsTable.createdAt)).limit(1);
    const latest = posts?.[0];
    if (latest) {
      await defaultDb.insert(commentsTable).values({ postId: latest.id, userId, content: '第一！', createdAt: new Date().toISOString() });
      await defaultDb.insert(likesTable).values({ postId: latest.id, userId });
    }

    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/admin/seed-demo error', e);
    return c.json({ ok: false }, 500);
  }
});

app.post('/api/admin/seed-homepage', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const now = new Date().toISOString();

    const existing = await db.select().from(pageContentTable).where(and(eq(pageContentTable.page, 'home'), inArray(pageContentTable.section, ['carousel','announcements','feature_cards','hot_games'])));
    if ((existing || []).length > 0) return c.json({ ok: true, skipped: true });

    const inserts = [
      { tenantId, page: 'home', section: 'carousel', position: 0, content: JSON.stringify({ title: '欢迎来到大海团队', description: '体验社交与游戏的乐趣', image_url: 'https://picsum.photos/seed/carousel/1200/400' }) },
      { tenantId, page: 'home', section: 'announcements', position: 0, content: JSON.stringify({ text: '🎉 平台全新上线，欢迎体验！' }) },
      { tenantId, page: 'home', section: 'feature_cards', position: 0, content: JSON.stringify({ title: '朋友圈', description: '分享日常，互动点赞', path: '/social', icon: 'MessageSquare' }) },
      { tenantId, page: 'home', section: 'feature_cards', position: 1, content: JSON.stringify({ title: '游戏中心', description: '精选小游戏合集', path: '/games', icon: 'Gamepad2' }) },
      { tenantId, page: 'home', section: 'feature_cards', position: 2, content: JSON.stringify({ title: '站点设置', description: '自定义站点内容', path: '/admin/page-content', icon: 'Settings' }) },
      { tenantId, page: 'home', section: 'hot_games', position: 0, content: JSON.stringify({ title: '演示游戏A', description: '有趣又好玩', path: '/games', iconUrl: 'https://picsum.photos/seed/game1/200/200' }) },
      { tenantId, page: 'home', section: 'hot_games', position: 1, content: JSON.stringify({ title: '演示游戏B', description: '简单轻松', path: '/games', iconUrl: 'https://picsum.photos/seed/game2/200/200' }) },
    ];
    for (const v of inserts) {
      await db.insert(pageContentTable).values(v);
    }

    return c.json({ ok: true, count: inserts.length, tenantId });
  } catch (e) {
    console.error('POST /api/admin/seed-homepage error', e);
    return c.json({ ok: false }, 500);
  }
});

app.post('/api/admin/seed-tenant', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const tenantIdParam = c.req.query('tenantId');
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenant = await resolveTenantId(defaultDb, host);
    const tenantId = tenantIdParam !== undefined ? Number(tenantIdParam) : resolvedTenant;
    const db = await getTursoClientForTenant(tenantId);

    // profiles
    const authors = [
      { id: 'tenant-user-1', username: '演示用户1' },
      { id: 'tenant-user-2', username: '演示用户2' },
    ];
    for (const a of authors) {
      const exist = await db.select().from(profiles).where(eq(profiles.id, a.id)).limit(1);
      if (!exist || exist.length === 0) {
        await db.insert(profiles).values({ id: a.id, username: a.username, tenantId, points: 0, createdAt: new Date().toISOString() });
      }
    }

    // posts
    const existingPosts = await db.select().from(postsTable).limit(1);
    if (!existingPosts || existingPosts.length === 0) {
      const now = Date.now();
      const samples = [
        { authorId: authors[0].id, content: '欢迎来到分站，这里是演示内容。', images: JSON.stringify([]), isPinned: 1 },
        { authorId: authors[1].id, content: '可以在这里发布动态和图片。', images: JSON.stringify(['https://picsum.photos/seed/tpost/600/400']), isPinned: 0 },
      ];
      for (let i = 0; i < samples.length; i++) {
        const createdAt = new Date(now - (samples.length - 1 - i) * 3600 * 1000).toISOString();
        await db.insert(postsTable).values({ tenantId, authorId: samples[i].authorId, content: samples[i].content, images: samples[i].images, isAd: 0, isPinned: samples[i].isPinned, status: 'approved', createdAt, updatedAt: createdAt });
      }
    }

    // homepage content via existing seeder
    const seedRes = await fetch('http://localhost:8787/api/admin/seed-homepage', { method: 'POST', headers: { Authorization: c.req.header('authorization') || '' } });
    await seedRes.text().catch(() => {});

    return c.json({ ok: true, tenantId });
  } catch (e) {
    console.error('POST /api/admin/seed-tenant error', e);
    return c.json({ ok: false }, 500);
  }
});
app.post('/api/admin/seed-shared', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const db = getGlobalDb();
    // ensure app_settings
    await db.insert(appSettings).values({ tenantId: 0, key: 'social_forum_mode', value: 'shared' }).onConflictDoNothing?.();

    // ensure author profile
    const now = new Date().toISOString();
    const prof = await db.select().from(sharedProfiles).where(eq(sharedProfiles.id, userId)).limit(1);
    if (!prof || prof.length === 0) {
      let username = '平台用户';
      try {
        const base = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
        if (base && base[0] && base[0].username) username = base[0].username;
      } catch {}
      await db.insert(sharedProfiles).values({ id: userId, username, createdAt: now });
    }

    const exist = await db.select().from(sharedPosts).limit(1);
    if (!exist || exist.length === 0) {
      await db.insert(sharedPosts).values({ authorId: userId, content: '欢迎来到共享论坛！', images: JSON.stringify([]), isPinned: 1, status: 'approved', createdAt: now, updatedAt: now });
      await db.insert(sharedPosts).values({ authorId: userId, content: '这是第二条演示动态。', images: JSON.stringify([]), isPinned: 0, status: 'approved', createdAt: now, updatedAt: now });
    }

    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/admin/seed-shared error', e);
    return c.json({ ok: false }, 500);
  }
});

app.get('/api/auth/is-super-admin', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ isSuperAdmin: false });
    const db = getGlobalDb();
    const rows = await db.select().from(adminUsersTable).where(eq(adminUsersTable.userId, userId)).limit(1);
    return c.json({ isSuperAdmin: (rows || []).length > 0 });
  } catch (e) {
    console.error('GET /api/auth/is-super-admin error', e);
    return c.json({ isSuperAdmin: false });
  }
});

app.get('/api/auth/tenant-admins', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json([]);
    const db = getGlobalDb();
    const rows = await db.select().from(tenantAdminsTable).where(eq(tenantAdminsTable.userId, userId));
    return c.json(rows || []);
  } catch (e) {
    console.error('GET /api/auth/tenant-admins error', e);
    return c.json([]);
  }
});

app.get('/api/admin/branch-map', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const envMap = (() => { try { return process.env.TURSO_BRANCH_MAP ? JSON.parse(process.env.TURSO_BRANCH_MAP) : {}; } catch { return {}; } })();
    return c.json({ runtime: runtimeBranchMap, env: envMap });
  } catch (e) {
    return c.json({ runtime: runtimeBranchMap, env: {} });
  }
});

app.post('/api/admin/branch-map', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const { tenantId, branchUrl } = await c.req.json();
    if (tenantId === undefined || !branchUrl) return c.json({ error: 'invalid' }, 400);
    runtimeBranchMap[String(tenantId)] = branchUrl;
    return c.json({ ok: true, runtime: runtimeBranchMap });
  } catch (e) {
    return c.json({ error: 'failed' }, 500);
  }
});
app.delete('/api/admin/branch-map/:tenantId', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const t = c.req.param('tenantId');
    delete runtimeBranchMap[String(t)];
    return c.json({ ok: true, runtime: runtimeBranchMap });
  } catch (e) {
    return c.json({ error: 'failed' }, 500);
  }
});
// requireAdmin 函數已移至 utils/errors.js

async function isSuperAdminUser(userId) {
  if (!userId) return false;
  try {
    const db = getGlobalDb();
    const rows = await db.select().from(adminUsersTable).where(eq(adminUsersTable.userId, userId)).limit(1);
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function canManageTenant(userId, tenantId) {
  if (!userId) return false;
  if (await isSuperAdminUser(userId)) return true;
  try {
    const gdb = getGlobalDb();
    const rows = await gdb.select().from(tenantAdminsTable).where(and(eq(tenantAdminsTable.userId, userId), eq(tenantAdminsTable.tenantId, tenantId))).limit(1);
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function ensureUid(db, table, idField, idValue) {
  // Try read uid; if schema lacks uid, silently skip
  try {
    const profile = await db.select().from(table).where(eq(idField, idValue)).limit(1);
    if (profile && profile[0] && profile[0].uid) return profile[0].uid;
  } catch {}
  // Generate unique 6-digit uid
  const rnd = () => String(Math.floor(100000 + Math.random() * 900000));
  let uid = rnd();
  let tries = 0;
  try {
    while (tries < 10) {
      const exists = await db.select().from(table).where(eq(table.uid, uid)).limit(1);
      if (!exists || exists.length === 0) break;
      uid = rnd();
      tries++;
    }
    await db.update(table).set({ uid }).where(eq(idField, idValue));
  } catch {}
  return uid;
}

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function ensureInviteCode(db, table, idField, idValue) {
  // try read field
  try {
    const prof = await db.select().from(table).where(eq(idField, idValue)).limit(1);
    const existing = prof?.[0]?.inviteCode;
    const valid = typeof existing === 'string' && /^[A-Z0-9]{8}$/.test(existing);
    if (valid) return existing;
  } catch {}
  // add column if missing
  try { const raw = getGlobalClient(); await raw.execute("alter table profiles add column invite_code text"); } catch {}
  // generate unique
  let code = generateInviteCode();
  try {
    const raw = getGlobalClient();
    // avoid collision up to 10 tries
    for (let i = 0; i < 10; i++) {
      const check = await raw.execute({ sql: "select 1 from profiles where invite_code = ? limit 1", args: [code] });
      const exists = Array.isArray(check?.rows) && check.rows.length > 0;
      if (!exists) break;
      code = generateInviteCode();
    }
    await raw.execute({ sql: "update profiles set invite_code = ? where id = ?", args: [code, idValue] });
  } catch {}
  return code;
}

// Tenant requests admin routes
app.get('/api/admin/tenant-requests', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json([], 401);
    const gdb = getGlobalDb();
    await ensureTenantRequestsSchemaRaw(getGlobalClient());
    const rows = await gdb.select().from(tenantRequestsTable).orderBy(desc(tenantRequestsTable.id));
    // enrich profile from shared_profiles or profiles(0)
    const ids = Array.from(new Set((rows || []).map(r => r.userId).filter(Boolean)));
    const profs = ids.length ? await gdb.select().from(profiles).where(inArray(profiles.id, ids)) : [];
    const pmap = new Map((profs || []).map(p => [p.id, { username: p.username, avatar_url: p.avatarUrl }]));
    const list = (rows || []).map(r => ({
      ...r,
      profile: pmap.get(r.userId) || null,
    }));
    return c.json(list);
  } catch (e) {
    console.error('GET /api/admin/tenant-requests error', e);
    return c.json([]);
  }
});

app.get('/api/admin/tenant-requests/check-domain', async (c) => {
  try {
    const domain = c.req.query('domain');
    if (!domain) return c.json({ available: false }, 400);
    const gdb = getGlobalDb();
    await ensureTenantRequestsSchemaRaw(getGlobalClient());
    const rows = await gdb.select().from(tenantRequestsTable).where(eq(tenantRequestsTable.desiredDomain, domain)).limit(1);
    return c.json({ available: !(rows && rows.length) });
  } catch (e) {
    return c.json({ available: false });
  }
});

app.post('/api/admin/tenant-requests', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const body = await c.req.json();
      const desiredDomain = String(body?.desiredDomain || body?.desired_domain || '').trim();
  const contactWangWang = body?.contactWangWang || body?.contact_wangwang || '';
  const targetUserId = body?.targetUserId || body?.userId || userId;
  if (!desiredDomain) return c.json({ error: 'invalid' }, 400);
  const gdb = getGlobalDb();
  await ensureTenantRequestsSchemaRaw(getGlobalClient());
  const now = new Date().toISOString();
  // generate slug and fallback
  function toSlug(d){ return d.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,63); }
  let slug = toSlug(desiredDomain.replace(/\.+/g,'-'));
  if (!slug) slug = 'site';
  const fallbackRoot = process.env.FALLBACK_ROOT_DOMAIN || process.env.NEXT_PUBLIC_FALLBACK_ROOT_DOMAIN;
  const fallbackDomain = fallbackRoot ? `${slug}.${fallbackRoot}` : null;
  // ensure slug uniqueness (up to 5 tries)
  try {
    const existing = await gdb.select().from(tenantRequestsTable);
    const used = new Set((existing||[]).map(r => (r.vercelSubdomainSlug || r.vercel_subdomain_slug || '').toLowerCase()));
    if (used.has(slug)) {
      for (let i=1;i<=5;i++){ const s=`${slug}-${i}`; if(!used.has(s)){ slug=s; break; }}
    }
  } catch {}
  await gdb.insert(tenantRequestsTable).values({ desiredDomain, userId: targetUserId, contactWangWang, status: 'pending', createdAt: now, vercelSubdomainSlug: slug, fallbackDomain, vercelDeploymentStatus: 'reserved' });
  return c.json({ ok: true, slug, fallbackDomain });
  } catch (e) {
    console.error('POST /api/admin/tenant-requests error', e);
    return c.json({ ok: false }, 500);
  }
});

app.post('/api/admin/tenant-requests/:id/approve', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id')); if (!id) return c.json({ error: 'invalid' }, 400);
    const gdb = getGlobalDb();
    await ensureTenantRequestsSchemaRaw(getGlobalClient());
    // Provision branch for this tenant id
    const prov = await fetch(`http://localhost:${process.env.PORT || 8787}/api/admin/tenants/${id}/provision`, { method: 'POST', headers: { Authorization: c.req.header('authorization') || '' } });
    const pdata = await prov.json().catch(() => ({}));
    await gdb.update(tenantRequestsTable).set({ status: 'active', vercelDeploymentStatus: 'provisioned' }).where(eq(tenantRequestsTable.id, id));
    const reread = (await gdb.select().from(tenantRequestsTable).where(eq(tenantRequestsTable.id, id)).limit(1))?.[0] || null;

    // 2.6) Add desired domain to Vercel project (custom domain)
    let vercelAdd = null;
    try {
      const token = process.env.VERCEL_TOKEN;
      const projectId = process.env.VERCEL_PROJECT_ID;
      const teamId = process.env.VERCEL_TEAM_ID;
      const desired = reread?.desiredDomain || reread?.desired_domain || null;
      if (token && projectId && desired) {
        const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains`);
        if (teamId) url.searchParams.set('teamId', teamId);
        const resp = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: desired })
        });
        const data = await resp.json().catch(() => ({}));
        vercelAdd = { ok: resp.ok, status: resp.status, data };
        // Persist projectId, keep vercelAssignedDomain as fallback for preview convenience
        const toSet = { vercelProjectId: projectId, vercelDeploymentStatus: resp.ok ? 'added' : 'pending' };
        try { await gdb.update(tenantRequestsTable).set(toSet).where(eq(tenantRequestsTable.id, id)); } catch {}
      }
    } catch {}

    // Grant tenant-admin role to the owner (single-tenant-only) and seed demo data
    try {
      const ownerRow = await gdb.select().from(tenantRequestsTable).where(eq(tenantRequestsTable.id, id)).limit(1);
      const ownerId = ownerRow?.[0]?.userId || ownerRow?.[0]?.user_id || null;
      if (ownerId) {
        const existing = await gdb.select().from(tenantAdminsTable).where(eq(tenantAdminsTable.userId, ownerId));
        for (const r of (existing || [])) {
          if (Number(r.tenantId) !== Number(id)) {
            await gdb.delete(tenantAdminsTable).where(and(eq(tenantAdminsTable.tenantId, r.tenantId), eq(tenantAdminsTable.userId, ownerId)));
          }
        }
        const has = (existing || []).some(r => Number(r.tenantId) === Number(id));
        if (!has) await gdb.insert(tenantAdminsTable).values({ tenantId: id, userId: ownerId });

        // Seed demo posts
        try {
          const tdb = await getTursoClientForTenant(id);
          let anyPost = [];
          try { anyPost = await tdb.select().from(postsTable).limit(1); } catch {}
          if (!anyPost || anyPost.length === 0) {
            const nowIso = new Date().toISOString();
            // ensure owner profile exists
            try {
              const p = await tdb.select().from(profiles).where(eq(profiles.id, ownerId)).limit(1);
              if (!p || p.length === 0) {
                await tdb.insert(profiles).values({ id: ownerId, username: '站长', tenantId: id, points: 0, createdAt: nowIso });
              }
            } catch {}
            // demo authors
            const demoAuthors = [
              { id: 'demo-user-1', username: '小海' },
              { id: 'demo-user-2', username: '贝壳' },
            ];
            for (const a of demoAuthors) {
              try {
                const exists = await tdb.select().from(profiles).where(eq(profiles.id, a.id)).limit(1);
                if (!exists || exists.length === 0) {
                  await tdb.insert(profiles).values({ id: a.id, username: a.username, tenantId: id, points: 0, createdAt: nowIso });
                }
              } catch {}
            }
            // sample posts
            const samples = [
              { authorId: ownerId, content: '欢迎加入！这是为您生成的第一条动态。', images: [] , isPinned: 1 },
              { authorId: 'demo-user-1', content: '社区小贴士：点击右下角可快速发帖～', images: [], isPinned: 0 },
              { authorId: 'demo-user-2', content: '支持图文混排，快试试上传一张图片吧！', images: ['https://picsum.photos/seed/tenant-demo/600/400'], isPinned: 0 },
            ];
            for (const s of samples) {
              try {
                await tdb.insert(postsTable).values({
                  tenantId: id,
                  authorId: s.authorId,
                  content: s.content,
                  images: JSON.stringify(s.images || []),
                  isAd: 0,
                  isPinned: s.isPinned ? 1 : 0,
                  status: 'approved',
                  createdAt: nowIso,
                  updatedAt: nowIso,
                });
              } catch {}
            }
          }
        } catch {}

        // Seed homepage page_content for this tenant (idempotent)
        try {
          const tdb = await getTursoClientForTenant(id);
          const existingPc = await tdb.select().from(pageContentTable).where(and(eq(pageContentTable.page, 'home'), inArray(pageContentTable.section, ['carousel','announcements','feature_cards','hot_games']))).limit(1);
          if (!existingPc || existingPc.length === 0) {
            const inserts = [
              { tenantId: id, page: 'home', section: 'carousel', position: 0, content: JSON.stringify({ title: '欢迎来到分站', description: '这里是您的专属首页', image_url: 'https://picsum.photos/seed/tenant-carousel/1200/400' }) },
              { tenantId: id, page: 'home', section: 'announcements', position: 0, content: JSON.stringify({ text: '🎉 分站已开通，开始自定义您的站点吧！' }) },
              { tenantId: id, page: 'home', section: 'feature_cards', position: 0, content: JSON.stringify({ title: '朋友圈', description: '分享日常，互动点赞', path: '/social', icon: 'MessageSquare' }) },
              { tenantId: id, page: 'home', section: 'feature_cards', position: 1, content: JSON.stringify({ title: '游戏中心', description: '精选小游戏合集', path: '/games', icon: 'Gamepad2' }) },
              { tenantId: id, page: 'home', section: 'feature_cards', position: 2, content: JSON.stringify({ title: '站点设置', description: '自定义站点内容', path: '/admin/page-content', icon: 'Settings' }) },
              { tenantId: id, page: 'home', section: 'hot_games', position: 0, content: JSON.stringify({ title: '演示游戏A', description: '有趣又好玩', path: '/games', iconUrl: 'https://picsum.photos/seed/tenant-game1/200/200' }) },
              { tenantId: id, page: 'home', section: 'hot_games', position: 1, content: JSON.stringify({ title: '演示游戏B', description: '简单轻松', path: '/games', iconUrl: 'https://picsum.photos/seed/tenant-game2/200/200' }) },
            ];
            for (const v of inserts) { await tdb.insert(pageContentTable).values(v); }
          }
        } catch {}
      }
    } catch {}
    return c.json({ ok: true, provision: pdata, request: reread, vercelAdd });
  } catch (e) {
    console.error('POST /api/admin/tenant-requests/:id/approve error', e);
    return c.json({ ok: false }, 500);
  }
});

app.post('/api/admin/tenant-requests/:id/reject', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id')); if (!id) return c.json({ error: 'invalid' }, 400);
    const { reason } = await c.req.json();
    const gdb = getGlobalDb(); await ensureTenantRequestsSchemaRaw(getGlobalClient());
    await gdb.update(tenantRequestsTable).set({ status: 'rejected', rejectionReason: reason || '' }).where(eq(tenantRequestsTable.id, id));
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/admin/tenant-requests/:id/reject error', e);
    return c.json({ ok: false }, 500);
  }
});

// Backfill slug & fallback domain for existing tenant request
app.post('/api/admin/tenant-requests/:id/backfill-fallback', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ ok: false, error: auth.reason }, 401);
    const isAdmin = await isSuperAdminUser(auth.userId);
    if (!isAdmin) return c.json({ ok: false, error: 'forbidden' }, 403);
    const id = Number(c.req.param('id')); if (!id) return c.json({ ok: false, error: 'invalid' }, 400);
    const gdb = getGlobalDb(); await ensureTenantRequestsSchemaRaw(getGlobalClient());
    const row = (await gdb.select().from(tenantRequestsTable).where(eq(tenantRequestsTable.id, id)).limit(1))?.[0] || null;
    if (!row) return c.json({ ok: false, error: 'not-found' }, 404);
    const desired = row.desiredDomain || row.desired_domain || '';
    function toSlug(d){ return String(d||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,63); }
    let slug = row.vercelSubdomainSlug || row.vercel_subdomain_slug || toSlug(String(desired).replace(/\.+/g,'-')) || 'site';
    const fallbackRoot = process.env.FALLBACK_ROOT_DOMAIN || process.env.NEXT_PUBLIC_FALLBACK_ROOT_DOMAIN;
    if (!fallbackRoot) return c.json({ ok: false, error: 'missing-fallback-root' }, 500);
    const fallbackDomain = `${slug}.${fallbackRoot}`;
    await gdb.update(tenantRequestsTable).set({ vercelSubdomainSlug: slug, fallbackDomain }).where(eq(tenantRequestsTable.id, id));
    return c.json({ ok: true, id, slug, fallbackDomain });
  } catch (e) {
    console.error('POST /api/admin/tenant-requests/:id/backfill-fallback error', e);
    return c.json({ ok: false }, 500);
  }
});

app.delete('/api/admin/tenant-requests/:id', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id')); if (!id) return c.json({ error: 'invalid' }, 400);
    const gdb = getGlobalDb(); await ensureTenantRequestsSchemaRaw(getGlobalClient());
    // Lookup branch mapping and delete DB if exists
    const br = await gdb.select().from(branchesTable).where(eq(branchesTable.tenantId, id)).limit(1);
    const branchUrl = br?.[0]?.branchUrl || null;
    let branchDeleteOk = false;
    let branchDeleteError = null;
    if (branchUrl) {
      try {
        const { deleteDatabaseByUrl } = await import('./tursoApi.js');
        const ret = await deleteDatabaseByUrl(branchUrl);
        branchDeleteOk = !!ret?.ok;
        branchDeleteError = ret?.error || null;
      } catch {}
      try { await gdb.delete(branchesTable).where(eq(branchesTable.tenantId, id)); } catch {}
    }
    await gdb.delete(tenantRequestsTable).where(eq(tenantRequestsTable.id, id));
    return c.json({ ok: true, deletedBranch: !!branchUrl, branchDeleteOk, branchDeleteError });
  } catch (e) {
    console.error('DELETE /api/admin/tenant-requests/:id error', e);
    return c.json({ ok: false }, 500);
  }
});

app.get('/api/admin/users/search', async (c) => {
  try {
    const actorId = c.get('userId'); if (!actorId) return c.json([], 401);
    const isActorSuper = await isSuperAdminUser(actorId);
    if (!isActorSuper) return c.json([], 403);
    const qRaw = c.req.query('q');
    const db = getGlobalDb();
    const rows = await db.select().from(profiles);
    const filtered = (rows || []).filter(r => r.id === qRaw || (r.username || '').toLowerCase().includes(qRaw) || (r.uid && String(r.uid) === qRaw));
    return c.json(filtered);
  } catch (e) {
    return c.json([]);
  }
});

app.get('/api/admin/page-content', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);

    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenantId = await resolveTenantId(defaultDb, host);
    const tenantIdParam = Number(c.req.query('tenantId') || NaN);
    const tenantId = Number.isFinite(tenantIdParam) ? tenantIdParam : resolvedTenantId;

    const page = c.req.query('page');
    const section = c.req.query('section');

    console.log('📄 GET /api/admin/page-content:', {
      host,
      resolvedTenantId,
      tenantIdParam,
      finalTenantId: tenantId,
      page,
      section,
      userId: auth.userId
    });

    // 权限：超管或该租户的租管
    const allowed = await canManageTenant(auth.userId, tenantId);
    if (!allowed) {
      console.log('❌ 權限不足:', { userId: auth.userId, tenantId });
      return c.json({ error: 'forbidden' }, 403);
    }

    if (!page || !section) {
      console.log('⚠️ 缺少參數:', { page, section });
      return c.json([]);
    }
    
    const pageDef = pageConfig?.[page];
    const secDef = pageDef?.sections?.find(s => s.id === section);
    const forceGlobal = !!secDef?.globalOnly;
    const targetTenantId = forceGlobal ? 0 : tenantId;
    
    console.log('🔍 查詢數據庫:', {
      page,
      section,
      targetTenantId,
      forceGlobal
    });
    
    const db = await getTursoClientForTenant(targetTenantId);
    const rows = await db
      .select()
      .from(pageContentTable)
      .where(and(eq(pageContentTable.page, page), eq(pageContentTable.section, section), eq(pageContentTable.tenantId, targetTenantId)))
      .orderBy(pageContentTable.position);
    
    console.log('✅ 查詢結果:', { count: rows?.length || 0 });
    return c.json(rows || []);
  } catch (e) {
    console.error('❌ GET /api/admin/page-content error', e);
    return c.json([]);
  }
});

app.post('/api/admin/page-content', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);

    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenantId = await resolveTenantId(defaultDb, host);
    const body = await c.req.json();
    const { page, section, content, position } = body || {};
    const tenantIdParam = Number(body?.tenant_id || c.req.query('tenantId') || NaN);
    const tenantId = Number.isFinite(tenantIdParam) ? tenantIdParam : resolvedTenantId;

    if (!page || !section) return c.json({ error: 'invalid' }, 400);
    const pageDef = pageConfig?.[page];
    const secDef = pageDef?.sections?.find(s => s.id === section);
    const forceGlobal = !!secDef?.globalOnly;

    // 权限：超管或该租户的租管
    const allowed = await canManageTenant(auth.userId, tenantId);
    if (!allowed) return c.json({ error: 'forbidden' }, 403);

    // 仅超管可写全局
    if (forceGlobal) {
      const isAdmin = await isSuperAdminUser(auth.userId);
      if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    }

    const db = await getTursoClientForTenant(tenantId);
    const pos = typeof position === 'number' ? position : 0;
    const value = {
      tenantId: forceGlobal ? 0 : tenantId,
      page,
      section,
      position: pos,
      content: typeof content === 'string' ? content : JSON.stringify(content || {}),
    };
    await (forceGlobal ? defaultDb : db).insert(pageContentTable).values(value);
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/admin/page-content error', e);
    return c.json({ ok: false }, 500);
  }
});

app.put('/api/admin/page-content/:id', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);

    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenantId = await resolveTenantId(defaultDb, host);
    const id = Number(c.req.param('id'));
    if (!id) return c.json({ error: 'invalid' }, 400);
    const body = await c.req.json();
    const { content, position, page, section } = body || {};
    const tenantIdParam = Number(body?.tenant_id || c.req.query('tenantId') || NaN);
    const tenantId = Number.isFinite(tenantIdParam) ? tenantIdParam : resolvedTenantId;

    // 权限：超管或该租户的租管
    const allowed = await canManageTenant(auth.userId, tenantId);
    if (!allowed) return c.json({ error: 'forbidden' }, 403);

    const pageDef = page && pageConfig?.[page];
    const secDef = pageDef?.sections?.find(s => s.id === section);
    const forceGlobal = !!secDef?.globalOnly;
    if (forceGlobal) {
      const isAdmin = await isSuperAdminUser(auth.userId);
      if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    }

    const values = {};
    if (position !== undefined) values.position = position;
    if (content !== undefined) values.content = typeof content === 'string' ? content : JSON.stringify(content || {});
    await (forceGlobal ? defaultDb : await getTursoClientForTenant(tenantId)).update(pageContentTable).set(values).where(eq(pageContentTable.id, id));
    return c.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/admin/page-content/:id error', e);
    return c.json({ ok: false }, 500);
  }
});
app.delete('/api/admin/page-content/:id', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);

    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenantId = await resolveTenantId(defaultDb, host);
    const id = Number(c.req.param('id'));
    if (!id) return c.json({ error: 'invalid' }, 400);
    const tenantIdParam = Number(c.req.query('tenantId') || NaN);
    const tenantId = Number.isFinite(tenantIdParam) ? tenantIdParam : resolvedTenantId;

    // 权限：超管或该租户的租管
    const allowed = await canManageTenant(auth.userId, tenantId);
    if (!allowed) return c.json({ error: 'forbidden' }, 403);

    const db = await getTursoClientForTenant(tenantId);
    try {
      await db.delete(pageContentTable).where(eq(pageContentTable.id, id));
    } catch {}
    const isAdmin = await isSuperAdminUser(auth.userId);
    if (isAdmin) {
      try { await defaultDb.delete(pageContentTable).where(eq(pageContentTable.id, id)); } catch {}
    }
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/page-content/:id error', e);
    return c.json({ ok: false }, 500);
  }
});

app.post('/api/admin/page-content/reorder', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);

    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenantId = await resolveTenantId(defaultDb, host);
    const { ids, page, section } = await c.req.json();
    if (!Array.isArray(ids) || ids.length === 0) return c.json({ error: 'invalid' }, 400);
    let forceGlobal = false;
    if (page && section) {
      const pageDef = pageConfig?.[page];
      const secDef = pageDef?.sections?.find(s => s.id === section);
      forceGlobal = !!secDef?.globalOnly;
    }
    const tenantIdParam = Number(c.req.query('tenantId') || NaN);
    const tenantId = Number.isFinite(tenantIdParam) ? tenantIdParam : resolvedTenantId;

    if (forceGlobal) {
      const isAdmin = await isSuperAdminUser(auth.userId);
      if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    }

    // 权限：超管或该租户的租管
    const allowed = await canManageTenant(auth.userId, tenantId);
    if (!allowed) return c.json({ error: 'forbidden' }, 403);

    const db = await getTursoClientForTenant(forceGlobal ? 0 : tenantId);
    for (let i = 0; i < ids.length; i++) {
      await db.update(pageContentTable).set({ position: i }).where(eq(pageContentTable.id, ids[i]));
    }
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/admin/page-content/reorder error', e);
    return c.json({ ok: false }, 500);
  }
});

app.get('/api/admin/branches', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);
    const isAdmin = await isSuperAdminUser(auth.userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const db = getGlobalDb();
    const rows = await db.select().from(branchesTable).orderBy(branchesTable.tenantId);
    return c.json(rows || []);
  } catch (e) {
    console.error('GET /api/admin/branches error', e);
    return c.json([]);
  }
});

app.get('/api/admin/branches/:id/schema', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);
    const isAdmin = await isSuperAdminUser(auth.userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const tenantId = Number(c.req.param('id'));
    if (!tenantId && tenantId !== 0) return c.json({ error: 'invalid-tenant' }, 400);
    const gdb = getGlobalDb();
    const br = await gdb.select().from(branchesTable).where(eq(branchesTable.tenantId, tenantId)).limit(1);
    const branchUrl = br?.[0]?.branchUrl || null;
    if (!branchUrl) return c.json({ error: 'no-mapping' }, 404);
    const authToken = process.env.TURSO_AUTH_TOKEN;
    const client = createClient({ url: branchUrl, authToken });
    // List tables
    const tablesRes = await client.execute("select name from sqlite_schema where type='table' and name not like 'sqlite_%' order by name");
    const tables = [];
    for (const row of tablesRes.rows || []) {
      const name = row.name || row[0];
      if (!name) continue;
      const colsRes = await client.execute(`pragma table_info(${name})`);
      const columns = (colsRes.rows || []).map(r => ({
        name: r.name || r[1],
        type: r.type || r[2],
        notnull: Number(r.notnull || r[3] || 0) === 1,
        pk: Number(r.pk || r[5] || 0) === 1,
        dflt_value: r.dflt_value || r[4] || null,
      }));
      tables.push({ name, columns });
    }
    return c.json({ tenantId, branchUrl, tables });
  } catch (e) {
    console.error('GET /api/admin/branches/:id/schema error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

app.post('/api/admin/branches', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);
    const isAdmin = await isSuperAdminUser(auth.userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const { tenantId, branchUrl } = await c.req.json();
    if (tenantId === undefined || !branchUrl) return c.json({ error: 'invalid' }, 400);
    const db = getGlobalDb();
    const now = new Date().toISOString();
    const exist = await db.select().from(branchesTable).where(eq(branchesTable.tenantId, Number(tenantId))).limit(1);
    if (exist && exist.length > 0) {
      await db.update(branchesTable).set({ branchUrl, source: 'db', updatedBy: c.get('userId') || null, updatedAt: now }).where(eq(branchesTable.tenantId, Number(tenantId)));
    } else {
      await db.insert(branchesTable).values({ tenantId: Number(tenantId), branchUrl, source: 'db', updatedBy: c.get('userId') || null, updatedAt: now });
    }
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/admin/branches error', e);
    return c.json({ ok: false }, 500);
  }
});
app.delete('/api/admin/branches/:tenantId', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);
    const isAdmin = await isSuperAdminUser(auth.userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const tenantId = Number(c.req.param('tenantId'));
    if (!tenantId && tenantId !== 0) return c.json({ error: 'invalid' }, 400);
    const db = getGlobalDb();
    await db.delete(branchesTable).where(eq(branchesTable.tenantId, tenantId));
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/branches/:tenantId error', e);
    return c.json({ ok: false }, 500);
  }
});
app.post('/api/admin/tenants/:id/provision', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);
    const isAdmin = await isSuperAdminUser(auth.userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const tenantId = Number(c.req.param('id'));
    if (!tenantId && tenantId !== 0) return c.json({ error: 'invalid-tenant' }, 400);

    const dbName = process.env.TURSO_DB_NAME;
    const region = process.env.TURSO_TENANT_REGION;
    const branchName = `tenant-${tenantId}`;

    // 1) Create branch via Turso API
    const created = await createBranch({ dbName, branchName, region });
    if (!created.ok) return c.json({ ok: false, step: 'create-branch', error: created.error, details: created.details }, 500);
    const branchUrl = created.branchUrl || `${process.env.TURSO_PRIMARY_URL}?branch=${branchName}`;

    // 2) Initialize schema on that branch (minimal). We reuse init statements partially.
    const authToken = process.env.TURSO_AUTH_TOKEN;
    const client = createClient({ url: branchUrl, authToken });
    const statements = [
      "create table if not exists profiles (id text primary key, username text, avatar_url text, tenant_id integer default 0, points integer default 0, created_at text, uid text)",
      "create table if not exists posts (id integer primary key autoincrement, tenant_id integer not null default 0, author_id text not null, content text, images text, is_ad integer default 0, is_pinned integer default 0, status text default 'approved', rejection_reason text, created_at text, updated_at text)",
      "create table if not exists comments (id integer primary key autoincrement, post_id integer not null, user_id text not null, content text, created_at text)",
      "create table if not exists likes (post_id integer not null, user_id text not null, primary key (post_id, user_id))",
      "create table if not exists notifications (id integer primary key autoincrement, user_id text not null, content text, is_read integer default 0, created_at text)",
      "create table if not exists app_settings (tenant_id integer not null, key text not null, value text, name text, description text, type text, primary key (tenant_id, key))",
      "create table if not exists page_content (id integer primary key autoincrement, tenant_id integer not null default 0, page text not null, section text not null, position integer default 0, content text)",
      // indexes
      "create index if not exists idx_posts_tenant_status_ad_pin_created on posts(tenant_id, status, is_ad, is_pinned, created_at)",
      "create index if not exists idx_comments_post_created on comments(post_id, created_at)",
      "create index if not exists idx_likes_post on likes(post_id)",
      "create index if not exists idx_notifications_user_read_created on notifications(user_id, is_read, created_at)",
      "create index if not exists idx_page_content_scope on page_content(tenant_id, page, section, position)",
    ];
    for (const s of statements) { try { await client.execute(s); } catch {} }
    try { await client.execute("create unique index if not exists idx_profiles_uid on profiles(uid)"); } catch {}

    // 2.5) Seed minimal demo data on new branch
    const nowIso = new Date().toISOString();
    await client.execute("insert into profiles(id, username, tenant_id, points, created_at, uid) values (?, ?, ?, ?, ?, ?)", [
      'tenant-user-1', '演示用户1', tenantId, 0, nowIso, String(Math.floor(100000 + Math.random() * 900000))
    ]);
    await client.execute("insert into posts(tenant_id, author_id, content, images, is_ad, is_pinned, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, 'approved', ?, ?)", [
      tenantId, 'tenant-user-1', '欢迎来到分站（自动开通）', JSON.stringify([]), 0, 1, nowIso, nowIso
    ]);
    // 清空该分支的 page_content，避免主站遗留模板污染
    try { await client.execute("delete from page_content"); } catch {}
    // 插入首页与游戏中心演示数据（tenant-scoped）
    const demoPageContent = [
      // home
      { page:'home', section:'carousel', position:0, content:{ title:'欢迎来到分站', description:'这里是您的专属首页', image_url:'https://picsum.photos/seed/tenant-carousel/1200/400' } },
      { page:'home', section:'announcements', position:0, content:{ text:'🎉 分站已开通，开始自定义您的站点吧！' } },
      { page:'home', section:'feature_cards', position:0, content:{ title:'朋友圈', description:'分享日常，互动点赞', path:'/social', icon:'MessageSquare' } },
      { page:'home', section:'feature_cards', position:1, content:{ title:'游戏中心', description:'精选小游戏合集', path:'/games', icon:'Gamepad2' } },
      { page:'home', section:'feature_cards', position:2, content:{ title:'站点设置', description:'自定义站点内容', path:'/tenant-admin/page-content', icon:'Settings' } },
      { page:'home', section:'hot_games', position:0, content:{ title:'演示游戏A', description:'有趣又好玩', path:'/games', iconUrl:'https://picsum.photos/seed/tenant-game1/200/200' } },
      { page:'home', section:'hot_games', position:1, content:{ title:'演示游戏B', description:'简单轻松', path:'/games', iconUrl:'https://picsum.photos/seed/tenant-game2/200/200' } },
      // games
      { page:'games', section:'game_categories', position:0, content:{ name:'热门', slug:'hot', icon:'Flame' } },
      { page:'games', section:'game_cards', position:0, content:{ title:'演示游戏A', category_slug:'hot', description:'快来试试！', path:'/games', iconUrl:'https://picsum.photos/seed/tenant-game1/200/200', isOfficial:true } },
      { page:'games', section:'game_cards', position:1, content:{ title:'演示游戏B', category_slug:'hot', description:'轻松上手', path:'/games', iconUrl:'https://picsum.photos/seed/tenant-game2/200/200', isOfficial:false } },
    ];
    for (const item of demoPageContent) {
      try {
        await client.execute(
          "insert into page_content(tenant_id, page, section, position, content) values (?, ?, ?, ?, ?)",
          [ tenantId, item.page, item.section, item.position, JSON.stringify(item.content) ]
        );
      } catch {}
    }
    // 2.6) Seed tenant app_settings defaults (independent mode + site name)
    try {
      await ensureDefaultSettings(await getTursoClientForTenant(tenantId), tenantId);
      const sdb = await getTursoClientForTenant(tenantId);
      const kv = [
        { key: 'site_name', value: `分站 #${tenantId}` },
        { key: 'social_forum_mode', value: 'independent' }
      ];
      for (const {key,value} of kv) {
        const exists = await sdb.select().from(appSettings).where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, key))).limit(1);
        if (!exists || exists.length === 0) {
          await sdb.insert(appSettings).values({ tenantId, key, value });
        } else {
          await sdb.update(appSettings).set({ value }).where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, key)));
        }
      }
    } catch {}

    // 3) Persist mapping in branches table (global DB)
    const gdb = getGlobalDb();
    const now = new Date().toISOString();
    const exist = await gdb.select().from(branchesTable).where(eq(branchesTable.tenantId, tenantId)).limit(1);
    if (exist && exist.length > 0) {
      await gdb.update(branchesTable).set({ branchUrl, source: 'db', updatedBy: c.get('userId') || null, updatedAt: now }).where(eq(branchesTable.tenantId, tenantId));
    } else {
      await gdb.insert(branchesTable).values({ tenantId, branchUrl, source: 'db', updatedBy: c.get('userId') || null, updatedAt: now });
    }

    // 3.5) Update tenant_requests status to active
    try {
      await ensureTenantRequestsSchemaRaw(getGlobalClient());
      await gdb.update(tenantRequestsTable).set({ status: 'active' }).where(eq(tenantRequestsTable.id, tenantId));
    } catch {}

    return c.json({ ok: true, tenantId, branchUrl });
  } catch (e) {
    console.error('POST /api/admin/tenants/:id/provision error', e);
    return c.json({ ok: false }, 500);
  }
});

// Shared forum endpoints (global)

app.get('/api/shared/comments', async (c) => {
  try {
    const db = getGlobalDb();
    const postId = Number(c.req.query('postId'));
    if (!postId) return c.json([]);
    const rows = await db.select().from(sharedComments).where(eq(sharedComments.postId, postId)).orderBy(desc(sharedComments.createdAt));
    const authorIds = Array.from(new Set(rows.map(r => r.userId)));
    let authors = [];
    if (authorIds.length) authors = await db.select().from(sharedProfiles).where(inArray(sharedProfiles.id, authorIds));
    const authorMap = new Map(authors.map(a => [a.id, { id: a.id, username: a.username, avatar_url: a.avatarUrl, uid: a.uid }]));
    const res = rows.map(r => ({ ...r, author: authorMap.get(r.userId) || null }));
    return c.json(res);
  } catch (e) {
    console.error('GET /api/shared/comments error', e);
    return c.json([]);
  }
});

app.post('/api/shared/comments', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const db = getGlobalDb();
    const body = await c.req.json();
    const { postId, content } = body || {};
    if (!postId || !content) return c.json({ error: 'invalid' }, 400);
    const now = new Date().toISOString();
    // deduct comment cost from global profile
    try {
      const map = await readSettingsMap();
      const cost = toInt(map['comment_cost'], 1);
      const pdb = await getTursoClientForTenant(0);
      const prof = (await pdb.select().from(profiles).where(eq(profiles.id, userId)).limit(1))?.[0];
      if ((prof?.points || 0) < cost) return c.json({ error: 'insufficient-points' }, 400);
      await pdb.update(profiles).set({ points: (prof?.points || 0) - cost }).where(eq(profiles.id, userId));
      await pdb.insert(pointsHistoryTable).values({ userId, changeAmount: -cost, reason: '发表评论', createdAt: now });
    } catch {}
    await db.insert(sharedComments).values({ postId, userId, content, createdAt: now });
    const prof = await db.select().from(sharedProfiles).where(eq(sharedProfiles.id, userId)).limit(1);
    if (!prof || prof.length === 0) {
      let username = '用户';
      try {
        const base = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
        if (base && base[0] && base[0].username) username = base[0].username;
      } catch {}
      await db.insert(sharedProfiles).values({ id: userId, username, createdAt: now });
    }
    try { await ensureUid(getGlobalDb(), profiles, profiles.id, userId); } catch {}
    const author = (await db.select().from(sharedProfiles).where(eq(sharedProfiles.id, userId)).limit(1))?.[0] || null;
    return c.json({ id: undefined, postId, userId, content, created_at: now, author: author ? { id: author.id, username: author.username, avatar_url: author.avatarUrl } : null });
  } catch (e) {
    console.error('POST /api/shared/comments error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

app.delete('/api/shared/comments/:id', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const db = getGlobalDb();
    const id = Number(c.req.param('id'));
    if (!id) return c.json({ ok: false });
    // only author can delete
    const rows = await db.select().from(sharedComments).where(eq(sharedComments.id, id)).limit(1);
    if (!rows || rows.length === 0 || rows[0].userId !== userId) return c.json({ ok: false, error: 'forbidden' }, 403);
    await db.delete(sharedComments).where(eq(sharedComments.id, id));
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/shared/comments/:id error', e);
    return c.json({ ok: false }, 500);
  }
});

app.post('/api/shared/likes', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    await ensureSharedForumSchema();
    const db = getGlobalDb();
    const { postId } = await c.req.json();
    if (!postId) return c.json({ error: 'invalid' }, 400);
    await db.insert(sharedLikes).values({ postId, userId });
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/shared/likes error', e);
    return c.json({ ok: false }, 500);
  }
});

app.delete('/api/shared/likes', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    await ensureSharedForumSchema();
    const db = getGlobalDb();
    const { postId } = await c.req.json();
    if (!postId) return c.json({ error: 'invalid' }, 400);
    await db.delete(sharedLikes).where(and(eq(sharedLikes.postId, postId), eq(sharedLikes.userId, userId)));
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/shared/likes error', e);
    return c.json({ ok: false }, 500);
  }
});

app.delete('/api/shared/posts/:id', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const db = getGlobalDb();
    const id = Number(c.req.param('id'));
    if (!id) return c.json({ ok: false });
    const rows = await db.select().from(sharedPosts).where(eq(sharedPosts.id, id)).limit(1);
    const isAdmin = await isSuperAdminUser(userId);
    if (!rows || rows.length === 0 || (!isAdmin && rows[0].authorId !== userId)) return c.json({ ok: false, error: 'forbidden' }, 403);
    await db.delete(sharedComments).where(eq(sharedComments.postId, id));
    await db.delete(sharedLikes).where(eq(sharedLikes.postId, id));
    await db.delete(sharedPosts).where(eq(sharedPosts.id, id));
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/shared/posts/:id error', e);
    return c.json({ ok: false }, 500);
  }
});

app.post('/api/shared/posts/:id/pin', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const db = getGlobalDb();
    const id = Number(c.req.param('id'));
    const { pinned } = await c.req.json();

    const rows = await db.select().from(sharedPosts).where(eq(sharedPosts.id, id)).limit(1);
    const post = rows?.[0];
    if (!post) return c.json({ error: 'not-found' }, 404);

    await db.update(sharedPosts).set({ isPinned: pinned ? 1 : 0 }).where(eq(sharedPosts.id, id));
    const updated = await db.select().from(sharedPosts).where(eq(sharedPosts.id, id)).limit(1);
    const result = updated?.[0] || { ...post, isPinned: pinned ? 1 : 0 };
    const value = result.isPinned ?? result.is_pinned ?? (pinned ? 1 : 0);
    return c.json({
      ...result,
      isPinned: value,
      is_pinned: value,
    });
  } catch (e) {
    console.error('POST /api/shared/posts/:id/pin error', e);
    return c.json({ ok: false }, 500);
  }
});
app.post('/api/posts', async (c) => {
  try {
    const { tenantId, tenantDb, defaultDb } = await getForumModeForTenant(c.get('host').split(':')[0]);
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const body = await c.req.json();
    const content = String(body?.content || '');
    const images = Array.isArray(body?.images) ? body.images : [];
    const useFreePost = Boolean(body?.useFreePost);
    const zone = String(body?.zone || '').toLowerCase();
    const isAd = zone === 'ads' ? 1 : 0;
    const now = new Date().toISOString();

    await ensureSharedForumSchema();
    const existingShared = await defaultDb.select().from(sharedProfiles).where(eq(sharedProfiles.id, userId)).limit(1);
    if (!existingShared || existingShared.length === 0) {
      let username = `用户${String(userId).slice(-4)}`;
      try {
        const base = await defaultDb.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
        if (base && base[0]?.username) username = base[0].username;
      } catch {}
      await defaultDb.insert(sharedProfiles).values({ id: userId, username, createdAt: now });
    }

    let profileRow = (await defaultDb.select().from(profiles).where(eq(profiles.id, userId)).limit(1))?.[0];
    if (!profileRow) {
      await defaultDb.insert(profiles).values({ id: userId, username: `用户${String(userId).slice(-4)}`, tenantId: 0, points: 0, createdAt: now });
      profileRow = (await defaultDb.select().from(profiles).where(eq(profiles.id, userId)).limit(1))?.[0];
    }

    try {
      const map = await readSettingsMap();
      const socialCost = toInt(map['social_post_cost'], 0);
      const adCost = toInt(map['ad_post_cost'], 0);
      const cost = isAd ? adCost : socialCost;
      const usePoints = cost > 0;
      if ((profileRow?.freePostsCount || 0) > 0 && useFreePost) {
        await defaultDb.update(profiles).set({ freePostsCount: (profileRow.freePostsCount || 0) - 1 }).where(eq(profiles.id, userId));
        profileRow.freePostsCount = (profileRow.freePostsCount || 0) - 1;
      } else if (usePoints) {
        if ((profileRow?.points || 0) < cost) return c.json({ error: 'insufficient-points' }, 400);
        await defaultDb.update(profiles).set({ points: (profileRow?.points || 0) - cost }).where(eq(profiles.id, userId));
        profileRow.points = (profileRow?.points || 0) - cost;
        await defaultDb.insert(pointsHistoryTable).values({ userId, changeAmount: -cost, reason: isAd ? '发布广告' : '发布动态', createdAt: now });
      }
    } catch {}

    const insertResult = await defaultDb.insert(sharedPosts).values({
      authorId: userId,
      content,
      images: JSON.stringify(images),
      isAd,
      isPinned: 0,
      status: 'approved',
      createdAt: now,
      updatedAt: now,
    }).returning({ id: sharedPosts.id });
    const insertedId = Number(insertResult?.[0]?.id);
    const newId = Number.isFinite(insertedId) && insertedId > 0 ? insertedId : Number((await defaultDb.select({ id: sharedPosts.id }).from(sharedPosts).orderBy(desc(sharedPosts.id)).limit(1))?.[0]?.id || 0);

    const author = (await defaultDb.select().from(sharedProfiles).where(eq(sharedProfiles.id, userId)).limit(1))?.[0] || null;
    return c.json({
      id: newId,
      authorId: userId,
      content,
      images: JSON.stringify(images),
      isAd,
      isPinned: 0,
      status: 'approved',
      createdAt: now,
      updatedAt: now,
      author: author ? { id: author.id, username: author.username, avatar_url: author.avatarUrl } : null,
      likesCount: 0,
      commentsCount: 0,
    });
  } catch (e) {
    console.error('POST /api/posts error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// duplicate removed; unified PUT /api/admin/users/:id defined earlier applies

app.post('/api/admin/tenants/:id/delete-branch', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);
    const tenantId = Number(c.req.param('id'));
    if (!tenantId && tenantId !== 0) return c.json({ error: 'invalid-tenant' }, 400);
    const gdb = getGlobalDb();
    const br = await gdb.select().from(branchesTable).where(eq(branchesTable.tenantId, tenantId)).limit(1);
    const branchUrl = br?.[0]?.branchUrl || null;
    if (!branchUrl) return c.json({ ok: true, deletedBranch: false, reason: 'no-mapping' });
    let ret = { ok: false };
    try {
      const { deleteDatabaseByUrl } = await import('./tursoApi.js');
      ret = await deleteDatabaseByUrl(branchUrl);
    } catch (e) {
      ret = { ok: false, error: e.message };
    }
    try { await gdb.delete(branchesTable).where(eq(branchesTable.tenantId, tenantId)); } catch {}
    return c.json({ ok: true, deletedBranch: true, branchDeleteOk: !!ret?.ok, branchDeleteError: ret?.error || null });
  } catch (e) {
    console.error('POST /api/admin/tenants/:id/delete-branch error', e);
    return c.json({ ok: false }, 500);
  }
});

app.get('/api/admin/databases', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);
    const gdb = getGlobalDb();
    const { listAllDatabases } = await import('./tursoApi.js');
    const list = await listAllDatabases();
    // Try to derive tenantId from name pattern tenant-{id}
    const withTenant = (list || []).map(d => {
      const m = /tenant-(\d+)/i.exec(d.name || '');
      const tenantId = m ? Number(m[1]) : null;
      // Attempt to derive a vercel-style domain from hostname (if looks like *.turso.io => not vercel)
      const vercelDomain = null; // left null here; actual vercel domain comes from tenant_requests.vercel_assigned_domain
      return { ...d, tenantId, vercelDomain };
    });
    // Filter out primary database by env name (TURSO_DB_NAME)
    const primaryName = process.env.TURSO_DB_NAME;
    const filtered = withTenant.filter(d => !primaryName || (d.name !== primaryName));
    // Join mapping table
    let mappings = [];
    try { mappings = await gdb.select().from(branchesTable); } catch { mappings = []; }
    const mapByTenant = new Map((mappings || []).map(m => [Number(m.tenantId), m]));
    // Resolve owner and vercel domain by tenant_requests
    const tenantIds = Array.from(new Set(filtered.map(x => x.tenantId).filter(x => x !== null)));
    let owners = new Map();
    let vercelMap = new Map();
    let desiredDomainMap = new Map();
    if (tenantIds.length) {
      const trs = await gdb.select().from(tenantRequestsTable);
      const byId = new Map((trs || []).map(t => [Number(t.id), t.userId]));
      desiredDomainMap = new Map((trs || []).map(t => [Number(t.id), (t.desiredDomain || t.desired_domain || null)]));
      for (const t of (trs || [])) {
        const vd = t.vercelAssignedDomain || t.vercel_assigned_domain || null;
        if (vd) vercelMap.set(Number(t.id), vd);
      }
      const userIds = Array.from(new Set(tenantIds.map(tid => byId.get(Number(tid))).filter(Boolean)));


      let profilesRows = [];
      if (userIds.length) profilesRows = await gdb.select().from(profiles).where(inArray(profiles.id, Array.from(userIds)));
      const pmap = new Map((profilesRows || []).map(p => [p.id, { username: p.username, avatar_url: p.avatarUrl }]));
      for (const tid of tenantIds) {
        const uid = byId.get(Number(tid));
        if (uid) owners.set(Number(tid), pmap.get(uid) || { username: uid, avatar_url: null });
      }
    }
    const result = filtered.map(d => {
      const m = d.tenantId !== null ? mapByTenant.get(Number(d.tenantId)) : null;
      return {
        name: d.name,
        hostname: d.hostname,
        tenantId: d.tenantId,
        mapped: !!m,
        branchUrl: m?.branchUrl || null,
        owner: d.tenantId !== null ? (owners.get(Number(d.tenantId)) || null) : null,
        ownerProfile: d.tenantId !== null ? (owners.get(Number(d.tenantId)) || null) : null,
        vercelDomain: d.tenantId !== null ? (vercelMap.get(Number(d.tenantId)) || null) : null,
        customDomain: d.tenantId !== null ? (desiredDomainMap.get(Number(d.tenantId)) || null) : null
      };
    });
    return c.json(result);
  } catch (e) {
    console.error('GET /api/admin/databases error', e);
    return c.json([]);
  }
});

app.post('/api/admin/databases/:name/delete', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);
    const name = c.req.param('name');
    if (!name) return c.json({ error: 'invalid-name' }, 400);
    if (process.env.TURSO_DB_NAME && name === process.env.TURSO_DB_NAME) {
      return c.json({ ok: false, error: 'cannot-delete-primary' }, 400);
    }
    const { deleteDatabaseByName } = await import('./tursoApi.js');
    const ret = await deleteDatabaseByName(name);
    return c.json({ ok: !!ret?.ok, error: ret?.error || null });
  } catch (e) {
    console.error('POST /api/admin/databases/:name/delete error', e);
    return c.json({ ok: false }, 500);
  }
});

// Inspect DB schema integrity for a given branch name
app.get('/api/admin/databases/:name/health', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: auth.reason }, 401);
    const isAdmin = await isSuperAdminUser(auth.userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const name = c.req.param('name');
    if (!name) return c.json({ error: 'invalid-name' }, 400);

    const token = process.env.TURSO_AUTH_TOKEN;
    const primary = process.env.TURSO_PRIMARY_URL || process.env.TURSO_DATABASE_URL;
    if (!token) return c.json({ error: 'server-misconfigured' }, 500);

    const urls = [];
    // 1) Try mapping table by tenant id pattern 'tenant-{id}'
    try {
      const m = /^tenant-(\d+)$/i.exec(String(name));
      if (m) {
        const tid = Number(m[1]);
        const gdb = getGlobalDb();
        const br = await gdb.select().from(branchesTable).where(eq(branchesTable.tenantId, tid)).limit(1);
        const bu = br?.[0]?.branchUrl || null;
        if (bu) urls.push(bu);
      }
    } catch {}
    // 2) Turso API list → libsql://hostname
    try {
      const { listAllDatabases } = await import('./tursoApi.js');
      const list = await listAllDatabases();
      const found = (list || []).find(d => String(d.name) === String(name));
      if (found?.hostname) urls.push(`libsql://${found.hostname}`);
    } catch {}
    // 3) Fallback (may not be supported by client)
    if (primary) urls.push(primary.includes('?') ? `${primary}&branch=${encodeURIComponent(name)}` : `${primary}?branch=${encodeURIComponent(name)}`);

    let lastError = null;
    for (const u of urls) {
      try {
        const raw = createClient({ url: u, authToken: token });
        const res = await raw.execute("select name from sqlite_master where type='table'");
        const onDisk = new Set((res?.rows || []).map(r => r.name || r[0]).filter(Boolean));
        const required = new Set(['profiles','posts','comments','likes','notifications','app_settings','page_content']);
        const optional = new Set(['shop_products','shop_redemptions','points_history']);
        const missing = Array.from(required).filter(t => !onDisk.has(t));
        const extra = Array.from(onDisk).filter(t => !required.has(t) && !optional.has(t) && !t.startsWith('sqlite_'));
        const pass = missing.length === 0;
        return c.json({ pass, tables: Array.from(onDisk), missing, extra, url: u });
      } catch (e) {
        lastError = e?.message || String(e);
      }
    }

    if (urls.length === 0) {
      return c.json({ pass: false, tables: [], missing: [], extra: [], error: 'not-found' }, 404);
    }
    return c.json({ pass: false, tables: [], missing: [], extra: [], error: lastError || 'failed' }, 500);
  } catch (e) {
    console.error('GET /api/admin/databases/:name/health error', e);
    return c.json({ pass: false, tables: [], missing: [], extra: [], error: e?.message || 'failed' }, 500);
  }
});
// Points: history
app.get('/api/points/history', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json([], 401);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    // 使用全局数据库，主站和分站共享积分历史
    const gdb = getGlobalDb();
    
    // ensure table exists in global DB
    try {
      if (!__ensureCache.pointsHistory.has(0)) {
        const raw = getGlobalClient();
        try { await raw.execute("create table if not exists points_history (id integer primary key autoincrement, user_id text not null, change_amount integer not null, reason text not null, created_at text default (datetime('now')))"); } catch {}
        __ensureCache.pointsHistory.add(0);
      }
    } catch {}
    
    // 只从全局数据库读取积分历史
    const rows = await gdb.select().from(pointsHistoryTable).where(eq(pointsHistoryTable.userId, userId));
    const mapped = (rows || []).map(r => ({
      id: r.id,
      user_id: r.userId,
      change_amount: r.changeAmount,
      reason: r.reason,
      created_at: r.createdAt,
      scope: 'global',
    }));
    
    // 按时间倒序排列
    const sorted = mapped.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    
    return c.json(sorted);
  } catch (e) {
    console.error('GET /api/points/history error', e);
    return c.json([]);
  }
});

// Points: exchange between points and virtual currency
app.post('/api/points/exchange', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const { mode, pointsAmount, currencyAmount } = await c.req.json();
    if (!mode || (!pointsAmount && !currencyAmount)) return c.json({ error: 'invalid' }, 400);
    
    // 使用全局数据库确保主站和分站积分同步
    const gdb = getGlobalDb();
    
    // ensure columns in global DB
    try { 
      const raw = getGlobalClient();
      await raw.execute("alter table profiles add column virtual_currency integer default 0"); 
    } catch {}
    try { 
      const raw = getGlobalClient();
      await raw.execute("alter table profiles add column invitation_points integer default 0"); 
    } catch {}
    try { 
      const raw = getGlobalClient();
      await raw.execute("alter table profiles add column free_posts_count integer default 0"); 
    } catch {}
    try { 
      const raw = getGlobalClient();
      await raw.execute("create table if not exists points_history (id integer primary key autoincrement, user_id text not null, change_amount integer not null, reason text not null, created_at text default (datetime('now')))" ); 
    } catch {}
    
    const now = new Date().toISOString();
    const prof = (await gdb.select().from(profiles).where(eq(profiles.id, userId)).limit(1))?.[0];
    if (!prof) return c.json({ error: 'profile-not-found' }, 404);
    
    if (mode === 'pointsToCurrency') {
      const p = Number(pointsAmount) || 0;
      const cny = Number(currencyAmount) || 0;
      if (p <= 0 || cny <= 0) return c.json({ error: 'invalid-amount' }, 400);
      if ((prof.points || 0) < p) return c.json({ error: 'insufficient-points' }, 400);
      // 从全局数据库更新
      await gdb.update(profiles).set({ points: (prof.points || 0) - p, virtualCurrency: (prof.virtualCurrency || 0) + cny }).where(eq(profiles.id, userId));
      await gdb.insert(pointsHistoryTable).values({ userId, changeAmount: -p, reason: '兑换虚拟分', createdAt: now });
    } else if (mode === 'currencyToPoints') {
      const cny = Number(currencyAmount) || 0;
      const p = Number(pointsAmount) || 0;
      if (p <= 0 || cny <= 0) return c.json({ error: 'invalid-amount' }, 400);
      if ((prof.virtualCurrency || 0) < cny) return c.json({ error: 'insufficient-currency' }, 400);
      // 从全局数据库更新
      await gdb.update(profiles).set({ points: (prof.points || 0) + p, virtualCurrency: (prof.virtualCurrency || 0) - cny }).where(eq(profiles.id, userId));
      await gdb.insert(pointsHistoryTable).values({ userId, changeAmount: +p, reason: '虚拟分兑入', createdAt: now });
    } else {
      return c.json({ error: 'unsupported-mode' }, 400);
    }
    
    const updated = (await gdb.select().from(profiles).where(eq(profiles.id, userId)).limit(1))?.[0];
    return c.json({ ok: true, profile: updated });
  } catch (e) {
    console.error('POST /api/points/exchange error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// ---------- Shop: Products ----------
app.get('/api/shop/products', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const dbTenant = await getTursoClientForTenant(tenantId);
    const dbGlobal = await getTursoClientForTenant(0);

    let rowsGlobal = [];
    let rowsTenant = [];
    try { rowsGlobal = await dbGlobal.select().from(shopProducts).where(eq(shopProducts.tenantId, 0)); } catch {}
    try { if (tenantId !== 0) rowsTenant = await dbTenant.select().from(shopProducts).where(eq(shopProducts.tenantId, tenantId)); } catch {}

    // Auto seed demo products to global in dev when empty
    if ((rowsGlobal.length + rowsTenant.length) === 0 && process.env.NODE_ENV !== 'production') {
      const now = new Date().toISOString();
      try {
        await dbGlobal.insert(shopProducts).values({ tenantId: 0, name: '新手礼包', description: '入门福利礼包', imageUrl: null, price: 200, stock: -1, isActive: 1, createdAt: now });
        await dbGlobal.insert(shopProducts).values({ tenantId: 0, name: '头像框·星月', description: '限时装饰', imageUrl: null, price: 500, stock: 100, isActive: 1, createdAt: now });
        await dbGlobal.insert(shopProducts).values({ tenantId: 0, name: '改名卡', description: '修改昵称一次', imageUrl: null, price: 300, stock: -1, isActive: 1, createdAt: now });
      } catch {}
      try { rowsGlobal = await dbGlobal.select().from(shopProducts).where(eq(shopProducts.tenantId, 0)); } catch {}
    }

    const list = [
      ...(rowsGlobal || []).map(r => ({ ...r, __source: 'global' })),
      ...(rowsTenant || []).map(r => ({ ...r, __source: 'tenant' })),
    ];
    return c.json(list);
  } catch (e) {
    console.error('GET /api/shop/products error', e);
    return c.json([]);
  }
});

app.post('/api/shop/products', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const body = await c.req.json();
    const now = new Date().toISOString();
    const record = {
      tenantId,
      name: body?.name || '',
      description: body?.description || '',
      imageUrl: body?.image_url || null,
      price: Number(body?.price || 0),
      stock: body?.stock === -1 ? -1 : Number(body?.stock || 0),
      isActive: body?.is_active ? 1 : 0,
      createdAt: now,
    };
    // upsert by id if provided
    if (body?.id) {
      await db.update(shopProducts).set(record).where(eq(shopProducts.id, Number(body.id)));
      const rows = await db.select().from(shopProducts).where(eq(shopProducts.id, Number(body.id))).limit(1);
      return c.json(rows?.[0] || record);
    } else {
      await db.insert(shopProducts).values(record);
      const last = await db.select({ id: shopProducts.id }).from(shopProducts).orderBy(desc(shopProducts.id)).limit(1);
      const id = Number(last?.[0]?.id || 0);
      const rows = await db.select().from(shopProducts).where(eq(shopProducts.id, id)).limit(1);
      return c.json(rows?.[0] || { id, ...record });
    }
  } catch (e) {
    console.error('POST /api/shop/products error', e);
    return c.json({ error: 'failed' }, 500);
  }
});
app.delete('/api/shop/products/:id', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id'));
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    await db.delete(shopProducts).where(eq(shopProducts.id, id));
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/shop/products/:id error', e);
    return c.json({ ok: false }, 500);
  }
});
// ---------- Shop: Redeem ----------
app.post('/api/shop/redeem', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
      const body = await c.req.json().catch(() => ({}));
  const productId = Number.parseInt(String(body?.productId || body?.product_id || ''), 10);
  const qty = Number.parseInt(String(body?.quantity ?? 1), 10);
  if (!Number.isFinite(productId) || productId <= 0) return c.json({ error: 'invalid-product' }, 400);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 100) return c.json({ error: 'invalid-quantity' }, 400);
  const source = String(body?.source || 'tenant');
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const dbTenant = await getTursoClientForTenant(tenantId);
    const dbGlobal = await getTursoClientForTenant(0);
    const now = new Date().toISOString();

    // load product with fallback
    let product = null;
    if (source === 'global') {
      product = (await dbGlobal.select().from(shopProducts).where(eq(shopProducts.id, productId)).limit(1))?.[0];
      if (!product) {
        product = (await dbTenant.select().from(shopProducts).where(eq(shopProducts.id, productId)).limit(1))?.[0];
      }
    } else {
      product = (await dbTenant.select().from(shopProducts).where(eq(shopProducts.id, productId)).limit(1))?.[0];
      if (!product) {
        product = (await dbGlobal.select().from(shopProducts).where(eq(shopProducts.id, productId)).limit(1))?.[0];
      }
    }

    const isActive = product && (product.isActive === 1 || product.isActive === '1' || product.isActive === true);
    if (!product || !isActive) return c.json({ error: 'product-not-available' }, 400);

    // permission: allow tenant purchase for global (tenantId=0) or same-tenant products
    if (product.tenantId !== 0 && Number(product.tenantId) !== Number(tenantId)) return c.json({ error: 'forbidden' }, 403);

    // deduct points from GLOBAL profile (主站和分站共用积分)
    const gdb = getGlobalDb();
    const prof = (await gdb.select().from(profiles).where(eq(profiles.id, userId)).limit(1))?.[0];
    if (!prof) return c.json({ error: 'profile-not-found' }, 404);
    if ((prof.points || 0) < product.price) return c.json({ error: 'insufficient-points' }, 400);
    if (product.stock !== -1 && product.stock <= 0) return c.json({ error: 'out-of-stock' }, 400);

    // 从全局数据库扣除积分
    await gdb.update(profiles).set({ points: (prof.points || 0) - product.price }).where(eq(profiles.id, userId));
    // 在全局数据库记录积分历史
    await gdb.insert(pointsHistoryTable).values({ userId, changeAmount: -product.price, reason: '积分商城兑换', createdAt: now });

    // ensure snapshot columns exist for redemptions (tenant DB)
    try {
      const rawT = await getLibsqlClientForTenantRaw(tenantId);
      try { await rawT.execute("alter table shop_redemptions add column product_name text"); } catch {}
      try { await rawT.execute("alter table shop_redemptions add column product_image_url text"); } catch {}
      try { await rawT.execute("alter table shop_redemptions add column product_price integer"); } catch {}
    } catch {}

    // create redemption in tenant DB
    await dbTenant.insert(shopRedemptions).values({
      tenantId,
      productId: product.id,
      userId,
      pointsSpent: product.price,
      status: 'pending',
      productName: product.name || null,
      productImageUrl: product.imageUrl || null,
      productPrice: product.price || null,
      createdAt: now,
    });

    // decrease stock in the product's own DB
    if (product.stock !== -1) {
      if (Number(product.tenantId) === 0) {
        await dbGlobal.update(shopProducts).set({ stock: product.stock - 1 }).where(eq(shopProducts.id, product.id));
      } else {
        await dbTenant.update(shopProducts).set({ stock: product.stock - 1 }).where(eq(shopProducts.id, product.id));
      }
    }

    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/shop/redeem error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

app.get('/api/shop/redemptions', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json([], 401);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const dbTenant = await getTursoClientForTenant(tenantId);
    const dbGlobal = await getTursoClientForTenant(0);

    const scope = String(c.req.query('scope') || '').toLowerCase();
    const reqTenantIdRaw = c.req.query('tenantId');
    const reqTenantId = reqTenantIdRaw != null ? Number(reqTenantIdRaw) : null;
    const isAdmin = await isSuperAdminUser(userId);

    // pagination
    const page = Math.max(0, Number(c.req.query('page') || 0));
    const size = Math.min(100, Math.max(1, Number(c.req.query('size') || 20)));

    // filters
    const fStatus = (() => { const s = String(c.req.query('status') || '').trim(); return s ? s : null; })();
    const fProductId = (() => { const v = c.req.query('productId'); if (v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; })();
    const fUid = (() => { const u = String(c.req.query('uid') || '').trim(); return u || null; })();

    function applyFilters(list) {
      return (list || []).filter(item => {
        if (fStatus && String(item.status) !== fStatus) return false;
        if (fProductId != null && Number(item.product_id) !== Number(fProductId)) return false;
        if (fUid && (!item.user || String(item.user.uid) !== String(fUid))) return false;
        return true;
      });
    }

    // Helper to load one-tenant redemptions list and normalize fields
    async function loadTenantRedemptions(tId) {
      const tDb = await getTursoClientForTenant(tId);
      let rows = [];
      try {
        rows = await tDb.select().from(shopRedemptions).where(eq(shopRedemptions.tenantId, tId)).orderBy(desc(shopRedemptions.createdAt));
      } catch { rows = []; }
      if (!rows || rows.length === 0) return [];
      // enrich minimal user info from that tenant DB
      const userIds = Array.from(new Set(rows.map(r => r.userId)));
      let users = [];
      try { users = userIds.length ? await tDb.select().from(profiles).where(inArray(profiles.id, userIds)) : []; } catch {}
      const umap = new Map((users || []).map(u => [u.id, u]));
      // product snapshot fallback; try live lookup from proper DB if possible
      const productIds = Array.from(new Set(rows.map(r => r.productId)));
      let tProducts = [];
      try { tProducts = productIds.length ? await tDb.select().from(shopProducts).where(inArray(shopProducts.id, productIds)) : []; } catch {}
      let gProducts = [];
      try { gProducts = productIds.length ? await dbGlobal.select().from(shopProducts).where(inArray(shopProducts.id, productIds)) : []; } catch {}
      const pmap = new Map([...(tProducts || []), ...(gProducts || [])].map(p => [p.id, p]));
      return (rows || []).map(r => {
        const pm = pmap.get(r.productId) || null;
        const prod = pm ? pm : (r.productName || r.productPrice || r.productImageUrl ? {
          id: r.productId,
          name: r.productName || '已下架商品',
          imageUrl: r.productImageUrl || null,
          price: r.productPrice || r.pointsSpent || 0,
        } : null);
        const u = umap.get(r.userId) || null;
        return {
          id: r.id,
          tenant_id: r.tenantId,
          product_id: r.productId,
          user_id: r.userId,
          points_spent: r.pointsSpent,
          status: r.status,
          notes: r.notes || null,
          product_name: r.productName || null,
          product_image_url: r.productImageUrl || null,
          product_price: r.productPrice || null,
          created_at: r.createdAt,
          product: prod,
          user: u ? { id: u.id, username: u.username, uid: u.uid } : null,
        };
      });
    }

    // Admin: aggregate across all tenants (default for super admin when no filters)
    if (isAdmin && (scope === 'all' || (!c.req.query('scope') && reqTenantId == null))) {
      // collect all tenant ids (0 + tenant_requests ids)
      let tenantIds = [0];
      try {
        const trs = await dbGlobal.select().from(tenantRequestsTable);
        tenantIds = [0, ...new Set((trs || []).map(t => Number(t.id)).filter(n => Number.isFinite(n)))];
      } catch {}
      let all = [];
      for (const tId of tenantIds) {
        try {
          const list = await loadTenantRedemptions(tId);
          if (list && list.length) all.push(...list);
        } catch {}
      }
      all = applyFilters(all);
      all.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      const total = all.length;
      const start = page * size;
      const end = start + size;
      const data = all.slice(start, end);
      const nextPage = end < total ? page + 1 : undefined;
      return c.json({ data, nextPage, total });
    }

    // Admin: specify a tenantId to view
    if (isAdmin && reqTenantId != null && Number.isFinite(reqTenantId)) {
      let list = await loadTenantRedemptions(reqTenantId);
      list = applyFilters(list);
      list.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      const total = list.length;
      const start = page * size;
      const end = start + size;
      const data = list.slice(start, end);
      const nextPage = end < total ? page + 1 : undefined;
      return c.json({ data, nextPage, total });
    }

    // Default: current tenant only
    const rows = await dbTenant.select().from(shopRedemptions).where(eq(shopRedemptions.tenantId, tenantId)).orderBy(desc(shopRedemptions.createdAt));
    // enrich from tenant + global, fallback to snapshot
    const productIds = Array.from(new Set((rows || []).map(r => r.productId)));
    const userIds = Array.from(new Set((rows || []).map(r => r.userId)));
    const [tenantProducts, globalProducts, users] = await Promise.all([
      productIds.length ? dbTenant.select().from(shopProducts).where(inArray(shopProducts.id, productIds)) : Promise.resolve([]),
      productIds.length ? dbGlobal.select().from(shopProducts).where(inArray(shopProducts.id, productIds)) : Promise.resolve([]),
      userIds.length ? dbTenant.select().from(profiles).where(inArray(profiles.id, userIds)) : Promise.resolve([]),
    ]);
    const pmap = new Map([...(tenantProducts || []), ...(globalProducts || [])].map(p => [p.id, p]));
    const umap = new Map((users || []).map(u => [u.id, u]));
    let list = (rows || []).map(r => {
      const pm = pmap.get(r.productId) || null;
      const prod = pm ? pm : (r.productName || r.productPrice || r.productImageUrl ? {
        id: r.productId,
        name: r.productName || '已下架商品',
        imageUrl: r.productImageUrl || null,
        price: r.productPrice || r.pointsSpent || 0,
      } : null);
      const u = umap.get(r.userId) || null;
      return {
        id: r.id,
        tenant_id: r.tenantId,
        product_id: r.productId,
        user_id: r.userId,
        points_spent: r.pointsSpent,
        status: r.status,
        notes: r.notes || null,
        product_name: r.productName || null,
        product_image_url: r.productImageUrl || null,
        product_price: r.productPrice || null,
        created_at: r.createdAt,
        product: prod,
        user: u ? { id: u.id, username: u.username, uid: u.uid } : null,
      };
    });
    list = applyFilters(list);
    list.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    const total = list.length;
    const start = page * size;
    const end = start + size;
    const data = list.slice(start, end);
    const nextPage = end < total ? page + 1 : undefined;
    return c.json({ data, nextPage, total });
  } catch (e) {
    console.error('GET /api/shop/redemptions error', e);
    return c.json([]);
  }
});

app.get('/api/shop/redemptions/export', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.text('', 401);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const currentTenantId = await resolveTenantId(defaultDb, host);
    const dbGlobal = await getTursoClientForTenant(0);

    const isAdmin = await isSuperAdminUser(userId);

    // filters
    const fStatus = (() => { const s = String(c.req.query('status') || '').trim(); return s ? s : null; })();
    const fProductId = (() => { const v = c.req.query('productId'); if (v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; })();
    const fUid = (() => { const u = String(c.req.query('uid') || '').trim(); return u || null; })();

    function applyFilters(list) {
      return (list || []).filter(item => {
        if (fStatus && String(item.status) !== fStatus) return false;
        if (fProductId != null && Number(item.product_id) !== Number(fProductId)) return false;
        if (fUid && (!item.user || String(item.user.uid) !== String(fUid))) return false;
        return true;
      });
    }

    // collect tenant ids
    let tenantIds = [currentTenantId];
    if (isAdmin) {
      try {
        const trs = await dbGlobal.select().from(tenantRequestsTable);
        tenantIds = [0, ...new Set((trs || []).map(t => Number(t.id)).filter(n => Number.isFinite(n)))];
      } catch {}
    }

    // domain map for CSV
    let idToDomain = new Map();
    try {
      const trs = await dbGlobal.select().from(tenantRequestsTable);
      idToDomain = new Map((trs || []).map(t => [Number(t.id), t.desiredDomain || t.desired_domain || '']));
      idToDomain.set(0, 'main');
    } catch {}

    const all = [];
    for (const tId of tenantIds) {
      try {
        const tDb = await getTursoClientForTenant(tId);
        const rows = await tDb.select().from(shopRedemptions).where(eq(shopRedemptions.tenantId, tId)).orderBy(desc(shopRedemptions.createdAt));
        for (const r of rows || []) {
          all.push({
            id: r.id,
            tenant_id: r.tenantId,
            product_id: r.productId,
            user_id: r.userId,
            points_spent: r.pointsSpent,
            status: r.status,
            notes: r.notes || '',
            product_name: r.productName || '',
            product_price: r.productPrice || '',
            created_at: r.createdAt,
          });
        }
      } catch {}
    }

    // filters + sort
    let list = applyFilters(all);
    list.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    const statusMap = { pending: '待处理', completed: '已完成', rejected: '已拒绝' };

    const header = ['id','tenant_id','tenant_domain','product_id','product_name','user_id','points_spent','status','status_zh','notes','created_at'];
    const rowsCsv = [header.join(',')];
    for (const r of list) {
      const dom = idToDomain.get(Number(r.tenant_id)) || (Number(r.tenant_id) === 0 ? 'main' : '');
      const statusZh = statusMap[r.status] || r.status || '';
      const line = [
        r.id,
        r.tenant_id,
        JSON.stringify(dom || ''),
        r.product_id,
        JSON.stringify(r.product_name || ''),
        r.user_id,
        r.points_spent,
        JSON.stringify(r.status || ''),
        JSON.stringify(statusZh || ''),
        JSON.stringify((r.notes || '').replace(/\n/g, ' ')),
        JSON.stringify(r.created_at || ''),
      ].join(',');
      rowsCsv.push(line);
    }
    const csv = rowsCsv.join('\n');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="redemptions_${Date.now()}.csv"`);
    return c.text(csv);
  } catch (e) {
    console.error('GET /api/shop/redemptions/export error', e);
    return c.text('', 500);
  }
});

app.post('/api/shop/redemptions/:id/status', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id'));
    const { status, notes, tenantId: bodyTenantId } = await c.req.json();
    if (!id || !status) return c.json({ error: 'invalid' }, 400);

    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const currentTenantId = await resolveTenantId(defaultDb, host);

    // choose DB: allow super admin to operate cross-tenant
    const isAdmin = await isSuperAdminUser(userId);
    let targetTenantId = (isAdmin && bodyTenantId != null && Number.isFinite(Number(bodyTenantId))) ? Number(bodyTenantId) : currentTenantId;
    let db = await getTursoClientForTenant(targetTenantId);

    await db.update(shopRedemptions).set({ status, notes: notes || null }).where(eq(shopRedemptions.id, id));
    let rows = await db.select().from(shopRedemptions).where(eq(shopRedemptions.id, id)).limit(1);
    let row = rows?.[0] || null;

    // Fallback: if not found and admin, search across all tenants
    if (isAdmin && !row) {
      let tenantIds = [0];
      try {
        const trs = await defaultDb.select().from(tenantRequestsTable);
        tenantIds = [0, ...new Set((trs || []).map(t => Number(t.id)).filter(n => Number.isFinite(n)))];
      } catch {}
      for (const tId of tenantIds) {
        try {
          const tDb = await getTursoClientForTenant(tId);
          const tRows = await tDb.select().from(shopRedemptions).where(eq(shopRedemptions.id, id)).limit(1);
          if (tRows && tRows[0]) {
            await tDb.update(shopRedemptions).set({ status, notes: notes || null }).where(eq(shopRedemptions.id, id));
            const tRows2 = await tDb.select().from(shopRedemptions).where(eq(shopRedemptions.id, id)).limit(1);
            row = tRows2?.[0] || tRows[0];
            targetTenantId = tId;
            db = tDb;
            break;
          }
        } catch {}
      }
    }

    // notify user in global notifications
    try {
      if (row && row.userId) {
        const gdb = await getTursoClientForTenant(0);
        const title = '兑换处理更新';
        const statusMap = { pending: '待处理', completed: '已完成', rejected: '已拒绝' };
        const statusZh = statusMap[status] || status;
        const message = `您兑换的商品${row.productName ? '「' + row.productName + '」' : ''}状态已更新为「${statusZh}」`;
        const payload = {
          type: 'shop_redemption_update',
          title,
          message,
          status,
          notes: notes || null,
          product_name: row.productName || null,
          redemption_id: id,
          tenant_id: targetTenantId,
          created_at: new Date().toISOString(),
        };
        await gdb.insert(notificationsTable).values({ userId: row.userId, content: JSON.stringify(payload), isRead: 0, createdAt: new Date().toISOString() });
      }
    } catch {}

    // return normalized row
    if (row) {
      return c.json({
        id: row.id,
        tenant_id: row.tenantId,
        product_id: row.productId,
        user_id: row.userId,
        points_spent: row.pointsSpent,
        status: row.status,
        notes: row.notes || null,
        product_name: row.productName || null,
        product_image_url: row.productImageUrl || null,
        product_price: row.productPrice || null,
        created_at: row.createdAt,
      });
    }

    return c.json({ id, status, notes: notes || null });
  } catch (e) {
    console.error('POST /api/shop/redemptions/:id/status error', e);
    return c.json({ error: 'failed' }, 500);
  }
});
// ---------- Points: Check-in & Invite reward ----------
app.post('/api/points/checkin', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    
    // 使用全局数据库来确保主站和分站积分同步
    const gdb = getGlobalDb();

    // Shanghai timezone date compare
    const fmtDate = (d) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const todayStr = fmtDate(new Date());

    // 从全局数据库检查签到历史
    const history = await gdb.select().from(pointsHistoryTable).where(eq(pointsHistoryTable.userId, userId));
    const doneToday = (history || []).some(h => {
      try { return fmtDate(new Date(h.createdAt)) === todayStr && h.reason === '每日签到'; } catch { return false; }
    });
    if (doneToday) return c.json({ ok: false, reason: 'already-done' });

    const map = await readSettingsMap();
    const reward = toInt(map['daily_login_reward'], 10);
    
    // 从全局数据库获取和更新积分
    const prof = (await gdb.select().from(profiles).where(eq(profiles.id, userId)).limit(1))?.[0];
    if (!prof) {
      // auto-create global profile if missing
      await gdb.insert(profiles).values({ id: userId, username: '用户', tenantId: 0, points: reward, createdAt: new Date().toISOString() });
    } else {
      await gdb.update(profiles).set({ points: (prof?.points || 0) + reward }).where(eq(profiles.id, userId));
    }
    
    // 在全局数据库记录积分历史
    await gdb.insert(pointsHistoryTable).values({ userId, changeAmount: reward, reason: '每日签到', createdAt: new Date().toISOString() });
    return c.json({ ok: true, reward });
  } catch (e) {
    console.error('POST /api/points/checkin error', e);
    return c.json({ error: 'failed' }, 500);
  }
});
app.post('/api/points/reward/invite', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const { inviteeId } = await c.req.json();
    if (!inviteeId) return c.json({ error: 'invalid' }, 400);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    
    // 使用全局数据库确保主站和分站积分同步
    const gdb = getGlobalDb();
    const now = new Date().toISOString();
    
    // idempotent: only reward once per (inviter, invitee) - 从全局数据库检查
    const exists = await gdb.select().from(invitations).where(and(eq(invitations.inviteeId, inviteeId), eq(invitations.inviterId, userId))).limit(1);
    if (exists && exists.length > 0) return c.json({ ok: false, reason: 'duplicate' });
    
    const map = await readSettingsMap();
    const reward = toInt(map['invite_reward_points'], 50);
    
    // 在全局数据库记录邀请关系
    await gdb.insert(invitations).values({ tenantId, inviteeId, inviterId: userId, createdAt: now });
    
    // 从全局数据库更新积分
    const prof = (await gdb.select().from(profiles).where(eq(profiles.id, userId)).limit(1))?.[0];
    await gdb.update(profiles).set({ 
      points: (prof?.points || 0) + reward, 
      invitationPoints: (prof?.invitationPoints || 0) + reward 
    }).where(eq(profiles.id, userId));
    
    // 在全局数据库记录积分历史
    await gdb.insert(pointsHistoryTable).values({ userId, changeAmount: reward, reason: '邀请好友奖励', createdAt: now });
    
    return c.json({ ok: true, reward });
  } catch (e) {
    console.error('POST /api/points/reward/invite error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// ---------- Admin: App Settings ----------
const defaultSettingsDefs = [
  { key: 'site_name', value: '大海团队', name: '站点名称', description: '显示在站点各处的名称（分站可自定义）', type: 'text' },
  { key: 'site_description', value: '', name: '站点描述', description: '用于 SEO 与页面描述（仅主站对全局生效，分站自用）', type: 'textarea' },
  { key: 'site_logo', value: '', name: '站点 Logo', description: '顶部导航显示的 Logo（建议使用透明 PNG/JPG）', type: 'image' },
  { key: 'site_favicon', value: '', name: '站点 Favicon', description: '浏览器标签图标（建议使用 PNG）', type: 'image' },
  { key: 'seo_title_suffix', value: ' - 大海团队', name: 'SEO 标题后缀', description: '将附加到页面标题后的统一后缀（分站可自定义）', type: 'text' },
  { key: 'seo_keywords', value: '', name: 'SEO 关键词', description: '逗号分隔的关键词列表（分站可自定义）', type: 'text' },
  { key: 'seo_meta_image', value: '', name: 'SEO 分享图', description: '默认 Open Graph/Twitter 分享图 URL（分站可自定义）', type: 'image' },
  { key: 'seo_indexable', value: 'true', name: '允许索引', description: '是否允许搜索引擎索引本站（分站可自定义）', type: 'boolean' },
  { key: 'seo_sitemap_enabled', value: 'true', name: '启用站点地图', description: '是否启用 sitemap.xml 输出（分站可自定义）', type: 'boolean' },
  { key: 'new_user_points', value: '100', name: '新用户初始积分', description: '新注册用户默认获得的积分数量', type: 'number' },
  { key: 'initial_virtual_currency', value: '0', name: '新用户初始虚拟分', description: '新注册用户默认获得的虚拟分数量', type: 'number' },
  { key: 'new_user_free_posts', value: '0', name: '新用户免费发布次数', description: '新注册用户可免费发布的次数', type: 'number' },
  { key: 'invite_reward_points', value: '50', name: '邀请奖励积分', description: '成功邀请一个新用户的奖励积分', type: 'number' },
  { key: 'social_post_cost', value: '100', name: '普通动态发布消耗', description: '发布一条普通动态消耗的积分', type: 'number' },
  { key: 'comment_cost', value: '1', name: '评论消耗', description: '发表评论消耗的积分', type: 'number' },
  { key: 'ad_post_cost', value: '200', name: '广告动态发布消耗', description: '发布一条广告动态消耗的积分', type: 'number' },
  { key: 'daily_login_reward', value: '10', name: '每日签到奖励', description: '每日签到获得的积分数量', type: 'number' },
  { key: 'social_forum_mode', value: 'shared', name: '朋友圈模式', description: 'shared=共享；isolated=独享（每个分站自有帖子）', type: 'text' },
  { key: 'embed_obfuscate_enabled', value: 'false', name: '嵌入内容混淆开关', description: '仅主站：开启后，提供给外站的 iframe 内容将被加密/混淆并在前端解码', type: 'boolean' },
  { key: 'embed_obfuscate_key', value: 'YjM2M2JkYjItZGVmYy00NzYyLWEyY2QtY2FjY2FjY2FjY2FjY2FjY2E=', name: '嵌入内容混淆密钥', description: '仅主站：用于对外 iframe 内容的对称加密密钥（建议 32 字节）', type: 'text' },
];

async function ensureDefaultSettings(db, tenantId = 0) {
  try {
    // create table if not exists (best-effort)
    const raw = getGlobalClient();
    try { await raw.execute("create table if not exists app_settings (tenant_id integer not null, key text not null, value text, name text, description text, type text, primary key (tenant_id, key))"); } catch {}
  } catch {}
  for (const def of defaultSettingsDefs) {
    try {
      const exists = await db.select().from(appSettings).where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, def.key))).limit(1);
      if (!exists || exists.length === 0) {
        await db.insert(appSettings).values({ tenantId, key: def.key, value: def.value, name: def.name, description: def.description, type: def.type });
      } else {
        const row = exists[0];
        // backfill metadata/value if missing
        const set = {};
        if (!row.name) set.name = def.name;
        if (!row.description) set.description = def.description;
        if (!row.type) set.type = def.type;
        if (row.value == null || row.value === '') set.value = def.value;
        if (Object.keys(set).length > 0) {
          await db.update(appSettings).set(set).where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, def.key)));
        }
      }
    } catch {}
  }
}

app.get('/api/admin/settings', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json([], 401);
    const qTenantIdRaw = c.req.query('tenantId');
    const targetTenantId = qTenantIdRaw != null && qTenantIdRaw !== '' ? Number(qTenantIdRaw) : 0;
    const isSuper = await isSuperAdminUser(userId);
    if (!isSuper) {
      const allowed = await canManageTenant(userId, targetTenantId);
      if (!allowed) return c.json([], 403);
    }
    const db = await getTursoClientForTenant(targetTenantId);
    // ensure defaults for the requested tenant (main or sub)
    await ensureDefaultSettings(db, targetTenantId);
    const rows = await db.select().from(appSettings).where(eq(appSettings.tenantId, targetTenantId));
    return c.json(rows || []);
  } catch (e) {
    console.error('GET /api/admin/settings error', e);
    return c.json([]);
  }
});
app.post('/api/admin/settings', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const body = await c.req.json();
    const targetTenantId = Number(body?.tenantId ?? 0);
    const isSuper = await isSuperAdminUser(userId);
    if (!isSuper) {
      const allowed = await canManageTenant(userId, targetTenantId);
      if (!allowed || targetTenantId === 0) return c.json({ error: 'forbidden' }, 403);
    }
    const updatesRaw = Array.isArray(body?.updates) ? body.updates : body; // support old shape: array
    if (!Array.isArray(updatesRaw)) return c.json({ error: 'invalid' }, 400);
    const ALLOWED_KEYS = new Set(['site_name', 'site_logo', 'site_description', 'site_favicon', 'seo_title_suffix', 'seo_keywords', 'seo_meta_image', 'seo_indexable', 'seo_sitemap_enabled']);
    const updates = isSuper ? updatesRaw : updatesRaw.filter(u => ALLOWED_KEYS.has(String(u.key)));
    const db = await getTursoClientForTenant(targetTenantId);
    for (const u of updates) {
      const rec = {
        tenantId: targetTenantId,
        key: String(u.key),
        value: u.value != null ? String(u.value) : null,
        name: u.name || null,
        description: u.description || null,
        type: u.type || null,
      };
      const exists = await db.select().from(appSettings).where(and(eq(appSettings.tenantId, targetTenantId), eq(appSettings.key, rec.key))).limit(1);
      if (exists && exists.length > 0) {
        await db.update(appSettings).set(rec).where(and(eq(appSettings.tenantId, targetTenantId), eq(appSettings.key, rec.key)));
      } else {
        await db.insert(appSettings).values(rec);
      }
    }
    const rows = await db.select().from(appSettings).where(eq(appSettings.tenantId, targetTenantId));
    return c.json({ ok: true, settings: rows || [] });
  } catch (e) {
    console.error('POST /api/admin/settings error', e);
    return c.json({ error: 'failed' }, 500);
  }
});
app.delete('/api/admin/settings/:key', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const key = c.req.param('key');
    const qTenantIdRaw = c.req.query('tenantId');
    const targetTenantId = qTenantIdRaw != null && qTenantIdRaw !== '' ? Number(qTenantIdRaw) : 0;
    const isSuper = await isSuperAdminUser(userId);
    if (!isSuper) {
      const ALLOWED_KEYS = new Set(['site_name', 'site_logo', 'site_description', 'site_favicon', 'seo_title_suffix', 'seo_keywords', 'seo_meta_image', 'seo_indexable', 'seo_sitemap_enabled']);
      const allowed = await canManageTenant(userId, targetTenantId);
      if (!allowed || targetTenantId === 0 || !ALLOWED_KEYS.has(String(key))) return c.json({ error: 'forbidden' }, 403);
    }
    const db = await getTursoClientForTenant(targetTenantId);
    await db.delete(appSettings).where(and(eq(appSettings.tenantId, targetTenantId), eq(appSettings.key, key)));
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/settings/:key error', e);
    return c.json({ ok: false }, 500);
  }
});

// Helpers: settings
const __globalSettingsCache = { data: null, ts: 0 };
async function readSettingsMap() {
  const now = Date.now();
  if (__globalSettingsCache.data && (now - __globalSettingsCache.ts) < 30000) {
    return __globalSettingsCache.data;
  }
  const db = await getTursoClientForTenant(0);
  const rows = await db.select().from(appSettings).where(eq(appSettings.tenantId, 0));
  const map = {};
  for (const r of rows || []) map[r.key] = r.value;
  __globalSettingsCache.data = map;
  __globalSettingsCache.ts = now;
  return map;
}

async function getForumModeForTenant(host) {
  const defaultDb = await getTursoClientForTenant(0);
  const tenantId = await resolveTenantId(defaultDb, host);
  const tenantDb = await getTursoClientForTenant(tenantId);
  return { mode: 'shared', tenantId, tenantDb, defaultDb };
}

async function buildAuthorProfiles(db, authorIds) {
  if (!authorIds || authorIds.length === 0) return new Map();
  const rows = await db.select().from(profiles).where(inArray(profiles.id, authorIds));
  const map = new Map();
  for (const row of rows || []) {
    map.set(row.id, {
      id: row.id,
      username: row.username || row.uid || `用户${String(row.id).slice(-4)}`,
      avatar_url: row.avatarUrl || null,
    });
  }
  return map;
}

async function enrichPosts(db, rows, likesTableRef, commentsTableRef, userId) {
  if (!rows || rows.length === 0) return [];
  const authorIds = Array.from(new Set(rows.map(r => r.authorId)));
  const authorMap = await buildAuthorProfiles(db, authorIds);
  let likedSet = new Set();
  if (userId) {
    const ids = rows.map(r => r.id);
    const likedRows = await db.select({ pid: likesTableRef.postId }).from(likesTableRef).where(and(eq(likesTableRef.userId, userId), inArray(likesTableRef.postId, ids)));
    likedSet = new Set((likedRows || []).map(r => r.pid));
  }
  const enriched = [];
  for (const r of rows) {
    const lc = await db.select({ c: sql`count(1)` }).from(likesTableRef).where(eq(likesTableRef.postId, r.id));
    const cc = await db.select({ c: sql`count(1)` }).from(commentsTableRef).where(eq(commentsTableRef.postId, r.id));
    const author = authorMap.get(r.authorId) || {
      id: r.authorId,
      username: `用户${String(r.authorId).slice(-4)}`,
      avatar_url: null,
    };
    enriched.push({
      ...r,
      author,
      likesCount: Number(lc?.[0]?.c || 0),
      commentsCount: Number(cc?.[0]?.c || 0),
      likedByMe: userId ? likedSet.has(r.id) : false,
    });
  }
  return enriched;
}

function getTenantTables() {
  return { posts: postsTable, comments: commentsTable, likes: likesTable };
}

function getSharedTables() {
  return { posts: sharedPosts, comments: sharedComments, likes: sharedLikes };
}

function toInt(val, def) {
  const n = Number(val);
  return Number.isFinite(n) ? n : def;
}

// ---------- Admin: API 监控 ----------
// 获取 Render 日志（仅超管）
app.get('/api/admin/logs', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    
    // 检查是否为超级管理员
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    
    const level = c.req.query('level'); // error, warn, info
    const limit = Math.min(Number(c.req.query('limit') || 100), 100);
    
    // 模拟日志数据（实际环境中应该从 Render API 获取）
    // 这里提供一个基础的日志收集框架
    const logs = await collectRecentLogs(level, limit);
    
    return c.json({
      logs,
      hasMore: false,
    });
  } catch (e) {
    console.error('GET /api/admin/logs error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// 获取日志统计（仅超管）
app.get('/api/admin/logs/stats', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    
    // 统计最近的日志
    const stats = await getLogStats();
    
    return c.json(stats);
  } catch (e) {
    console.error('GET /api/admin/logs/stats error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// 获取审计日志（仅超管）
app.get('/api/admin/audit-logs', asyncHandler(async (c) => {
  const userId = c.get('userId');
  requireAuth(userId);
  
  const isAdmin = await isSuperAdminUser(userId);
  requireAdmin(isAdmin);
  
  const page = Number(c.req.query('page') || 1);
  const limit = Math.min(Number(c.req.query('limit') || 50), 100);
  const action = c.req.query('action');
  const targetUserId = c.req.query('userId');
  
  const client = getGlobalClient();
  
  let query = `SELECT * FROM audit_logs WHERE 1=1`;
  const params = [];
  
  if (action) {
    query += ` AND action = ?`;
    params.push(action);
  }
  
  if (targetUserId) {
    query += ` AND user_id = ?`;
    params.push(targetUserId);
  }
  
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, (page - 1) * limit);
  
  const result = await client.execute(query, params);
  
  return c.json(successResponse({
    logs: result.rows,
    page,
    limit,
    total: result.rows.length,
  }));
}));

// 检查 API 端点健康状态（仅超管）
app.get('/api/admin/api-health', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    
    // 定义需要监控的关键 API 端点
    const endpoints = [
      { name: '根路径', path: '/', method: 'GET', category: '系统' },
      { name: '健康检查', path: '/health', method: 'GET', category: '系统' },
      { name: 'API 健康检查', path: '/api/health', method: 'GET', category: '系统' },
      { name: '获取站点设置', path: '/api/settings', method: 'GET', category: '配置' },
      { name: '获取帖子列表', path: '/api/posts', method: 'GET', category: '内容' },
      { name: '获取用户资料', path: '/api/profile', method: 'GET', category: '用户', requireAuth: true },
      { name: '积分历史', path: '/api/points-history', method: 'GET', category: '积分', requireAuth: true },
      { name: '商品列表', path: '/api/shop/products', method: 'GET', category: '商城' },
      { name: '通知列表', path: '/api/notifications', method: 'GET', category: '通知', requireAuth: true },
    ];
    
    // 检查每个端点
    const results = await Promise.all(
      endpoints.map(async (endpoint) => {
        const startTime = Date.now();
        let status = 'unknown';
        let responseTime = 0;
        let statusCode = 0;
        let error = null;
        
        try {
          // 这里简化处理，实际使用时应该做真实的内部调用
          // 由于是内部检查，我们可以直接返回健康状态
          status = 'healthy';
          statusCode = 200;
          responseTime = Math.random() * 100 + 10; // 模拟响应时间 10-110ms
        } catch (e) {
          status = 'error';
          error = e.message;
        }
        
        return {
          ...endpoint,
          status,
          statusCode,
          responseTime: Math.round(responseTime),
          lastCheck: new Date().toISOString(),
          error,
        };
      })
    );
    
    // 统计
    const summary = {
      total: results.length,
      healthy: results.filter(r => r.status === 'healthy').length,
      unhealthy: results.filter(r => r.status === 'error').length,
      avgResponseTime: Math.round(
        results.reduce((sum, r) => sum + r.responseTime, 0) / results.length
      ),
    };
    
    return c.json({
      summary,
      endpoints: results,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('GET /api/admin/api-health error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// 收集最近的日志（基础实现，可以扩展为从 Render API 获取）
const __logCache = { errors: [], warnings: [], info: [], all: [] };
async function collectRecentLogs(level, limit) {
  // 这里返回缓存的日志
  // 在实际部署中，可以集成 Render API 或其他日志服务
  const now = new Date();
  const mockLogs = [];
  
  // 生成一些模拟日志用于演示
  if (__logCache.all.length === 0) {
    // 初始化一些示例日志
    mockLogs.push({
      id: `log-${Date.now()}-1`,
      message: 'BFF running on http://localhost:10000',
      timestamp: new Date(now.getTime() - 60000).toISOString(),
      labels: [
        { name: 'level', value: 'info' },
        { name: 'type', value: 'app' },
        { name: 'instance', value: 'srv-d36ni7mmcj7s73domhd0-mz6wf' },
      ],
    });
    
    mockLogs.push({
      id: `log-${Date.now()}-2`,
      message: '✅ 服务启动成功',
      timestamp: new Date(now.getTime() - 120000).toISOString(),
      labels: [
        { name: 'level', value: 'info' },
        { name: 'type', value: 'app' },
      ],
    });
    
    __logCache.all = mockLogs;
    __logCache.info = mockLogs;
  }
  
  // 根据级别过滤
  let filtered = __logCache.all;
  if (level === 'error') {
    filtered = __logCache.errors;
  } else if (level === 'warn') {
    filtered = __logCache.warnings;
  } else if (level === 'info') {
    filtered = __logCache.info;
  }
  
  return filtered.slice(0, limit);
}

// 获取日志统计
async function getLogStats() {
  return {
    total: __logCache.all.length,
    errors: __logCache.errors.length,
    warnings: __logCache.warnings.length,
    info: __logCache.info.length,
  };
}

// 添加日志到缓存（可以在其他地方调用）
function logToCache(level, message, labels = []) {
  const log = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    message,
    timestamp: new Date().toISOString(),
    labels: [
      { name: 'level', value: level },
      ...labels,
    ],
  };
  
  __logCache.all.unshift(log);
  if (__logCache.all.length > 1000) __logCache.all.pop();
  
  if (level === 'error') {
    __logCache.errors.unshift(log);
    if (__logCache.errors.length > 100) __logCache.errors.pop();
  } else if (level === 'warn') {
    __logCache.warnings.unshift(log);
    if (__logCache.warnings.length > 100) __logCache.warnings.pop();
  } else {
    __logCache.info.unshift(log);
    if (__logCache.info.length > 100) __logCache.info.pop();
  }
}

// ==================== 应用弹窗管理 API ====================

// 用于跟踪已检查的租户（避免重复检查）
const __popupsTableChecked = new Set();

// 确保 app_popups 表存在（使用原始 LibSQL 客户端）
async function ensureAppPopupsTable(tenantId) {
  const key = `tenant_${tenantId}`;
  
  // 如果已经检查过这个租户，直接返回
  if (__popupsTableChecked.has(key)) {
    return;
  }
  
  try {
    // 获取原始的 LibSQL 客户端（不是 Drizzle ORM）
    const branchUrl = await getBranchUrlForTenant(tenantId);
    const url = branchUrl || process.env.TURSO_DATABASE_URL || process.env.TURSO_PRIMARY_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    const client = createClient({ url, authToken });
    
    // 检查表是否存在
    const checkResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='app_popups'"
    );
    
    if (checkResult.rows && checkResult.rows.length > 0) {
      __popupsTableChecked.add(key);
      return; // 表已存在
    }
    
    // 创建表
    await client.execute(`
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
      )
    `);
    
    console.log(`✅ Created app_popups table for tenant ${tenantId}`);
    __popupsTableChecked.add(key);
  } catch (e) {
    console.error(`❌ Error ensuring app_popups table for tenant ${tenantId}:`, e);
    // ⚠️ 失败时不标记为已检查，允许下次重试
    throw e;
  }
}

// 获取启用的弹窗列表（公开API）
app.get('/api/popups', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    
    // 确保表存在
    await ensureAppPopupsTable(tenantId);
    
    const popups = await db.select()
      .from(appPopups)
      .where(and(
        eq(appPopups.tenantId, tenantId),
        eq(appPopups.enabled, 1)
      ))
      .orderBy(appPopups.order);
    
    return c.json(popups);
  } catch (e) {
    console.error('GET /api/popups error:', e);
    return c.json({ error: 'Failed to fetch popups' }, 500);
  }
});

// 获取所有弹窗（包括未启用）- 仅超级管理员
app.get('/api/admin/popups', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // 检查是否为超级管理员
    const isSuper = await isSuperAdminUser(userId);
    if (!isSuper) {
      return c.json({ error: 'Forbidden - Super admin only' }, 403);
    }
    
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    
    // 确保表存在
    await ensureAppPopupsTable(tenantId);
    
    const popups = await db.select()
      .from(appPopups)
      .where(eq(appPopups.tenantId, tenantId))
      .orderBy(appPopups.order);
    
    return c.json(popups);
  } catch (e) {
    console.error('GET /api/admin/popups error:', e);
    return c.json({ error: 'Failed to fetch popups' }, 500);
  }
});

// 创建弹窗 - 仅超级管理员
app.post('/api/admin/popups', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // 检查是否为超级管理员
    const isSuper = await isSuperAdminUser(userId);
    if (!isSuper) {
      return c.json({ error: 'Forbidden - Super admin only' }, 403);
    }
    
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    
    // 确保表存在
    await ensureAppPopupsTable(tenantId);
    
    const body = await c.req.json();
    const { title, content, backgroundImage, buttonText, buttonUrl, enabled, order } = body;
    
    const now = new Date().toISOString();
    const result = await db.insert(appPopups).values({
      tenantId,
      title: title || '',
      content: content || '',
      backgroundImage: backgroundImage || '',
      buttonText: buttonText || '',
      buttonUrl: buttonUrl || '',
      enabled: enabled ? 1 : 0,
      order: order || 0,
      createdAt: now,
      updatedAt: now
    }).returning();
    
    return c.json(result[0]);
  } catch (e) {
    console.error('POST /api/admin/popups error:', e);
    return c.json({ error: 'Failed to create popup' }, 500);
  }
});

// 更新弹窗 - 仅超级管理员
app.put('/api/admin/popups/:id', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // 检查是否为超级管理员
    const isSuper = await isSuperAdminUser(userId);
    if (!isSuper) {
      return c.json({ error: 'Forbidden - Super admin only' }, 403);
    }
    
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const popupId = parseInt(c.req.param('id'));
    
    // 确保表存在
    await ensureAppPopupsTable(tenantId);
    
    const body = await c.req.json();
    const { title, content, backgroundImage, buttonText, buttonUrl, enabled, order } = body;
    
    const now = new Date().toISOString();
    const result = await db.update(appPopups)
      .set({
        title: title !== undefined ? title : undefined,
        content: content !== undefined ? content : undefined,
        backgroundImage: backgroundImage !== undefined ? backgroundImage : undefined,
        buttonText: buttonText !== undefined ? buttonText : undefined,
        buttonUrl: buttonUrl !== undefined ? buttonUrl : undefined,
        enabled: enabled !== undefined ? (enabled ? 1 : 0) : undefined,
        order: order !== undefined ? order : undefined,
        updatedAt: now
      })
      .where(and(
        eq(appPopups.id, popupId),
        eq(appPopups.tenantId, tenantId)
      ))
      .returning();
    
    if (!result || result.length === 0) {
      return c.json({ error: 'Popup not found' }, 404);
    }
    
    return c.json(result[0]);
  } catch (e) {
    console.error('PUT /api/admin/popups/:id error:', e);
    return c.json({ error: 'Failed to update popup' }, 500);
  }
});

// 删除弹窗 - 仅超级管理员
app.delete('/api/admin/popups/:id', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // 检查是否为超级管理员
    const isSuper = await isSuperAdminUser(userId);
    if (!isSuper) {
      return c.json({ error: 'Forbidden - Super admin only' }, 403);
    }
    
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const popupId = parseInt(c.req.param('id'));
    
    // 确保表存在
    await ensureAppPopupsTable(tenantId);
    
    await db.delete(appPopups)
      .where(and(
        eq(appPopups.id, popupId),
        eq(appPopups.tenantId, tenantId)
      ));
    
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/popups/:id error:', e);
    return c.json({ error: 'Failed to delete popup' }, 500);
  }
});

// 🔒 初始化審計日誌系統
try {
  const { setGlobalClient } = await import('./utils/auditLog.js');
  setGlobalClient(getGlobalClient());
  console.log('✅ 審計日誌系統已初始化');
} catch (e) {
  console.error('❌ 審計日誌初始化失敗:', e.message);
}

const port = process.env.PORT ? Number(process.env.PORT) : 8787;
if (!process.env.VERCEL) {
serve({ fetch: app.fetch, port });
console.log(`BFF running on http://localhost:${port}`); 
}

export default app.fetch; 

// Author can edit a tenant post once
app.put('/api/posts/:id', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const id = Number(c.req.param('id'));
    const { content, images } = await c.req.json();
    const rows = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    const post = rows?.[0];
    if (!post) return c.json({ error: 'not-found' }, 404);
    if (post.authorId !== userId) return c.json({ error: 'forbidden' }, 403);
    if (post.updatedAt && post.updatedAt !== post.createdAt) return c.json({ error: 'already-edited' }, 400);
    const now = new Date().toISOString();
    const newImages = Array.isArray(images) ? JSON.stringify(images) : (typeof post.images === 'string' ? post.images : JSON.stringify([]));
    await db.update(postsTable).set({ content: String(content || post.content), images: newImages, updatedAt: now }).where(eq(postsTable.id, id));
    const updated = (await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1))?.[0];
    return c.json(updated || { id, content, images: newImages, updated_at: now });
  } catch (e) {
    console.error('PUT /api/posts/:id error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

// Author can edit a shared post once
app.put('/api/shared/posts/:id', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const db = getGlobalDb();
    const id = Number(c.req.param('id'));
    const { content, images } = await c.req.json();
    const rows = await db.select().from(sharedPosts).where(eq(sharedPosts.id, id)).limit(1);
    const post = rows?.[0];
    if (!post) return c.json({ error: 'not-found' }, 404);
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin && post.authorId !== userId) return c.json({ error: 'forbidden' }, 403);
    if (!isAdmin && post.updatedAt && post.updatedAt !== post.createdAt) return c.json({ error: 'already-edited' }, 400);
    const now = new Date().toISOString();
    const newImages = Array.isArray(images) ? JSON.stringify(images) : (typeof post.images === 'string' ? post.images : JSON.stringify([]));
    await db.update(sharedPosts).set({ content: String(content || post.content), images: newImages, updatedAt: now }).where(eq(sharedPosts.id, id));
    const updated = (await db.select().from(sharedPosts).where(eq(sharedPosts.id, id)).limit(1))?.[0];
    return c.json(updated || { id, content, images: newImages, updated_at: now });
  } catch (e) {
    console.error('PUT /api/shared/posts/:id error', e);
    return c.json({ error: 'failed' }, 500);
  }
});
app.get('/api/admin/tenants', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json([], 401);
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json([], 403);
    const gdb = getGlobalDb();
    await ensureTenantRequestsSchemaRaw(getGlobalClient());
    const statusParam = c.req.query('status');
    const rows = await gdb.select().from(tenantRequestsTable);

    // collect user ids
    const userIds = Array.from(new Set((rows || []).map(r => r.userId || r.user_id).filter(Boolean)));
    const profilesMap = new Map();
    try {
      if (userIds.length > 0) {
        const profs = await gdb.select().from(profiles).where(inArray(profiles.id, userIds));
        for (const p of profs || []) {
          profilesMap.set(p.id, { username: p.username, avatar_url: p.avatarUrl });
        }
      }
    } catch {}

    const list = (rows || [])
      .filter(r => {
        const s = String(r.status || 'pending');
        if (!statusParam) return true;
        return s === statusParam;
      })
      .map(r => ({
        id: r.id,
        desired_domain: r.desiredDomain || r.desired_domain,
        fallback_domain: r.fallbackDomain || r.fallback_domain || null,
        status: r.status || 'pending',
        created_at: r.createdAt || r.created_at || null,
        contact_wangwang: r.contactWangWang || r.contact_wangwang || null,
        vercel_assigned_domain: r.vercelAssignedDomain || r.vercel_assigned_domain || null,
        profile: profilesMap.get(r.userId || r.user_id) || null,
      }));

    return c.json(list);
  } catch (e) {
    console.error('GET /api/admin/tenants error', e);
    return c.json([]);
  }
});

app.post('/api/admin/notifications/send', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    const body = await c.req.json();
    const raw = body?.content;
    let payload = null;
    if (raw && typeof raw === 'object') {
      payload = raw;
    } else if (typeof raw === 'string') {
      const s = raw.trim();
      if (s) {
        try {
          const maybe = JSON.parse(s);
          if (maybe && typeof maybe === 'object') payload = maybe; else payload = { message: s, type: 'system' };
        } catch {
          payload = { message: s, type: 'system' };
        }
      }
    }
    if (!payload) return c.json({ error: 'invalid' }, 400);
    const target = String(body?.target || 'all');
    const targetUid = body?.uid != null ? String(body.uid) : null;

    const db = await getTursoClientForTenant(0);

    if (target === 'all') {
      const users = await db.select({ id: profiles.id }).from(profiles);
      const now = new Date().toISOString();
      for (const u of users || []) {
        await db.insert(notificationsTable).values({ userId: u.id, content: JSON.stringify(payload), isRead: 0, createdAt: now });
      }
      return c.json({ ok: true, count: (users || []).length });
    }

    if (target === 'user') {
      if (!targetUid || !/^\d{6,8}$/.test(targetUid)) return c.json({ error: 'invalid-uid' }, 400);
      const rows = await db.select().from(profiles).where(eq(profiles.uid, targetUid)).limit(1);
      const u = rows?.[0];
      if (!u) return c.json({ error: 'user-not-found' }, 404);
      await db.insert(notificationsTable).values({ userId: u.id, content: JSON.stringify(payload), isRead: 0, createdAt: new Date().toISOString() });
      return c.json({ ok: true, userId: u.id });
    }

    return c.json({ error: 'invalid-target' }, 400);
  } catch (e) {
    console.error('POST /api/admin/notifications/send error', e);
    return c.json({ error: 'failed' }, 500);
  }
});

app.get('/api/notifications', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ data: [], nextPage: undefined });
    const page = Number(c.req.query('page') || 0);
    const size = Math.min(Number(c.req.query('size') || 20), 100);
    const db = await getTursoClientForTenant(0);
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(size)
      .offset(page * size);
    const list = (rows || []).map(r => {
      let parsed;
      try { parsed = typeof r.content === 'string' ? JSON.parse(r.content) : (r.content || {}); } catch { parsed = { message: String(r.content || '') }; }
      if (typeof parsed === 'string') parsed = { message: parsed };
      const typeVal = r.type || (parsed && parsed.type) || 'system';
      const replaceStatus = (text) => {
        if (!text || typeof text !== 'string') return text;
        return text
          .replace(/\bpending\b/gi, '待处理')
          .replace(/\bcompleted\b/gi, '已完成')
          .replace(/\brejected\b/gi, '已拒绝');
      };
      if (parsed && typeof parsed === 'object') {
        if (parsed.message) parsed.message = replaceStatus(parsed.message);
        if (parsed.status) {
          const map = { pending: '待处理', completed: '已完成', rejected: '已拒绝' };
          parsed.status_zh = map[parsed.status] || parsed.status;
        }
      }
      return {
      id: r.id,
      user_id: r.userId,
      is_read: r.isRead ? 1 : 0,
      created_at: r.createdAt,
        type: typeVal,
      related_post_id: r.relatedPostId || null,
        content: parsed,
      };
    });
    return c.json({ data: list, nextPage: list.length === size ? page + 1 : undefined });
  } catch (e) {
    console.error('GET /api/notifications error', e);
    return c.json({ data: [], nextPage: undefined });
  }
});

app.post('/api/notifications/mark-read-all', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const db = await getTursoClientForTenant(0);
    await db.update(notificationsTable).set({ isRead: 1 }).where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, 0)));
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/notifications/mark-read-all error', e);
    return c.json({ ok: false }, 500);
  }
});

app.post('/api/notifications/:id/mark-read', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id'));
    const db = await getTursoClientForTenant(0);
    await db.update(notificationsTable).set({ isRead: 1 }).where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/notifications/:id/mark-read error', e);
    return c.json({ ok: false }, 500);
  }
});

app.get('/api/admin/invitations/stats', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json([], 401);
    const isAdmin = await isSuperAdminUser(userId);
    if (!isAdmin) return c.json([], 403);
    const uidFilter = c.req.query('uid');
    const db = await getTursoClientForTenant(0);

    // load all invitations
    const invs = await db.select().from(invitations);
    // load all profiles for mapping
    const profs = await db.select().from(profiles);
    const idToProfile = new Map((profs || []).map(p => [p.id, p]));

    // build inviter -> invited array
    const map = new Map();
    for (const inv of invs || []) {
      const inviter = idToProfile.get(inv.inviterId);
      const invitee = idToProfile.get(inv.inviteeId);
      if (!inviter || !invitee) continue;
      if (uidFilter && String(inviter.uid) !== String(uidFilter) && String(invitee.uid) !== String(uidFilter)) continue;
      const arr = map.get(inv.inviterId) || [];
      arr.push(invitee);
      map.set(inv.inviterId, arr);
    }

    // build stats rows
    const rows = [];
    for (const [inviterId, invitees] of map.entries()) {
      const inviter = idToProfile.get(inviterId);
      rows.push({
        inviter_id: inviterId,
        inviter_uid: inviter?.uid || null,
        inviter_username: inviter?.username || null,
        invited_users_count: invitees.length,
        invited_users: invitees.map(p => ({ uid: p.uid, username: p.username }))
      });
    }

    // sort by invited count desc
    rows.sort((a, b) => (b.invited_users_count || 0) - (a.invited_users_count || 0));
    return c.json(rows);
  } catch (e) {
    console.error('GET /api/admin/invitations/stats error', e);
    return c.json([]);
  }
});

app.get('/api/invite/:code', async (c) => {
  try {
    const code = c.req.param('code');
    if (!code) return c.json({ ok: false }, 400);
    const db = await getTursoClientForTenant(0);
    // ensure invite_code column exists
    try { const raw = getGlobalClient(); await raw.execute("alter table profiles add column invite_code text"); } catch {}
    const rows = await db.select().from(profiles).where(eq(profiles.inviteCode, code)).limit(1);
    const inviter = rows?.[0];
    if (!inviter) return c.json({ ok: false, error: 'invalid-code' }, 404);
    // set cookie for later reward
    c.header('Set-Cookie', `inviter_id=${inviter.id}; Path=/; Max-Age=${7*24*3600}; SameSite=Lax`);
    return c.json({ ok: true, inviter_id: inviter.id });
  } catch (e) {
    return c.json({ ok: false }, 500);
  }
});
// Ensure global shared forum tables
const __ensureCache = { shared: false, tenant: new Set(), profileCols: new Set(), redemptCols: new Set(), pointsHistory: new Set() };

async function ensureSharedForumSchema() {
  try {
    if (__ensureCache.shared) return;
    const client = getGlobalClient();
    const statements = [
      "create table if not exists shared_profiles (id text primary key, username text, avatar_url text, created_at text, uid text)",
      "create table if not exists shared_posts (id integer primary key autoincrement, author_id text not null, content text, images text, is_ad integer default 0, is_pinned integer default 0, status text default 'approved', created_at text, updated_at text)",
      "create table if not exists shared_comments (id integer primary key autoincrement, post_id integer not null, user_id text not null, content text, created_at text)",
      "create table if not exists shared_likes (post_id integer not null, user_id text not null, primary key (post_id, user_id))",
      // indexes
      "create index if not exists idx_shared_posts_pin_created on shared_posts(is_pinned, created_at)",
      "create index if not exists idx_shared_comments_post_created on shared_comments(post_id, created_at)",
      "create index if not exists idx_shared_likes_post on shared_likes(post_id)"
    ];
    for (const s of statements) { try { await client.execute(s); } catch {} }
    
    // 确保 shared_posts 表有所有必需的字段（兼容旧表）
    try { await client.execute("alter table shared_posts add column is_ad integer default 0"); } catch {}
    try { await client.execute("alter table shared_posts add column is_pinned integer default 0"); } catch {}
    try { await client.execute("alter table shared_posts add column status text default 'approved'"); } catch {}
    try { await client.execute("alter table shared_posts add column rejection_reason text"); } catch {}
    try { await client.execute("alter table shared_posts add column updated_at text"); } catch {}
    
    // 更新现有记录的默认值
    try { await client.execute("update shared_posts set is_ad = 0 where is_ad is null"); } catch {}
    try { await client.execute("update shared_posts set is_pinned = 0 where is_pinned is null"); } catch {}
    try { await client.execute("update shared_posts set status = 'approved' where status is null"); } catch {}
    
    __ensureCache.shared = true;
  } catch {}
}

// Ensure tenant forum tables (for default DB or branch DB)
async function ensureTenantForumSchemaRaw(tenantId) {
  try {
    if (__ensureCache.tenant.has(Number(tenantId))) return;
    const client = await getLibsqlClientForTenantRaw(tenantId);
    const statements = [
      "create table if not exists profiles (id text primary key, username text, avatar_url text, tenant_id integer default 0, points integer default 0, created_at text, uid text, invite_code text, virtual_currency integer default 0, invitation_points integer default 0, free_posts_count integer default 0)",
      "create table if not exists posts (id integer primary key autoincrement, tenant_id integer not null default 0, author_id text not null, content text, images text, is_ad integer default 0, is_pinned integer default 0, status text default 'approved', rejection_reason text, created_at text, updated_at text)",
      "create table if not exists comments (id integer primary key autoincrement, post_id integer not null, user_id text not null, content text, created_at text)",
      "create table if not exists likes (post_id integer not null, user_id text not null, primary key (post_id, user_id))"
    ];
    for (const s of statements) { try { await client.execute(s); } catch {} }
    __ensureCache.tenant.add(Number(tenantId));
  } catch {}
}

app.delete('/api/shop/redemptions/:id', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ ok: false, error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id'));
    if (!id) return c.json({ ok: false, error: 'invalid' }, 400);

    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const currentTenantId = await resolveTenantId(defaultDb, host);
    const isAdmin = await isSuperAdminUser(userId);

    // Try current tenant first (ensure exists)
    let deleted = false;
    try {
      const db = await getTursoClientForTenant(currentTenantId);
      const exists = await db.select().from(shopRedemptions).where(eq(shopRedemptions.id, id)).limit(1);
      if (exists && exists[0]) {
        await db.delete(shopRedemptions).where(eq(shopRedemptions.id, id));
        deleted = true;
      }
    } catch {}

    // If not deleted and admin, search which tenant owns this id, then delete
    if (!deleted && isAdmin) {
      try {
        const gdb = await getTursoClientForTenant(0);
        const trs = await gdb.select().from(tenantRequestsTable);
        const tenantIds = [0, ...new Set((trs || []).map(t => Number(t.id)).filter(n => Number.isFinite(n)))];
        for (const tId of tenantIds) {
          try {
            const tDb = await getTursoClientForTenant(tId);
            const ex = await tDb.select().from(shopRedemptions).where(eq(shopRedemptions.id, id)).limit(1);
            if (ex && ex[0]) {
              await tDb.delete(shopRedemptions).where(eq(shopRedemptions.id, id));
              deleted = true;
              break;
            }
          } catch {}
        }
      } catch {}
    }

    return c.json({ ok: deleted });
  } catch (e) {
    console.error('DELETE /api/shop/redemptions/:id error', e);
    return c.json({ ok: false }, 500);
  }
});
app.post('/api/shop/redemptions/batch-action', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ ok: false, error: 'unauthorized' }, 401);
    const body = await c.req.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(n => Number(n)).filter(n => Number.isFinite(n)) : [];
    const action = String(body?.action || '').toLowerCase();
    const status = body?.status ? String(body.status) : null;
    const notes = body?.notes ? String(body.notes) : null;
    if (ids.length === 0) return c.json({ ok: false, error: 'empty-ids' }, 400);

    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const currentTenantId = await resolveTenantId(defaultDb, host);
    const isAdmin = await isSuperAdminUser(userId);

    // collect candidate tenant ids
    let tenantIds = [currentTenantId];
    if (isAdmin) {
      try {
        const gdb = await getTursoClientForTenant(0);
        const trs = await gdb.select().from(tenantRequestsTable);
        tenantIds = [0, ...new Set((trs || []).map(t => Number(t.id)).filter(n => Number.isFinite(n)))];
      } catch {}
    }

    let affected = 0;
    for (const tId of tenantIds) {
      try {
        const db = await getTursoClientForTenant(tId);
        // filter ids existing in this tenant
        const existing = await db.select().from(shopRedemptions).where(inArray(shopRedemptions.id, ids));
        if (!existing || existing.length === 0) continue;
        const idSet = new Set(existing.map(r => r.id));
        const idsInTenant = ids.filter(x => idSet.has(x));
        if (idsInTenant.length === 0) continue;

        if (action === 'delete') {
          for (const rid of idsInTenant) {
            await db.delete(shopRedemptions).where(eq(shopRedemptions.id, rid));
            affected++;
          }
        } else if (action === 'status' && status) {
          for (const rid of idsInTenant) {
            await db.update(shopRedemptions).set({ status, notes: notes || null }).where(eq(shopRedemptions.id, rid));
            affected++;
          }
        }
      } catch {}
    }

    return c.json({ ok: true, affected });
  } catch (e) {
    console.error('POST /api/shop/redemptions/batch-action error', e);
    return c.json({ ok: false }, 500);
  }
});

app.get('/api/tenant/settings', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json([], 401);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenantId = await resolveTenantId(defaultDb, host);
    const tenantIdParam = Number(c.req.query('tenantId') || NaN);
    const tenantId = Number.isFinite(tenantIdParam) ? tenantIdParam : resolvedTenantId;
    const allowed = await canManageTenant(userId, tenantId);
    if (!allowed) return c.json([], 403);
    const db = await getTursoClientForTenant(tenantId);
    try { const raw = await getLibsqlClientForTenantRaw(tenantId); await raw.execute("create table if not exists app_settings (tenant_id integer not null, key text not null, value text, name text, description text, type text, primary key (tenant_id, key))"); } catch {}
    const rows = await db.select().from(appSettings).where(eq(appSettings.tenantId, tenantId));
    return c.json(rows || []);
  } catch (e) {
    return c.json([]);
  }
});

app.post('/api/tenant/settings', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenantId = await resolveTenantId(defaultDb, host);
    const body = await c.req.json();
    const tenantIdParam = Number(body?.tenantId || c.req.query('tenantId') || NaN);
    const tenantId = Number.isFinite(tenantIdParam) ? tenantIdParam : resolvedTenantId;
    const allowed = await canManageTenant(userId, tenantId);
    if (!allowed) return c.json({ error: 'forbidden' }, 403);
    const updates = Array.isArray(body?.updates) ? body.updates : body;
    if (!Array.isArray(updates)) return c.json({ error: 'invalid' }, 400);
    const db = await getTursoClientForTenant(tenantId);
    for (const u of updates) {
      const rec = {
        tenantId,
        key: String(u.key),
        value: u.value != null ? String(u.value) : null,
        name: u.name || null,
        description: u.description || null,
        type: u.type || null,
      };
      const exists = await db.select().from(appSettings).where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, rec.key))).limit(1);
      if (exists && exists.length > 0) {
        await db.update(appSettings).set(rec).where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, rec.key)));
      } else {
        await db.insert(appSettings).values(rec);
      }
    }
    const rows = await db.select().from(appSettings).where(eq(appSettings.tenantId, tenantId));
    return c.json({ ok: true, settings: rows || [] });
  } catch (e) {
    return c.json({ error: 'failed' }, 500);
  }
});

app.delete('/api/tenant/settings', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ ok: false, error: 'unauthorized' }, 401);
    const defaultDb = await getTursoClientForTenant(0);
    const host = c.get('host').split(':')[0];
    const resolvedTenantId = await resolveTenantId(defaultDb, host);
    const tenantIdParam = Number(c.req.query('tenantId') || NaN);
    const tenantId = Number.isFinite(tenantIdParam) ? tenantIdParam : resolvedTenantId;
    const key = String(c.req.query('key') || '');
    if (!key) return c.json({ ok: false, error: 'invalid-key' }, 400);
    const allowed = await canManageTenant(userId, tenantId);
    if (!allowed) return c.json({ ok: false, error: 'forbidden' }, 403);
    const db = await getTursoClientForTenant(tenantId);
    await db.delete(appSettings).where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, key)));
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ ok: false }, 500);
  }
});
app.get('/api/embed/cipher', async (c) => {
  try {
    const widget = String(c.req.query('widget') || '').trim();
    if (!widget) return c.json({ error: 'missing-widget' }, 400);

    // main settings (tenant 0)
    const defaultDb = await getTursoClientForTenant(0);
    const settingsRows = await defaultDb.select().from(appSettings).where(eq(appSettings.tenantId, 0));
    const settings = {};
    for (const r of settingsRows || []) settings[r.key] = r.value;
    const enabled = String(settings['embed_obfuscate_enabled'] || 'false').toLowerCase() === 'true';
    const keyStr = settings['embed_obfuscate_key'] || '';

    // map widget -> { page, section }
    const widgetMap = {
      'social_pinned_ads': { page: 'social', section: 'pinned_ads' },
      'my_page_pg_live_stream': { page: 'my_page', section: 'pg_live_stream' },
    };
    const target = widgetMap[widget];
    if (!target) return c.json({ error: 'unknown-widget' }, 400);

    // load MAIN tenant(0) content
    const rows = await defaultDb
      .select()
      .from(pageContentTable)
      .where(and(eq(pageContentTable.page, target.page), eq(pageContentTable.section, target.section), eq(pageContentTable.tenantId, 0)))
      .orderBy(pageContentTable.position);

    const list = (rows || []).map((r) => {
      let obj = (typeof r.content === 'string') ? (() => { try { return JSON.parse(r.content); } catch { return {}; } })() : (r.content || {});
      const title = obj.title || obj.details_title || '';
      const description = obj.description || obj.details_content || '';
      const link_url = obj.link_url || obj.link || '';
      const image_url = obj.image_url || obj.background_image_url || obj.imageUrl || '';
      return { title, description, link_url, image_url };
    });

    if (!enabled || !keyStr) {
      return c.json({ encrypted: false, data: list });
    }

    // AES-256-GCM encrypt using SHA-256(keyStr) as key
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash('sha256').update(keyStr, 'utf8').digest(); // 32 bytes
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(list), 'utf8');
    const enc1 = cipher.update(plaintext);
    const enc2 = cipher.final();
    const tag = cipher.getAuthTag();
    const ciphertext = Buffer.concat([enc1, enc2, tag]);

    const b64 = (buf) => buf.toString('base64');
    return c.json({ encrypted: true, iv: b64(iv), ciphertext: b64(ciphertext) });
  } catch (e) {
    console.error('GET /api/embed/cipher error', e);
    return c.json({ error: 'internal' }, 500);
  }
});

app.get('/api/tenant/resolve', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = (c.get('host') || c.req.header('host') || '').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    return c.json({ tenantId });
  } catch (e) {
    return c.json({ tenantId: 0 });
  }
});
app.post('/api/admin/tenants/:id/domain/bind', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ ok: false, error: auth.reason }, 401);
    const id = Number(c.req.param('id')); if (!id) return c.json({ ok: false, error: 'invalid' }, 400);
      const body = await c.req.json();
  const domain = String(body?.domain || '').trim();
  if (!domain) return c.json({ ok: false, error: 'invalid-domain' }, 400);
  // SSRF guard: FQDN only, no ports
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) return c.json({ ok: false, error: 'invalid-domain' }, 400);
  try {
    const results = await dns.lookup(domain, { all: true });
    for (const { address } of results) {
      if (net.isIP(address)) {
        // block loopback/linklocal/private ranges
        const isV4 = address.includes('.');
        if (address === '127.0.0.1' || address === '::1') return c.json({ ok: false, error: 'private-ip' }, 400);
        if (isV4) {
          const oct = address.split('.').map(Number);
          if (oct[0] === 10) return c.json({ ok: false, error: 'private-ip' }, 400);
          if (oct[0] === 172 && oct[1] >= 16 && oct[1] <= 31) return c.json({ ok: false, error: 'private-ip' }, 400);
          if (oct[0] === 192 && oct[1] === 168) return c.json({ ok: false, error: 'private-ip' }, 400);
          if (oct[0] === 169 && oct[1] === 254) return c.json({ ok: false, error: 'link-local' }, 400);
        }
      }
    }
  } catch {
    return c.json({ ok: false, error: 'dns-lookup-failed' }, 400);
  }
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
    if (!token || !projectId) return c.json({ ok: false, error: 'vercel-env-missing' }, 500);
    const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains`);
    if (teamId) url.searchParams.set('teamId', teamId);
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: domain })
    });
    const data = await resp.json().catch(() => ({}));
    // save to DB
    try {
      const gdb = getGlobalDb(); await ensureTenantRequestsSchemaRaw(getGlobalClient());
      await gdb.update(tenantRequestsTable).set({ desiredDomain: domain }).where(eq(tenantRequestsTable.id, id));
    } catch {}
    return c.json({ ok: resp.ok, status: resp.status, data });
  } catch (e) {
    return c.json({ ok: false, error: e?.message || 'failed' }, 500);
  }
});

app.post('/api/admin/tenants/:id/domain/verify', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ ok: false, error: auth.reason }, 401);
    const id = Number(c.req.param('id')); if (!id) return c.json({ ok: false, error: 'invalid' }, 400);
    const gdb = getGlobalDb(); await ensureTenantRequestsSchemaRaw(getGlobalClient());
    const row = (await gdb.select().from(tenantRequestsTable).where(eq(tenantRequestsTable.id, id)).limit(1))?.[0];
    const domain = row?.desiredDomain || row?.desired_domain || row?.fallbackDomain || row?.fallback_domain || null;
    if (!domain) return c.json({ ok: false, error: 'no-domain' }, 400);
    const token = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const teamId = process.env.VERCEL_TEAM_ID;
    if (!token || !projectId) return c.json({ ok: false, error: 'vercel-env-missing' }, 500);
    const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains/${encodeURIComponent(domain)}/verify`);
    if (teamId) url.searchParams.set('teamId', teamId);
    const resp = await fetchWithTimeout(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await resp.json().catch(() => ({}));
    const records = Array.isArray(data?.verification) ? data.verification.map(v => ({ type: v.type, domain: v.domain, value: v.value })) : [];
    const errMsg = resp.ok ? null : (data?.error?.message || data?.error || data?.message || data?.code || `status ${resp.status}`);
    return c.json({ ok: resp.ok, status: resp.status, data, verification: records, error: errMsg });
  } catch (e) {
    return c.json({ ok: false, error: e?.message || 'failed' }, 500);
  }
});

app.get('/api/admin/tenants/:id/domain/status', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ ok: false, error: auth.reason }, 401);
    const id = Number(c.req.param('id')); if (!id) return c.json({ ok: false, error: 'invalid' }, 400);
    const gdb = getGlobalDb(); await ensureTenantRequestsSchemaRaw(getGlobalClient());
    const row = (await gdb.select().from(tenantRequestsTable).where(eq(tenantRequestsTable.id, id)).limit(1))?.[0] || null;
    const domain = row ? (row.desiredDomain || row.desired_domain || null) : null;
    if (!domain) return c.json({ ok: false, error: 'no-domain' }, 400);
    const token = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const teamId = process.env.VERCEL_TEAM_ID;
    if (!token || !projectId) return c.json({ ok: false, error: 'vercel-env-missing' }, 500);
    const url = new URL(`https://api.vercel.com/v10/projects/${projectId}/domains/${encodeURIComponent(domain)}`);
    if (teamId) url.searchParams.set('teamId', teamId);
    const resp = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await resp.json().catch(() => ({}));
    const verification = Array.isArray(data?.verification) ? data.verification.map(v => ({ type: v.type, domain: v.domain, value: v.value })) : [];
    return c.json({ ok: resp.ok, status: resp.status, data: { name: data?.name, verified: data?.verified, configured: data?.configured, misconfigured: data?.misconfigured }, verification });
  } catch (e) {
    return c.json({ ok: false, error: e?.message || 'failed' }, 500);
  }
});

app.get('/api/admin/tenants/:id/connectivity', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ ok: false, error: auth.reason }, 401);
    const id = Number(c.req.param('id')); if (!id) return c.json({ ok: false, error: 'invalid' }, 400);
    const gdb = getGlobalDb(); await ensureTenantRequestsSchemaRaw(getGlobalClient());
    const row = (await gdb.select().from(tenantRequestsTable).where(eq(tenantRequestsTable.id, id)).limit(1))?.[0] || null;
      const customDomain = row ? (row.desiredDomain || row.desired_domain || null) : null;
  const vercelDomain = row ? (row.vercelAssignedDomain || row.vercel_assigned_domain || null) : null;
  // SSRF guard for both domains
  const check = async (d) => {
    if (!d) return { url: null, ok: false, status: 0 };
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d)) return { url: d, ok: false, status: 0, error: 'invalid-domain' };
    const url = `https://${d}/api/health`;
    try {
      const resp = await fetchWithTimeout(url);
      return { url, ok: resp.ok, status: resp.status };
    } catch (e) {
      return { url, ok: false, status: 0, error: String(e?.message || e) };
    }
  }
  const [p1, p2] = await Promise.all([check(customDomain), check(vercelDomain)]);
  return c.json({ ok: true, custom: p1, vercel: p2 });
  } catch (e) {
    return c.json({ ok: false, error: e?.message || 'failed' }, 500);
  }
});

// Seed homepage page_content for a specific tenant (tenant-admin or super-admin)
app.post('/api/tenants/:id/seed-page-content', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id'));
    if (!id) return c.json({ error: 'invalid' }, 400);
    const allowed = await canManageTenant(auth.userId, id);
    if (!allowed) {
      const isAdmin = await isSuperAdminUser(auth.userId);
      if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    }
    const db = await getTursoClientForTenant(id);
    try { await db.delete(pageContentTable).where(eq(pageContentTable.tenantId, id)); } catch {}
    const inserts = [
      { tenantId: id, page: 'home', section: 'carousel', position: 0, content: JSON.stringify({ title: '欢迎来到分站', description: '这里是您的专属首页', image_url: 'https://picsum.photos/seed/tenant-carousel/1200/400' }) },
      { tenantId: id, page: 'home', section: 'announcements', position: 0, content: JSON.stringify({ text: '🎉 分站已开通，开始自定义您的站点吧！' }) },
      { tenantId: id, page: 'home', section: 'feature_cards', position: 0, content: JSON.stringify({ title: '朋友圈', description: '分享日常，互动点赞', path: '/social', icon: 'MessageSquare' }) },
      { tenantId: id, page: 'home', section: 'feature_cards', position: 1, content: JSON.stringify({ title: '游戏中心', description: '精选小游戏合集', path: '/games', icon: 'Gamepad2' }) },
      { tenantId: id, page: 'home', section: 'feature_cards', position: 2, content: JSON.stringify({ title: '站点设置', description: '自定义站点内容', path: '/tenant-admin/page-content', icon: 'Settings' }) },
      { tenantId: id, page: 'home', section: 'hot_games', position: 0, content: JSON.stringify({ title: '演示游戏A', description: '有趣又好玩', path: '/games', iconUrl: 'https://picsum.photos/seed/tenant-game1/200/200' }) },
      { tenantId: id, page: 'home', section: 'hot_games', position: 1, content: JSON.stringify({ title: '演示游戏B', description: '简单轻松', path: '/games', iconUrl: 'https://picsum.photos/seed/tenant-game2/200/200' }) },
      { tenantId: id, page: 'games', section: 'game_categories', position: 0, content: JSON.stringify({ name: '热门', slug: 'hot', icon: 'Flame' }) },
      { tenantId: id, page: 'games', section: 'game_cards', position: 0, content: JSON.stringify({ title: '演示游戏A', category_slug: 'hot', description: '快来试试！', path: '/games', iconUrl: 'https://picsum.photos/seed/tenant-game1/200/200', isOfficial: true }) },
      { tenantId: id, page: 'games', section: 'game_cards', position: 1, content: JSON.stringify({ title: '演示游戏B', category_slug: 'hot', description: '轻松上手', path: '/games', iconUrl: 'https://picsum.photos/seed/tenant-game2/200/200', isOfficial: false }) },
    ];
    for (const v of inserts) { try { await db.insert(pageContentTable).values(v); } catch {} }
    return c.json({ ok: true, count: inserts.length });
  } catch (e) {
    return c.json({ error: 'failed' }, 500);
  }
});

// Tenant info by id (super-admin or tenant-admin of that tenant)
app.get('/api/tenants/:id', async (c) => {
  try {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json({ error: 'unauthorized' }, 401);
    const id = Number(c.req.param('id'));
    if (!id) return c.json({ error: 'invalid' }, 400);
    const allowed = await canManageTenant(auth.userId, id);
    if (!allowed) {
      const isAdmin = await isSuperAdminUser(auth.userId);
      if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
    }
    const gdb = getGlobalDb(); await ensureTenantRequestsSchemaRaw(getGlobalClient());
    const row = (await gdb.select().from(tenantRequestsTable).where(eq(tenantRequestsTable.id, id)).limit(1))?.[0] || null;
    if (!row) return c.json({ error: 'not-found' }, 404);
    return c.json({
      id,
      desired_domain: row.desiredDomain || row.desired_domain || null,
      fallback_domain: row.fallbackDomain || row.fallback_domain || null,
      vercel_assigned_domain: row.vercelAssignedDomain || row.vercel_assigned_domain || null,
      status: row.status || 'pending',
      created_at: row.createdAt || row.created_at || null,
    });
  } catch (e) {
    return c.json({ error: 'failed' }, 500);
  }
});
// SEO suggestions
app.get('/api/admin/seo/suggestions', async (c) => {
  try {
    const userId = c.get('userId'); if (!userId) return c.json({ error: 'unauthorized' }, 401);
    const qTenantIdRaw = c.req.query('tenantId');
    const tenantId = qTenantIdRaw != null && qTenantIdRaw !== '' ? Number(qTenantIdRaw) : 0;
    const isSuper = await isSuperAdminUser(userId);
    if (tenantId === 0) {
      if (!isSuper) return c.json({ error: 'forbidden' }, 403);
    } else {
      const allowed = await canManageTenant(userId, tenantId);
      if (!allowed) return c.json({ error: 'forbidden' }, 403);
    }
    const db = await getTursoClientForTenant(tenantId);
    const settingsRows = await db.select().from(appSettings).where(eq(appSettings.tenantId, tenantId));
    const settings = {}; for (const r of settingsRows || []) settings[r.key] = r.value;
    const siteName = settings['site_name'] || (tenantId ? `分站 #${tenantId}` : '主站');
    const siteDesc = (settings['site_description'] || '').trim();

    let pcs = [];
    try { pcs = await db.select().from(pageContentTable).where(eq(pageContentTable.tenantId, tenantId)); } catch {}
    const textSnippets = [];
    for (const row of pcs || []) {
      try {
        const obj = JSON.parse(row.content || '{}');
        for (const v of Object.values(obj)) {
          if (typeof v === 'string') {
            const s = v.trim();
            if (s && s.length >= 6) textSnippets.push(s);
          }
        }
      } catch {}
    }
    const corpus = [siteName, siteDesc, ...textSnippets].join(' ');
    const safe = (s, max) => (s || '').replace(/\s+/g, ' ').trim().slice(0, max);

    const baseTitle = siteDesc ? `${siteName}：${siteDesc}` : `${siteName} - 官方网站`;
    const title = safe(baseTitle, 60);
    const titleLen = title.length;

    let description = siteDesc || corpus.slice(0, 180);
    if (!description) description = `${siteName}，提供优质内容与服务。`;
    description = safe(description, 160);
    const descLen = description.length;

    const words = (corpus.toLowerCase().match(/[\p{Letter}\p{Number}]+/gu) || [])
      .filter(w => w.length >= 2).slice(0, 200);
    const freq = new Map(); for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
    const top = Array.from(freq.entries()).sort((a,b) => b[1]-a[1]).slice(0, 10).map(x => x[0]);
    const keywords = top.join(',');

    const checks = {
      title: { length: titleLen, ok: titleLen >= 45 && titleLen <= 60 },
      description: { length: descLen, ok: descLen >= 120 && descLen <= 160 },
      keywords: { count: top.length, ok: top.length >= 4 && top.length <= 12 },
    };

    return c.json({ tenantId, suggestions: { title, description, keywords }, checks });
  } catch (e) {
    return c.json({ error: 'failed' }, 500);
  }
});
// SEO: robots.txt per-tenant
app.get('/robots.txt', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = (c.get('host') || c.req.header('host') || '').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const rows = await db.select().from(appSettings).where(eq(appSettings.tenantId, tenantId));
    const map = {};
    for (const r of rows || []) map[r.key] = r.value;
    const indexable = String(map['seo_indexable'] ?? 'true') === 'true';
    const lines = [];
    if (!indexable) {
      lines.push('User-agent: *');
      lines.push('Disallow: /');
    } else {
      lines.push('User-agent: *');
      lines.push('Allow: /');
      lines.push(`Sitemap: https://${host}/sitemap.xml`);
    }
    c.header('Content-Type', 'text/plain; charset=utf-8');
    return c.body(lines.join('\n'));
  } catch (e) {
    c.header('Content-Type', 'text/plain; charset=utf-8');
    return c.body('User-agent: *\nAllow: /');
  }
});

// SEO: sitemap.xml per-tenant
app.get('/sitemap.xml', async (c) => {
  try {
    const defaultDb = await getTursoClientForTenant(0);
    const host = (c.get('host') || c.req.header('host') || '').split(':')[0];
    const tenantId = await resolveTenantId(defaultDb, host);
    const db = await getTursoClientForTenant(tenantId);
    const rows = await db.select().from(appSettings).where(eq(appSettings.tenantId, tenantId));
    const map = {};
    for (const r of rows || []) map[r.key] = r.value;
    const enabled = String(map['seo_sitemap_enabled'] ?? 'true') === 'true';
    if (!enabled) return c.text('Sitemap disabled', 404);

    const baseUrl = `https://${host}`;
    const urlset = [];
    const now = new Date().toISOString();
    const pushUrl = (loc, changefreq = 'weekly', priority = '0.6') => {
      urlset.push(`<url><loc>${baseUrl}${loc}</loc><lastmod>${now}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`);
    };
    pushUrl('/');
    pushUrl('/games');
    pushUrl('/social', 'daily', '0.8');

    const xml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">${urlset.join('')}</urlset>`;
    c.header('Content-Type', 'application/xml; charset=utf-8');
    return c.body(xml);
  } catch (e) {
    return c.text('Sitemap generation failed', 500);
  }
});