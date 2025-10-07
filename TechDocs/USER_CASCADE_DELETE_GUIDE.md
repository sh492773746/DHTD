# 🗑️ 用户级联删除实现指南

> 删除 Supabase 用户时自动删除 Turso 业务数据的完整方案
> 最后更新: 2025-10-07
> 版本: v1.0.0

---

## 🎯 目标

**实现效果**：
```
删除 Supabase Authentication 用户
  ↓
自动触发 Turso 数据删除
  ├─ profiles 表数据
  ├─ posts 表数据（用户发布的帖子）
  ├─ comments 表数据（用户的评论）
  ├─ invitations 表数据（邀请记录）
  └─ 其他关联数据
  ↓
完全删除用户所有数据 ✅
```

---

## 📋 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **方案 1: API 级联删除** | 简单直接、易于控制 | 需要通过 API 删除 | ⭐⭐⭐⭐⭐ |
| **方案 2: Database Webhook** | 自动化、解耦 | 配置复杂、调试困难 | ⭐⭐⭐ |
| **方案 3: Database Function** | 数据库级触发器 | Supabase 限制、维护困难 | ⭐⭐ |

**推荐方案 1**：API 级联删除（最简单、最可靠）

---

## ✅ 方案 1: API 级联删除（推荐）

### 实现原理

```
管理员调用删除 API
  ↓
DELETE /api/admin/users/:id
  ↓
步骤 1: 验证权限（仅超级管理员）
  ↓
步骤 2: 删除 Turso 数据
  ├─ profiles
  ├─ posts
  ├─ comments
  ├─ invitations
  └─ points_history
  ↓
步骤 3: 删除 Supabase 用户
  └─ 使用 Admin API
  ↓
返回删除结果 ✅
```

### 后端实现

**文件**: `server/index.js`

```javascript
// 删除用户（级联删除）
app.delete('/api/admin/users/:id', async (c) => {
  try {
    const actorId = c.get('userId');
    if (!actorId) return c.json({ error: 'unauthorized' }, 401);
    
    // 仅超级管理员可删除
    const isActorSuper = await isSuperAdminUser(actorId);
    if (!isActorSuper) return c.json({ error: 'forbidden' }, 403);
    
    const targetUserId = c.req.param('id');
    if (!targetUserId) return c.json({ error: 'invalid' }, 400);
    
    // 防止删除自己
    if (targetUserId === actorId) {
      return c.json({ error: 'cannot-delete-self' }, 400);
    }
    
    const gdb = getGlobalDb();
    const deletedData = {
      profiles: 0,
      posts: 0,
      comments: 0,
      invitations: 0,
      points_history: 0,
      admin_roles: 0,
    };
    
    // === 步骤 1: 删除 Turso 数据 ===
    
    // 1.1 删除管理员角色
    try {
      const adminDeleted = await gdb
        .delete(adminUsersTable)
        .where(eq(adminUsersTable.userId, targetUserId));
      deletedData.admin_roles++;
    } catch (e) {
      console.error('Failed to delete admin_users:', e);
    }
    
    try {
      const tenantAdminDeleted = await gdb
        .delete(tenantAdminsTable)
        .where(eq(tenantAdminsTable.userId, targetUserId));
      deletedData.admin_roles++;
    } catch (e) {
      console.error('Failed to delete tenant_admins:', e);
    }
    
    // 1.2 删除邀请记录
    try {
      const invitationsDeleted = await gdb
        .delete(invitations)
        .where(
          or(
            eq(invitations.inviterId, targetUserId),
            eq(invitations.inviteeId, targetUserId)
          )
        );
      deletedData.invitations = invitationsDeleted?.count || 0;
    } catch (e) {
      console.error('Failed to delete invitations:', e);
    }
    
    // 1.3 删除积分历史
    try {
      const pointsHistoryDeleted = await gdb
        .delete(pointsHistory)
        .where(eq(pointsHistory.userId, targetUserId));
      deletedData.points_history = pointsHistoryDeleted?.count || 0;
    } catch (e) {
      console.error('Failed to delete points_history:', e);
    }
    
    // 1.4 删除评论
    try {
      const commentsDeleted = await gdb
        .delete(comments)
        .where(eq(comments.userId, targetUserId));
      deletedData.comments = commentsDeleted?.count || 0;
    } catch (e) {
      console.error('Failed to delete comments:', e);
    }
    
    // 1.5 删除帖子
    try {
      const postsDeleted = await gdb
        .delete(posts)
        .where(eq(posts.userId, targetUserId));
      deletedData.posts = postsDeleted?.count || 0;
    } catch (e) {
      console.error('Failed to delete posts:', e);
    }
    
    // 1.6 删除 profile（最后删除，因为其他表可能有外键）
    try {
      await gdb
        .delete(profiles)
        .where(eq(profiles.id, targetUserId));
      deletedData.profiles = 1;
    } catch (e) {
      console.error('Failed to delete profile:', e);
    }
    
    // === 步骤 2: 删除 Supabase 用户 ===
    
    const supabaseDeleteSuccess = await deleteSupabaseUser(targetUserId);
    
    if (!supabaseDeleteSuccess) {
      return c.json({
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

// 辅助函数: 删除 Supabase 用户
async function deleteSupabaseUser(userId) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase credentials');
      return false;
    }
    
    // 使用 Supabase Admin API 删除用户
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${userId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
      }
    );
    
    if (!response.ok) {
      console.error('Supabase delete failed:', await response.text());
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('deleteSupabaseUser error:', e);
    return false;
  }
}
```

