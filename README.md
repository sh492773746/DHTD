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

**請查看 [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) 獲取完整的技術文檔**，包含：

- 📋 **項目概述** - 系統架構和部署流程
- 🛠️ **技術棧** - 完整的技術棧列表
- 🌐 **API 文檔** - 所有 API 端點詳細說明
- 🗄️ **數據庫設計** - 完整的數據表結構
- 🔐 **安全性** - 認證、授權和安全策略
- ⚙️ **環境變量配置** - 所有環境變量說明
- 🚀 **部署指南** - Vercel 和 Render 部署流程
- 💻 **開發指南** - 開發規範和最佳實踐

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
- **完整文檔**: [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)

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

關鍵環境變量（完整列表見 [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)）：

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

**每次修改代碼後，請務必更新 [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) 中的相應部分：**

- ✅ API 文檔 (新增/修改端點時)
- ✅ 數據庫設計 (新增/修改表時)
- ✅ 環境變量配置 (新增變量時)
- ✅ 技術棧 (新增依賴時)
- ✅ 版本歷史 (重大更新時)

## 📄 許可證

MIT License

---

**📖 更多詳細信息請查看 [完整技術文檔](./PROJECT_DOCUMENTATION.md)**
