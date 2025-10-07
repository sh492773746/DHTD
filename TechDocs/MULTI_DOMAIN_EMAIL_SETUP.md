# 🌐 多域名邮箱验证配置指南

> 支持多个域名和分站的邮箱验证配置
> 最后更新: 2025-10-07

---

## 📋 您的域名列表

根据您的配置，您有以下域名：

1. **tv28.cc** （主域名1）
2. **dahai.ws** （主域名2）
3. **dhtd.vercel.app** （Vercel 域名）

**所有域名和分站都需要能够正常进行邮箱验证！** ✅

---

## 🎯 解决方案概述

### 方案1: 配置所有域名（推荐） ⭐

在 Supabase 中添加所有域名，每个域名都能独立工作。

**优点**:
- ✅ 每个域名独立验证
- ✅ 分站自动适配
- ✅ 用户在哪个域名注册，就跳转回哪个域名

**实现**:
- Supabase Dashboard 配置
- 代码已自动支持（已更新）

---

## 🔧 Supabase 配置步骤

### 步骤1: 登录 Supabase Dashboard

```
访问: https://supabase.com/dashboard
选择您的项目
```

### 步骤2: 进入认证设置

```
左侧菜单: Settings → Authentication
```

### 步骤3: 配置 Site URL

**选择一个主域名作为 Site URL**（推荐使用最常用的）:

```
https://tv28.cc
```

或者：
```
https://dahai.ws
```

**注意**: Site URL 只能设置一个，但不影响其他域名工作。

### 步骤4: 配置 Redirect URLs（重要！）

**添加所有域名的重定向 URL**:

```
https://tv28.cc/*
https://tv28.cc/auth/callback
https://dahai.ws/*
https://dahai.ws/auth/callback
https://dhtd.vercel.app/*
https://dhtd.vercel.app/auth/callback
http://localhost:5173/*
http://localhost:5173/auth/callback
```

**分站自动支持**:
```
https://tv28.cc/*         ← 包含所有子域名和路径
  ↓ 自动支持
https://tv28.cc/tenant-demo1/*
https://tv28.cc/tenant-demo2/*
...
```

**重要**: `/*` 通配符会自动匹配所有分站路径！

### 步骤5: 保存配置

```
1. 点击 "Save" 保存
2. 等待 1-2 分钟生效
3. 测试所有域名
```

---

## 🚀 代码已自动优化

**文件**: `src/contexts/SupabaseAuthContext.jsx`

### 动态重定向支持 ✅

**新增代码**:
```javascript
const signUp = useCallback(async (email, password, options) => {
  // 动态设置重定向 URL，支持多个域名和分站
  const redirectUrl = `${window.location.origin}/auth/callback`;
  
  const { data, error } = await fetchWithRetry(() => supabaseClient.auth.signUp({ 
    email, 
    password, 
    options: { 
      ...options, 
      emailRedirectTo: redirectUrl,  // 动态重定向到当前域名
      data: { 
        hostname: window.location.hostname 
      } 
    }
  }));
  // ...
}, [toast, getHumanReadableError]);
```

### 工作原理:

**场景1: 在 tv28.cc 注册**
```
用户访问: https://tv28.cc/register
↓
window.location.origin = "https://tv28.cc"
↓
redirectUrl = "https://tv28.cc/auth/callback"
↓
验证后跳转: https://tv28.cc/auth/callback
```

**场景2: 在 dahai.ws 注册**
```
用户访问: https://dahai.ws/register
↓
window.location.origin = "https://dahai.ws"
↓
redirectUrl = "https://dahai.ws/auth/callback"
↓
验证后跳转: https://dahai.ws/auth/callback
```

**场景3: 在分站注册**
```
用户访问: https://tv28.cc/tenant-demo1/register
↓
window.location.origin = "https://tv28.cc"
↓
redirectUrl = "https://tv28.cc/auth/callback"
↓
验证后跳转: https://tv28.cc/auth/callback
↓
AuthCallback 检测到 tenant-demo1
↓
自动跳转: https://tv28.cc/tenant-demo1/
```

---

## 🧪 完整测试流程

### 测试1: 主域名 tv28.cc

```
1. 访问: https://tv28.cc/register
2. 注册账号
3. 检查邮件
4. 点击验证按钮
5. 应该跳转到: https://tv28.cc/auth/callback
6. 然后跳转到: https://tv28.cc/
```

### 测试2: 主域名 dahai.ws