### 前端调用

**文件**: `src/pages/UserManagement.jsx`

```javascript
const handleDeleteUser = async (userId) => {
  if (!confirm('确定要删除该用户吗？此操作不可恢复！')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });
    
    const data = await response.json();
    
    if (data.ok) {
      toast({
        title: "删除成功",
        description: `已删除用户及其所有数据`,
      });
      
      // 刷新用户列表
      refetch();
    } else {
      toast({
        variant: "destructive",
        title: "删除失败",
        description: data.message || data.error,
      });
    }
  } catch (error) {
    toast({
      variant: "destructive",
      title: "删除失败",
      description: error.message,
    });
  }
};
```

---

## 🔔 方案 2: Supabase Database Webhook

### 实现原理

```
Supabase 用户被删除（通过 Dashboard 或其他方式）
  ↓
触发 Database Webhook
  ↓
POST https://yourapi.com/webhooks/user-deleted
  ↓
删除 Turso 数据 ✅
```

### 配置步骤

#### 步骤 1: 创建 Webhook Endpoint

**文件**: `server/index.js`

```javascript
// Webhook: Supabase 用户删除
app.post('/webhooks/user-deleted', async (c) => {
  try {
    // 验证 webhook 签名（推荐）
    const signature = c.req.header('x-supabase-signature');
    const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
    
    if (webhookSecret && signature) {
      // 验证签名逻辑
      const body = await c.req.text();
      const expectedSignature = await crypto
        .subtle
        .digest('SHA-256', new TextEncoder().encode(webhookSecret + body));
      
      // 简化：实际应该用 crypto.timingSafeEqual
      if (signature !== Buffer.from(expectedSignature).toString('hex')) {
        return c.json({ error: 'invalid-signature' }, 401);
      }
    }
    
    const payload = await c.req.json();
    const { type, record } = payload;
    
    if (type !== 'DELETE' || record?.table !== 'users') {
      return c.json({ error: 'invalid-event' }, 400);
    }
    
    const userId = record.old_record?.id;
    if (!userId) {
      return c.json({ error: 'missing-user-id' }, 400);
    }
    
    // 删除 Turso 数据
    const gdb = getGlobalDb();
    
    await gdb.delete(invitations).where(
      or(
        eq(invitations.inviterId, userId),
        eq(invitations.inviteeId, userId)
      )
    );
    
    await gdb.delete(pointsHistory).where(eq(pointsHistory.userId, userId));
    await gdb.delete(comments).where(eq(comments.userId, userId));
    await gdb.delete(posts).where(eq(posts.userId, userId));
    await gdb.delete(profiles).where(eq(profiles.id, userId));
    
    console.log(`Webhook: Deleted Turso data for user ${userId}`);
    
    return c.json({ ok: true });
    
  } catch (e) {
    console.error('Webhook error:', e);
    return c.json({ error: 'failed' }, 500);
  }
});
```

