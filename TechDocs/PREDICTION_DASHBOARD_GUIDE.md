# PC28 預測系統儀表板使用指南

> 創建時間：2025-10-06  
> 版本：v1.0.0  
> 訪問路徑：`/prediction-dashboard`

---

## 📋 功能概覽

這是一個連接外部 PC28 預測 API 的數據可視化儀表板，提供實時預測數據分析和算法性能對比。

### ✨ 核心功能

1. **三系統支持**
   - 🎯 加拿大28
   - ⚡ 分分28
   - 💎 比特28

2. **統計儀表板**
   - 總預測數
   - 正確預測數
   - 錯誤預測數
   - 實時準確率

3. **算法性能對比**
   - 最多顯示 4 個最佳算法
   - 準確率可視化排名
   - 大小/單雙統計
   - 點擊篩選預測記錄

4. **預測記錄列表**
   - 最近 20 條記錄
   - 算法篩選功能
   - 驗證狀態顯示
   - 結果對比

---

## 🎯 頁面佈局

### 1. 頂部區域
```
┌──────────────────────────────────────────┐
│  🎯 PC28 預測系統         [刷新數據] 按鈕  │
│  實時預測數據分析與算法對比                │
└──────────────────────────────────────────┘
```

### 2. 系統選擇標籤
```
┌─────────────┬─────────────┬─────────────┐
│ 👑 加拿大28  │  ⚡ 分分28   │  💎 比特28   │
│  (激活狀態)  │             │             │
└─────────────┴─────────────┴─────────────┘
```

### 3. 統計卡片（4 個）
```
┌────────────┬────────────┬────────────┬────────────┐
│ 總預測數    │ 正確預測    │ 錯誤預測    │  準確率     │
│   959      │   720      │   239      │ 75.08%     │
│ (藍色)     │ (綠色)     │ (紅色)     │ (粉色)     │
└────────────┴────────────┴────────────┴────────────┘
```

### 4. 算法性能對比
```
┌──────────────────────────────────────────┐
│  🎯 算法性能對比                          │
├────────┬────────┬────────┬────────────┤
│ 🥇算法4 │ 🥈算法3 │ 🥉算法1 │ 🎖️算法2    │
│ 78.02% │ 76.72% │ 73.76% │ 71.98%     │
│ 181次  │ 178次  │ 194次  │ 167次      │
│ 大小✓  │ 單雙✓  │        │            │
└────────┴────────┴────────┴────────────┘
```

### 5. 預測記錄表格
```
┌──────────────────────────────────────────┐
│  📊 預測記錄（最近20條）                   │
│  [全部] [算法1] [算法2] [算法3] [算法4]   │
├──────┬────────┬────────┬──────┬────────┤
│ 期號  │ 預測    │ 實際    │ 狀態 │ 結果    │
│ ...  │ 大小單  │ 大小雙  │ 已驗證│ ✓ 對   │
└──────┴────────┴────────┴──────┴────────┘
```

---

## 🎨 設計特色

### 配色方案

| 元素 | 顏色 | 用途 |
|------|------|------|
| 主背景 | `from-indigo-50 via-purple-50 to-pink-50` | 漸變背景 |
| 激活標籤 | `from-purple-600 to-pink-600` | 系統選擇 |
| 總預測數 | `text-indigo-600` | 統計數字 |
| 正確預測 | `text-green-600` | 成功標識 |
| 錯誤預測 | `text-red-600` | 失敗標識 |
| 準確率 | `text-pink-600` | 關鍵指標 |

### 動畫效果

- ✅ 懸停放大（`hover:shadow-xl`）
- ✅ 按鈕過渡（`transition-all duration-300`）
- ✅ 卡片陰影（`shadow-lg`）
- ✅ 骨架屏加載（`animate-pulse`）

---

## 🔌 API 集成

### 外部 API 配置

```javascript
// src/hooks/usePredictionAPI.js
const PREDICTION_API_BASE = 'http://156.67.218.225:5000';
const PREDICTION_API_KEY = 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506';
```

### API 端點

| 端點 | 用途 | 示例 |
|------|------|------|
| `/api/predictions` | 獲取加拿大28預測記錄 | - |
| `/api/predictions/stats` | 獲取加拿大28統計 | - |
| `/api/ff28/predictions` | 獲取分分28預測記錄 | - |
| `/api/ff28/predictions/stats` | 獲取分分28統計 | - |
| `/api/bit28/predictions` | 獲取比特28預測記錄 | - |
| `/api/bit28/predictions/stats` | 獲取比特28統計 | - |
| `/api/algorithm/compare` | 算法對比 | `?system=jnd28` |

### 請求格式

```javascript
fetch('http://156.67.218.225:5000/api/predictions', {
  method: 'GET',
  headers: {
    'X-API-Key': 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506',
    'Content-Type': 'application/json',
  },
});
```

### 響應格式

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "issue": "20250106-001",
      "prediction": "大單",
      "actual_result": "大雙",
      "result": "錯",
      "status": "verified",
      "algorithm": "算法4 - 加權歷史"
    }
  ]
}
```

---

## 📊 數據結構

### 統計數據 (PredictionStats)

```typescript
interface PredictionStats {
  total_predictions: number;      // 總預測數
  correct_predictions: number;    // 正確預測數
  wrong_predictions: number;      // 錯誤預測數
  accuracy_rate: number;          // 準確率 (%)
}
```

### 預測記錄 (Prediction)

```typescript
interface Prediction {
  id: number;
  issue: string;              // 期號
  prediction: string;         // 預測結果（如 "大單"）
  actual_result?: string;     // 實際結果
  result?: '對' | '錯';       // 驗證結果
  status: 'pending' | 'verified';  // 驗證狀態
  algorithm: string;          // 算法名稱
  algorithm_id: number;
  created_at: string;
  verified_at?: string;
}
```

### 算法數據 (AlgorithmData)

```typescript
interface AlgorithmData {
  algorithm_id: number;
  algorithm: string;              // 算法名稱
  total_predictions: number;      // 總預測數
  correct_predictions: number;    // 正確數
  wrong_predictions: number;      // 錯誤數
  accuracy_rate: string;          // 準確率
  size_correct_count: number;     // 大小正確數
  parity_correct_count: number;   // 單雙正確數
}
```

---

## 🚀 使用方法

### 1. 訪問頁面

```
方式 1：直接訪問 URL
https://dhtd.vercel.app/prediction-dashboard