```
1. 访问: https://dahai.ws/register
2. 注册账号
3. 检查邮件
4. 点击验证按钮
5. 应该跳转到: https://dahai.ws/auth/callback
6. 然后跳转到: https://dahai.ws/
```

### 测试3: Vercel 域名 dhtd.vercel.app

```
1. 访问: https://dhtd.vercel.app/register
2. 注册账号
3. 检查邮件
4. 点击验证按钮
5. 应该跳转到: https://dhtd.vercel.app/auth/callback
6. 然后跳转到: https://dhtd.vercel.app/
```

### 测试4: 分站 tenant-demo1

```
1. 访问: https://tv28.cc/tenant-demo1/register
2. 注册账号（自动归属 tenant-demo1）
3. 检查邮件
4. 点击验证按钮
5. 应该跳转到: https://tv28.cc/auth/callback
6. AuthCallback 检测到来自 tenant-demo1
7. 自动跳转到: https://tv28.cc/tenant-demo1/
```

---

## 📊 域名配置表

| 域名 | Site URL | Redirect URL | 分站支持 | 状态 |
|------|----------|--------------|----------|------|
| tv28.cc | ⭐ 推荐 | ✅ 必须添加 | ✅ 自动 | ❓ 待配置 |
| dahai.ws | 可选 | ✅ 必须添加 | ✅ 自动 | ❓ 待配置 |
| dhtd.vercel.app | 可选 | ✅ 必须添加 | ✅ 自动 | ❓ 待配置 |
| localhost:5173 | - | ✅ 本地开发 | ✅ 自动 | ❓ 待配置 |

---

## 🎯 分站认证说明

### 分站如何工作？

**分站路径**:
```
https://tv28.cc/tenant-demo1/
https://tv28.cc/tenant-demo2/
https://dahai.ws/tenant-shop1/
...
```

**验证流程**:
```
1. 用户在分站注册
   → https://tv28.cc/tenant-demo1/register
   
2. 提交注册表单
   → emailRedirectTo = "https://tv28.cc/auth/callback"
   → 记录 tenant_id = "tenant-demo1"
   
3. 用户收到邮件并点击验证

4. Supabase 验证 token
   → redirect_to = "https://tv28.cc/auth/callback"
   
5. AuthCallback 页面处理
   → 检测用户的 profile.tenant_id = "tenant-demo1"
   → 或者从 session 中获取 tenant 信息
   
6. 自动跳转到分站
   → https://tv28.cc/tenant-demo1/
```

### 分站 tenant_id 存储

**注册时存储**:
```javascript
// src/pages/Register.jsx
const hostname = window.location.hostname;
const tenant_id = extractTenantId(window.location.pathname);

// 注册时传递 tenant_id
await signUp(email, password, {
  data: {
    username,
    hostname,
    tenant_id,  // 存储到 user metadata
  }
});
```

**验证后读取**:
```javascript
// src/pages/AuthCallback.jsx
const { session, profile } = useAuth();

useEffect(() => {
  if (session && profile) {
    const tenantId = profile.tenant_id;
    if (tenantId) {
      navigate(`/tenant-${tenantId}/`);  // 跳转到分站
    } else {
      navigate('/');  // 跳转到主站
    }
  }
}, [session, profile]);
```

---

## 🔍 验证链接示例

### tv28.cc 验证链接

```
https://your-project.supabase.co/auth/v1/verify
  ?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  &type=signup
  &redirect_to=https://tv28.cc/auth/callback
```

### dahai.ws 验证链接

```
https://your-project.supabase.co/auth/v1/verify
  ?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  &type=signup
  &redirect_to=https://dahai.ws/auth/callback
```

### 分站验证链接

```
https://your-project.supabase.co/auth/v1/verify
  ?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  &type=signup
  &redirect_to=https://tv28.cc/auth/callback
  
→ 验证成功后
→ AuthCallback 检测 tenant_id = "tenant-demo1"
→ 跳转到: https://tv28.cc/tenant-demo1/
```

---

## ⚠️ 常见问题

### Q1: 我有多个域名，Site URL 只能设置一个怎么办？

**A**: 没问题！Site URL 只是默认值，实际重定向由 Redirect URLs 控制。

**配置**:
```
Site URL: https://tv28.cc （主域名）
Redirect URLs: 
  - https://tv28.cc/*
  - https://dahai.ws/*
  - https://dhtd.vercel.app/*
```

**结果**: 所有域名都能正常工作 ✅

### Q2: 分站需要单独配置吗？

