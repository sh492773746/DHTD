# 📊 用户数据存储架构说明

> 用户数据存储位置、结构和同步机制完整说明
> 最后更新: 2025-10-07
> 版本: v1.0.0

---

## 🎯 快速回答

**用户注册后，数据存储在两个地方：**

1. **Supabase Authentication** - 认证数据（账号密码、邮箱）
2. **Turso 数据库 (SQLite)** - 用户资料和业务数据

---

## 📦 数据存储架构

### 整体架构图

```
用户注册
  ↓
┌─────────────────────────────────────────────────┐
│  Supabase Authentication (PostgreSQL)          │
│  ├── 账号密码（加密）                            │
│  ├── 邮箱地址                                    │
│  ├── 邮箱验证状态                                │
│  ├── OAuth 登录信息                             │
│  └── user_metadata (自定义数据)                 │
└─────────────────────────────────────────────────┘
  ↓ 用户登录后
┌─────────────────────────────────────────────────┐
│  Turso 数据库 (SQLite)                          │
│  ├── 全局数据库 (demo1)                         │
│  │   └── profiles 表                            │
│  │       ├── 用户名、头像                        │
│  │       ├── 积分、虚拟货币                      │
│  │       ├── 邀请码、UID                        │
│  │       └── 业务数据                           │
│  │                                              │
│  └── 分站数据库 (可选)                          │
│      └── 分站特定数据                            │
└─────────────────────────────────────────────────┘
```

---

## 🔐 Supabase Authentication

### 存储位置

**服务**: Supabase Cloud (PostgreSQL)  
**项目**: 您的 Supabase 项目  
**查看方式**: Supabase Dashboard → Authentication → Users

### 存储内容

#### **1. 基础认证信息**

| 字段 | 说明 | 示例 |
|------|------|------|
| `id` | 用户唯一ID (UUID) | `550e8400-e29b-41d4-a716-446655440000` |
| `email` | 邮箱地址 | `user@example.com` |
| `encrypted_password` | 加密的密码 | `$2a$10$...` |
| `email_confirmed_at` | 邮箱验证时间 | `2025-01-01 10:00:00` |
| `created_at` | 注册时间 | `2025-01-01 09:59:00` |
| `last_sign_in_at` | 最后登录时间 | `2025-01-01 11:00:00` |

#### **2. 用户元数据 (user_metadata)**

注册时传入的自定义数据：

```json
{
  "username": "用户昵称",
  "invited_by": "邀请码",
  "hostname": "注册时的域名"
}
```

**代码位置**: `src/contexts/SupabaseAuthContext.jsx`

```javascript
const signUp = async (email, password, options) => {
  await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        hostname: window.location.hostname,
        // 其他自定义数据
      }
    }
  });
};
```

### 查看方法

#### **方式 1: Supabase Dashboard**

```
1. 访问 https://supabase.com/dashboard
2. 选择您的项目
3. Authentication → Users
4. 查看所有注册用户
```

#### **方式 2: SQL 查询**

```sql
-- 在 Supabase SQL Editor 执行
SELECT 
  id,
  email,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  last_sign_in_at
FROM auth.users
ORDER BY created_at DESC;
```

**示例输出**:
```
| id       | email           | email_confirmed_at  | created_at          |
|----------|-----------------|---------------------|---------------------|
| uuid-1   | admin@test.com  | 2025-01-01 10:00:00 | 2025-01-01 09:59:00 |
| uuid-2   | user@test.com   | 2025-01-02 11:00:00 | 2025-01-02 10:59:00 |
```

---

## 💾 Turso 数据库

### 存储位置

**服务**: Turso (LibSQL/SQLite)  
**数据库**: `demo1` (全局数据库)  
**连接信息**: 环境变量 `TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN`

### 数据库结构

#### **全局数据库 (demo1)**

```
demo1 (tenant_id = 0)
├── profiles (用户资料表) ⭐
├── posts (帖子表)
├── comments (评论表)
├── invitations (邀请记录)
├── points_history (积分历史)
├── admin_users (超级管理员表)
├── tenant_admins (租户管理员表)
└── ... (其他业务表)
```

### profiles 表结构

#### **完整字段说明**

```sql
CREATE TABLE profiles (
  -- 主键
  id TEXT PRIMARY KEY,              -- Supabase User ID (来自 auth.users.id)
  
  -- 基础信息
  username TEXT,                    -- 用户名
  avatar_url TEXT,                  -- 头像 URL
  
  -- 租户信息
  tenant_id INTEGER DEFAULT 0,      -- 租户 ID (0 = 全局，其他 = 分站)
  
  -- 积分系统
  points INTEGER DEFAULT 0,         -- 积分（全局共享）
  virtual_currency INTEGER DEFAULT 0, -- 虚拟货币
  invitation_points INTEGER DEFAULT 0, -- 邀请积分
  free_posts_count INTEGER DEFAULT 0,  -- 免费发帖次数
  
  -- 唯一标识
  uid TEXT,                         -- 8位数字 UID
  invite_code TEXT,                 -- 邀请码
  
  -- 时间戳
  created_at TEXT                   -- 创建时间 (ISO 8601)
);
```

