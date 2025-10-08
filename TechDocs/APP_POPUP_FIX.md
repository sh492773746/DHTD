# 🔧 应用弹窗功能修复报告

## 📋 问题概述

用户报告在访问 `/admin/popups` 应用弹窗管理页面时，提示 **"加载失败 Unauthorized"**。

---

## 🔍 问题诊断

### 使用的工具

通过 **Render MCP 工具**检索后端日志，发现以下错误：

```
GET /api/popups error: TypeError: Cannot read properties of undefined (reading 'select')
```

**时间戳**: `2025-10-08T18:10:23.454446244Z`

---

### 根本原因

1. **数据库连接错误**
   - 弹窗 API 错误地使用了 `c.get('db')`
   - 但 `db` 对象并未在中间件中设置
   - 导致 `db` 为 `undefined`

2. **权限检查错误**
   - 使用了不存在的 `c.get('user')`
   - 使用了错误的函数 `checkSuperAdmin()`
   - 正确的应该是 `c.get('userId')` 和 `isSuperAdminUser()`

---

## 🛠️ 修复内容

### 1. 修复数据库连接

#### 错误的代码 ❌

```javascript
app.get('/api/popups', async (c) => {
  const db = c.get('db');           // ❌ undefined
  const tenantId = c.get('tenantId'); // ❌ undefined
  // ...
});
```

#### 正确的代码 ✅

```javascript
app.get('/api/popups', async (c) => {
  // 1. 获取默认数据库
  const defaultDb = await getTursoClientForTenant(0);
  
  // 2. 解析当前租户 ID
  const host = c.get('host').split(':')[0];
  const tenantId = await resolveTenantId(defaultDb, host);
  
  // 3. 获取租户专属数据库连接
  const db = await getTursoClientForTenant(tenantId);
  // ...
});
```

---

### 2. 修复权限检查

#### 错误的代码 ❌

```javascript
const user = c.get('user');  // ❌ user 不存在
const isSuperAdmin = await checkSuperAdmin(user.id, c.get('token')); // ❌ 函数错误
```

#### 正确的代码 ✅

```javascript
// 1. 从中间件获取 userId
const userId = c.get('userId');  // ✅ 中间件设置的 userId

// 2. 检查是否登录
if (!userId) return c.json({ error: 'Unauthorized' }, 401);

// 3. 检查是否为超级管理员
const isSuper = await isSuperAdminUser(userId);  // ✅ 使用正确的函数
if (!isSuper) return c.json({ error: 'Forbidden - Super admin only' }, 403);
```

---

## 📝 修复的 API 路由

### 1. 公开 API

✅ **`GET /api/popups`** - 获取启用的弹窗列表
- 修复：数据库连接
- 修复：租户 ID 解析

---

### 2. 管理员 API（需要超级管理员权限）

✅ **`GET /api/admin/popups`** - 获取所有弹窗
- 修复：数据库连接
- 修复：权限检查
- 修复：租户 ID 解析

✅ **`POST /api/admin/popups`** - 创建弹窗
- 修复：数据库连接
- 修复：权限检查
- 修复：租户 ID 解析

✅ **`PUT /api/admin/popups/:id`** - 更新弹窗
- 修复：数据库连接
- 修复：权限检查
- 修复：租户 ID 解析

✅ **`DELETE /api/admin/popups/:id`** - 删除弹窗
- 修复：数据库连接
- 修复：权限检查
- 修复：租户 ID 解析

---

## 🎯 修复前后对比

### 修复前

```javascript
// ❌ 错误的实现
app.get('/api/admin/popups', async (c) => {
  const user = c.get('user');              // undefined
  const db = c.get('db');                  // undefined
  const tenantId = c.get('tenantId');      // undefined
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);  // 总是返回 401
  }
  
  const isSuperAdmin = await checkSuperAdmin(user.id);  // 函数不存在
  // ...
});
```

**结果**: 提示 "加载失败 Unauthorized"

---

### 修复后

```javascript
// ✅ 正确的实现
app.get('/api/admin/popups', async (c) => {
  // 1. 获取 userId（中间件已设置）
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  // 2. 检查超级管理员权限
  const isSuper = await isSuperAdminUser(userId);
  if (!isSuper) {
    return c.json({ error: 'Forbidden - Super admin only' }, 403);
  }
  
  // 3. 获取数据库连接
  const defaultDb = await getTursoClientForTenant(0);
  const host = c.get('host').split(':')[0];
  const tenantId = await resolveTenantId(defaultDb, host);
  const db = await getTursoClientForTenant(tenantId);
  
  // 4. 查询数据
  const popups = await db.select()
    .from(appPopups)
    .where(eq(appPopups.tenantId, tenantId))
    .orderBy(appPopups.order);
  
  return c.json(popups);
});
```

**结果**: 正常返回弹窗列表 ✅

---

## 📊 技术细节

### 中间件设置的上下文

项目的认证中间件（`server/index.js:452`）设置了以下上下文：

```javascript
app.use('*', async (c, next) => {
  // 设置 host
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || '';
  c.set('host', host);

  // 设置 userId（通过 JWT 验证）
  const auth = c.req.header('authorization');
  // ... JWT 验证逻辑 ...
  c.set('userId', userId);
  
  await next();
});
```