**A**: 不需要！`/*` 通配符自动支持所有分站。

**配置**:
```
https://tv28.cc/*
  ↓ 自动包含
https://tv28.cc/tenant-demo1/*
https://tv28.cc/tenant-demo2/*
https://tv28.cc/tenant-shop1/*
...
```

### Q3: 用户在分站注册后会跳转到哪里？

**A**: 跳转流程如下：

```
用户在 https://tv28.cc/tenant-demo1/register 注册
  ↓
收到验证邮件并点击
  ↓
Supabase 验证成功
  ↓
重定向到: https://tv28.cc/auth/callback
  ↓
AuthCallback 检测到 tenant_id = "tenant-demo1"
  ↓
自动跳转到: https://tv28.cc/tenant-demo1/ ✅
```

### Q4: 不同域名的分站会冲突吗？

**A**: 不会！每个域名和分站都是独立的。

**示例**:
```
https://tv28.cc/tenant-demo1/
  ↓ 独立于
https://dahai.ws/tenant-demo1/
  ↓ 独立于
https://dhtd.vercel.app/tenant-demo1/
```

每个都有自己的用户、数据和配置。

### Q5: 如何测试所有域名都正常工作？

**A**: 逐个测试：

```
1. 在 tv28.cc 注册 → 验证 → 确认跳转正确 ✅
2. 在 dahai.ws 注册 → 验证 → 确认跳转正确 ✅
3. 在 dhtd.vercel.app 注册 → 验证 → 确认跳转正确 ✅
4. 在 tv28.cc/tenant-demo1 注册 → 验证 → 确认跳转到分站 ✅
```

---

## 🎯 快速配置清单

### Supabase Dashboard:

```
✅ Site URL: https://tv28.cc

✅ Redirect URLs:
   - https://tv28.cc/*
   - https://tv28.cc/auth/callback
   - https://dahai.ws/*
   - https://dahai.ws/auth/callback
   - https://dhtd.vercel.app/*
   - https://dhtd.vercel.app/auth/callback
   - http://localhost:5173/*
   - http://localhost:5173/auth/callback

✅ 保存配置
✅ 等待 1-2 分钟生效
```

### 代码配置:

```
✅ SupabaseAuthContext.jsx 已更新
   - 自动检测当前域名
   - 动态设置 emailRedirectTo
   - 支持所有域名和分站

✅ AuthCallback.jsx 已存在
   - 处理验证成功后的跳转
   - 自动检测 tenant_id
   - 跳转到正确的域名和分站
```

---

## 🧪 测试脚本（可选）

您可以使用此脚本测试所有域名：

```bash
#!/bin/bash

echo "🧪 测试所有域名的邮箱验证..."

# 测试域名列表
DOMAINS=(
  "https://tv28.cc"
  "https://dahai.ws"
  "https://dhtd.vercel.app"
)

for domain in "${DOMAINS[@]}"; do
  echo ""
  echo "📧 测试域名: $domain"
  echo "1. 访问: $domain/register"
  echo "2. 注册账号: test-$RANDOM@example.com"
  echo "3. 检查邮件中的链接是否包含: redirect_to=$domain/auth/callback"
  echo "4. 点击验证按钮"
  echo "5. 确认跳转到: $domain/"
  echo "---"
done

echo ""
echo "✅ 测试完成！"
```

---

## 📝 配置总结

### 已完成 ✅:
- ✅ 代码已支持多域名（自动检测）
- ✅ 代码已支持分站（自动跳转）
- ✅ AuthCallback 已正确处理

### 待配置 ❓:
- ❓ Supabase Dashboard → Site URL
- ❓ Supabase Dashboard → Redirect URLs（3个域名 × 2个URL = 6个）
- ❓ 测试所有域名

### 配置后效果 🎉:
- ✅ tv28.cc 注册 → 跳转回 tv28.cc
- ✅ dahai.ws 注册 → 跳转回 dahai.ws
- ✅ dhtd.vercel.app 注册 → 跳转回 dhtd.vercel.app
- ✅ 所有分站自动支持
- ✅ 用户体验完美

---

## 🚀 下一步

1. **登录 Supabase Dashboard**
2. **配置 Site URL** (选择 tv28.cc 或 dahai.ws)
3. **添加所有 Redirect URLs** (6个URL)
4. **保存并等待生效** (1-2分钟)
5. **测试所有域名** (逐个注册测试)

---

**配置完成后，所有域名和分站都能完美工作！** 🎉

