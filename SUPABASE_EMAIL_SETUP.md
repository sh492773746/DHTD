# 📧 Supabase 邮箱模板配置指南

## 快速配置步骤

### 1. 登录 Supabase Dashboard

```
访问: https://supabase.com/dashboard
选择您的项目
```

### 2. 进入邮件模板设置

```
左侧菜单: Authentication → Email Templates
```

### 3. 配置 "Confirm signup" 模板

#### 📝 Subject (主题)
```
验证您的邮箱 - {{ .SiteURL }}
```

或者使用更友好的主题：
```
🎉 欢迎注册！请验证您的邮箱
```

#### 📄 Message body (邮件正文)

**选项1: 使用精美的 HTML 模板**（推荐）
```
1. 打开项目根目录的 supabase-email-template.html
2. 复制全部内容
3. 粘贴到 Supabase 的 "Message body" 中
4. 点击 Save
```

**选项2: 使用简洁的纯文本模板**
```
您好！

感谢您注册 {{ .SiteURL }}。

请点击下面的链接验证您的邮箱地址：

{{ .ConfirmationURL }}

此链接将在 24 小时后失效。

如果您没有注册此账号，请忽略此邮件。

---
本邮件由系统自动发送，请勿直接回复。
```

### 4. 测试邮件模板

```
1. 点击 "Send test email" 按钮
2. 输入您的邮箱地址
3. 检查邮箱（包括垃圾邮件箱）
4. 验证邮件是否正确显示
```

### 5. 其他可选模板配置

#### Magic Link (魔法链接)
**Subject:**
```
您的登录链接 - {{ .SiteURL }}
```

**Message body:**
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { 
      display: inline-block; 
      padding: 12px 30px; 
      background-color: #4299e1; 
      color: white; 
      text-decoration: none; 
      border-radius: 5px; 
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>🔑 您的登录链接</h2>
    <p>点击下方按钮登录您的账号：</p>
    <p><a href="{{ .ConfirmationURL }}" class="button">立即登录</a></p>
    <p>此链接将在 1 小时后失效。</p>
    <p style="color: #666; font-size: 12px;">
      如果您没有请求此链接，请忽略此邮件。
    </p>
  </div>
</body>
</html>
```

#### Reset Password (重置密码)
**Subject:**
```
重置您的密码 - {{ .SiteURL }}
```

**Message body:**
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { 
      display: inline-block; 
      padding: 12px 30px; 
      background-color: #f56565; 
      color: white; 
      text-decoration: none; 
      border-radius: 5px; 
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>🔐 重置您的密码</h2>
    <p>您请求重置密码。点击下方按钮继续：</p>
    <p><a href="{{ .ConfirmationURL }}" class="button">重置密码</a></p>
    <p>此链接将在 1 小时后失效。</p>
    <p style="color: #e53e3e; font-weight: bold;">
      ⚠️ 如果您没有请求重置密码，请立即联系我们。
    </p>
  </div>
</body>
</html>
```

---

## 📊 可用变量

在模板中可以使用以下变量（Supabase 会自动替换）：

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{ .ConfirmationURL }}` | 确认/验证链接 | `https://yourapp.com/auth/confirm?token=...` |
| `{{ .Email }}` | 用户邮箱地址 | `user@example.com` |
| `{{ .SiteURL }}` | 网站地址 | `https://yourapp.com` |
| `{{ .Token }}` | 验证令牌 | `eyJhbGc...` |
| `{{ .TokenHash }}` | 令牌哈希 | `abc123...` |

---

## 🎨 模板特点

### HTML 模板特点：
- ✅ 响应式设计（手机/桌面自适应）
- ✅ 渐变色背景（现代美观）
- ✅ 清晰的行动号召按钮
- ✅ 备用链接（按钮无法点击时）
- ✅ 安全提示
- ✅ 中文友好

### 设计元素：
- 🎨 渐变色 Header
- 📧 信息高亮框
- 🔘 大号验证按钮
- 📱 移动端优化
- 🔒 安全提示框

---

## 🧪 测试清单

配置完成后，请测试以下场景：

- [ ] 新用户注册 → 收到验证邮件
- [ ] 邮件在桌面端正常显示
- [ ] 邮件在移动端正常显示
- [ ] 验证按钮可以点击
- [ ] 备用链接可以复制使用
- [ ] 链接点击后正常跳转
- [ ] 邮箱验证成功
- [ ] 检查垃圾邮件箱（确保不被误判）

---

## ⚠️ 常见问题

### Q1: 邮件进垃圾邮件箱怎么办？

**A**: 配置 SMTP 发件服务器（如 SendGrid）：

```
1. Supabase Dashboard → Settings → Authentication
2. SMTP Settings
3. 配置自定义 SMTP（参考 TechDocs/USER_REGISTRATION_TROUBLESHOOTING.md）
```

### Q2: 模板变量不生效？

**A**: 确保使用正确的语法：
- ✅ 正确: `{{ .Email }}`
- ❌ 错误: `{{.Email}}`（缺少空格）
- ❌ 错误: `{Email}`（缺少点号）

### Q3: 样式不显示？

**A**: 
1. 确保使用内联样式（`style="..."`）
2. 避免使用外部 CSS 文件
3. 某些邮件客户端不支持 `<style>` 标签

### Q4: 如何自定义品牌？

**A**: 修改模板中的以下部分：
- Logo 文字: `<h1 class="logo">🎉 欢迎加入</h1>`
- 品牌颜色: `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);`
- 按钮颜色: `.button { background: ... }`

---

## 📝 配置完成后

1. ✅ 保存模板
2. ✅ 发送测试邮件
3. ✅ 验证邮件显示正确
4. ✅ 测试完整注册流程
5. ✅ 删除 `supabase-email-template.html` 文件（可选）
6. ✅ 删除此配置文档（可选）

---

## 🔗 相关文档

- [Supabase Email Templates 官方文档](https://supabase.com/docs/guides/auth/auth-email-templates)
- [用户注册问题排查](./TechDocs/USER_REGISTRATION_TROUBLESHOOTING.md)
- [SMTP 配置指南](./TechDocs/USER_REGISTRATION_TROUBLESHOOTING.md#方案-a-配置-supabase-邮件服务推荐)

---

**配置完成后，请测试整个注册流程以确保邮件正常发送！** 🎉

