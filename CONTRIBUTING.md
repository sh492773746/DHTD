# 貢獻指南

感謝您對本項目的貢獻！請遵循以下指南以確保代碼質量和文檔的一致性。

## 📋 提交代碼前的檢查清單

### ✅ 代碼檢查
- [ ] 代碼符合項目風格規範
- [ ] 所有功能已在本地測試
- [ ] 沒有引入新的 linter 錯誤
- [ ] 沒有提交敏感信息（密鑰、Token 等）

### ✅ 文檔更新（重要！）

**每次代碼修改後，請檢查是否需要更新以下文檔部分：**

#### 1. API 相關修改
- [ ] 更新 `PROJECT_DOCUMENTATION.md` 中的 **API 文檔** 部分
- [ ] 添加新端點的請求/響應示例
- [ ] 更新狀態碼說明
- [ ] 更新 Rate Limiting 規則（如有變化）

**示例：新增 API 端點時**
```markdown
#### X. 新端點名稱
​```http
POST /api/new-endpoint
Authorization: Bearer <token>
Content-Type: application/json
​```

**請求體**
​```json
{
  "field": "value"
}
​```

**響應**
​```json
{
  "success": true,
  "data": { ... }
}
​```
```

#### 2. 數據庫相關修改
- [ ] 更新 `PROJECT_DOCUMENTATION.md` 中的 **數據庫設計** 部分
- [ ] 添加新表的結構說明
- [ ] 更新索引建議
- [ ] 說明數據遷移步驟（如需要）

**示例：新增數據表時**
```markdown
##### new_table (新表說明)
​```sql
CREATE TABLE new_table (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_name TEXT NOT NULL,
  created_at TEXT
);
​```

**索引**
​```sql
CREATE INDEX idx_new_table_field ON new_table(field_name);
​```
```

#### 3. 環境變量相關修改
- [ ] 更新 `PROJECT_DOCUMENTATION.md` 中的 **環境變量配置** 部分
- [ ] 添加新變量的說明和示例值
- [ ] 標註是否必填
- [ ] 更新 `.env.example`（如果有）

**示例：新增環境變量時**
```markdown
| NEW_VARIABLE | 變量用途說明 | ✅/❌ | 示例值 |
```

#### 4. 技術棧相關修改
- [ ] 更新 `PROJECT_DOCUMENTATION.md` 中的 **技術棧** 部分
- [ ] 添加新依賴及其版本
- [ ] 說明新技術的用途

**示例：新增依賴時**
```markdown
| 新依賴名 | 版本 | 用途 |
|---------|------|------|
| new-lib | 1.0.0 | 功能說明 |
```

#### 5. 安全性相關修改
- [ ] 更新 `PROJECT_DOCUMENTATION.md` 中的 **安全性** 部分
- [ ] 添加新的安全措施說明
- [ ] 更新安全檢查清單

#### 6. 重大功能更新
- [ ] 更新 `PROJECT_DOCUMENTATION.md` 中的 **版本歷史** 部分
- [ ] 記錄版本號和更新日期
- [ ] 列出主要變更

**示例：版本更新時**
```markdown
### v1.1.0 (2025-XX-XX)
- ✅ 新增 XXX 功能
- 🐛 修復 XXX 問題
- ⚡ 優化 XXX 性能
```

## 🔄 文檔更新工作流

### 1. 修改代碼時同步更新文檔

```bash
# 1. 修改代碼
vim src/pages/NewFeature.jsx
vim server/index.js

# 2. 立即更新文檔
vim PROJECT_DOCUMENTATION.md

# 3. 一起提交
git add .
git commit -m "feat: 添加新功能

- 實現 XXX 功能
- 更新 API 文檔
- 更新數據庫設計文檔
"
```

### 2. PR 審查時的文檔檢查

審查者請確認：
- [ ] PR 描述清晰說明了變更內容
- [ ] 相關文檔已同步更新
- [ ] 文檔格式正確（Markdown 語法）
- [ ] 示例代碼可執行且正確

## 📝 Commit 消息規範

使用語義化提交消息：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 類型
- `feat`: 新功能
- `fix`: Bug 修復
- `docs`: 僅文檔更新
- `style`: 代碼格式調整（不影響功能）
- `refactor`: 代碼重構
- `perf`: 性能優化
- `test`: 測試相關
- `chore`: 構建工具或輔助工具變動

### Scope 範圍（可選）
- `api`: API 相關
- `db`: 數據庫相關
- `ui`: UI 組件
- `auth`: 認證相關
- `admin`: 管理後台
- `docs`: 文檔

### 示例
```bash
# 簡單提交
git commit -m "feat: 添加用戶導出功能"

# 詳細提交
git commit -m "feat(api): 添加用戶導出 API

- 新增 GET /api/admin/export-users 端點
- 支持 CSV 和 JSON 格式導出
- 實現分頁導出，避免內存溢出
- 更新 API 文檔

Closes #123
"

# 文檔更新
git commit -m "docs: 更新 API 文檔

- 添加用戶導出端點說明
- 更新環境變量配置
- 修正數據庫表結構描述
"
```

## 🧪 測試要求

### 本地測試
在提交 PR 前，請確保：

```bash
# 1. 前端構建成功
npm run build

# 2. 預覽生產版本
npm run preview

# 3. 後端啟動無錯誤
npm run start

# 4. 測試關鍵功能
# - 用戶登入/登出
# - API 請求成功
# - 數據正常顯示
```

### API 測試示例
```bash
# 測試新增的 API
curl -X POST https://localhost:8787/api/new-endpoint \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'
```

