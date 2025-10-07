# 🔧 用户注册问题排查指南

> 邮箱注册、验证邮件、Turso 数据同步问题完整排查
> 最后更新: 2025-10-07
> 版本: v1.0.0

---

## 📋 问题症状

### 问题 1: 邮箱注册收不到验证邮件 ❌
- 用户使用邮箱注册
- 提示"注册成功，请检查邮箱"
- 但收件箱、垃圾邮件都没有验证邮件

### 问题 2: Turso 数据库缺少用户数据 ❌
- Supabase Authentication → Users 能看到注册的用户
- Turso `demo1` 数据库 → `user` 表只有管理员
- 新注册的用户没有同步到 Turso

---

## 🔍 问题分析

### 问题 1 根本原因: Supabase 邮件配置

**Supabase 默认行为**:
```
开发环境 (localhost):
✅ 显示验证链接在控制台
❌ 不发送真实邮件

生产环境 (vercel.app):
❌ 使用 Supabase 默认SMTP（有限额）
❌ 邮件可能被拦截或进垃圾邮件
```

**需要配置**:
1. 自定义 SMTP 服务器
2. 或使用第三方邮件服务（如 SendGrid, AWS SES）

---

### 问题 2 根本原因: 用户数据同步机制

**当前同步流程**:
```
1. 用户注册 Supabase
   ↓
2. Supabase 发送验证邮件
   ↓
3. 用户点击邮件链接验证
   ↓
4. 用户登录网站
   ↓
5. 前端调用 GET /api/profile?ensure=true
   ↓
6. 后端自动创建 Turso profile ✅
```

**问题**:
```
如果收不到验证邮件
→ 用户无法验证邮箱
→ 用户无法登录
→ 无法调用 /api/profile
→ Turso 不会创建 profile ❌
```

---

## ✅ 解决方案

### 方案 A: 配置 Supabase 邮件服务（推荐）

#### 步骤 1: 登录 Supabase Dashboard

```
https://supabase.com/dashboard
→ 选择您的项目
→ Authentication → Email Templates
```

#### 步骤 2: 配置 SMTP

**选项 1: 使用 SendGrid（推荐）**

1. 注册 SendGrid 账号: https://sendgrid.com
2. 创建 API Key
3. 在 Supabase 配置:

```
Settings → Authentication → SMTP Settings

SMTP Host: smtp.sendgrid.net
SMTP Port: 587
SMTP Username: apikey
SMTP Password: <您的 SendGrid API Key>
From Email: noreply@yourdomain.com
From Name: 您的网站名称
```

**选项 2: 使用 Gmail SMTP**

```
SMTP Host: smtp.gmail.com
SMTP Port: 587
SMTP Username: your-email@gmail.com
SMTP Password: <应用专用密码>
From Email: your-email@gmail.com

注意: 需要在 Gmail 设置中启用「两步验证」并生成「应用专用密码」
```

**选项 3: 使用 AWS SES**

```
SMTP Host: email-smtp.us-east-1.amazonaws.com
SMTP Port: 587
SMTP Username: <AWS SES SMTP 用户名>
SMTP Password: <AWS SES SMTP 密码>
From Email: <已验证的发件地址>
```

#### 步骤 3: 自定义邮件模板

```
Authentication → Email Templates → Confirm Signup

Subject: 验证您的邮箱

Body:
<h2>欢迎注册 {{ .SiteName }}!</h2>
<p>请点击下面的链接验证您的邮箱：</p>
<p><a href="{{ .ConfirmationURL }}">验证邮箱</a></p>
<p>如果您没有注册账号，请忽略此邮件。</p>
```

#### 步骤 4: 测试

```
1. 注册新账号
2. 检查邮箱（包括垃圾邮件文件夹）
3. 应该收到验证邮件
```

---

### 方案 B: 禁用邮箱验证（仅开发环境）⚠️

**警告**: 仅用于开发测试，生产环境必须启用验证！

#### 在 Supabase Dashboard 配置:

```
Authentication → Settings → Email Auth

取消勾选:
☐ Enable email confirmations
```

