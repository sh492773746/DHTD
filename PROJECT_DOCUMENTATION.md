# 多租戶社交平台 - 項目技術文檔

> 最後更新時間：2025-09-30  
> 文檔版本：v1.0.0

---

## 📋 目錄

- [項目概述](#項目概述)
- [技術棧](#技術棧)
- [系統架構](#系統架構)
- [環境變量配置](#環境變量配置)
- [API 文檔](#api-文檔)
- [數據庫設計](#數據庫設計)
- [安全性](#安全性)
- [部署流程](#部署流程)
- [開發指南](#開發指南)

---

## 項目概述

### 簡介
這是一個基於多租戶架構的社交平台，支持：
- 🏢 多租戶隔離 (Multi-tenancy)
- 👥 用戶社交互動 (發帖、評論、點讚)
- 🎮 遊戲中心 (預測遊戲)
- 💰 積分系統與商城
- 📧 邀請系統
- 🎨 可自定義的站點設置
- 🔐 基於 JWT 的認證系統

### 部署架構
```
GitHub (代碼倉庫)
    ↓ (自動部署)
    ├─→ Vercel (前端 SPA)
    └─→ Render (後端 BFF)
         ↓
    ├─→ Supabase (用戶認證)
    └─→ Turso (業務數據 - 多租戶分支)
```

### 訪問地址
- **前端**: https://dhtd.vercel.app, https://tv28.cc
- **後端 API**: https://dhtd.onrender.com

---

## 技術棧

### 前端技術

#### 核心框架
| 技術 | 版本 | 用途 |
|------|------|------|
| React | 18.3.1 | 前端框架 |
| Vite | 5.4.20 | 構建工具 |
| React Router | 6.16.0 | 路由管理 |

#### 狀態管理
| 技術 | 版本 | 用途 |
|------|------|------|
| TanStack Query | 5.45.1 | 數據獲取與緩存 |
| React Context | - | 全局狀態 (Auth, Tenant, Theme) |

#### UI 框架與工具
| 技術 | 版本 | 用途 |
|------|------|------|
| Tailwind CSS | 3.3.3 | CSS 框架 |
| Radix UI | - | 無障礙組件庫 |
| shadcn/ui | - | UI 組件集合 |
| Framer Motion | 10.16.4 | 動畫庫 |
| Lucide React | 0.292.0 | 圖標庫 |

#### 功能庫
| 技術 | 版本 | 用途 |
|------|------|------|
| @supabase/supabase-js | 2.30.0 | Supabase 客戶端 |
| react-helmet-async | 2.0.5 | SEO 管理 |
| react-dropzone | 14.2.3 | 文件上傳 |
| chart.js | 4.4.3 | 圖表可視化 |
| date-fns | 3.6.0 | 日期處理 |

#### 分析工具
| 技術 | 版本 | 用途 |
|------|------|------|
| @vercel/analytics | 1.5.0 | Vercel 分析 |
| @vercel/speed-insights | 1.2.0 | 性能監控 |

### 後端技術

#### 核心框架
| 技術 | 版本 | 用途 |
|------|------|------|
| Node.js | - | 運行時環境 |
| Hono | 4.9.8 | Web 框架 |
| @hono/node-server | 1.19.3 | Node 服務器適配器 |

#### 數據庫
| 技術 | 版本 | 用途 |
|------|------|------|
| Drizzle ORM | 0.44.5 | 數據庫 ORM |
| @libsql/client | 0.15.15 | Turso 客戶端 |
| PostgreSQL | - | Supabase 數據庫 |
| SQLite | - | Turso 數據庫 |

#### 認證與安全
| 技術 | 版本 | 用途 |
|------|------|------|
| jose | 6.1.0 | JWT/JWKS 處理 |
| crypto-js | 4.2.0 | 加密工具 |

#### 圖片處理
| 技術 | 版本 | 用途 |
|------|------|------|
| sharp | 0.34.4 | 圖片壓縮與處理 |

---

## 系統架構

### 整體架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                         用戶瀏覽器                           │
│  (React SPA + TanStack Query + Context API)                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                    Vercel (前端托管)                         │
│  - 靜態資源 (HTML, CSS, JS)                                 │
│  - API 代理 (/api/* → Render)                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ API Rewrites
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                Render (後端 BFF 服務)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Hono App                                           │   │
│  │  - JWT 驗證                                          │   │
│  │  - Rate Limiting                                    │   │
│  │  - CORS 控制                                        │   │
│  │  - API 路由處理                                      │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────┬───────────────────────┘
               │                      │
               ↓                      ↓
┌──────────────────────┐   ┌──────────────────────┐
│   Supabase           │   │   Turso (SQLite)     │
│   (PostgreSQL)       │   │   多租戶分支架構      │
│   - 用戶認證         │   │   - 業務數據         │
│   - JWT 簽發         │   │   - 按租戶隔離       │
└──────────────────────┘   └──────────────────────┘
```

### 多租戶架構

#### 租戶識別流程
```javascript
// 1. 用戶訪問域名 (例如: tenant1.example.com)
window.location.hostname

// 2. 前端發起租戶解析請求
GET /api/tenant/resolve
Headers: { 'X-Horizons-Resolve-Host': 'tenant1.example.com' }

// 3. 後端查詢 branches 表
SELECT tenant_id FROM branches WHERE custom_domain = 'tenant1.example.com'

// 4. 返回租戶 ID
{ "tenantId": 1 }

// 5. TenantContext 存儲並全局使用
activeTenantId = 1
```

#### 數據隔離策略
- **方案**: 共享數據庫 + `tenant_id` 字段隔離
- **優點**: 資源共享、成本低、管理簡單
- **實現**: 所有查詢自動添加 `WHERE tenant_id = ?` 條件

#### Turso 分支架構
```
主數據庫 (demo1)
├── 分支 1 (tenant_1_branch) → tenant_id = 1
├── 分支 2 (tenant_2_branch) → tenant_id = 2
└── 分支 N (tenant_N_branch) → tenant_id = N
```

### Context 層級結構

```jsx
<QueryClientProvider>           // TanStack Query 狀態管理
  <BrowserRouter>               // 路由
    <HelmetProvider>            // SEO 管理
      <ThemeProvider>           // 主題 (light/dark)
        <TenantProvider>        // 租戶上下文
          <AuthProvider>        // 認證上下文
            <App />             // 主應用
          </AuthProvider>
        </TenantProvider>
      </ThemeProvider>
    </HelmetProvider>
  </BrowserRouter>
</QueryClientProvider>
```

### 路由架構

```
/ (Root)
├── /auth                      // 認證頁面
│   ├── /auth/callback         // OAuth 回調
│   └── /invite/:code          // 邀請鏈接
│
├── / (MainLayout)             // 主布局 + 底部導航
│   ├── /                      // 首頁 (Dashboard)
│   ├── /social                // 社交動態
│   ├── /games                 // 遊戲中心
│   ├── /games/prediction-28   // 預測遊戲 (需登入)
│   ├── /profile               // 個人主頁 (需登入)
│   ├── /profile/:userId       // 其他用戶主頁
│   ├── /profile/edit          // 編輯資料 (需登入)
│   ├── /points-center         // 積分中心 (需登入)
│   ├── /points-history        // 積分歷史 (需登入)
│   ├── /notifications         // 通知 (需登入)
│   └── /tenant/:id/home       // 租戶首頁
│
├── /admin (AdminRoute)        // 超級管理員後台
│   ├── /admin                 // 管理員儀表板
│   ├── /admin/users           // 用戶管理
│   ├── /admin/content         // 內容審核
│   ├── /admin/site-settings   // 站點設置
│   ├── /admin/page-content    // 頁面內容管理
│   ├── /admin/notifications   // 通知管理
│   ├── /admin/invitations     // 邀請分析
│   ├── /admin/saas            // SaaS 租戶管理
│   ├── /admin/databases       // 數據庫管理
│   ├── /admin/shop            // 商城管理
│   └── /admin/seo             // SEO 設置
│
└── /tenant-admin (TenantAdminRoute)  // 租戶管理員後台
    ├── /tenant-admin          // 租戶儀表板
    ├── /tenant-admin/page-content
    ├── /tenant-admin/site-settings
    └── /tenant-admin/seo
```

---

## 環境變量配置

### 前端環境變量 (Vercel)

> **注意**: Vite 使用 `import.meta.env.*` 訪問環境變量

```bash
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://uurhxgavwfxykerrjrjj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# 域名配置
NEXT_PUBLIC_ROOT_DOMAIN=dhtd.onrender.com
ROOT_DOMAIN=dhtd.vercel.app

# Turso 配置 (前端可選，主要用於後端)
TURSO_DATABASE_URL=libsql://demo1-sh492773746.aws-ap-northeast-1.turso.io
TURSO_PRIMARY_URL=libsql://demo1-sh492773746.aws-ap-northeast-1.turso.io
TURSO_NEAREST_URL=libsql://demo1-sh492773746.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=<your-turso-auth-token>
TURSO_DB_NAME=demo1
TURSO_API_TOKEN=<your-turso-api-token>
TURSO_TENANT_REGION=aws-ap-northeast-1
TURSO_ORG=sh492773746

# Vercel 部署配置 (用於動態域名管理)
VERCEL_TOKEN=<your-vercel-token>
VERCEL_PROJECT_ID=prj_rv27jPW6BE2q4RIIJsxLXheqk8Tg
VERCEL_TEAM_ID=team_W92eV91OcxZ6wG4t1bmN0zD8

# Umami 分析 (可選)
UMAMI_BASE_URL=https://cloud.umami.is
UMAMI_WEBSITE_ID=02352487-f601-4503-99a0-1e9c1d2fe213
UMAMI_API_KEY=<your-umami-api-key>
```

### 後端環境變量 (Render)

```bash
# Node 環境
NODE_ENV=production

# 域名與 CORS
NEXT_PUBLIC_ROOT_DOMAIN=dhtd.onrender.com
ROOT_DOMAIN=dhtd.vercel.app
ALLOWED_ORIGINS=https://dhtd.vercel.app,https://tv28.cc

# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://uurhxgavwfxykerrjrjj.supabase.co
SUPABASE_URL=https://uurhxgavwfxykerrjrjj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWKS_URL=https://uurhxgavwfxykerrjrjj.supabase.co/auth/v1/keys?apikey=<service-role-key>

# PostgreSQL (Supabase)
DATABASE_URL=postgresql://postgres.uurhxgavwfxykerrjrjj:Ac69228576..@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require

# Turso 配置
TURSO_DATABASE_URL=libsql://demo1-sh492773746.aws-ap-northeast-1.turso.io
TURSO_PRIMARY_URL=libsql://demo1-sh492773746.aws-ap-northeast-1.turso.io
TURSO_NEAREST_URL=libsql://demo1-sh492773746.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
TURSO_DB_NAME=demo1
TURSO_API_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
TURSO_TENANT_REGION=aws-ap-northeast-1
TURSO_ORG=sh492773746

# 上傳配置
UPLOAD_TMP_DIR=tmp_uploads

# 網路配置
FETCH_RETRIES=3
FETCH_TIMEOUT_MS=5000
MAX_JSON_BYTES=262144

# 調試
ENABLE_AUTH_DEBUG=1

# Vercel API
VERCEL_TOKEN=<your-vercel-token>
VERCEL_PROJECT_ID=prj_rv27jPW6BE2q4RIIJsxLXheqk8Tg
VERCEL_TEAM_ID=team_W92eV91OcxZ6wG4t1bmN0zD8

# Umami Analytics
UMAMI_BASE_URL=https://cloud.umami.is
UMAMI_WEBSITE_ID=02352487-f601-4503-99a0-1e9c1d2fe213
UMAMI_API_KEY=<your-umami-api-key>
```

### 本地開發環境變量

創建 `.env.local` 文件：

```bash
# Supabase
VITE_SUPABASE_URL=https://uurhxgavwfxykerrjrjj.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>

# 本地開發域名
VITE_ROOT_DOMAIN=localhost

# Turso (如需本地測試)
VITE_TURSO_DATABASE_URL=libsql://demo1-sh492773746.aws-ap-northeast-1.turso.io
VITE_TURSO_AUTH_TOKEN=<your-auth-token>
```

### 環境變量說明

| 變量名 | 用途 | 必填 | 示例 |
|--------|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 項目 URL | ✅ | https://xxx.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服務端密鑰 | ✅ | eyJhbGci... |
| `TURSO_DATABASE_URL` | Turso 數據庫 URL | ✅ | libsql://... |
| `TURSO_AUTH_TOKEN` | Turso 認證 Token | ✅ | eyJhbGci... |
| `ALLOWED_ORIGINS` | CORS 白名單 | ✅ | https://app1.com,https://app2.com |
| `VERCEL_TOKEN` | Vercel API Token | ❌ | 用於動態域名管理 |
| `UMAMI_API_KEY` | Umami 分析 API | ❌ | 用於數據分析 |

---

## API 文檔

### 基礎信息

- **Base URL**: `https://dhtd.onrender.com/api`
- **認證方式**: Bearer Token (JWT)
- **請求格式**: `application/json`
- **響應格式**: `application/json`

### 通用響應格式

#### 成功響應
```json
{
  "success": true,
  "data": { ... }
}
```

#### 錯誤響應
```json
{
  "error": "錯誤信息描述"
}
```

### HTTP 狀態碼

| 狀態碼 | 說明 |
|--------|------|
| 200 | 請求成功 |
| 201 | 創建成功 |
| 400 | 請求參數錯誤 |
| 401 | 未認證或 Token 無效 |
| 403 | 無權限訪問 |
| 404 | 資源不存在 |
| 429 | 請求過於頻繁 (Rate Limit) |
| 500 | 服務器內部錯誤 |

---

### 🔐 認證相關 API

#### 1. 驗證 Token
```http
POST /api/auth/verify
Authorization: Bearer <token>
```

**響應**
```json
{
  "valid": true,
  "userId": "uuid",
  "email": "user@example.com"
}
```

#### 2. 檢查是否為超級管理員
```http
GET /api/admin/is-super-admin
Authorization: Bearer <token>
```

**響應**
```json
{
  "isSuperAdmin": true
}
```

#### 3. 獲取租戶管理員列表
```http
GET /api/admin/tenant-admins
Authorization: Bearer <token>
```

**響應**
```json
["tenant_id_1", "tenant_id_2"]
```

---

### 👤 用戶相關 API

#### 1. 獲取用戶資料
```http
GET /api/profile?userId=<user-id>&ensure=1
Authorization: Bearer <token>
```

**Query 參數**
- `userId` (string, required): 用戶 ID
- `ensure` (0|1, optional): 是否自動創建不存在的 profile

**響應**
```json
{
  "id": "uuid",
  "username": "用戶名",
  "avatarUrl": "https://...",
  "tenantId": 0,
  "points": 1000,
  "virtualCurrency": 500,
  "inviteCode": "ABC123",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

#### 2. 更新用戶資料
```http
PUT /api/profile
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "username": "新用戶名",
  "avatarUrl": "https://..."
}
```

**響應**
```json
{
  "success": true,
  "profile": { ... }
}
```

#### 3. 上傳頭像
```http
POST /api/upload-avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**表單數據**
- `avatar` (file): 圖片文件 (最大 5MB)

**響應**
```json
{
  "avatarUrl": "https://..."
}
```

#### 4. 獲取用戶列表 (管理員)
```http
GET /api/admin/users?page=1&limit=20&tenantId=0
Authorization: Bearer <token>
```

**Query 參數**
- `page` (number, default: 1): 頁碼
- `limit` (number, default: 20): 每頁數量
- `tenantId` (number, optional): 租戶 ID

**響應**
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "用戶名",
      "points": 1000,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

---

### 📝 帖子相關 API

#### 1. 獲取帖子列表
```http
GET /api/posts?page=1&limit=10&tenantId=0&scope=tenant
Authorization: Bearer <token> (optional)
```

**Query 參數**
- `page` (number, default: 1): 頁碼
- `limit` (number, default: 10): 每頁數量
- `tenantId` (number, default: 0): 租戶 ID
- `scope` (tenant|shared, default: tenant): 數據範圍

**響應**
```json
{
  "posts": [
    {
      "id": 1,
      "content": "帖子內容",
      "images": "url1,url2",
      "authorId": "uuid",
      "author": {
        "username": "作者名",
        "avatarUrl": "https://..."
      },
      "likesCount": 10,
      "commentsCount": 5,
      "isLiked": false,
      "isPinned": 0,
      "isAd": 0,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 100,
  "hasMore": true
}
```

#### 2. 創建帖子
```http
POST /api/posts
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "content": "帖子內容",
  "images": ["https://image1.jpg", "https://image2.jpg"],
  "scope": "tenant"
}
```

**響應**
```json
{
  "success": true,
  "post": {
    "id": 1,
    "content": "帖子內容",
    "status": "approved",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

#### 3. 刪除帖子
```http
DELETE /api/posts/:id
Authorization: Bearer <token>
```

**響應**
```json
{
  "success": true
}
```

#### 4. 點讚/取消點讚
```http
POST /api/posts/:id/like
Authorization: Bearer <token>
```

**響應**
```json
{
  "liked": true,
  "likesCount": 11
}
```

#### 5. 置頂帖子 (管理員)
```http
PUT /api/posts/:id/pin
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "isPinned": 1
}
```

#### 6. 審核帖子 (管理員)
```http
PUT /api/posts/:id/moderate
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "status": "approved",  // approved | rejected
  "rejectionReason": "違反社區規範"  // 拒絕時必填
}
```

---

### 💬 評論相關 API

#### 1. 獲取評論列表
```http
GET /api/comments/:postId?scope=tenant
Authorization: Bearer <token> (optional)
```

**Query 參數**
- `scope` (tenant|shared, default: tenant): 數據範圍

**響應**
```json
{
  "comments": [
    {
      "id": 1,
      "postId": 1,
      "userId": "uuid",
      "content": "評論內容",
      "author": {
        "username": "評論者",
        "avatarUrl": "https://..."
      },
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### 2. 創建評論
```http
POST /api/comments
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "postId": 1,
  "content": "評論內容",
  "scope": "tenant"
}
```

**響應**
```json
{
  "success": true,
  "comment": {
    "id": 1,
    "content": "評論內容",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

#### 3. 刪除評論
```http
DELETE /api/comments/:id
Authorization: Bearer <token>
```

**響應**
```json
{
  "success": true
}
```

---

### 🏢 租戶相關 API

#### 1. 解析租戶 ID
```http
GET /api/tenant/resolve
Headers:
  X-Horizons-Resolve-Host: tenant1.example.com
```

**響應**
```json
{
  "tenantId": 1
}
```

#### 2. 獲取站點設置
```http
GET /api/settings?t=<timestamp>&scope=main
```

**Query 參數**
- `t` (timestamp, optional): 緩存破壞參數
- `scope` (main|tenant, default: tenant): 設置範圍

**響應**
```json
{
  "site_name": "站點名稱",
  "site_logo": "https://...",
  "site_description": "站點描述",
  "primary_color": "#3b82f6",
  "announcement_text": "公告內容"
}
```

#### 3. 更新站點設置 (管理員)
```http
PUT /api/settings
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "tenantId": 0,
  "settings": {
    "site_name": "新站點名稱",
    "site_logo": "https://..."
  }
}
```

**響應**
```json
{
  "success": true
}
```

#### 4. 獲取頁面內容
```http
GET /api/page-content?page=home&tenantId=0
Authorization: Bearer <token> (optional)
```

**Query 參數**
- `page` (string, required): 頁面名稱
- `tenantId` (number, default: 0): 租戶 ID

**響應**
```json
{
  "hero": {
    "title": "歡迎來到平台",
    "subtitle": "最好的社交體驗",
    "backgroundImage": "https://..."
  },
  "features": [
    {
      "icon": "Zap",
      "title": "功能標題",
      "description": "功能描述"
    }
  ]
}
```

#### 5. 更新頁面內容 (管理員)
```http
PUT /api/page-content
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "tenantId": 0,
  "page": "home",
  "section": "hero",
  "content": {
    "title": "新標題"
  }
}
```

---

### 💰 積分相關 API

#### 1. 獲取積分歷史
```http
GET /api/points-history?limit=50
Authorization: Bearer <token>
```

**響應**
```json
{
  "history": [
    {
      "id": 1,
      "userId": "uuid",
      "changeAmount": 100,
      "reason": "每日簽到",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### 2. 扣除積分
```http
POST /api/points/deduct
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "amount": 100,
  "reason": "購買商品"
}
```

**響應**
```json
{
  "success": true,
  "newBalance": 900
}
```

#### 3. 增加積分 (管理員)
```http
POST /api/admin/points/add
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "userId": "uuid",
  "amount": 500,
  "reason": "活動獎勵"
}
```

---

### 🛒 商城相關 API

#### 1. 獲取商品列表
```http
GET /api/shop/products?tenantId=0
```

**響應**
```json
{
  "products": [
    {
      "id": 1,
      "name": "商品名稱",
      "description": "商品描述",
      "imageUrl": "https://...",
      "price": 1000,
      "stock": 100,
      "enabled": 1,
      "displayOrder": 1
    }
  ]
}
```

#### 2. 兌換商品
```http
POST /api/shop/redeem
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "productId": 1,
  "quantity": 1
}
```

**響應**
```json
{
  "success": true,
  "redemption": {
    "id": 1,
    "orderId": "ORD-20250101-123456",
    "status": "pending"
  }
}
```

#### 3. 管理商品 (管理員)
```http
POST /api/admin/shop/products
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "tenantId": 0,
  "name": "新商品",
  "price": 1000,
  "stock": -1,  // -1 表示無限庫存
  "enabled": 1
}
```

---

### 📧 通知相關 API

#### 1. 獲取通知列表
```http
GET /api/notifications?limit=50
Authorization: Bearer <token>
```

**響應**
```json
{
  "notifications": [
    {
      "id": 1,
      "content": "通知內容",
      "isRead": 0,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "unreadCount": 5
}
```

#### 2. 標記已讀
```http
PUT /api/notifications/:id/read
Authorization: Bearer <token>
```

**響應**
```json
{
  "success": true
}
```

#### 3. 全部標記已讀
```http
PUT /api/notifications/read-all
Authorization: Bearer <token>
```

---

### 🎁 邀請相關 API

#### 1. 驗證邀請碼
```http
GET /api/invite/:code
```

**響應**
```json
{
  "valid": true,
  "inviter": {
    "username": "邀請者",
    "avatarUrl": "https://..."
  }
}
```

#### 2. 獲取邀請統計
```http
GET /api/admin/invitations/analytics
Authorization: Bearer <token>
```

**響應**
```json
{
  "totalInvitations": 1000,
  "successfulInvitations": 800,
  "topInviters": [
    {
      "userId": "uuid",
      "username": "用戶名",
      "invitationCount": 50
    }
  ]
}
```

---

### 🎮 遊戲相關 API

#### 1. 獲取遊戲記錄
```http
GET /api/games/prediction/history?limit=20
Authorization: Bearer <token>
```

**響應**
```json
{
  "history": [
    {
      "id": 1,
      "gameType": "prediction_28",
      "betAmount": 100,
      "result": "win",
      "winAmount": 200,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### 2. 下注
```http
POST /api/games/prediction/bet
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "gameType": "prediction_28",
  "betAmount": 100,
  "prediction": "big"
}
```

---

### 🔍 系統監控 API

#### 1. 獲取日誌（超管）
```http
GET /api/admin/logs?level=error&limit=100
Authorization: Bearer <token>
```

**Query 參數**
- `level` (string, optional): 日誌級別 (error, warn, info)
- `limit` (number, default: 100, max: 100): 返回數量

**響應**
```json
{
  "logs": [
    {
      "id": "log-123",
      "message": "錯誤信息",
      "timestamp": "2025-10-01T12:00:00Z",
      "labels": [
        { "name": "level", "value": "error" },
        { "name": "type", "value": "app" },
        { "name": "instance", "value": "srv-xxx" }
      ]
    }
  ],
  "hasMore": false
}
```

#### 2. 獲取日誌統計（超管）
```http
GET /api/admin/logs/stats
Authorization: Bearer <token>
```

**響應**
```json
{
  "total": 150,
  "errors": 5,
  "warnings": 10,
  "info": 135
}
```

---

### 📊 分析相關 API

#### 1. 獲取 Umami 統計
```http
GET /api/analytics/umami?startDate=2025-01-01&endDate=2025-01-31
Authorization: Bearer <token>
```

**響應**
```json
{
  "pageviews": 10000,
  "visitors": 5000,
  "bounceRate": 0.3
}
```

---

### ⚙️ 系統管理 API

#### 1. 創建 Turso 分支 (管理員)
```http
POST /api/admin/databases/create-branch
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "tenantId": 1,
  "branchName": "tenant_1_branch"
}
```

#### 2. 管理 Vercel 域名 (管理員)
```http
POST /api/admin/vercel/domains
Authorization: Bearer <token>
Content-Type: application/json
```

**請求體**
```json
{
  "domain": "tenant1.example.com",
  "action": "add"  // add | remove
}
```

---

### 🚫 Rate Limiting

所有 API 端點都有頻率限制：

| 端點類型 | 限制 | 時間窗口 |
|----------|------|----------|
| 讀取端點 (GET) | 100 請求 | 1 分鐘 |
| 寫入端點 (POST/PUT/DELETE) | 30 請求 | 1 分鐘 |
| 認證端點 | 10 請求 | 1 分鐘 |
| 上傳端點 | 5 請求 | 1 分鐘 |

超出限制時返回：
```json
{
  "error": "請求過於頻繁，請稍後再試",
  "retryAfter": 60
}
```
HTTP 狀態碼: `429 Too Many Requests`

---

## 數據庫設計

### Turso (SQLite) 表結構

#### 用戶相關表

##### profiles (用戶資料表)
```sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,              -- Supabase User ID
  username TEXT,                    -- 用戶名
  avatar_url TEXT,                  -- 頭像 URL
  tenant_id INTEGER DEFAULT 0,      -- 所屬租戶 ID (統一為 0，全局共享)
  points INTEGER DEFAULT 0,         -- 積分 (全局共享，主站分站同步)
  virtual_currency INTEGER DEFAULT 0, -- 虛擬貨幣 (全局共享)
  invitation_points INTEGER DEFAULT 0, -- 邀請積分 (全局共享)
  free_posts_count INTEGER DEFAULT 0,  -- 免費發帖次數
  uid TEXT,                         -- 唯一標識符
  invite_code TEXT,                 -- 邀請碼
  created_at TEXT                   -- 創建時間
);
```

**重要說明**：
- ✅ 用戶積分（`points`）、虛擬貨幣（`virtual_currency`）等數據統一存儲在**全局數據庫** (tenant_id = 0)
- ✅ 主站和分站**完全共享**用戶積分數據
- ✅ 所有積分操作（簽到、兌換、商城購買等）都在全局數據庫中進行
- ✅ 用戶在任何站點的積分變動都會實時同步到所有站點

##### admin_users (超級管理員表)
```sql
CREATE TABLE admin_users (
  user_id TEXT PRIMARY KEY          -- 用戶 ID
);
```

##### tenant_admins (租戶管理員表)
```sql
CREATE TABLE tenant_admins (
  tenant_id INTEGER NOT NULL,       -- 租戶 ID
  user_id TEXT NOT NULL             -- 用戶 ID
);
```

#### 內容相關表

##### posts (帖子表)
```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 0,  -- 租戶隔離
  author_id TEXT NOT NULL,               -- 作者 ID
  content TEXT,                          -- 內容
  images TEXT,                           -- 圖片 URL (逗號分隔)
  is_ad INTEGER DEFAULT 0,               -- 是否為廣告
  is_pinned INTEGER DEFAULT 0,           -- 是否置頂
  status TEXT DEFAULT 'approved',        -- 狀態: approved|pending|rejected
  rejection_reason TEXT,                 -- 拒絕原因
  created_at TEXT,                       -- 創建時間
  updated_at TEXT                        -- 更新時間
);
```

##### comments (評論表)
```sql
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,         -- 帖子 ID
  user_id TEXT NOT NULL,            -- 用戶 ID
  content TEXT,                     -- 內容
  created_at TEXT                   -- 創建時間
);
```

##### likes (點讚表)
```sql
CREATE TABLE likes (
  post_id INTEGER NOT NULL,         -- 帖子 ID
  user_id TEXT NOT NULL             -- 用戶 ID
);
```

##### notifications (通知表)
```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,            -- 用戶 ID
  content TEXT,                     -- 通知內容
  is_read INTEGER DEFAULT 0,        -- 是否已讀
  created_at TEXT                   -- 創建時間
);
```

#### 租戶管理表

##### app_settings (應用設置表)
```sql
CREATE TABLE app_settings (
  tenant_id INTEGER NOT NULL,       -- 租戶 ID
  key TEXT NOT NULL,                -- 設置鍵
  value TEXT,                       -- 設置值
  name TEXT,                        -- 顯示名稱
  description TEXT,                 -- 描述
  type TEXT                         -- 類型
);
```

##### page_content (頁面內容表)
```sql
CREATE TABLE page_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 0,  -- 租戶 ID
  page TEXT NOT NULL,                    -- 頁面名稱
  section TEXT NOT NULL,                 -- 區塊名稱
  position INTEGER DEFAULT 0,            -- 位置順序
  content TEXT                           -- JSON 格式內容
);
```

##### tenant_requests (租戶申請表)
```sql
CREATE TABLE tenant_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desired_domain TEXT,              -- 期望域名
  user_id TEXT,                     -- 申請用戶 ID
  contact_wangwang TEXT,            -- 聯繫方式
  status TEXT,                      -- 狀態: pending|approved|rejected
  vercel_project_id TEXT,           -- Vercel 項目 ID
  vercel_assigned_domain TEXT,      -- Vercel 分配域名
  vercel_deployment_status TEXT,    -- 部署狀態
  vercel_subdomain_slug TEXT,       -- 子域名 slug
  fallback_domain TEXT,             -- 備用域名
  rejection_reason TEXT,            -- 拒絕原因
  created_at TEXT                   -- 創建時間
);
```

##### branches (Turso 分支表)
```sql
CREATE TABLE branches (
  tenant_id INTEGER PRIMARY KEY,    -- 租戶 ID
  branch_url TEXT NOT NULL,         -- 分支 URL
  source TEXT,                      -- 來源
  updated_by TEXT,                  -- 更新者
  updated_at TEXT                   -- 更新時間
);
```

#### 業務功能表

##### points_history (積分歷史表)
```sql
CREATE TABLE points_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,            -- 用戶 ID
  change_amount INTEGER NOT NULL,   -- 變動金額 (正/負)
  reason TEXT NOT NULL,             -- 變動原因
  created_at TEXT                   -- 創建時間
);
```

##### shop_products (商品表)
```sql
CREATE TABLE shop_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 0,  -- 租戶 ID
  name TEXT,                             -- 商品名稱
  description TEXT,                      -- 商品描述
  image_url TEXT,                        -- 商品圖片
  price INTEGER NOT NULL DEFAULT 0,      -- 價格 (積分)
  stock INTEGER NOT NULL DEFAULT -1,     -- 庫存 (-1 表示無限)
  enabled INTEGER DEFAULT 1,             -- 是否啟用
  display_order INTEGER DEFAULT 0,       -- 顯示順序
  created_at TEXT,                       -- 創建時間
  updated_at TEXT                        -- 更新時間
);
```

##### shop_redemptions (兌換記錄表)
```sql
CREATE TABLE shop_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,    -- 訂單 ID
  user_id TEXT NOT NULL,            -- 用戶 ID
  product_id INTEGER NOT NULL,      -- 商品 ID
  quantity INTEGER DEFAULT 1,       -- 數量
  total_points INTEGER NOT NULL,    -- 總積分
  status TEXT DEFAULT 'pending',    -- 狀態: pending|completed|cancelled
  contact_info TEXT,                -- 聯繫信息
  notes TEXT,                       -- 備註
  created_at TEXT,                  -- 創建時間
  updated_at TEXT                   -- 更新時間
);
```

##### invitations (邀請表)
```sql
CREATE TABLE invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inviter_id TEXT NOT NULL,         -- 邀請者 ID
  invitee_id TEXT,                  -- 被邀請者 ID
  invite_code TEXT UNIQUE NOT NULL, -- 邀請碼
  status TEXT DEFAULT 'pending',    -- 狀態: pending|accepted
  created_at TEXT,                  -- 創建時間
  accepted_at TEXT                  -- 接受時間
);
```

#### 共享數據表 (跨租戶)

##### shared_posts (共享帖子表)
```sql
CREATE TABLE shared_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id TEXT NOT NULL,
  content TEXT,
  images TEXT,
  is_ad INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  status TEXT DEFAULT 'approved',
  created_at TEXT,
  updated_at TEXT
);
```

##### shared_comments (共享評論表)
```sql
CREATE TABLE shared_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT,
  created_at TEXT
);
```

##### shared_likes (共享點讚表)
```sql
CREATE TABLE shared_likes (
  post_id INTEGER NOT NULL,
  user_id TEXT NOT NULL
);
```

##### shared_profiles (共享用戶資料表)
```sql
CREATE TABLE shared_profiles (
  id TEXT PRIMARY KEY,
  username TEXT,
  avatar_url TEXT,
  uid TEXT,
  created_at TEXT
);
```

### 索引優化建議

```sql
-- 帖子查詢優化
CREATE INDEX idx_posts_tenant_created ON posts(tenant_id, created_at DESC);
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_status ON posts(status);

-- 評論查詢優化
CREATE INDEX idx_comments_post ON comments(post_id);

-- 點讚查詢優化
CREATE INDEX idx_likes_post_user ON likes(post_id, user_id);

-- 通知查詢優化
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);

-- 積分歷史查詢優化
CREATE INDEX idx_points_history_user ON points_history(user_id, created_at DESC);

-- 設置查詢優化
CREATE INDEX idx_app_settings_tenant_key ON app_settings(tenant_id, key);

-- 頁面內容查詢優化
CREATE INDEX idx_page_content_tenant_page ON page_content(tenant_id, page, section);
```

---

## 安全性

### 🔐 認證與授權

#### JWT 驗證流程
```javascript
// 1. 前端從 Supabase 獲取 JWT Token
const { data, error } = await supabase.auth.signInWithPassword({
  email, password
});
const token = data.session.access_token;

// 2. 請求時附帶 Token
fetch('/api/protected', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// 3. 後端驗證 Token (使用 JWKS)
const JWKS = createRemoteJWKSet(new URL(SUPABASE_JWKS_URL));
const { payload } = await jwtVerify(token, JWKS, {
  issuer: `${SUPABASE_URL}/auth/v1`
});

// 4. 提取用戶信息
const userId = payload.sub;
```

#### 權限層級

| 角色 | 權限 | 數據訪問 |
|------|------|----------|
| **訪客** | 瀏覽公開內容 | 公開帖子、頁面內容 |
| **普通用戶** | 發帖、評論、點讚 | 自己的數據 + 公開數據 |
| **租戶管理員** | 管理租戶內容和設置 | 所屬租戶的所有數據 |
| **超級管理員** | 全站管理 | 所有數據 |

#### 權限檢查實現
```javascript
// 後端中間件
async function requireAuth(c, next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  
  try {
    const { payload } = await jwtVerify(token, SUPABASE_JWKS);
    c.set('userId', payload.sub);
    await next();
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

async function requireAdmin(c, next) {
  const userId = c.get('userId');
  const isAdmin = await checkIfAdmin(userId);
  if (!isAdmin) return c.json({ error: 'Forbidden' }, 403);
  await next();
}
```

### 🛡️ CORS 安全策略

#### CORS 配置
```javascript
// 白名單機制
const ALLOWED_ORIGINS = [
  'https://dhtd.vercel.app',
  'https://tv28.cc',
  'http://localhost:3000',      // 本地開發
  'http://localhost:5173'       // Vite 開發服務器
];

// 動態 CORS 驗證
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return true;  // 同源請求
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    if (ROOT_DOMAIN && origin.endsWith(`.${ROOT_DOMAIN}`)) return true;
    return false;  // 拒絕未知來源
  },
  credentials: false,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type']
}));
```

### 🔒 安全標頭

#### CSP (Content Security Policy)
```javascript
app.use('*', async (c, next) => {
  c.header('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://cloud.umami.is",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https:",
    "frame-ancestors 'none'"
  ].join('; '));
  
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  await next();
});
```

### 🚦 Rate Limiting (頻率限制)

#### 實現原理
```javascript
// 內存存儲 (生產環境建議使用 Redis)
const rateStore = new Map();

function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const record = rateStore.get(key) || { count: 0, resetTime: now + windowMs };
  
  if (now > record.resetTime) {
    // 重置計數器
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }
  
  rateStore.set(key, record);
  
  if (record.count > maxRequests) {
    return { 
      allowed: false, 
      retryAfter: Math.ceil((record.resetTime - now) / 1000) 
    };
  }
  
  return { allowed: true };
}

// 使用示例
app.post('/api/posts', async (c) => {
  const userId = c.get('userId');
  const { allowed, retryAfter } = rateLimit(`post:${userId}`, 10, 60000);
  
  if (!allowed) {
    return c.json({ 
      error: '請求過於頻繁',
      retryAfter 
    }, 429);
  }
  
  // 處理請求...
});
```

#### Rate Limit 配置

| 操作類型 | 限制 | 時間窗口 | Key 格式 |
|----------|------|----------|----------|
| 創建帖子 | 10 次 | 1 分鐘 | `post:{userId}` |
| 評論 | 30 次 | 1 分鐘 | `comment:{userId}` |
| 點讚 | 60 次 | 1 分鐘 | `like:{userId}` |
| 上傳圖片 | 5 次 | 1 分鐘 | `upload:{userId}` |
| API 調用 | 100 次 | 1 分鐘 | `api:{userId}` |

### 🔐 數據安全

#### SQL 注入防護
```javascript
// ✅ 正確：使用 ORM 參數化查詢
const posts = await db.select()
  .from(postsTable)
  .where(eq(postsTable.tenantId, tenantId))
  .limit(limit);

// ❌ 錯誤：字符串拼接
const posts = await db.execute(
  `SELECT * FROM posts WHERE tenant_id = ${tenantId}`
);
```

#### XSS 防護
```jsx
// React 自動轉義
<div>{userContent}</div>  // ✅ 安全

// 危險：dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: userContent }} />  // ❌ 危險
```

#### 敏感數據保護
```javascript
// 後端返回用戶數據時移除敏感字段
function sanitizeProfile(profile) {
  const { password, secretKey, ...safe } = profile;
  return safe;
}

// 環境變量永不暴露到前端
// ✅ 後端: process.env.SUPABASE_SERVICE_ROLE_KEY
// ❌ 前端: import.meta.env.SUPABASE_SERVICE_ROLE_KEY (危險!)
```

### 🖼️ 文件上傳安全

#### 上傳限制
```javascript
// 文件大小限制
const MAX_FILE_SIZE = 5 * 1024 * 1024;  // 5MB

// 允許的文件類型
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// 驗證文件
async function validateUpload(file) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('文件過大，最大 5MB');
  }
  
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('不支持的文件類型');
  }
  
  // 使用 sharp 驗證圖片有效性
  try {
    await sharp(file.buffer).metadata();
  } catch (e) {
    throw new Error('無效的圖片文件');
  }
}
```

#### 文件名安全
```javascript
// 生成安全的文件名
function generateSafeFilename(originalName) {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${random}${ext}`;
}
```

### 🔍 審計與監控

#### 操作日誌
```javascript
// 記錄敏感操作
async function logAction(userId, action, details) {
  await db.insert(auditLogsTable).values({
    userId,
    action,      // 'delete_post', 'ban_user', etc.
    details: JSON.stringify(details),
    ipAddress: getClientIp(),
    createdAt: new Date().toISOString()
  });
}

// 使用示例
app.delete('/api/posts/:id', async (c) => {
  const postId = c.req.param('id');
  const userId = c.get('userId');
  
  await deletePost(postId);
  await logAction(userId, 'delete_post', { postId });
  
  return c.json({ success: true });
});
```

#### 錯誤處理
```javascript
// 統一錯誤處理
app.onError((err, c) => {
  // 記錄錯誤（但不暴露詳情給用戶）
  console.error('Server error:', err);
  
  // 生產環境隱藏詳細錯誤信息
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: '服務器錯誤，請稍後重試' }, 500);
  }
  
  return c.json({ error: err.message }, 500);
});
```

### 🌐 HTTPS 強制

#### 生產環境配置
```javascript
// Vercel 和 Render 自動提供 HTTPS
// 確保所有 API 調用使用 HTTPS

// 檢查協議
app.use('*', async (c, next) => {
  if (process.env.NODE_ENV === 'production') {
    const proto = c.req.header('x-forwarded-proto');
    if (proto !== 'https') {
      return c.redirect(`https://${c.req.header('host')}${c.req.path}`);
    }
  }
  await next();
});
```

### 🔑 環境變量安全

#### 最佳實踐
```bash
# ✅ 正確：使用環境變量
SUPABASE_SERVICE_ROLE_KEY=your_secret_key

# ❌ 錯誤：硬編碼在代碼中
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

# ✅ 正確：不提交 .env 文件
# .gitignore
.env
.env.local
.env.production

# ✅ 正確：使用平台環境變量管理
# Vercel: Settings → Environment Variables
# Render: Environment → Environment Variables
```

### 🛠️ 安全檢查清單

- [x] JWT Token 驗證
- [x] CORS 白名單
- [x] Rate Limiting
- [x] SQL 注入防護 (Drizzle ORM)
- [x] XSS 防護 (React 自動轉義)
- [x] CSRF 防護 (SameSite Cookie)
- [x] 文件上傳驗證
- [x] 安全標頭 (CSP, X-Frame-Options, etc.)
- [x] HTTPS 強制
- [x] 敏感數據不暴露到前端
- [ ] 雙因素認證 (2FA) - 待實現
- [ ] 操作審計日誌 - 部分實現
- [ ] 自動威脅檢測 - 待實現

---

## 部署流程

### 自動部署架構

```
開發者
  ↓
git push origin main
  ↓
GitHub Repository
  ├─→ Vercel (自動部署前端)
  │     ├─ 檢測到推送
  │     ├─ 執行 npm run build
  │     ├─ 部署到 CDN
  │     └─ 更新 https://dhtd.vercel.app
  │
  └─→ Render (自動部署後端)
        ├─ 檢測到推送
        ├─ 執行 npm install
        ├─ 啟動 npm run start
        └─ 更新 https://dhtd.onrender.com
```

### Vercel 部署配置

#### 項目設置
```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "devCommand": "npm run dev"
}
```

#### 環境變量 (Vercel Dashboard)
```bash
# Settings → Environment Variables

# Production
NEXT_PUBLIC_SUPABASE_URL=https://...
ROOT_DOMAIN=dhtd.vercel.app
# ... (參考環境變量章節)

# Preview (可選)
NEXT_PUBLIC_SUPABASE_URL=https://...
ROOT_DOMAIN=preview.vercel.app
```

#### Rewrites 配置
```json
// vercel.json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://dhtd.onrender.com/api/:path*"
    }
  ]
}
```

### Render 部署配置

#### render.yaml
```yaml
services:
  - type: web
    name: social-app-bff
    env: node
    plan: free              # 或 starter, standard
    region: singapore       # 選擇最近的區域
    buildCommand: "npm install"
    startCommand: "npm run start"
    envVars:
      - key: NODE_ENV
        value: production
      - key: SUPABASE_URL
        sync: false         # 手動設置
      # ... 其他環境變量
```

#### 健康檢查
```javascript
// server/index.js
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### 部署前檢查清單

#### 前端部署前
- [ ] 更新版本號 (package.json)
- [ ] 運行 `npm run build` 確保無構建錯誤
- [ ] 檢查環境變量是否正確設置
- [ ] 測試生產構建 `npm run preview`
- [ ] 檢查 .gitignore 是否包含敏感文件

#### 後端部署前
- [ ] 數據庫遷移腳本已準備
- [ ] 環境變量在 Render 中已配置
- [ ] Rate Limiting 配置已優化
- [ ] 日誌系統正常工作
- [ ] 測試 JWT 驗證流程

### 回滾策略

#### Vercel 回滾
```bash
# 方法 1: Vercel Dashboard
# Deployments → 選擇歷史部署 → Promote to Production

# 方法 2: Vercel CLI
vercel rollback
```

#### Render 回滾
```bash
# Render Dashboard
# Services → social-app-bff → Manual Deploy
# 選擇之前的 Deployment ID
```

### 監控與告警

#### 推薦工具
- **Vercel Analytics**: 自動啟用，監控性能
- **Render Metrics**: CPU、Memory、請求量
- **Umami**: 自定義分析
- **Sentry** (可選): 錯誤追蹤

#### 關鍵指標
- 響應時間 (P95 < 500ms)
- 錯誤率 (< 1%)
- 可用性 (> 99.5%)
- 數據庫連接數

---

## 開發指南

### 本地開發環境設置

#### 前置要求
- Node.js 18+ 
- npm 或 yarn
- Git

#### 安裝步驟

```bash
# 1. 克隆倉庫
git clone <your-repo-url>
cd <project-directory>

# 2. 安裝依賴
npm install

# 3. 配置環境變量
cp .env.example .env.local
# 編輯 .env.local，填入實際值

# 4. 啟動開發服務器

# 終端 1: 前端 (Vite)
npm run dev

# 終端 2: 後端 (Hono BFF)
npm run bff

# 5. 訪問應用
# 前端: http://localhost:5173
# 後端: http://localhost:8787
```

### 項目結構說明

```
project-root/
├── src/                          # 前端源代碼
│   ├── components/               # React 組件
│   │   ├── ui/                   # shadcn/ui 組件
│   │   ├── admin/                # 管理員組件
│   │   └── ...                   # 功能組件
│   ├── contexts/                 # React Context
│   │   ├── AuthContext.jsx       # 認證上下文
│   │   ├── TenantContext.jsx     # 租戶上下文
│   │   └── ThemeProvider.jsx     # 主題上下文
│   ├── pages/                    # 頁面組件
│   ├── hooks/                    # 自定義 Hooks
│   ├── lib/                      # 工具函數
│   │   ├── api.js                # API 請求封裝
│   │   ├── utils.js              # 通用工具
│   │   └── supabaseClient.js     # Supabase 客戶端
│   ├── config/                   # 配置文件
│   ├── router/                   # 路由配置
│   ├── App.jsx                   # 主應用組件
│   ├── main.jsx                  # 入口文件
│   └── index.css                 # 全局樣式
│
├── server/                       # 後端源代碼
│   ├── drizzle/                  # Drizzle ORM
│   │   └── schema.js             # 數據庫 Schema
│   ├── index.js                  # Hono 服務器主文件
│   └── tursoApi.js               # Turso API 封裝
│
├── api/                          # API 路由 (舊結構)
├── plugins/                      # Vite 插件
├── tools/                        # 工具腳本
│   ├── check-tenant-settings.js
│   └── seed-tenant-demo-settings.js
│
├── public/                       # 靜態資源
├── dist/                         # 構建輸出
├── tmp_uploads/                  # 臨時上傳目錄
│
├── package.json                  # 依賴配置
├── vite.config.js                # Vite 配置
├── tailwind.config.js            # Tailwind 配置
├── vercel.json                   # Vercel 配置
├── render.yaml                   # Render 配置
└── PROJECT_DOCUMENTATION.md      # 本文檔
```

### 開發工作流

#### 新功能開發
```bash
# 1. 創建功能分支
git checkout -b feature/new-feature

# 2. 開發功能
# - 前端：src/pages/ 或 src/components/
# - 後端：server/index.js 添加 API 路由
# - 數據庫：server/drizzle/schema.js 添加表

# 3. 測試功能
npm run dev

# 4. 提交代碼
git add .
git commit -m "feat: 添加新功能"

# 5. 推送並創建 PR
git push origin feature/new-feature
```

#### 修復 Bug
```bash
git checkout -b fix/bug-description
# ... 修復代碼
git commit -m "fix: 修復 XXX 問題"
git push origin fix/bug-description
```

### 常用命令

```bash
# 開發
npm run dev              # 啟動前端開發服務器
npm run bff              # 啟動後端開發服務器

# 構建
npm run build            # 構建生產版本
npm run preview          # 預覽生產構建

# 工具腳本
npm run check:tenant-settings     # 檢查租戶設置
npm run seed:tenant-demo          # 初始化演示數據
```

### 代碼風格

#### JavaScript/JSX
- 使用 ES6+ 語法
- 優先使用函數式組件和 Hooks
- 組件文件使用 PascalCase (UserProfile.jsx)
- 工具函數文件使用 camelCase (api.js)

#### CSS
- 使用 Tailwind CSS 工具類
- 自定義樣式放在 index.css
- 遵循移動優先原則

#### 命名規範
```javascript
// 組件
const UserProfile = () => { ... }

// Hooks
const useAuth = () => { ... }

// 工具函數
const fetchWithRetry = async () => { ... }

// 常量
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// API 端點
app.get('/api/users/:id', ...)
```

### 調試技巧

#### 前端調試
```javascript
// 使用 React DevTools
// Chrome 擴展: React Developer Tools

// TanStack Query DevTools (已集成)
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// 日誌輸出
console.log('Debug info:', data);
```

#### 後端調試
```javascript
// 啟用認證調試
ENABLE_AUTH_DEBUG=1

// 日誌輸出
console.log('[API]', endpoint, payload);

// 錯誤追蹤
try {
  // ...
} catch (e) {
  console.error('Error:', e);
  throw e;
}
```

### 數據庫操作

#### 使用 Drizzle ORM
```javascript
// 查詢
const users = await db.select()
  .from(profiles)
  .where(eq(profiles.tenantId, tenantId))
  .limit(10);

// 插入
await db.insert(posts).values({
  content: 'Hello',
  authorId: userId,
  tenantId: 0
});

// 更新
await db.update(profiles)
  .set({ points: sql`${profiles.points} + 100` })
  .where(eq(profiles.id, userId));

// 刪除
await db.delete(posts).where(eq(posts.id, postId));
```

### 常見問題

#### Q: CORS 錯誤
```bash
# 確保前端請求的域名在 ALLOWED_ORIGINS 中
ALLOWED_ORIGINS=https://dhtd.vercel.app,http://localhost:5173
```

#### Q: JWT Token 無效
```bash
# 檢查 SUPABASE_JWKS_URL 是否正確
# 檢查 Token 是否過期
# 確保 Authorization Header 格式正確: "Bearer <token>"
```

#### Q: 圖片上傳失敗
```bash
# 檢查 tmp_uploads/ 目錄是否存在且有寫權限
mkdir -p tmp_uploads
chmod 755 tmp_uploads
```

#### Q: 數據庫連接失敗
```bash
# 檢查 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN
# 測試連接
curl -H "Authorization: Bearer $TURSO_AUTH_TOKEN" $TURSO_DATABASE_URL
```

---

## 版本歷史

### v1.0.3 (2025-10-01)
- ✨ **新增 API 監控功能**（僅超級管理員）
  - 新增後台 API 監控頁面 (`/admin/api-monitor`)
  - 實時查看服務器日誌（所有/錯誤/系統信息）
  - 自動每 30 秒刷新日誌
  - 日誌統計儀表板（總數/錯誤/警告/狀態）
  - 內置日誌緩存系統（可擴展集成 Render API）
  - **權限控制**: 僅超級管理員可訪問

### v1.0.2 (2025-10-01)
- 🐛 **修復 shared_posts 表 Schema 問題**
  - 添加缺失字段：`is_ad`, `is_pinned`, `status`, `rejection_reason`, `updated_at`
  - 自動遷移現有表結構，確保向後兼容
  - 修復共享帖子創建和查詢功能
  - **效果**: 跨租戶共享帖子功能恢復正常

### v1.0.1 (2025-09-30)
- 🐛 **修復積分同步問題** - 統一所有積分操作使用全局數據庫
  - 修復簽到積分（`/api/points/checkin`）
  - 修復商城兌換（`/api/shop/redeem`）
  - 修復積分兌換（`/api/points/exchange`）
  - 修復邀請獎勵（`/api/points/reward/invite`）
  - 修復積分歷史查詢（`/api/points-history`）
  - **重要**: 現在主站和分站完全共享用戶積分數據

### v1.0.0 (2025-09-30)
- ✅ 初始版本
- ✅ 多租戶架構
- ✅ 用戶認證系統
- ✅ 社交功能 (帖子、評論、點讚)
- ✅ 積分系統
- ✅ 商城系統
- ✅ 管理員後台
- ✅ 自動部署流程

---

## 貢獻指南

### 提交 Issue
1. 檢查是否已存在類似 Issue
2. 使用清晰的標題描述問題
3. 提供重現步驟
4. 附上錯誤截圖或日誌

### 提交 Pull Request
1. Fork 倉庫
2. 創建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: 添加某功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

### Commit 消息規範
```
feat: 新功能
fix: 修復 Bug
docs: 文檔更新
style: 代碼格式調整
refactor: 代碼重構
test: 測試相關
chore: 構建/工具相關
```

---

## 許可證

[MIT License](LICENSE)

---

## 聯繫方式

- **項目維護者**: [您的名字]
- **Email**: [您的郵箱]
- **GitHub**: [倉庫地址]

---

**📝 文檔更新提示**

每次代碼修改後，請相應更新本文檔的以下部分：
- ✅ API 文檔 (新增/修改端點)
- ✅ 數據庫設計 (新增/修改表)
- ✅ 環境變量配置 (新增變量)
- ✅ 技術棧 (新增依賴)
- ✅ 版本歷史 (重大更新)

---

*最後更新: 2025-09-30*