#### **字段详解**

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `id` | TEXT | ✅ 是 | Supabase 用户 ID | `550e8400-...` |
| `username` | TEXT | ❌ 否 | 用户名 | `用户123` |
| `avatar_url` | TEXT | ❌ 否 | 头像地址 | `https://...` |
| `tenant_id` | INTEGER | ✅ 是 | 租户 ID | `0` (全局) |
| `points` | INTEGER | ✅ 是 | 积分 | `100` |
| `virtual_currency` | INTEGER | ✅ 是 | 虚拟货币 | `50` |
| `invitation_points` | INTEGER | ✅ 是 | 邀请积分 | `20` |
| `free_posts_count` | INTEGER | ✅ 是 | 免费发帖数 | `5` |
| `uid` | TEXT | ❌ 否 | 8位数字 UID | `12345678` |
| `invite_code` | TEXT | ❌ 否 | 邀请码 | `ABC123` |
| `created_at` | TEXT | ❌ 否 | 创建时间 | `2025-01-01T10:00:00.000Z` |

### 查看方法

#### **方式 1: Turso CLI**

```bash
# 连接到数据库
turso db shell demo1

# 查询所有用户
SELECT id, username, points, created_at FROM profiles ORDER BY created_at DESC;

# 查询特定用户
SELECT * FROM profiles WHERE id = 'your-user-id';

# 统计用户数
SELECT COUNT(*) FROM profiles;
```

#### **方式 2: Turso Dashboard**

```
1. 访问 https://turso.tech/dashboard
2. 选择 demo1 数据库
3. 使用 SQL Editor 查询
```

#### **方式 3: API 查询**

```javascript
// 后端代码
import { getGlobalDb } from './server/tursoApi.js';
import { profiles } from './server/drizzle/schema.js';

const globalDb = getGlobalDb();
const users = await globalDb.select().from(profiles).limit(10);
console.log(users);
```

---

## 🔄 数据同步流程

### 注册到存储的完整流程

```
步骤 1: 用户填写注册表单
  ↓
步骤 2: 前端调用 signUp
  ↓
步骤 3: Supabase 创建账号
  ├─ 存储到 auth.users 表 ✅
  ├─ 加密密码
  └─ 设置 email_confirmed_at = NULL (未验证)
  ↓
步骤 4: Supabase 发送验证邮件
  ↓
步骤 5: 用户点击验证链接
  ↓
步骤 6: 邮箱验证成功
  └─ 更新 email_confirmed_at ✅
  ↓
步骤 7: 用户登录网站
  ↓
步骤 8: 前端调用 GET /api/profile?ensure=true
  ↓
步骤 9: 后端检查 Turso profiles 表
  ├─ 如果存在 → 返回数据
  └─ 如果不存在 → 创建 profile ✅
  ↓
步骤 10: Turso 存储用户 profile
  └─ 插入到 profiles 表 ✅
```

### 关键代码

**创建 profile 的代码**: `server/index.js` → GET /api/profile

```javascript
app.get('/api/profile', async (c) => {
  const userId = c.get('userId');
  const ensure = c.req.query('ensure') === 'true';
  
  const globalDb = getGlobalDb();
  
  // 检查是否已存在
  let rowsGlobal = await globalDb
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  
  // 如果不存在且 ensure=true，则创建
  if (ensure && (!rowsGlobal || rowsGlobal.length === 0)) {
    await globalDb.insert(profiles).values({
      id: userId,
      username: '用户',
      tenantId: 0,
      points: 0,
      virtualCurrency: 0,
      invitationPoints: 0,
      freePostsCount: 0,
      createdAt: new Date().toISOString()
    });
    
    // 重新查询
    rowsGlobal = await globalDb
      .select()
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
  }
  
  return c.json(rowsGlobal[0] || null);
});
```

---

## 📍 数据存储位置总结

### 注册成功的用户数据分布

| 数据类型 | 存储位置 | 数据库 | 表名 | 触发时机 |
|---------|---------|--------|------|----------|
| **账号密码** | Supabase | PostgreSQL | `auth.users` | 注册时 |
| **邮箱地址** | Supabase | PostgreSQL | `auth.users` | 注册时 |
| **邮箱验证状态** | Supabase | PostgreSQL | `auth.users.email_confirmed_at` | 点击验证链接时 |
| **用户名** | Turso | demo1 | `profiles.username` | 首次登录时 |
| **头像** | Turso | demo1 | `profiles.avatar_url` | 首次登录时 |
| **积分** | Turso | demo1 | `profiles.points` | 首次登录时 |
| **UID** | Turso | demo1 | `profiles.uid` | 首次登录时 |
| **邀请码** | Turso | demo1 | `profiles.invite_code` | 首次登录时 |

