# 項目安全與架構優化報告

> 生成時間：2025-10-01  
> 分析範圍：完整代碼庫  
> 嚴重程度：🔴 嚴重 | 🟡 中等 | 🟢 輕微

---

## 📋 目錄

1. [🔴 嚴重安全問題](#嚴重安全問題)
2. [🟡 中等安全問題](#中等安全問題)
3. [⚡ 性能優化建議](#性能優化建議)
4. [🏗️ 架構改進建議](#架構改進建議)
5. [📝 代碼質量建議](#代碼質量建議)
6. [✅ 優先修復清單](#優先修復清單)

---

## 🔴 嚴重安全問題

### 1. JWT Token 驗證降級攻擊風險

**位置**：`server/index.js:407-424`

**問題**：
```javascript
// 🔴 危險：在生產環境中允許不驗證簽名的 JWT decode
if (!userId && (process.env.NODE_ENV !== 'production' || 
    process.env.ALLOW_JWT_DECODE_FALLBACK === '1')) {
  const payload = decodeJwt(token);  // ❌ 不驗證簽名！
  userId = payload?.sub || null;
}
```

**風險等級**：🔴 嚴重

**影響**：
- 攻擊者可以偽造 JWT Token
- 繞過身份驗證
- 冒充任何用戶（包括管理員）

**修復建議**：
```javascript
// ✅ 移除生產環境的 fallback
if (!userId && process.env.NODE_ENV === 'development') {
  const payload = decodeJwt(token);
  userId = payload?.sub || null;
}

// 或者完全移除這個 fallback
// 只使用 JWKS 驗證
```

**修復優先級**：🔥 立即修復

---

### 2. 環境變量 ALLOW_JWT_DECODE_FALLBACK 安全風險

**問題**：
- 如果在生產環境設置 `ALLOW_JWT_DECODE_FALLBACK=1`
- 所有 JWT 驗證將降級為不安全的 decode
- 完全繞過簽名驗證

**修復建議**：
```javascript
// ✅ 只在開發環境允許
if (!userId && process.env.NODE_ENV === 'development') {
  // ... decode logic
}

// 移除環境變量檢查
```

---

### 3. Rate Limiting 使用內存存儲

**位置**：`server/index.js:97`

**問題**：
```javascript
const __rateStore = new Map();  // ❌ 內存存儲
```

**風險**：
- 服務器重啟後限流數據丟失
- 多實例部署時無法共享限流狀態
- 可以通過重啟繞過限流

**修復建議**：
```javascript
// ✅ 使用 Redis 或數據庫存儲
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

async function isRateLimited(key, limit, windowMs) {
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, Math.ceil(windowMs / 1000));
  }
  return current > limit;
}
```

---

### 4. 文件上傳缺少文件內容驗證

**位置**：`server/index.js:635-702`

**問題**：
```javascript
// ❌ 只檢查 MIME type，不驗證實際文件內容
if (!__isAllowedImage(f.type)) return c.json({ error: 'unsupported-type' }, 415);
```

**風險**：
- 攻擊者可以修改 MIME type 上傳惡意文件
- 可能上傳偽裝成圖片的惡意腳本

**修復建議**：
```javascript
// ✅ 使用 sharp 驗證文件真實性
async function validateImageFile(buffer, declaredType) {
  try {
    const metadata = await sharp(buffer).metadata();
    
    // 驗證實際格式與聲明一致
    const actualFormat = metadata.format;
    const declaredFormat = declaredType.split('/')[1];
    
    if (!['jpeg', 'png', 'webp', 'gif'].includes(actualFormat)) {
      throw new Error('Invalid image format');
    }
    
    // 檢查圖片尺寸（防止過大圖片）
    if (metadata.width > 4000 || metadata.height > 4000) {
      throw new Error('Image too large');
    }
    
    return true;
  } catch (e) {
    throw new Error('Invalid image file');
  }
}

// 使用
const buf = Buffer.from(await file.arrayBuffer());
await validateImageFile(buf, file.type);  // 驗證文件
```

---

### 5. SQL 注入風險（動態表名）

**位置**：多處使用字符串拼接執行 SQL

**問題**：
```javascript
// ⚠️ 雖然使用 Drizzle ORM，但在某些地方使用了原始 SQL
await client.execute("alter table profiles add column avatar_url text");
```

**當前狀態**：✅ 大部分使用 ORM（安全）  
**風險**：🟡 低（表名是硬編碼的）

**建議**：保持使用 ORM，避免原始 SQL

---

## 🟡 中等安全問題

### 6. CORS 配置過於寬鬆

**位置**：`server/index.js:54-64`

**問題**：
```javascript
origin: (origin) => {
  if (!origin) return true;  // ❌ 允許無 origin 的請求
  // ...
}
```

**風險**：
- 某些情況下可能被 CSRF 攻擊
- 建議對敏感操作添加額外驗證

**修復建議**：
```javascript
// ✅ 對敏感操作添加 CSRF Token
credentials: true,  // 啟用憑證
// 添加 CSRF 中間件
```

---

### 7. 沒有請求體大小限制

**問題**：
- 沒有全局請求體大小限制
- 可能導致 DoS 攻擊

**修復建議**：
```javascript
// ✅ 添加請求體大小限制
app.use('*', async (c, next) => {
  const contentLength = Number(c.req.header('content-length') || 0);
  const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
  
  if (contentLength > MAX_BODY_SIZE) {
    return c.json({ error: 'payload-too-large' }, 413);
  }
  
  await next();
});
```

---

### 8. 密碼策略缺失

**問題**：
- 沒有強制密碼複雜度要求
- 依賴 Supabase 默認設置

**建議**：
- 在 Supabase Dashboard 配置密碼策略
- 最小長度 8 字符
- 要求大小寫 + 數字

---

### 9. 缺少請求日誌和審計追蹤

**問題**：
- 沒有記錄敏感操作（刪除帖子、修改積分等）
- 無法追溯安全事件

**修復建議**：
```javascript
// ✅ 添加審計日誌
async function auditLog(userId, action, details) {
  await db.insert(auditLogs).values({
    userId,
    action,
    details: JSON.stringify(details),
    ipAddress: getClientIp(),
    userAgent: getUserAgent(),
    timestamp: new Date().toISOString(),
  });
}

// 使用示例
app.delete('/api/posts/:id', async (c) => {
  const userId = c.get('userId');
  const postId = c.req.param('id');
  
  await deletePost(postId);
  await auditLog(userId, 'DELETE_POST', { postId });  // 記錄操作
  
  return c.json({ success: true });
});
```

---

### 10. 舊的 AuthContext 未清理

**位置**：`src/contexts/AuthContext.jsx`

**問題**：
- 存在舊的 localStorage 認證邏輯
- 與新的 SupabaseAuthContext 可能衝突
- 安全性低（localStorage 可被 XSS 攻擊）

**修復建議**：
```bash
# ✅ 刪除舊文件
rm src/contexts/AuthContext.jsx

# 確保所有地方都使用 SupabaseAuthContext
```

---

## ⚡ 性能優化建議

### 11. server/index.js 文件過大（5600+ 行）

**問題**：
- 單文件過大，難以維護
- 所有路由和邏輯混在一起
- 降低代碼可讀性

**優化建議**：

**拆分為多個模塊**：
```
server/
├── index.js              # 主入口（100 行左右）
├── config/
│   ├── cors.js           # CORS 配置
│   ├── security.js       # 安全標頭配置
│   └── database.js       # 數據庫連接
├── middleware/
│   ├── auth.js           # JWT 驗證中間件
│   ├── rateLimit.js      # Rate Limiting
│   └── tenant.js         # 租戶解析
├── routes/
│   ├── auth.js           # 認證相關路由
│   ├── users.js          # 用戶相關路由
│   ├── posts.js          # 帖子相關路由
│   ├── comments.js       # 評論相關路由
│   ├── points.js         # 積分相關路由
│   ├── shop.js           # 商城相關路由
│   ├── admin.js          # 管理員相關路由
│   └── tenant.js         # 租戶相關路由
├── services/
│   ├── userService.js    # 用戶業務邏輯
│   ├── postService.js    # 帖子業務邏輯
│   └── pointsService.js  # 積分業務邏輯
└── utils/
    ├── validation.js     # 驗證工具
    └── helpers.js        # 通用工具
```

**示例重構**：
```javascript
// server/index.js (重構後)
import { Hono } from 'hono';
import { setupMiddleware } from './middleware/index.js';
import { setupRoutes } from './routes/index.js';

const app = new Hono();

// 應用中間件
setupMiddleware(app);

// 註冊路由
setupRoutes(app);

export default app;

// server/routes/posts.js
import { Hono } from 'hono';
export const postsRouter = new Hono();

postsRouter.get('/api/posts', async (c) => {
  // 帖子列表邏輯
});

postsRouter.post('/api/posts', async (c) => {
  // 創建帖子邏輯
});
```

**優先級**：🟡 中等（建議在 v2.0 進行）

---

### 12. 缺少數據庫查詢緩存

**問題**：
- 每次請求都查詢數據庫
- 高頻查詢（如站點設置）沒有緩存
- 增加數據庫負載

**優化建議**：
```javascript
// ✅ 使用 Redis 或內存緩存
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5分鐘

async function getCachedSettings(tenantId) {
  const cacheKey = `settings:${tenantId}`;
  
  // 嘗試從緩存獲取
  let settings = cache.get(cacheKey);
  if (settings) return settings;
  
  // 緩存未命中，從數據庫獲取
  settings = await db.select().from(appSettings)
    .where(eq(appSettings.tenantId, tenantId));
  
  // 存入緩存
  cache.set(cacheKey, settings);
  
  return settings;
}

// 更新設置時清除緩存
async function updateSettings(tenantId, updates) {
  await db.update(appSettings).set(updates)...;
  cache.del(`settings:${tenantId}`);  // 清除緩存
}
```

---

### 13. N+1 查詢問題

**位置**：帖子列表查詢

**問題**：
```javascript
// ❌ 可能存在 N+1 查詢
const posts = await db.select().from(postsTable)...;
for (const post of posts) {
  const author = await db.select().from(profiles)
    .where(eq(profiles.id, post.authorId));  // N 次查詢
}
```

**優化建議**：
```javascript
// ✅ 使用 JOIN 或批量查詢
const posts = await db.select({
  post: postsTable,
  author: profiles,
  likesCount: sql`COUNT(DISTINCT ${likesTable.userId})`,
  commentsCount: sql`COUNT(DISTINCT ${commentsTable.id})`,
})
.from(postsTable)
.leftJoin(profiles, eq(postsTable.authorId, profiles.id))
.leftJoin(likesTable, eq(postsTable.id, likesTable.postId))
.leftJoin(commentsTable, eq(postsTable.id, commentsTable.postId))
.groupBy(postsTable.id);
```

---

### 14. 圖片處理可能阻塞事件循環

**位置**：`server/index.js:676-681`

**問題**：
```javascript
// ❌ 同步處理可能很慢
outBuf = await sharp(buf).rotate().jpeg({ quality: 90 }).toBuffer();
```

**優化建議**：
```javascript
// ✅ 使用隊列處理大文件
import Queue from 'bull';
const imageQueue = new Queue('image-processing', process.env.REDIS_URL);

imageQueue.process(async (job) => {
  const { buffer, userId, filename } = job.data;
  const processed = await sharp(buffer).rotate().jpeg({ quality: 90 }).toBuffer();
  // 上傳到存儲...
  return { url: publicUrl };
});

// 上傳端點只是添加到隊列
app.post('/api/uploads/post-images', async (c) => {
  const job = await imageQueue.add({ buffer, userId, filename });
  return c.json({ jobId: job.id, status: 'processing' });
});
```

---

### 15. 缺少數據庫連接池管理

**問題**：
- 沒有看到明確的連接池配置
- 可能導致連接洩漏

**優化建議**：
```javascript
// ✅ 配置連接池
const tursoClient = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
  connectionPool: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000,
  }
});

// 使用後釋放連接
```

---

## 🏗️ 架構改進建議

### 16. 租戶隔離邏輯分散

**問題**：
- 租戶 ID 解析邏輯在多處重複
- 容易遺漏 `tenantId` 過濾導致數據洩漏

**優化建議**：

**創建租戶中間件**：
```javascript
// server/middleware/tenant.js
export const tenantMiddleware = async (c, next) => {
  const host = c.get('host').split(':')[0];
  const defaultDb = await getTursoClientForTenant(0);
  const tenantId = await resolveTenantId(defaultDb, host);
  
  c.set('tenantId', tenantId);
  c.set('tenantDb', await getTursoClientForTenant(tenantId));
  
  await next();
};

// 使用
app.use('/api/*', tenantMiddleware);

// 路由中直接使用
app.get('/api/posts', async (c) => {
  const tenantId = c.get('tenantId');  // 統一獲取
  const db = c.get('tenantDb');
  // ...
});
```

**創建租戶隔離查詢助手**：
```javascript
// server/utils/tenantQuery.js
export class TenantQuery {
  constructor(db, tenantId) {
    this.db = db;
    this.tenantId = tenantId;
  }
  
  // 自動添加 tenantId 過濾
  select(table) {
    return this.db.select()
      .from(table)
      .where(eq(table.tenantId, this.tenantId));
  }
  
  insert(table, values) {
    return this.db.insert(table).values({
      ...values,
      tenantId: this.tenantId,  // 自動添加
    });
  }
}

// 使用
const tq = new TenantQuery(db, tenantId);
const posts = await tq.select(postsTable).limit(10);
```

---

### 17. 錯誤處理不統一

**問題**：
- 有些返回 `{ error: '...' }`
- 有些返回 `{ ok: false }`
- 錯誤格式不一致

**優化建議**：
```javascript
// ✅ 統一錯誤響應格式
class APIError extends Error {
  constructor(message, code = 500, details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// 全局錯誤處理中間件
app.onError((err, c) => {
  if (err instanceof APIError) {
    return c.json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
        details: err.details,
      }
    }, err.code);
  }
  
  // 生產環境隱藏詳細錯誤
  const message = process.env.NODE_ENV === 'production' 
    ? '服務器錯誤' 
    : err.message;
  
  return c.json({
    success: false,
    error: { message }
  }, 500);
});

// 使用
if (!userId) {
  throw new APIError('未授權', 401);
}
```

---

### 18. 缺少健康檢查和監控

**問題**：
- `/health` 端點過於簡單
- 沒有檢查數據庫連接
- 沒有檢查依賴服務

**優化建議**：
```javascript
// ✅ 完善的健康檢查
app.get('/health', async (c) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: 'unknown',
      supabase: 'unknown',
      turso: 'unknown',
    }
  };
  
  // 檢查數據庫連接
  try {
    await db.select().from(profiles).limit(1);
    health.checks.database = 'healthy';
  } catch (e) {
    health.checks.database = 'unhealthy';
    health.status = 'degraded';
  }
  
  // 檢查 Supabase
  try {
    const { data } = await supabase.from('profiles').select('id').limit(1);
    health.checks.supabase = 'healthy';
  } catch (e) {
    health.checks.supabase = 'unhealthy';
    health.status = 'degraded';
  }
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  return c.json(health, statusCode);
});
```

---

### 19. 前端環境變量可能洩漏

**位置**：`vite.config.js:250-263`

**問題**：
```javascript
define: {
  'import.meta.env.SUPABASE_SERVICE_ROLE_KEY': JSON.stringify(...),  // 🔴 危險！
  'import.meta.env.TURSO_AUTH_TOKEN': JSON.stringify(...),           // 🔴 危險！
}
```

**風險**：
- 敏感密鑰可能被編譯到前端代碼
- 任何人都可以在瀏覽器中看到

**修復建議**：
```javascript
// ✅ 只注入公開變量
define: {
  'import.meta.env.NEXT_PUBLIC_ROOT_DOMAIN': JSON.stringify(process.env.NEXT_PUBLIC_ROOT_DOMAIN),
  'import.meta.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL),
  // ❌ 移除所有私鑰
  // 'import.meta.env.SUPABASE_SERVICE_ROLE_KEY': ...,  // 危險！
  // 'import.meta.env.TURSO_AUTH_TOKEN': ...,           // 危險！
}
```

**驗證**：
```bash
# 檢查構建後的代碼
npm run build
grep -r "SUPABASE_SERVICE_ROLE_KEY" dist/  # 應該沒有結果
```

---

### 20. 缺少 API 響應緩存

**問題**：
- 公開端點（如 `/api/posts`）每次都查詢數據庫
- 相同請求重複處理

**優化建議**：
```javascript
// ✅ 使用 HTTP 緩存標頭
app.get('/api/posts', async (c) => {
  // 設置緩存標頭
  c.header('Cache-Control', 'public, max-age=60');  // 1分鐘
  c.header('ETag', generateETag(data));
  
  // 檢查 If-None-Match
  if (c.req.header('if-none-match') === etag) {
    return c.body(null, 304);  // Not Modified
  }
  
  const posts = await db.select()...;
  return c.json(posts);
});
```

---

### 21. 前端狀態管理可以優化

**問題**：
- TanStack Query 配置可以更精細
- 某些查詢可以合併

**優化建議**：
```javascript
// ✅ 優化查詢配置
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 30,  // 增加緩存時間
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,  // 避免不必要的重新獲取
      retry: 1,  // 減少重試次數
    },
  },
});

// 合併相關查詢
const { data } = useQuery({
  queryKey: ['userDashboard', userId],
  queryFn: async () => {
    // 一次請求獲取多個數據
    const [profile, posts, points] = await Promise.all([
      fetchProfile(userId),
      fetchUserPosts(userId),
      fetchPointsHistory(userId),
    ]);
    return { profile, posts, points };
  },
});
```

---

### 22. 圖片未使用 CDN

**問題**：
- 圖片直接從 Supabase Storage 提供
- 沒有 CDN 加速

**優化建議**：
```javascript
// ✅ 配置 Cloudflare 或其他 CDN
// 在 Supabase Dashboard → Storage → Settings
// 啟用 CDN

// 或使用 Vercel Image Optimization
import Image from 'next/image';

<Image 
  src={avatarUrl}
  width={100}
  height={100}
  alt="avatar"
/>
```

---

## 📝 代碼質量建議

### 23. 缺少 TypeScript

**問題**：
- 使用 JavaScript，缺少類型安全
- 容易出現類型相關的 bug

**建議**：
```typescript
// ✅ 遷移到 TypeScript
// 1. 重命名 .js 為 .ts, .jsx 為 .tsx
// 2. 添加類型定義

interface User {
  id: string;
  username: string;
  avatarUrl?: string;
  points: number;
}

interface Post {
  id: number;
  content: string;
  authorId: string;
  createdAt: string;
}

// API 響應類型
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

**優先級**：🟢 低（長期改進）

---

### 24. 缺少單元測試

**問題**：
- 沒有測試覆蓋
- 重構時容易引入 bug

**建議**：
```javascript
// ✅ 添加測試框架
// package.json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0"
  },
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui"
  }
}

// tests/auth.test.js
import { describe, it, expect } from 'vitest';
import { verifyToken } from '../server/auth.js';

describe('Authentication', () => {
  it('should verify valid JWT token', async () => {
    const result = await verifyToken('valid-token');
    expect(result.valid).toBe(true);
  });
  
  it('should reject invalid JWT token', async () => {
    const result = await verifyToken('invalid-token');
    expect(result.valid).toBe(false);
  });
});
```

---

### 25. 環境變量管理混亂

**問題**：
- 使用 `NEXT_PUBLIC_*` 和 `VITE_*` 混合
- 不同環境變量名稱不一致

**優化建議**：
```javascript
// ✅ 統一環境變量命名
// .env.example
# 前端公開變量（使用 VITE_ 前綴）
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=

# 後端私有變量（無前綴）
SUPABASE_SERVICE_ROLE_KEY=
TURSO_AUTH_TOKEN=
DATABASE_URL=

// server/config/env.js
export const config = {
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  turso: {
    url: process.env.TURSO_DATABASE_URL,
    token: process.env.TURSO_AUTH_TOKEN,
  },
};

// 驗證必需的環境變量
const required = ['SUPABASE_URL', 'TURSO_DATABASE_URL'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}
```

---

### 26. localStorage 使用需要加密

**位置**：`src/contexts/AuthContext.jsx:18`

**問題**：
```javascript
// ❌ 直接存儲敏感數據
localStorage.setItem('socialapp_user', JSON.stringify(userData));
```

**風險**：
- XSS 攻擊可以讀取
- 數據未加密

**建議**：
```javascript
// ✅ 方案 1：不在 localStorage 存儲敏感數據
// 只存儲 session ID，服務器端存儲數據

// ✅ 方案 2：加密存儲
import CryptoJS from 'crypto-js';

function setSecureItem(key, value) {
  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(value),
    SECRET_KEY
  ).toString();
  localStorage.setItem(key, encrypted);
}

function getSecureItem(key) {
  const encrypted = localStorage.getItem(key);
  if (!encrypted) return null;
  const decrypted = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
  return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
}
```

---

### 27. 缺少輸入驗證庫

**問題**：
- 手動驗證輸入，容易遺漏
- 沒有統一的驗證邏輯

**建議**：
```javascript
// ✅ 使用 Zod 驗證
import { z } from 'zod';

// 定義 Schema
const createPostSchema = z.object({
  content: z.string().min(1).max(5000),
  images: z.array(z.string().url()).max(9),
  scope: z.enum(['tenant', 'shared']).optional(),
});

// 使用
app.post('/api/posts', async (c) => {
  const body = await c.req.json();
  
  try {
    const validated = createPostSchema.parse(body);
    // 使用驗證後的數據
  } catch (e) {
    return c.json({ 
      error: 'validation-failed', 
      details: e.errors 
    }, 400);
  }
});
```

---

## 🔐 其他安全建議

### 28. 添加內容安全策略（CSP）

**當前**：
```javascript
c.header('Content-Security-Policy', [
  `default-src 'self'`,
  `script-src 'self' https://cloud.umami.is`,
  `style-src 'self' 'unsafe-inline'`,  // ⚠️ unsafe-inline
  // ...
]);
```

**優化建議**：
```javascript
// ✅ 移除 unsafe-inline，使用 nonce
const nonce = crypto.randomBytes(16).toString('base64');

c.header('Content-Security-Policy', [
  `default-src 'self'`,
  `script-src 'self' 'nonce-${nonce}' https://cloud.umami.is`,
  `style-src 'self' 'nonce-${nonce}'`,  // 移除 unsafe-inline
  `img-src 'self' data: https: blob:`,
  `connect-src 'self' https:`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
]);

// 在模板中使用 nonce
<script nonce="${nonce}">...</script>
```

---

### 29. 添加 SQL 查詢超時

**建議**：
```javascript
// ✅ 設置查詢超時
const db = drizzle(client, {
  logger: true,
  queryTimeout: 5000,  // 5 秒超時
});

// 或在查詢時設置
const posts = await Promise.race([
  db.select().from(postsTable).limit(10),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Query timeout')), 5000)
  )
]);
```

---

### 30. 添加防暴力破解機制

**建議**：
```javascript
// ✅ 登入嘗試限制
const loginAttempts = new Map();

app.post('/api/auth/login', async (c) => {
  const { email } = await c.req.json();
  const key = `login:${email}`;
  
  // 檢查嘗試次數
  const attempts = loginAttempts.get(key) || 0;
  if (attempts >= 5) {
    return c.json({ 
      error: '登入嘗試過多，請 15 分鐘後重試' 
    }, 429);
  }
  
  // 登入邏輯...
  if (loginFailed) {
    loginAttempts.set(key, attempts + 1);
    setTimeout(() => loginAttempts.delete(key), 15 * 60 * 1000);
  } else {
    loginAttempts.delete(key);
  }
});
```

---

## ✅ 優先修復清單

### 🔥 立即修復（高危）

1. **移除 JWT decode fallback**（嚴重安全漏洞）
   - 位置：`server/index.js:407-424`
   - 風險：允許偽造 Token
   - 修復時間：5 分鐘

2. **檢查前端環境變量洩漏**
   - 位置：`vite.config.js:250-263`
   - 風險：私鑰暴露
   - 修復時間：10 分鐘

3. **添加文件內容驗證**
   - 位置：`server/index.js:635-702`
   - 風險：惡意文件上傳
   - 修復時間：20 分鐘

### 🟡 本週修復（中危）

4. **移除舊的 AuthContext**
   - 位置：`src/contexts/AuthContext.jsx`
   - 風險：衝突和安全問題
   - 修復時間：5 分鐘

5. **升級 Rate Limiting 到 Redis**
   - 位置：`server/index.js:97`
   - 風險：限流可被繞過
   - 修復時間：1 小時

6. **添加請求體大小限制**
   - 位置：全局中間件
   - 風險：DoS 攻擊
   - 修復時間：10 分鐘

7. **統一錯誤處理**
   - 位置：全局
   - 風險：信息洩漏
   - 修復時間：30 分鐘

### 🟢 本月優化（性能）

8. **拆分 server/index.js**
   - 優化：可維護性
   - 修復時間：4-8 小時

9. **添加數據庫查詢緩存**
   - 優化：性能
   - 修復時間：2 小時

10. **優化 N+1 查詢**
    - 優化：性能
    - 修復時間：1 小時

11. **添加單元測試**
    - 優化：代碼質量
    - 修復時間：持續進行

---

## 📊 整體評估

| 類別 | 評分 | 說明 |
|------|------|------|
| **安全性** | 65/100 | 有嚴重漏洞需要修復 |
| **性能** | 70/100 | 基礎性能良好，有優化空間 |
| **架構** | 60/100 | 功能完整但需要重構 |
| **代碼質量** | 65/100 | 缺少測試和類型安全 |
| **可維護性** | 55/100 | 文件過大，需要拆分 |
| **整體評分** | **63/100** | 良好，但需要改進 |

---

## 🎯 改進路線圖

### Phase 1: 緊急安全修復（本週）
- [ ] 移除 JWT decode fallback
- [ ] 檢查並修復環境變量洩漏
- [ ] 添加文件內容驗證
- [ ] 移除舊的 AuthContext
- [ ] 添加請求體大小限制

### Phase 2: 安全加固（本月）
- [ ] 升級 Rate Limiting 到 Redis
- [ ] 添加審計日誌
- [ ] 統一錯誤處理
- [ ] 完善健康檢查
- [ ] 添加防暴力破解

### Phase 3: 性能優化（下月）
- [ ] 拆分 server/index.js
- [ ] 添加查詢緩存
- [ ] 優化 N+1 查詢
- [ ] 配置 CDN
- [ ] 圖片懶加載

### Phase 4: 長期改進（季度）
- [ ] 遷移到 TypeScript
- [ ] 添加完整測試覆蓋
- [ ] 實施 CI/CD 自動化測試
- [ ] 性能監控和告警
- [ ] 代碼質量檢查工具

---

## 💡 最佳實踐建議

### 開發流程
1. ✅ 每次修改都運行測試
2. ✅ 使用 ESLint 和 Prettier
3. ✅ Code Review 必須包含安全檢查
4. ✅ 定期進行安全審計
5. ✅ 監控生產環境錯誤

### 部署流程
1. ✅ 使用環境變量管理敏感信息
2. ✅ 自動化部署前運行測試
3. ✅ 生產環境啟用所有安全標頭
4. ✅ 定期備份數據庫
5. ✅ 監控服務器資源使用

### 安全檢查清單
- [ ] 所有用戶輸入都經過驗證
- [ ] 所有 API 端點都有權限檢查
- [ ] 所有文件上傳都經過驗證
- [ ] 所有數據庫查詢都使用 ORM
- [ ] 所有敏感操作都有審計日誌
- [ ] 所有錯誤都被適當處理
- [ ] 所有環境變量都不暴露到前端

---

## 📞 需要立即關注的問題

### 🚨 嚴重級別（24小時內修復）

1. **JWT decode fallback** - 允許偽造 Token
2. **環境變量洩漏檢查** - 可能暴露密鑰

### ⚠️ 高級別（本週內修復）

3. **文件上傳驗證** - 防止惡意文件
4. **Rate Limiting 升級** - 防止濫用
5. **移除舊代碼** - AuthContext 衝突

### 📝 中級別（本月內優化）

6. **代碼拆分** - 提高可維護性
7. **查詢緩存** - 提升性能
8. **錯誤處理** - 統一格式

---

## 🎉 已做得好的地方

項目也有很多優秀的地方：

✅ 使用 Drizzle ORM（防 SQL 注入）  
✅ HTTPS 強制（Vercel/Render 自動）  
✅ CORS 白名單配置  
✅ Secure Headers 中間件  
✅ JWT JWKS 驗證（主要流程）  
✅ 文件大小限制  
✅ 圖片壓縮處理  
✅ 多租戶數據隔離  
✅ 完善的文檔  
✅ 自動部署流程  

---

## 📚 參考資源

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Hono Best Practices](https://hono.dev/docs/guides/best-practices)
- [React Security](https://react.dev/learn/keeping-components-pure#side-effects-unintended-consequences)

---

**生成時間**: 2025-10-01  
**建議優先處理**: 🔥 JWT 安全問題和環境變量檢查