## 🚀 Pull Request 流程

### 1. 創建 PR

```bash
# 1. 創建功能分支
git checkout -b feature/amazing-feature

# 2. 開發功能並更新文檔
# ...

# 3. 提交更改
git add .
git commit -m "feat: 添加驚人的新功能"

# 4. 推送到遠程
git push origin feature/amazing-feature

# 5. 在 GitHub 上創建 Pull Request
```

### 2. PR 標題格式

```
<type>: <簡短描述>

示例:
feat: 添加用戶導出功能
fix: 修復登入頁面跳轉問題
docs: 更新 API 文檔
```

### 3. PR 描述模板

```markdown
## 📋 變更說明
簡要描述本次變更的內容和原因

## 🔧 變更類型
- [ ] 新功能 (feat)
- [ ] Bug 修復 (fix)
- [ ] 文檔更新 (docs)
- [ ] 代碼重構 (refactor)
- [ ] 性能優化 (perf)
- [ ] 其他

## 📝 文檔更新
- [ ] 已更新 PROJECT_DOCUMENTATION.md
- [ ] 已更新 API 文檔
- [ ] 已更新數據庫設計
- [ ] 已更新環境變量說明
- [ ] 無需更新文檔

## ✅ 測試清單
- [ ] 本地測試通過
- [ ] 前端構建成功
- [ ] 後端正常啟動
- [ ] API 測試通過
- [ ] 無 linter 錯誤

## 📸 截圖（如適用）
[添加截圖]

## 🔗 相關 Issue
Closes #[issue number]

## 💡 額外說明
[任何需要審查者知道的額外信息]
```

## 🛠️ 開發環境配置

### IDE 推薦設置

#### VS Code 擴展
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "dsznajder.es7-react-js-snippets",
    "formulahendry.auto-rename-tag"
  ]
}
```

#### VS Code 設置
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.eol": "\n"
}
```

### Git Hooks（可選）

創建 `.husky/pre-commit` 來自動檢查：

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# 檢查是否更新了文檔
if git diff --cached --name-only | grep -qE '(server/|src/)'; then
  if ! git diff --cached --name-only | grep -q 'PROJECT_DOCUMENTATION.md'; then
    echo "⚠️  警告：您修改了代碼但未更新 PROJECT_DOCUMENTATION.md"
    echo "請確認是否需要更新文檔"
    echo ""
    read -p "繼續提交嗎？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
fi
```

## 📚 文檔編寫規範

### Markdown 格式
- 使用清晰的標題層級 (`#`, `##`, `###`)
- 代碼塊指定語言 (```javascript, ```bash, ```sql)
- 使用表格整理結構化數據
- 添加適當的 emoji 提升可讀性 📝

### API 文檔格式
```markdown
#### 端點名稱
​```http
METHOD /api/endpoint
Authorization: Bearer <token>
​```

**Query 參數** (如有)
- `param1` (type, required/optional): 說明

**請求體** (如有)
​```json
{ "example": "value" }
​```

**響應**
​```json
{ "success": true }
​```
```

### 數據庫文檔格式
```markdown
##### table_name (表說明)
​```sql
CREATE TABLE table_name (
  field TYPE CONSTRAINTS,  -- 字段說明
  ...
);
​```
```

## 🔍 Code Review 檢查項

### 審查者檢查清單
- [ ] 代碼邏輯正確
- [ ] 無明顯性能問題
- [ ] 錯誤處理完善
- [ ] 安全性考慮周全
- [ ] **文檔已同步更新** ⭐
- [ ] 命名規範清晰
- [ ] 註釋適當
- [ ] 無調試代碼殘留

### 常見問題
1. **忘記更新文檔** - 最常見的問題！
2. API 端點未添加認證檢查
3. 數據庫查詢未添加 `tenantId` 過濾
4. 環境變量硬編碼在代碼中
5. 上傳文件未驗證類型和大小

## 🎯 最佳實踐

### 1. 小步提交
```bash
# 好的做法：功能拆分為小的提交
git commit -m "feat: 添加用戶導出 API 端點"
git commit -m "feat: 實現前端導出按鈕"
git commit -m "docs: 更新用戶導出文檔"

# 避免：所有更改一次提交
git commit -m "feat: 用戶導出功能" # 包含太多變更
```

### 2. 文檔先行
```bash
# 1. 先更新文檔，定義 API 格式
vim PROJECT_DOCUMENTATION.md

# 2. 再實現代碼
vim server/index.js

# 3. 確保文檔和代碼一致
```

### 3. 及時同步
```bash
# 每次功能開發完成後立即更新文檔
# 不要等到 PR 階段才想起來更新
```

## ❓ 常見問題

### Q: 小改動也要更新文檔嗎？
A: 視情況而定：
- 修改 API 參數 → ✅ 需要
- 修改 UI 樣式 → ❌ 不需要
- 修改數據庫字段 → ✅ 需要
- 修正拼寫錯誤 → ❌ 不需要

### Q: 文檔更新在 PR 前還是 PR 後？
A: **PR 前**！文檔應該和代碼一起提交。

### Q: 如何確保文檔格式正確？
A: 使用 Markdown 預覽工具（VS Code 內置）檢查格式。

## 📞 獲取幫助

如有任何疑問：
1. 查看 [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md)
2. 查看現有 PR 作為參考
3. 在 Issue 中提問
4. 聯繫項目維護者

---

**記住：好的文檔和好的代碼同樣重要！** 📚✨