**效果**:
- ✅ 注册后立即可登录
- ✅ 无需验证邮箱
- ⚠️ 安全风险：任何人都可以注册

---

### 方案 C: 手动验证用户（临时解决）

#### 在 Supabase Dashboard 手动验证:

```
1. Authentication → Users
2. 找到未验证的用户
3. 点击用户
4. 点击「Confirm email」
5. 用户即可登录
```

---

## 🔧 Turso 用户同步问题解决

### 当前机制

代码位置: `server/index.js` → GET /api/profile

```javascript
// 当用户首次访问时自动创建 profile
app.get('/api/profile', async (c) => {
  const userId = c.get('userId');
  const ensure = c.req.query('ensure') === 'true';
  
  if (ensure && isSelf && (!rowsGlobal || rowsGlobal.length === 0)) {
    // 自动创建全局 profile
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
  }
});
```

### 为什么只有管理员？

**原因分析**:
```
1. 管理员账号是手动创建的
   → 直接在数据库插入 profile ✅

2. 普通用户注册流程:
   Supabase 注册 → 收不到邮件 → 无法验证 → 无法登录 → 不调用 API → 没创建 profile ❌
```

### 验证方法

#### 方法 1: 检查用户是否验证邮箱

```sql
-- 在 Supabase SQL Editor 执行
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at
FROM auth.users
ORDER BY created_at DESC;
```

**正常情况**:
```
| id      | email           | email_confirmed_at      | created_at              |
|---------|-----------------|-------------------------|-------------------------|
| uuid-1  | admin@test.com  | 2025-01-01 10:00:00     | 2025-01-01 09:59:00     |
| uuid-2  | user@test.com   | 2025-01-02 11:00:00     | 2025-01-02 10:59:00     |
```

**异常情况**:
```
| id      | email           | email_confirmed_at      | created_at              |
|---------|-----------------|-------------------------|-------------------------|
| uuid-1  | admin@test.com  | 2025-01-01 10:00:00     | 2025-01-01 09:59:00     |
| uuid-2  | user@test.com   | NULL                    | 2025-01-02 10:59:00     | ← 未验证
```

#### 方法 2: 手动触发 profile 创建

**方式 A: 前端触发**
```
1. 手动验证用户邮箱（Supabase Dashboard）
2. 用户登录网站
3. 访问任意需要登录的页面
4. 前端自动调用 GET /api/profile?ensure=true
5. 后端创建 profile ✅
```

**方式 B: 后端脚本**

创建迁移脚本:
```javascript
// tools/sync-users-to-turso.js
import { getGlobalDb } from '../server/tursoApi.js';
import { profiles } from '../server/drizzle/schema.js';

// 从 Supabase 获取所有已验证用户
const supabaseUsers = await supabase.auth.admin.listUsers();

const globalDb = getGlobalDb();

for (const user of supabaseUsers.data.users) {
  if (user.email_confirmed_at) {
    // 检查是否已存在
    const existing = await globalDb
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    
    if (!existing || existing.length === 0) {
      // 创建 profile
      await globalDb.insert(profiles).values({
        id: user.id,
        username: user.user_metadata?.username || '用户',
        tenantId: 0,
        points: 0,
        virtualCurrency: 0,
        invitationPoints: 0,
        freePostsCount: 0,
        createdAt: user.created_at
      });
      
      console.log(`✅ Created profile for ${user.email}`);
    }
  }
}
```

---

## 🎯 完整解决步骤

### 步骤 1: 修复邮件发送

**推荐方案: SendGrid**

1. 注册 SendGrid: https://sendgrid.com
2. 创建 API Key (Settings → API Keys)
3. 配置 Supabase SMTP:
   ```
   Dashboard → Authentication → SMTP Settings
   
   SMTP Host: smtp.sendgrid.net
   SMTP Port: 587
   Username: apikey
   Password: <你的 SendGrid API Key>
   From Email: noreply@yourdomain.com
   ```
4. 保存配置

### 步骤 2: 验证现有用户

```
Supabase Dashboard → Authentication → Users
→ 选择未验证的用户
→ 点击「Confirm email」
```