方式 2：從導航菜單（待添加）
點擊 "預測系統" 菜單項
```

### 2. 切換系統

點擊頂部的三個標籤之一：
- 👑 加拿大28
- ⚡ 分分28
- 💎 比特28

系統會自動：
- ✅ 重新加載統計數據
- ✅ 重新加載算法對比
- ✅ 重新加載預測記錄

### 3. 查看統計

四個統計卡片實時顯示：
1. **總預測數** - 所有預測記錄總數
2. **正確預測** - 驗證為正確的預測數
3. **錯誤預測** - 驗證為錯誤的預測數
4. **準確率** - 正確率百分比

### 4. 算法對比

- 顯示最佳 4 個算法
- 按準確率從高到低排序
- 🥇🥈🥉🎖️ 獎牌標識
- 顯示大小/單雙統計
- **點擊算法卡片**可篩選該算法的預測記錄

### 5. 篩選記錄

在預測記錄區域：
1. 點擊 `[全部]` 按鈕 - 顯示所有記錄
2. 點擊 `[算法1]` 等按鈕 - 只顯示該算法的記錄
3. 或點擊上方算法卡片 - 自動篩選

### 6. 刷新數據

點擊右上角的 `[刷新數據]` 按鈕：
- ✅ 重新獲取統計數據
- ✅ 重新獲取算法對比
- ✅ 重新獲取預測記錄

---

## 🛠️ 技術實現

### 文件結構

```
src/
├── pages/
│   └── PredictionDashboard.jsx    # 主頁面組件
├── hooks/
│   └── usePredictionAPI.js        # API 調用 Hooks
└── router/
    └── index.jsx                  # 路由配置（已更新）
```

### 自定義 Hooks

#### usePredictions
```javascript
const { data, loading, error, refetch } = usePredictions('jnd28');
```

#### usePredictionStats
```javascript
const { data, loading, error, refetch } = usePredictionStats('jnd28');
```

#### useAlgorithmCompare
```javascript
const { data, loading, error, refetch } = useAlgorithmCompare('jnd28');
```

### 狀態管理

```javascript
const [activeSystem, setActiveSystem] = useState('jnd28');
const [selectedAlgorithm, setSelectedAlgorithm] = useState('全部');
```

---

## 🐛 錯誤處理

### 加載狀態

```jsx
{loading && (
  <div className="animate-pulse">
    <div className="h-4 bg-gray-200 rounded"></div>
  </div>
)}
```

### 錯誤狀態

```jsx
{error && (
  <div className="text-red-600">
    錯誤: {error}
  </div>
)}
```

### 空數據狀態

```jsx
{data.length === 0 && (
  <div className="text-center text-gray-500">
    暫無數據
  </div>
)}
```

---

## 📱 響應式設計

### 斷點配置

| 屏幕尺寸 | 佈局 |
|---------|------|
| `< 768px` | 單列佈局 |
| `768px - 1024px` | 2 列佈局 |
| `> 1024px` | 4 列佈局 |

### Grid 配置

```jsx
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
```

---

## 🎯 未來優化建議

### 功能增強

- [ ] 添加日期範圍篩選
- [ ] 添加算法詳細分析頁面
- [ ] 添加圖表可視化（折線圖、餅圖）
- [ ] 添加導出功能（CSV、Excel）
- [ ] 添加實時 WebSocket 更新
- [ ] 添加歷史趨勢分析

### 性能優化

- [ ] 實現數據緩存（React Query）
- [ ] 添加虛擬滾動（大數據量）
- [ ] 優化圖片加載
- [ ] 實現懶加載

### UI/UX 優化

- [ ] 添加深色模式
- [ ] 添加自定義主題
- [ ] 添加動畫過渡
- [ ] 添加加載進度條
- [ ] 添加提示信息（Tooltip）

---

## 🔗 相關文檔

- [REACT_GUIDE.md](./REACT_GUIDE.md) - React 調用 PC28 API 完整指南
- [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) - 項目技術文檔

---

## 📞 技術支持

### 常見問題

**Q: 為什麼數據加載失敗？**
A: 檢查：
1. API 服務是否運行（`http://156.67.218.225:5000`）
2. API Key 是否正確
3. 網絡連接是否正常
4. CORS 配置是否正確

**Q: 如何添加新的系統？**
A: 
1. 在 `systemLabels` 對象中添加新系統
2. 更新系統選擇按鈕
3. 確保 API 支持新系統的端點

**Q: 如何自定義樣式？**
A: 修改 `PredictionDashboard.jsx` 中的 Tailwind CSS 類名

---

## 🎉 版本歷史

### v1.0.0 (2025-10-06)
- ✅ 初始版本發布
- ✅ 三系統支持（加拿大28、分分28、比特28）
- ✅ 統計儀表板
- ✅ 算法性能對比
- ✅ 預測記錄列表
- ✅ 響應式設計
- ✅ 美觀的漸變色 UI

---

**享受預測分析！** 🚀

