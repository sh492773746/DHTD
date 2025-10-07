# 多租戶社交平台

> 一個基於 React + Hono 的現代化多租戶社交平台，支持自定義域名、積分系統、遊戲中心和商城功能。

## 🚀 快速開始

```bash
# 安裝依賴
npm install

# 配置環境變量
cp .env.example .env.local
# 編輯 .env.local 填入實際配置

# 啟動開發服務器
npm run dev        # 前端 (http://localhost:5173)
npm run bff        # 後端 (http://localhost:8787)
```

## 📚 完整文檔

### 🗂️ 技術文檔中心
**所有技術文檔已整理至 [TechDocs/](./TechDocs/) 文件夾**

📖 **[查看文檔索引](./TechDocs/INDEX.md)** - 快速找到所需文檔

#### 📌 核心文檔
- 🚀 **[性能優化指南](./TechDocs/PERFORMANCE_OPTIMIZATION.md)** - LCP 優化、代碼分割、壓縮策略
- 📦 **[依賴檢查報告](./TechDocs/DEPENDENCIES_CHECK.md)** - 依賴管理、健康檢查
- 📋 **[項目完整文檔](./TechDocs/PROJECT_DOCUMENTATION.md)** - 架構、API、數據庫、部署

#### 🛠️ 開發文檔
- ⚛️ **[React 開發指南](./TechDocs/REACT_GUIDE.md)** - 組件開發、Hooks、狀態管理
- 🔒 **[安全優化報告](./TechDocs/SECURITY_AND_OPTIMIZATION_REPORT.md)** - 安全策略、環境變量
- 📊 **[性能優化完整指南](./TechDocs/PERFORMANCE_OPTIMIZATION_GUIDE.md)** - 前後端性能優化

#### 🎮 功能文檔
- 🎯 **[預測儀表板指南](./TechDocs/PREDICTION_DASHBOARD_GUIDE.md)** - 預測功能開發
- 💰 **[積分同步修復](./TechDocs/POINTS_SYNC_FIX.md)** - 積分系統問題排查
- 🚦 **[速率限制升級](./TechDocs/RATE_LIMITING_AUDIT_ERROR_UPGRADE_GUIDE.md)** - API 限流、審計

## 🌟 主要特性

- ✅ **多租戶架構** - 支持多個獨立站點，數據完全隔離
- ✅ **用戶認證** - 基於 Supabase 的 JWT 認證系統
- ✅ **社交功能** - 發帖、評論、點讚、關注
- ✅ **積分系統** - 用戶積分、虛擬貨幣、邀請獎勵
- ✅ **遊戲中心** - 預測遊戲等互動遊戲
- ✅ **商城系統** - 積分兌換商品
- ✅ **管理後台** - 超級管理員和租戶管理員
- ✅ **自定義域名** - 支持自定義域名綁定
- ✅ **響應式設計** - 完美支持移動端和桌面端
- ✅ **SEO 優化** - 動態 meta 標籤和 sitemap

## 🏗️ 技術架構

```
前端 (Vercel)          後端 (Render)           數據庫
─────────────          ─────────────           ──────────
React 18              Hono                    Supabase (認證)
Vite                  Node.js                 Turso (業務數據)
TanStack Query        Drizzle ORM             
Tailwind CSS          JWT/JWKS                
```

## 📦 核心依賴

### 前端
- React 18.3.1
- Vite 5.4.20
- TanStack Query 5.45.1
- Tailwind CSS 3.3.3
- Radix UI (shadcn/ui)
- Framer Motion 10.16.4

### 後端
- Hono 4.9.8
- Drizzle ORM 0.44.5
- @libsql/client 0.15.15
- jose 6.1.0 (JWT)
- sharp 0.34.4 (圖片處理)

## 🔗 相關鏈接

- **前端訪問**: https://dhtd.vercel.app
- **後端 API**: https://dhtd.onrender.com
- **技術文檔**: [TechDocs/](./TechDocs/)

## 📝 開發流程

1. **本地開發**
   ```bash
   npm run dev   # 前端開發
   npm run bff   # 後端開發
   ```

2. **構建測試**
   ```bash
   npm run build
   npm run preview
   ```

3. **部署**
   ```bash
   git push origin main  # 自動部署到 Vercel + Render
   ```

## 🔐 環境變量

關鍵環境變量（完整列表見 [項目文檔](./TechDocs/PROJECT_DOCUMENTATION.md)）：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Turso
TURSO_DATABASE_URL=libsql://xxx
TURSO_AUTH_TOKEN=xxx

# 域名
ROOT_DOMAIN=dhtd.vercel.app
ALLOWED_ORIGINS=https://dhtd.vercel.app,https://tv28.cc
```

## 🤝 貢獻指南

1. Fork 本倉庫
2. 創建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: 添加某功能'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

### Commit 規範
- `feat`: 新功能
- `fix`: 修復 Bug
- `docs`: 文檔更新
- `style`: 代碼格式
- `refactor`: 重構
- `test`: 測試
- `chore`: 構建/工具

## ⚠️ 重要提醒

**每次修改代碼後，請務必更新 [TechDocs/](./TechDocs/) 中的相應文檔：**

- ✅ **API 文檔** - 新增/修改端點時更新 [PROJECT_DOCUMENTATION.md](./TechDocs/PROJECT_DOCUMENTATION.md)
- ✅ **數據庫設計** - 新增/修改表時更新項目文檔
- ✅ **環境變量配置** - 新增變量時更新項目文檔
- ✅ **技術棧** - 新增依賴時更新 [DEPENDENCIES_CHECK.md](./TechDocs/DEPENDENCIES_CHECK.md)
- ✅ **性能優化** - 性能改進時更新 [PERFORMANCE_OPTIMIZATION.md](./TechDocs/PERFORMANCE_OPTIMIZATION.md)
- ✅ **版本歷史** - 重大更新時更新相關文檔

## 📄 許可證

MIT License

---

**📖 更多詳細信息請查看 [技術文檔中心](./TechDocs/INDEX.md)**
