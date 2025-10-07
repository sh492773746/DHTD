# Rate Limiting、審計日誌和錯誤處理升級指南

> 創建時間：2025-10-01  
> 版本：v1.2.0

---

## 📋 目錄

1. [Upstash Redis 免費方案設置](#upstash-redis-免費方案設置)
2. [Rate Limiting 升級](#rate-limiting-升級)
3. [審計日誌系統](#審計日誌系統)
4. [統一錯誤處理](#統一錯誤處理)
5. [集成示例](#集成示例)

---

## 🎁 Upstash Redis 免費方案設置

### 為什麼選擇 Upstash？

| 特性 | Upstash Redis | Redis Cloud | Render Redis |
|------|---------------|-------------|--------------|
| 免費額度 | 10,000 命令/天 | 30MB | 需付費計劃 |
| 信用卡 | ❌ 不需要 | ✅ 需要 | ✅ 需要 |
| 延遲 | 超低（邊緣網絡） | 中等 | 取決於區域 |
| 與 Vercel 集成 | ✅ 完美 | ⚠️ 一般 | ⚠️ 一般 |
| **推薦度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |

### 註冊步驟

#### 1. 註冊 Upstash 賬號
```
訪問：https://console.upstash.com/
使用 GitHub 或 Google 賬號快速登入
```

#### 2. 創建 Redis 數據庫
```
1. 點擊「Create Database」
2. 選擇「Global」（全球邊緣網絡）
3. 選擇離您最近的區域（如 ap-southeast-1）
4. 點擊「Create」
```

#### 3. 獲取連接信息
```
在數據庫詳情頁面：
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN

複製這兩個值
```

#### 4. 配置環境變量

**Vercel（前端）**：
```bash
# 不需要配置（前端不使用 Redis）
```

**Render（後端）**：
```bash
# Settings → Environment Variables

UPSTASH_REDIS_REST_URL=https://YOUR-DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR-TOKEN
```

**本地開發（.env.local）**：
```bash
UPSTASH_REDIS_REST_URL=https://YOUR-DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR-TOKEN
```

---

## ⚡ Rate Limiting 升級

### 已創建的模塊

#### `server/utils/redis.js`

提供三個主要功能：

**1. 檢查是否超過限制**
```javascript
import { isRateLimited } from './utils/redis.js';

// 使用
const limited = await isRateLimited('api:user:123', 100, 60000);
if (limited) {
  return c.json({ error: '請求過於頻繁' }, 429);
}
```

**2. 獲取限流信息**
```javascript
import { getRateLimitInfo } from './utils/redis.js';

const info = await getRateLimitInfo('api:user:123');
// { count: 50, ttl: 30 }
```

**3. 重置限流**
```javascript
import { resetRateLimit } from './utils/redis.js';

await resetRateLimit('api:user:123');
```

### 自動降級機制

- ✅ **優先使用 Redis**（如果已配置）
- ✅ **自動降級到內存**（如果 Redis 未配置或失敗）
- ✅ **無縫切換**（不影響業務）

### 集成到現有端點

#### 舊代碼（內存存儲）：
```javascript
const __rateStore = new Map();
function __isLimited(key, limit, windowMs) {
  // ... 內存邏輯
}

// 使用
if (__isLimited(`post:${userId}`, 10, 60000)) {
  return c.json({ error: 'too-many-requests' }, 429);
}
```

#### 新代碼（Redis + 內存後備）：
```javascript
import { isRateLimited } from './utils/redis.js';

// 使用（自動選擇 Redis 或內存）
if (await isRateLimited(`post:${userId}`, 10, 60000)) {
  throw new RateLimitError(60);
}
```

### 建議的 Rate Limit 配置

| 操作類型 | 限制 | 時間窗口 | Key 格式 |
|----------|------|----------|----------|
| 創建帖子 | 10 次 | 1 分鐘 | `post:create:${userId}` |
| 評論 | 30 次 | 1 分鐘 | `comment:create:${userId}` |
| 點讚 | 60 次 | 1 分鐘 | `like:${userId}` |
| 上傳圖片 | 5 次 | 1 分鐘 | `upload:${userId}` |
| API 調用（GET） | 100 次 | 1 分鐘 | `api:get:${userId}` |
| API 調用（POST） | 30 次 | 1 分鐘 | `api:post:${userId}` |
| 登入嘗試 | 5 次 | 15 分鐘 | `login:${email}` |

---

## 📝 審計日誌系統

### 已創建的模塊

#### `server/utils/auditLog.js`

自動創建 `audit_logs` 表：

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,              -- 操作者 ID
  action TEXT NOT NULL,                -- 操作類型
  resource_type TEXT,                  -- 資源類型（post/user/comment等）
  resource_id TEXT,                    -- 資源 ID
  details TEXT,                        -- JSON 格式詳細信息
  ip_address TEXT,                     -- IP 地址
  user_agent TEXT,                     -- User Agent
  status TEXT DEFAULT 'success',       -- 狀態（success/failed）
  error_message TEXT,                  -- 錯誤信息（如果失敗）
  created_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_action_created ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

### 使用方法

#### 1. 記錄審計日誌
```javascript
import { auditLog, getClientInfo, AuditActions, ResourceTypes } from './utils/auditLog.js';

app.delete('/api/posts/:id', async (c) => {
  const userId = c.get('userId');
  const postId = c.req.param('id');
  const { ipAddress, userAgent } = getClientInfo(c);
  
  // 執行刪除
  await db.delete(postsTable).where(eq(postsTable.id, postId));
  
  // 📝 記錄審計日誌
  await auditLog({
    userId,
    action: AuditActions.POST_DELETE,
    resourceType: ResourceTypes.POST,
    resourceId: postId,
    details: { postId, deletedAt: new Date().toISOString() },
    ipAddress,
    userAgent,
  });
  
  return c.json({ success: true });
});
```

#### 2. 記錄失敗操作
```javascript
try {
  await someOperation();
  
  await auditLog({
    userId,
    action: AuditActions.POST_CREATE,
    status: 'success',
    ...getClientInfo(c),
  });
} catch (error) {
  // 記錄失敗
  await auditLog({
    userId,
    action: AuditActions.POST_CREATE,
    status: 'failed',
    errorMessage: error.message,
    ...getClientInfo(c),
  });
  
  throw error;
}
```

### 內置的操作類型

**用戶操作**：
- `user.login`, `user.logout`, `user.register`
- `user.update_profile`, `user.delete`

**內容操作**：
- `post.create`, `post.update`, `post.delete`
- `post.pin`, `post.moderate`
- `comment.create`, `comment.delete`

**積分操作**：
- `points.checkin`, `points.exchange`
- `points.admin_adjust`

**商城操作**：
- `shop.redeem`, `shop.product_create`, `shop.product_update`

**管理員操作**：
- `admin.user_ban`, `admin.user_role_change`
- `admin.settings_update`
- `admin.tenant_create`, `admin.tenant_delete`

**系統操作**：
- `system.database_create`, `system.branch_create`

### 查詢審計日誌

```javascript
// 在 server/index.js 中添加查詢端點

app.get('/api/admin/audit-logs', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new UnauthorizedError();
  
  const isAdmin = await isSuperAdminUser(userId);
  if (!isAdmin) throw new ForbiddenError();
  
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
});
```

---

## 🎯 統一錯誤處理

### 已創建的模塊

#### `server/utils/errors.js`

### 1. 自定義錯誤類

```javascript
// 通用 API 錯誤
throw new APIError('錯誤信息', 500, { detail: '...' });

// 特定錯誤類型
throw new UnauthorizedError();           // 401
throw new ForbiddenError();              // 403
throw new NotFoundError('帖子', '123');  // 404
throw new ValidationError('參數無效');   // 400
throw new RateLimitError(60);            // 429
throw new ConflictError('用戶已存在');   // 409
```

### 2. 標準響應格式

**成功響應**：
```javascript
import { successResponse } from './utils/errors.js';

// 僅成功狀態
return c.json(successResponse());
// { success: true }

// 帶數據
return c.json(successResponse({ id: 1, name: 'test' }));
// { success: true, data: { id: 1, name: 'test' } }

// 帶消息
return c.json(successResponse(data, '創建成功'));
// { success: true, data: {...}, message: '創建成功' }
```

**錯誤響應**（自動處理）：
```javascript
// 拋出錯誤即可，全局處理器會格式化
throw new NotFoundError('帖子', postId);

// 自動返回：
{
  "success": false,
  "error": {
    "message": "帖子不存在: 123",
    "code": 404
  }
}
```

### 3. 輔助驗證函數

```javascript
import { validate, requireAuth, requireAdmin } from './utils/errors.js';

app.post('/api/posts', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  
  // 簡潔的驗證（失敗自動拋出異常）
  requireAuth(userId);
  validate(body.content, '內容不能為空');
  validate(body.content.length <= 5000, '內容過長');
  
  // 繼續處理...
});
```

### 4. 異步錯誤包裝器

```javascript
import { asyncHandler } from './utils/errors.js';

// 自動捕獲異常
app.get('/api/posts', asyncHandler(async (c) => {
  const posts = await db.select()...;  // 異常會被自動捕獲
  return c.json(successResponse(posts));
}));
```

---

## 🔧 集成示例

### 示例 1：刪除帖子（完整版）

**舊代碼**：
```javascript
app.delete('/api/posts/:id', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    
    const id = Number(c.req.param('id'));
    const post = await db.select()...;
    if (!post) return c.json({ error: 'not-found' }, 404);
    
    await db.delete(postsTable).where(eq(postsTable.id, id));
    return c.json({ ok: true });
  } catch (e) {
    console.error('Error:', e);
    return c.json({ ok: false });
  }
});
```

**新代碼（集成所有優化）**：
```javascript
app.delete('/api/posts/:id', asyncHandler(async (c) => {
  const userId = c.get('userId');
  const postId = Number(c.req.param('id'));
  const { ipAddress, userAgent } = getClientInfo(c);
  
  // 🔒 驗證
  requireAuth(userId);
  
  // 🚦 Rate Limiting
  if (await isRateLimited(`delete:post:${userId}`, 10, 60000)) {
    throw new RateLimitError(60);
  }
  
  // 📋 業務邏輯
  const post = (await db.select().from(postsTable)
    .where(eq(postsTable.id, postId)).limit(1))?.[0];
  
  if (!post) {
    throw new NotFoundError('帖子', postId);
  }
  
  const isAdmin = await isSuperAdminUser(userId);
  if (!isAdmin && post.authorId !== userId) {
    throw new ForbiddenError('只能刪除自己的帖子');
  }
  
  // 執行刪除
  await db.delete(postsTable).where(eq(postsTable.id, postId));
  await db.delete(commentsTable).where(eq(commentsTable.postId, postId));
  await db.delete(likesTable).where(eq(likesTable.postId, postId));
  
  // 📝 審計日誌
  await auditLog({
    userId,
    action: AuditActions.POST_DELETE,
    resourceType: ResourceTypes.POST,
    resourceId: String(postId),
    details: { 
      postContent: post.content?.substring(0, 100),
      deletedAt: new Date().toISOString() 
    },
    ipAddress,
    userAgent,
  });
  
  // ✅ 統一響應
  return c.json(successResponse(null, '帖子已刪除'));
}));
```

### 示例 2：創建帖子（含積分扣除）

```javascript
app.post('/api/posts', asyncHandler(async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { ipAddress, userAgent } = getClientInfo(c);
  
  // 驗證
  requireAuth(userId);
  validate(body.content, '內容不能為空');
  validate(body.content.length <= 5000, '內容不能超過 5000 字符');
  
  // Rate Limiting
  if (await isRateLimited(`post:create:${userId}`, 10, 60000)) {
    throw new RateLimitError(60);
  }
  
  // 檢查積分
  const profile = (await db.select().from(profiles)
    .where(eq(profiles.id, userId)).limit(1))?.[0];
  
  if (!profile || profile.points < 10) {
    throw new ValidationError('積分不足，需要 10 積分發帖');
  }
  
  // 創建帖子
  const result = await db.insert(postsTable).values({
    authorId: userId,
    content: body.content,
    images: JSON.stringify(body.images || []),
    tenantId: 0,
    createdAt: new Date().toISOString(),
  }).returning();
  
  // 扣除積分
  await db.update(profiles)
    .set({ points: profile.points - 10 })
    .where(eq(profiles.id, userId));
  
  // 審計日誌
  await auditLog({
    userId,
    action: AuditActions.POST_CREATE,
    resourceType: ResourceTypes.POST,
    resourceId: String(result[0].id),
    details: { 
      contentLength: body.content.length,
      pointsDeducted: 10 
    },
    ipAddress,
    userAgent,
  });
  
  return c.json(successResponse(result[0], '發布成功'));
}));
```

### 示例 3：管理員操作（修改用戶權限）

```javascript
app.post('/api/admin/users/:id/role', asyncHandler(async (c) => {
  const adminId = c.get('userId');
  const targetUserId = c.req.param('id');
  const { role } = await c.req.json();
  const { ipAddress, userAgent } = getClientInfo(c);
  
  // 驗證權限
  requireAuth(adminId);
  const isAdmin = await isSuperAdminUser(adminId);
  requireAdmin(isAdmin);
  
  // 驗證輸入
  validate(['user', 'tenant-admin', 'super-admin'].includes(role), '無效的角色');
  
  // Rate Limiting
  if (await isRateLimited(`admin:role:${adminId}`, 20, 60000)) {
    throw new RateLimitError(60);
  }
  
  // 執行操作
  if (role === 'super-admin') {
    await db.insert(adminUsersTable).values({ userId: targetUserId });
  } else if (role === 'tenant-admin') {
    await db.insert(tenantAdminsTable).values({ 
      userId: targetUserId,
      tenantId: 0 
    });
  }
  
  // 📝 重要：記錄權限變更
  await auditLog({
    userId: adminId,
    action: AuditActions.ADMIN_USER_ROLE_CHANGE,
    resourceType: ResourceTypes.USER,
    resourceId: targetUserId,
    details: { 
      oldRole: 'user',
      newRole: role,
      changedBy: adminId 
    },
    ipAddress,
    userAgent,
  });
  
  return c.json(successResponse(null, '權限已更新'));
}));
```

---

## 📊 需要添加審計日誌的關鍵操作

### 🔴 高優先級（必須記錄）

1. **刪除操作**
   - 刪除帖子
   - 刪除用戶
   - 刪除評論

2. **權限變更**
   - 添加/移除管理員
   - 添加/移除租戶管理員

3. **積分操作**
   - 管理員調整積分
   - 大額積分變動（> 1000）

4. **敏感設置**
   - 修改站點設置
   - 修改 SEO 設置

5. **租戶管理**
   - 創建租戶
   - 刪除租戶
   - 修改域名

### 🟡 中優先級（建議記錄）

6. 創建帖子
7. 商品兌換
8. 帳戶登入/登出

### 🟢 低優先級（可選記錄）

9. 查看操作
10. 更新個人資料

---

## 🚀 部署步驟

### 1. 配置 Upstash Redis（5 分鐘）

```bash
# 1. 訪問 https://console.upstash.com/
# 2. 創建免費 Redis 數據庫
# 3. 複製連接信息
# 4. 在 Render 設置環境變量：
#    UPSTASH_REDIS_REST_URL=...
#    UPSTASH_REDIS_REST_TOKEN=...
```

### 2. 推送代碼

```bash
git add .
git commit -m "feat: 升級 Rate Limiting、審計日誌和錯誤處理"
git push origin main
```

### 3. 驗證部署

```bash
# 等待 2-3 分鐘部署完成

# 測試 Rate Limiting
for i in {1..10}; do curl https://dhtd.onrender.com/api/posts; done

# 查看審計日誌（超管）
curl https://dhtd.onrender.com/api/admin/audit-logs \
  -H "Authorization: Bearer YOUR_TOKEN"

# 測試錯誤響應格式
curl https://dhtd.onrender.com/api/posts/999999 \
  # 應返回標準錯誤格式
```

---

## 📈 預期效果

### Rate Limiting 改進

| 指標 | 舊版本（內存） | 新版本（Redis） |
|------|---------------|----------------|
| 持久性 | ❌ 重啟丟失 | ✅ 持久化 |
| 多實例支持 | ❌ 不支持 | ✅ 支持 |
| 精確度 | ⚠️ 中等 | ✅ 高 |
| 性能 | ✅ 快（本地） | ✅ 快（邊緣網絡） |

### 審計日誌優勢

- ✅ **安全審計** - 追溯所有敏感操作
- ✅ **問題排查** - 快速定位問題原因
- ✅ **合規性** - 符合數據保護要求
- ✅ **用戶追蹤** - 了解用戶行為
- ✅ **異常檢測** - 發現可疑活動

### 統一錯誤處理優勢

- ✅ **一致性** - 所有 API 統一格式
- ✅ **易調試** - 清晰的錯誤信息
- ✅ **安全性** - 生產環境隱藏詳情
- ✅ **用戶體驗** - 友好的錯誤提示
- ✅ **代碼簡潔** - 減少重複代碼

---

## 🎨 管理後台集成

### 創建審計日誌查看頁面

路徑：`src/pages/AdminAuditLogs.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const AdminAuditLogs = () => {
  const { session } = useAuth();
  const [logs, setLogs] = useState([]);
  
  useEffect(() => {
    fetch('/api/admin/audit-logs', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    .then(res => res.json())
    .then(data => setLogs(data.data?.logs || []));
  }, [session]);
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">審計日誌</h1>
      
      <div className="space-y-2">
        {logs.map(log => (
          <Card key={log.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Badge>{log.action}</Badge>
                  <span className="ml-2 text-sm">
                    {log.user_id} - {log.resource_type}:{log.resource_id}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {log.created_at}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminAuditLogs;
```

### 添加到導航菜單

```javascript
// src/config/navigationConfig.js
{
  title: '系統監控',
  items: [
    { to: '/admin/api-monitor', label: 'API 監控', icon: Activity },
    { to: '/admin/api-docs', label: 'API 文檔', icon: BookOpen },
    { to: '/admin/audit-logs', label: '審計日誌', icon: FileText },  // 新增
  ],
}
```

---

## 📝 環境變量更新

### 新增環境變量

在 Render 添加：

```bash
# Upstash Redis（免費方案）
UPSTASH_REDIS_REST_URL=https://YOUR-DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR-TOKEN

# 可選：Redis 功能開關（默認啟用）
ENABLE_REDIS=true
```

### 完整環境變量清單

請查看 `PROJECT_DOCUMENTATION.md` 的環境變量章節。

---

## ✅ 驗證清單

### Rate Limiting 驗證
- [ ] Upstash Redis 已配置
- [ ] 環境變量已設置
- [ ] 服務器日誌顯示「Redis 已連接」
- [ ] 快速請求被限制（返回 429）
- [ ] 限流信息準確

### 審計日誌驗證
- [ ] audit_logs 表已創建
- [ ] 刪除操作被記錄
- [ ] 權限變更被記錄
- [ ] 日誌包含 IP 和 User Agent
- [ ] 可以查詢歷史日誌

### 錯誤處理驗證
- [ ] 401/403/404 返回統一格式
- [ ] success: true/false 字段存在
- [ ] 生產環境不暴露堆棧追蹤
- [ ] 開發環境顯示詳細錯誤

---

## 🎯 逐步集成建議

由於 `server/index.js` 有 5600+ 行，建議分批集成：

### Week 1: 基礎設施
- ✅ 創建 utils 模塊（已完成）
- ✅ 配置 Upstash Redis
- ✅ 測試 Redis 連接
- ✅ 應用全局錯誤處理

### Week 2: 關鍵端點集成（10-15 個）
- 刪除帖子
- 修改權限
- 調整積分
- 創建租戶
- 刪除用戶

### Week 3: 次要端點集成（20-30 個）
- 創建帖子
- 創建評論
- 商品兌換
- 設置更新

### Week 4: 完整集成和測試
- 所有端點
- 完整測試
- 性能優化

---

## 🔍 監控和維護

### 查看 Redis 使用情況

```bash
# Upstash Dashboard
# 查看：
# - 命令數量
# - 內存使用
# - 延遲統計
```

### 清理舊審計日誌

```sql
-- 保留最近 90 天的日誌
DELETE FROM audit_logs 
WHERE created_at < datetime('now', '-90 days');

-- 或創建定時任務
```

### 審計日誌分析查詢

```sql
-- 查找最活躍的用戶
SELECT user_id, COUNT(*) as action_count
FROM audit_logs
WHERE created_at > datetime('now', '-7 days')
GROUP BY user_id
ORDER BY action_count DESC
LIMIT 10;

-- 查找失敗的操作
SELECT * FROM audit_logs
WHERE status = 'failed'
AND created_at > datetime('now', '-24 hours')
ORDER BY created_at DESC;

-- 查找敏感操作
SELECT * FROM audit_logs
WHERE action IN ('admin.user_role_change', 'admin.tenant_delete', 'points.admin_adjust')
ORDER BY created_at DESC
LIMIT 100;
```

---

## 💰 成本估算

### Upstash Redis 免費層

```
免費額度：10,000 命令/天
預估使用：
- Rate Limiting：~5,000 命令/天
- 其他緩存：~2,000 命令/天
總計：      ~7,000 命令/天

✅ 完全在免費額度內
```

如需更多：
- Pro 層：$0.2 / 100K 命令
- 非常便宜

---

## 📚 相關文檔

- [Upstash Redis 文檔](https://docs.upstash.com/redis)
- [Hono 錯誤處理](https://hono.dev/docs/guides/middleware#error-handling)
- [OWASP 日誌指南](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

---

**下一步**: 配置 Upstash Redis，然後逐步集成到關鍵端點。

有任何問題隨時詢問！