**可用的上下文**:
- ✅ `c.get('host')` - 请求的主机名
- ✅ `c.get('userId')` - 当前用户 ID（如果已登录）

**不可用的上下文**:
- ❌ `c.get('db')` - 未设置
- ❌ `c.get('tenantId')` - 未设置
- ❌ `c.get('user')` - 未设置
- ❌ `c.get('token')` - 未设置

---

### 正确的数据库连接模式

参考其他 API 的实现（如 `/api/admin/page-content`）：

```javascript
// 1. 获取默认数据库（用于查询租户信息）
const defaultDb = await getTursoClientForTenant(0);

// 2. 解析当前租户 ID
const host = c.get('host').split(':')[0];
const tenantId = await resolveTenantId(defaultDb, host);

// 3. 获取租户专属数据库连接
const db = await getTursoClientForTenant(tenantId);
```

---

### 正确的权限检查模式

参考其他管理员 API 的实现：

```javascript
// 1. 获取 userId
const userId = c.get('userId');

// 2. 检查是否登录
if (!userId) return c.json({ error: 'unauthorized' }, 401);

// 3. 检查是否为超级管理员
const isSuper = await isSuperAdminUser(userId);
if (!isSuper) return c.json({ error: 'forbidden' }, 403);
```

**可用的权限检查函数**:
- ✅ `isSuperAdminUser(userId)` - 检查超级管理员
- ✅ `canManageTenant(userId, tenantId)` - 检查租户管理员

**不可用的函数**:
- ❌ `checkSuperAdmin()` - 不存在

---

## ✅ 修复验证

修复后应该满足以下条件：

### 1. 公开 API

```bash
# 测试公开 API
curl https://dhtd.onrender.com/api/popups

# 预期结果：返回启用的弹窗列表（可能是空数组）
[]
```

---

### 2. 管理员 API（未登录）

```bash
# 未登录访问管理员 API
curl https://dhtd.onrender.com/api/admin/popups

# 预期结果：返回 401 Unauthorized
{"error":"unauthorized"}
```

---

### 3. 管理员 API（超级管理员）

```bash
# 超级管理员访问
curl -H "Authorization: Bearer <超级管理员token>" \
  https://dhtd.onrender.com/api/admin/popups

# 预期结果：返回所有弹窗列表
[...]
```

---

### 4. 前端页面

访问 `https://你的域名/admin/popups`：

✅ 超级管理员：看到弹窗管理页面  
❌ 普通用户：无权访问（403）  
❌ 未登录：跳转到登录页

---

## 🚀 部署信息

### Git Commit

```
Commit: 17ba678e424dbfcb1b27d886ec9bf7c0e605be83
Message: fix: 修复弹窗 API 数据库连接问题 🔧
Time: 2025-10-08T18:17:15Z
```

### Render 部署

```
Deploy ID: dep-d3jalbjuibrs73e40u50
Status: build_in_progress → live
Service: srv-d36ni7mmcj7s73domhd0 (DHTD)
```

---

## 📚 相关文档

- [APP_POPUP_GUIDE.md](./APP_POPUP_GUIDE.md) - 应用弹窗功能使用指南
- [INDEX.md](./INDEX.md) - 技术文档索引

---

## 🎓 经验总结

### 1. 中间件上下文检查

在使用 `c.get()` 获取上下文时，应该先确认中间件是否设置了该值。

**建议**:
```javascript
// ❌ 不要假设中间件设置了所有值
const db = c.get('db');

// ✅ 查看中间件代码，确认可用的上下文
const userId = c.get('userId');  // 中间件确实设置了
```

---

### 2. 参考现有 API

在添加新 API 时，应该参考现有 API 的实现模式。

**建议**:
```javascript
// 1. 搜索类似的 API
grep -n "app.get('/api/admin/" server/index.js

// 2. 查看它们如何获取数据库连接
// 3. 查看它们如何检查权限
// 4. 复制相同的模式
```

---

### 3. 使用 Render MCP 工具调试

Render MCP 工具非常强大，可以快速定位问题。

**使用步骤**:
1. `mcp_render_list_workspaces` - 列出工作区
2. `mcp_render_list_services` - 列出服务
3. `mcp_render_list_logs` - 检索错误日志
4. `mcp_render_get_deploy` - 查看部署状态

---

### 4. 错误提示优化

前端显示 "加载失败 Unauthorized"，但实际错误是数据库连接问题。

**建议**:
- 后端返回更详细的错误信息（开发环境）
- 前端捕获并记录完整错误
- 使用 `console.error` 输出详细错误

---

## 🔜 后续建议

1. **添加单元测试**
   - 测试数据库连接逻辑
   - 测试权限检查逻辑
   - 避免类似问题再次出现

2. **添加 API 文档**
   - 记录所有 API 路由
   - 说明需要的权限
   - 提供请求/响应示例

3. **统一中间件模式**
   - 考虑在中间件中设置 `db` 和 `tenantId`
   - 或者创建统一的获取数据库连接的辅助函数

---

**版本**: v1.26.2  
**修复时间**: 2025-10-08  
**状态**: ✅ 已修复并部署