#### 步骤 2: 配置 Supabase Webhook

```
1. 登录 Supabase Dashboard
2. Database → Webhooks
3. 点击 "Create a new webhook"

配置:
- Name: user-deleted-webhook
- Table: auth.users
- Events: DELETE
- Type: HTTP Request
- Method: POST
- URL: https://yourapi.com/webhooks/user-deleted
- Headers: 
  - Content-Type: application/json
  - x-webhook-secret: <your-secret>
```

#### 步骤 3: 测试 Webhook

```bash
# 模拟 webhook 请求
curl -X POST https://yourapi.com/webhooks/user-deleted \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-secret" \
  -d '{
    "type": "DELETE",
    "record": {
      "table": "users",
      "old_record": {
        "id": "user-id-to-delete"
      }
    }
  }'
```

---

## 🔧 方案 3: Database Function (高级)

### Supabase Database Function

**注意**: Supabase 的 `auth.users` 表在 `auth` schema，可能无法直接创建触发器。

如果可以，步骤如下：

```sql
-- 创建触发器函数
CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS trigger AS $$
BEGIN
  -- 调用外部 API 删除 Turso 数据
  PERFORM net.http_post(
    url := 'https://yourapi.com/webhooks/user-deleted',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := json_build_object(
      'userId', OLD.id,
      'email', OLD.email
    )::jsonb
  );
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
CREATE TRIGGER on_user_delete
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_delete();
```

**限制**：
- Supabase 可能不允许在 `auth.users` 上创建触发器
- 需要启用 `pg_net` 扩展
- 调试困难

---

## 📊 删除数据范围

### 全局数据库 (demo1)

```sql
-- 删除以下表的用户数据：

DELETE FROM admin_users WHERE user_id = ?;
DELETE FROM tenant_admins WHERE user_id = ?;
DELETE FROM invitations WHERE inviter_id = ? OR invitee_id = ?;
DELETE FROM points_history WHERE user_id = ?;
DELETE FROM comments WHERE user_id = ?;
DELETE FROM posts WHERE user_id = ?;
DELETE FROM profiles WHERE id = ?;
```

### 注意事项

#### 1. 外键约束
```
如果有外键约束，需要按正确顺序删除：
1. 子表数据（comments, posts）
2. 关联表数据（invitations, points_history）
3. 主表数据（profiles）
```

#### 2. 软删除 vs 硬删除

**软删除**（推荐生产环境）：
```sql
-- 不真正删除，只是标记
UPDATE profiles SET deleted_at = NOW() WHERE id = ?;
```

**硬删除**（完全删除）：
```sql
-- 彻底删除数据
DELETE FROM profiles WHERE id = ?;
```

#### 3. 数据备份

**删除前备份**：
```javascript
// 在删除前导出用户数据
const backupUserData = async (userId) => {
  const userData = {
    profile: await gdb.select().from(profiles).where(eq(profiles.id, userId)),
    posts: await gdb.select().from(posts).where(eq(posts.userId, userId)),
    comments: await gdb.select().from(comments).where(eq(comments.userId, userId)),
  };
  
  // 保存到文件或备份数据库
  await fs.writeFile(
    `backups/user-${userId}-${Date.now()}.json`,
    JSON.stringify(userData, null, 2)
  );
};
```

---

## 🧪 测试级联删除

### 测试脚本

**文件**: `tools/test-cascade-delete.js`