### 步骤 3: 让用户登录

```
1. 已验证的用户登录网站
2. 访问 /dashboard 或任意页面
3. 自动调用 GET /api/profile?ensure=true
4. 后端创建 Turso profile
```

### 步骤 4: 验证同步

**检查 Turso 数据库**:
```sql
-- 连接到 Turso
turso db shell demo1

-- 查询 profiles
SELECT id, username, created_at FROM profiles ORDER BY created_at DESC;
```

**预期结果**:
```
| id      | username | created_at              |
|---------|----------|-------------------------|
| uuid-1  | 管理员    | 2025-01-01 10:00:00     |
| uuid-2  | 用户     | 2025-01-02 11:00:00     | ← 新用户
```

---

## 📊 数据流程图

### 正常流程 ✅

```
用户注册
  ↓
Supabase 创建账号
  ↓
发送验证邮件 (SendGrid) ✅
  ↓
用户收到邮件
  ↓
点击验证链接
  ↓
邮箱验证成功
  ↓
用户登录网站
  ↓
前端调用 GET /api/profile?ensure=true
  ↓
后端检测 Turso 无 profile
  ↓
自动创建 profile ✅
  ↓
返回用户数据
```

### 当前异常流程 ❌

```
用户注册
  ↓
Supabase 创建账号
  ↓
尝试发送验证邮件 ❌ (SMTP 未配置)
  ↓
用户收不到邮件 ❌
  ↓
无法验证邮箱
  ↓
无法登录
  ↓
无法调用 API
  ↓
Turso 没有 profile ❌
```

---

## 🔍 调试清单

### Supabase 检查
- [ ] Authentication → Users 能看到注册的用户
- [ ] 用户的 `email_confirmed_at` 字段有值（已验证）
- [ ] Authentication → SMTP Settings 已配置
- [ ] SMTP 配置测试成功

### Turso 检查
- [ ] 连接到 `demo1` 数据库成功
- [ ] `profiles` 表存在
- [ ] 管理员 profile 存在
- [ ] 新用户 profile 不存在（问题）

### 前端检查
- [ ] 用户可以注册（不报错）
- [ ] 显示"请检查邮箱"提示
- [ ] 用户无法登录（邮箱未验证）

### 后端检查
- [ ] GET /api/profile 接口正常
- [ ] 日志显示 ensure=true 时创建 profile
- [ ] Turso 连接正常

---

## ⚠️ 常见错误

### 错误 1: SMTP 认证失败

```
Error: SMTP authentication failed
```

**原因**: SMTP 用户名/密码错误

**解决**:
- SendGrid: 用户名必须是 `apikey`
- Gmail: 必须使用应用专用密码，不是 Gmail 登录密码

---

### 错误 2: 邮件进垃圾邮件

```
邮件发送成功，但用户收不到
```

**原因**: 
- 发件地址未验证
- SPF/DKIM 未配置

**解决**:
1. SendGrid: 验证发件域名
2. 添加 SPF 记录到 DNS
3. 测试发送到多个邮箱服务（Gmail, Outlook, QQ邮箱）

---

### 错误 3: Profile 未同步

```
用户已登录，但 Turso 仍无 profile
```

**原因**: 前端未调用 ensure=true

**解决**:
```javascript
// 确保登录后调用
useEffect(() => {
  if (user?.id) {
    fetch('/api/profile?ensure=true');
  }
}, [user]);
```

---

## 📚 相关文档

- [Supabase SMTP 文档](https://supabase.com/docs/guides/auth/auth-smtp)
- [SendGrid 快速开始](https://docs.sendgrid.com/for-developers/sending-email/quickstart-nodejs)
- [项目完整文档](./PROJECT_DOCUMENTATION.md)

---

## 🆘 获取帮助

如果问题仍未解决：

1. 检查 Supabase Dashboard → Logs
2. 检查 Render 后端日志
3. 检查浏览器 Console
4. 提供具体错误信息

---

**最后更新**: 2025-10-07 | **版本**: v1.0.0

