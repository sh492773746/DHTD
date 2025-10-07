# Supabase 邮箱验证模板配置指南

## 📧 邮箱模板文件

**HTML模板文件**: `supabase-email-template-confirm-signup.html`

## 🚀 快速配置步骤

### 步骤 1: 登录 Supabase Dashboard

1. 访问: https://supabase.com/dashboard
2. 选择您的项目
3. 导航到: **Authentication** → **Email Templates**

### 步骤 2: 配置 Confirm Signup 模板

1. 在左侧菜单找到 **Confirm signup**
2. 点击进入编辑页面

### 步骤 3: 设置邮件主题

在 **Subject** 字段输入:
```
验证您的邮箱 - 欢迎加入 {{ .SiteURL }}
```

或使用更简洁的:
```
✉️ 验证您的邮箱地址
```

### 步骤 4: 粘贴邮件正文

1. 打开文件: `supabase-email-template-confirm-signup.html`
2. 复制所有内容
3. 粘贴到 **Message body (HTML)** 字段

### 步骤 5: 保存并测试

1. 点击 **Save** 保存模板
2. 创建测试账号验证邮件效果
3. 检查邮件是否正常显示

---

## 🎨 模板特性

### 设计特点

- ✅ **响应式设计**: 自适应手机和电脑
- ✅ **现代美观**: 渐变色彩，圆角按钮
- ✅ **清晰明了**: 重点突出，易于理解
- ✅ **安全提示**: 包含安全警告信息
- ✅ **备用链接**: 提供复制链接选项

### 支持的变量

Supabase 提供以下模板变量:

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{ .ConfirmationURL }}` | 验证链接 | 必需 ⭐ |
| `{{ .SiteURL }}` | 网站地址 | 可选 |
| `{{ .Token }}` | 验证令牌 | 可选 |
| `{{ .TokenHash }}` | 令牌哈希 | 可选 |
| `{{ .Email }}` | 用户邮箱 | 可选 |

### 邮件内容结构

```
┌─────────────────────────────┐
│   🎉 欢迎加入 (Header)      │ ← 渐变色背景
├─────────────────────────────┤
│   您好！👋                  │
│                             │
│   感谢您注册...             │
│                             │
│   [✉️ 验证我的邮箱]         │ ← CTA 按钮
│                             │
│   按钮无法点击？            │ ← 备用链接
│   复制链接: ...             │
│                             │
│   ⚠️ 安全提示               │ ← 安全警告
├─────────────────────────────┤
│   页脚信息                  │
└─────────────────────────────┘
```

---

## ⚙️ 自定义选项

### 修改品牌颜色

在 HTML 中查找以下颜色值并替换:

```css
/* 主色调（紫色渐变）*/
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* 可以替换为您的品牌色，例如蓝色: */
background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);

/* 或绿色: */
background: linear-gradient(135deg, #10b981 0%, #059669 100%);
```

### 修改 Logo

将此行:
```html
<h1 class="email-logo">🎉 欢迎加入</h1>
```

替换为您的 Logo 图片:
```html
<img src="YOUR_LOGO_URL" alt="Logo" style="height: 50px;">
```

### 修改网站名称

全局查找替换:
- `{{ .SiteURL }}` 可以替换为具体的网站名称

### 添加社交媒体链接

在 footer 部分添加:
```html
<div class="social-links">
    <a href="YOUR_WECHAT_QR">微信</a>
    <a href="YOUR_WEIBO">微博</a>
    <a href="YOUR_TWITTER">Twitter</a>
</div>
```

---

## 📱 移动端优化

模板已包含响应式设计:

```css
@media only screen and (max-width: 600px) {
    .email-body {
        padding: 30px 20px;  /* 更小的内边距 */
    }
    .greeting {
        font-size: 20px;     /* 更小的字体 */
    }
    .cta-button {
        padding: 14px 30px;  /* 更小的按钮 */
    }
}
```

---

## 🧪 测试建议

### 1. 多邮箱客户端测试

测试以下邮箱客户端的显示效果:
- ✅ Gmail (网页版 + 移动 App)
- ✅ Outlook (网页版 + 桌面客户端)
- ✅ QQ 邮箱
- ✅ 网易邮箱 (163, 126)
- ✅ Apple Mail (iOS + macOS)

### 2. 测试步骤

```bash
1. 注册新账号
2. 检查收件箱（包括垃圾邮件）
3. 验证邮件显示效果
4. 点击验证按钮
5. 确认跳转正确
```

### 3. 检查清单

- [ ] 邮件正常接收
- [ ] 样式显示正确
- [ ] 按钮可以点击
- [ ] 链接跳转正确
- [ ] 移动端显示正常
- [ ] 图片正常加载
- [ ] 文字清晰可读
- [ ] 没有乱码

---

## 🔧 常见问题

### Q1: 邮件样式显示不正常

**A**: 某些邮件客户端不完全支持 CSS。建议:
- 使用内联样式
- 避免使用高级 CSS 特性
- 使用表格布局（如需更好兼容性）

### Q2: 按钮点击无效

**A**: 检查:
- `{{ .ConfirmationURL }}` 是否正确
- 链接是否被邮箱客户端屏蔽
- 是否有备用纯文本链接

### Q3: 邮件进入垃圾邮件

**A**: 需要配置:
1. SPF 记录
2. DKIM 签名
3. DMARC 策略
4. 使用可信 SMTP 服务（如 SendGrid）

### Q4: 图片不显示

**A**: 
- 确保图片使用 HTTPS 链接
- 图片托管在可靠的 CDN
- 避免使用过大的图片

### Q5: 如何测试模板

**A**: 
```bash
# 方法1: 注册新账号
# 方法2: Supabase Dashboard 有测试发送功能
# 方法3: 使用 Supabase CLI
supabase db remote commit
```

---

## 📊 最佳实践

### 邮件内容

1. **主题行**
   - ✅ 简短明了（30字以内）
   - ✅ 包含关键词（验证、邮箱）
   - ✅ 适度使用 emoji（提高打开率）

2. **正文内容**
   - ✅ 开门见山，说明目的
   - ✅ CTA 按钮清晰醒目
   - ✅ 提供备用链接
   - ✅ 说明有效期
   - ✅ 安全提示

3. **设计**
   - ✅ 品牌一致性
   - ✅ 清晰的层次结构
   - ✅ 合适的留白
   - ✅ 响应式设计

### 技术要点

1. **兼容性**
   ```
   - 使用表格布局（最佳兼容性）
   - 内联 CSS 样式
   - 避免 JavaScript
   - 避免外部字体
   ```

2. **性能**
   ```
   - 压缩图片
   - 减少 HTTP 请求
   - 使用 CDN
   ```

3. **可访问性**
   ```
   - Alt 文本
   - 语义化 HTML
   - 足够的对比度
   - 清晰的文字大小
   ```

---

## 🎯 使用后清理

**配置完成后，请删除以下文件:**
```bash
rm supabase-email-template-confirm-signup.html
rm SUPABASE_EMAIL_TEMPLATE_GUIDE.md
```

或将其移动到文档目录:
```bash
mkdir -p docs/templates
mv supabase-email-template-confirm-signup.html docs/templates/
mv SUPABASE_EMAIL_TEMPLATE_GUIDE.md docs/templates/
```

---

## 📞 需要帮助？

如果遇到问题:
1. 查看 [Supabase 文档](https://supabase.com/docs/guides/auth/auth-email-templates)
2. 检查 Supabase Dashboard 日志
3. 测试 SMTP 配置
4. 联系技术支持

---

**提示**: 配置完成后请发送测试邮件验证效果！