```javascript
import { getGlobalDb } from '../server/tursoApi.js';
import { profiles, posts, comments } from '../server/drizzle/schema.js';
import { eq } from 'drizzle-orm';

async function testCascadeDelete(userId) {
  const gdb = getGlobalDb();
  
  console.log('🔍 删除前检查...');
  
  // 检查数据
  const profile = await gdb.select().from(profiles).where(eq(profiles.id, userId));
  const userPosts = await gdb.select().from(posts).where(eq(posts.userId, userId));
  const userComments = await gdb.select().from(comments).where(eq(comments.userId, userId));
  
  console.log(`- Profile: ${profile.length} 条`);
  console.log(`- Posts: ${userPosts.length} 条`);
  console.log(`- Comments: ${userComments.length} 条`);
  
  // 调用删除 API
  console.log('\n🗑️  执行删除...');
  
  const response = await fetch(`http://localhost:3000/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer YOUR_ADMIN_TOKEN',
    },
  });
  
  const result = await response.json();
  console.log('删除结果:', result);
  
  // 验证删除
  console.log('\n✅ 删除后检查...');
  
  const profileAfter = await gdb.select().from(profiles).where(eq(profiles.id, userId));
  const postsAfter = await gdb.select().from(posts).where(eq(posts.userId, userId));
  const commentsAfter = await gdb.select().from(comments).where(eq(comments.userId, userId));
  
  console.log(`- Profile: ${profileAfter.length} 条 (应该是 0)`);
  console.log(`- Posts: ${postsAfter.length} 条 (应该是 0)`);
  console.log(`- Comments: ${commentsAfter.length} 条 (应该是 0)`);
  
  if (profileAfter.length === 0 && postsAfter.length === 0 && commentsAfter.length === 0) {
    console.log('\n🎉 级联删除成功！');
  } else {
    console.log('\n❌ 级联删除不完整！');
  }
}

// 运行测试
const testUserId = process.argv[2];
if (!testUserId) {
  console.error('用法: node tools/test-cascade-delete.js <user-id>');
  process.exit(1);
}

testCascadeDelete(testUserId);
```

**运行**：
```bash
node tools/test-cascade-delete.js user-id-here
```

---

## 📝 环境变量

添加到 `.env`:

```bash
# Supabase Admin (用于删除用户)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Webhook Secret (可选，用于验证)
SUPABASE_WEBHOOK_SECRET=your-secret-key
```

---

## ⚠️ 重要提示

### 1. 权限控制

```javascript
// 只有超级管理员可以删除用户
const isActorSuper = await isSuperAdminUser(actorId);
if (!isActorSuper) {
  return c.json({ error: 'forbidden' }, 403);
}
```

### 2. 防止自删除

```javascript
// 不能删除自己
if (targetUserId === actorId) {
  return c.json({ error: 'cannot-delete-self' }, 400);
}
```

### 3. 确认机制

```javascript
// 前端二次确认
const confirmed = window.confirm(
  '确定要删除该用户吗？\n\n此操作将：\n' +
  '- 删除用户账号\n' +
  '- 删除所有帖子和评论\n' +
  '- 删除邀请记录\n' +
  '- 删除积分历史\n\n' +
  '此操作不可恢复！'
);
```

### 4. 审计日志

```javascript
// 记录删除操作
await gdb.insert(auditLogs).values({
  action: 'user_delete',
  actorId: actorId,
  targetId: targetUserId,
  timestamp: new Date().toISOString(),
  metadata: JSON.stringify(deletedData),
});
```

---

## 📚 相关文档

- [用户数据存储架构](./USER_DATA_STORAGE.md)
- [用户注册问题排查](./USER_REGISTRATION_TROUBLESHOOTING.md)
- [项目完整文档](./PROJECT_DOCUMENTATION.md)

---

## 🎯 推荐实施步骤

### 步骤 1: 实现 API 删除端点（1小时）
1. 添加 `DELETE /api/admin/users/:id`
2. 实现 Turso 数据删除
3. 实现 Supabase 用户删除

### 步骤 2: 添加前端按钮（30分钟）
1. 在用户管理页面添加删除按钮
2. 添加确认对话框
3. 调用删除 API

### 步骤 3: 测试（30分钟）
1. 创建测试用户
2. 添加测试数据
3. 执行删除
4. 验证数据完全删除

### 步骤 4: 生产部署（可选）
1. 添加审计日志
2. 添加数据备份
3. 配置 webhook（可选）

---

**最后更新**: 2025-10-07 | **版本**: v1.0.0

