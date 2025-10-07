# 🚀 性能优化指南 (LCP 优化)

## 📊 当前状态
- **LCP (Largest Contentful Paint)**: 5.18秒 → 目标 < 2.5秒

## ✅ 已实施的优化

### 1. Vite 构建优化
- ✅ 启用 Terser 压缩
- ✅ 生产环境移除 console
- ✅ 代码分割策略
  - React vendor chunk (react, react-dom, react-router-dom)
  - UI vendor chunk (framer-motion, lucide-react)
  - Chart vendor chunk (recharts)
  - Data vendor chunk (@tanstack/react-query, @supabase/supabase-js)
- ✅ CSS 代码分割
- ✅ 优化输出文件名结构

### 2. 图片优化
- ✅ 轮播图首屏图片优先加载 (fetchpriority="high", loading="eager")
- ✅ 非首屏轮播图懒加载 (loading="lazy")
- ✅ 游戏卡片图片懒加载
- ✅ 前 6 个游戏卡片优先加载 (priority prop)
- ✅ 异步解码 (decoding="async")

### 3. HTML 优化
- ✅ DNS 预解析 (dns-prefetch)
- ✅ 预连接外部资源 (preconnect)
- ✅ 内联关键 CSS
- ✅ 防止布局偏移的基础样式
- ✅ 分析脚本异步加载 (defer)

### 4. 动画优化
- ✅ 添加 willChange 提示给浏览器

## 🔜 建议的进一步优化

### 1. 路由懒加载 (代码分割)
**影响**: 减少初始 bundle 50-70%

当前所有页面都是同步导入，建议改为：

```javascript
// 保持首屏同步加载
import Dashboard from '@/pages/Dashboard';
import AuthPage from '@/pages/AuthPage';

// 其他页面懒加载
const SocialFeed = lazy(() => import('@/pages/SocialFeed'));
const Prediction = lazy(() => import('@/pages/Prediction'));
const GameCenter = lazy(() => import('@/pages/GameCenter'));
// ... 等等
```

### 2. 图片 CDN 和格式优化
**影响**: 减少图片加载时间 40-60%

建议：
- 使用 WebP 格式（体积减少 25-35%）
- 添加响应式图片 (srcset)
- 使用图片 CDN
- 图片压缩（TinyPNG / ImageOptim）

示例：
```html
<img 
  src="image.webp"
  srcset="image-320w.webp 320w, image-640w.webp 640w, image-1280w.webp 1280w"
  sizes="(max-width: 640px) 100vw, 640px"
  loading="eager"
  fetchpriority="high"
/>
```

### 3. 字体优化
**影响**: 减少 FOIT/FOUT，改善视觉稳定性

建议：
```html
<!-- 在 index.html 中添加 -->
<link rel="preload" href="/fonts/main-font.woff2" as="font" type="font/woff2" crossorigin />

<style>
  @font-face {
    font-family: 'MainFont';
    src: url('/fonts/main-font.woff2') format('woff2');
    font-display: swap; /* 或 optional */
  }
</style>
```

### 4. 关键 CSS 内联
**影响**: 更快的首屏渲染

建议提取首屏关键 CSS 并内联到 `<head>` 中，非关键 CSS 延迟加载。

工具：
- [Critical](https://github.com/addyosmani/critical)
- [Critters](https://github.com/GoogleChromeLabs/critters)

### 5. 预加载关键资源
**影响**: 提前加载关键资源

```html
<!-- 预加载首屏图片 -->
<link rel="preload" as="image" href="/hero-image.webp" fetchpriority="high" />

<!-- 预加载关键字体 -->
<link rel="preload" as="font" href="/fonts/main.woff2" type="font/woff2" crossorigin />
```

### 6. Service Worker / 离线缓存
**影响**: 二次访问速度提升 80%+

使用 Workbox 或 vite-plugin-pwa：
```bash
npm install -D vite-plugin-pwa
```

### 7. 减少 JavaScript 执行时间
**影响**: 更快的交互响应

建议：
- 移除不必要的动画库
- 考虑使用更轻量的替代品（如 CSS animations 代替 framer-motion 的部分场景）
- 使用虚拟滚动（如 react-window）处理长列表

### 8. 服务端渲染 (SSR) / 静态生成 (SSG)
**影响**: 大幅改善 LCP 和 FCP

如果可能，考虑：
- 使用 Next.js 或 Remix
- 或使用 Vite SSR
- 至少为首页生成静态 HTML

## 📈 预期效果

实施以上优化后，预计性能指标：
- **LCP**: 5.18s → 1.5-2.0s ✅
- **FCP**: 改善 30-50%
- **TTI**: 改善 40-60%
- **Bundle Size**: 减少 50-70%

## 🛠️ 实施优先级

### 高优先级（立即实施）
1. ✅ 代码分割和构建优化（已完成）
2. ✅ 图片优化（已完成）
3. 🔜 路由懒加载
4. 🔜 图片格式优化（WebP）

### 中优先级（本周内）
5. 🔜 字体优化
6. 🔜 关键 CSS 内联
7. 🔜 预加载关键资源

### 低优先级（长期）
8. 🔜 Service Worker
9. 🔜 SSR/SSG 迁移
10. 🔜 第三方脚本优化

## 📝 监控

使用以下工具持续监控性能：
- Lighthouse (Chrome DevTools)
- WebPageTest
- Vercel Analytics ✅ (已集成)
- Vercel Speed Insights ✅ (已集成)

## 🎯 目标

2025年1月前实现：
- LCP < 2.5s
- FID < 100ms
- CLS < 0.1

---

**最后更新**: 2025-01-07
**更新人**: AI Assistant