### 为什么分两个地方？

```
Supabase Authentication:
✅ 专门的认证服务
✅ 安全的密码加密
✅ OAuth 集成
✅ 邮箱验证
✅ 会话管理
❌ 不适合存储业务数据

Turso 数据库:
✅ 业务数据存储
✅ 积分、虚拟货币
✅ 用户资料
✅ 关系数据查询
❌ 不处理认证
```

---

## 🔍 如何查看用户数据

### 场景 1: 查看某个用户的完整数据

#### **步骤 1: 在 Supabase 查看认证信息**

```
Supabase Dashboard → Authentication → Users → 搜索邮箱

查看:
- User ID
- Email
- Email Confirmed (是否验证)
- Created At (注册时间)
- Last Sign In (最后登录)
```

#### **步骤 2: 在 Turso 查看业务数据**

```bash
turso db shell demo1

SELECT * FROM profiles WHERE id = 'your-user-id';
```

**示例输出**:
```
id: 550e8400-e29b-41d4-a716-446655440000
username: 用户123
avatar_url: https://example.com/avatar.jpg
tenant_id: 0
points: 100
virtual_currency: 50
invitation_points: 20
free_posts_count: 5
uid: 12345678
invite_code: ABC123
created_at: 2025-01-01T10:00:00.000Z
```

### 场景 2: 查看所有注册用户

#### **Supabase (所有账号)**

```sql
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at
FROM auth.users
ORDER BY created_at DESC;
```

#### **Turso (已登录过的用户)**

```bash
turso db shell demo1

SELECT 
  id,
  username,
  points,
  created_at
FROM profiles
ORDER BY created_at DESC;
```

### 场景 3: 统计数据

```bash
# 连接 Turso
turso db shell demo1

# 总用户数
SELECT COUNT(*) as total_users FROM profiles;

# 有积分的用户
SELECT COUNT(*) FROM profiles WHERE points > 0;

# 积分排行榜
SELECT username, points FROM profiles ORDER BY points DESC LIMIT 10;

# 最近注册的用户
SELECT username, created_at FROM profiles ORDER BY created_at DESC LIMIT 10;
```

---

## ⚙️ 环境变量配置

用户数据相关的环境变量：

```bash
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # 后端管理用

# Turso 配置
TURSO_DATABASE_URL=libsql://demo1-xxx.turso.io
TURSO_AUTH_TOKEN=eyJ...
```

---

## 🎯 常见问题

### Q1: 为什么 Supabase 有用户，但 Turso 没有？

**答**: Profile 只在用户**首次登录**时创建。

**解决**:
1. 让用户登录网站
2. 或运行同步脚本: `node tools/sync-supabase-users.js`

---

### Q2: 用户数据在哪个数据库？

**答**: 
- **认证数据**: Supabase (PostgreSQL)
- **业务数据**: Turso demo1 数据库

---

### Q3: 积分数据存在哪里？

**答**: Turso demo1 → profiles 表 → points 字段

**全局共享**:
- 主站和分站共享同一个积分
- 在任何站点获得的积分都会同步

---

### Q4: 如何修改用户积分？

```bash
# 连接 Turso
turso db shell demo1

# 更新积分
UPDATE profiles SET points = 1000 WHERE id = 'user-id';

# 或通过 API
PUT /api/admin/users/{id}
{
  "points": 1000
}
```

---

### Q5: 删除用户后数据在哪？

**需要两个地方都删除**:

```sql
-- 1. Supabase (使用 Dashboard 或 API)
DELETE FROM auth.users WHERE id = 'user-id';

-- 2. Turso
DELETE FROM profiles WHERE id = 'user-id';
```

---

## 📚 相关文档

- [用户注册问题排查](./USER_REGISTRATION_TROUBLESHOOTING.md)
- [项目完整文档](./PROJECT_DOCUMENTATION.md)
- [数据库设计](./PROJECT_DOCUMENTATION.md#数据库设计)

---

## 🛠️ 管理工具

### 1. 用户同步脚本

```bash
# 同步 Supabase 用户到 Turso
node tools/sync-supabase-users.js
```

### 2. Turso CLI

```bash
# 查看所有数据库
turso db list

# 连接数据库
turso db shell demo1

# 查询用户
SELECT * FROM profiles;
```

### 3. Supabase Dashboard

```
https://supabase.com/dashboard
→ Authentication → Users
```

---

**最后更新**: 2025-10-07 | **版本**: v1.0.0

