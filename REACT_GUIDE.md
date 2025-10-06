# React 调用 PC28 预测 API 完整指南

## 📋 目录

1. [基础设置](#基础设置)
2. [单个组件示例](#单个组件示例)
3. [完整应用示例](#完整应用示例)
4. [自定义 Hook](#自定义-hook)
5. [TypeScript 版本](#typescript-版本)
6. [错误处理](#错误处理)
7. [最佳实践](#最佳实践)

---

## 基础设置

### 1. 创建 React 项目

```bash
# 使用 Create React App
npx create-react-app pc28-dashboard
cd pc28-dashboard

# 安装 axios（可选，也可以使用 fetch）
npm install axios

# 启动开发服务器
npm start
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
REACT_APP_API_BASE_URL=http://156.67.218.225:5000
REACT_APP_API_KEY=your_secure_api_key_here
```

---

## 单个组件示例

### 示例 1：获取加拿大28预测记录（使用 fetch）

```jsx
// src/components/PredictionList.jsx
import React, { useState, useEffect } from 'react';

function PredictionList() {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPredictions();
  }, []);

  const fetchPredictions = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${process.env.REACT_APP_API_BASE_URL}/api/predictions`,
        {
          method: 'GET',
          headers: {
            'X-API-Key': process.env.REACT_APP_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === 'success') {
        setPredictions(data.data);
      } else {
        throw new Error(data.message || '数据加载失败');
      }
    } catch (err) {
      setError(err.message);
      console.error('获取预测数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">错误: {error}</div>;

  return (
    <div className="prediction-list">
      <h2>加拿大28预测记录</h2>
      <button onClick={fetchPredictions}>刷新</button>
      
      <table>
        <thead>
          <tr>
            <th>期号</th>
            <th>预测</th>
            <th>实际结果</th>
            <th>状态</th>
            <th>结果</th>
            <th>算法</th>
          </tr>
        </thead>
        <tbody>
          {predictions.map((pred) => (
            <tr key={pred.id}>
              <td>{pred.issue}</td>
              <td>{pred.prediction}</td>
              <td>{pred.actual_result || '-'}</td>
              <td>{pred.status === 'verified' ? '已验证' : '待验证'}</td>
              <td>
                {pred.result === '对' ? '✓ 对' : pred.result === '错' ? '✗ 错' : '-'}
              </td>
              <td>{pred.algorithm}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PredictionList;
```

### 示例 2：获取统计数据（使用 axios）

```jsx
// src/components/PredictionStats.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  headers: {
    'X-API-Key': process.env.REACT_APP_API_KEY,
  },
});

function PredictionStats({ system = 'jnd28' }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
  }, [system]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = system === 'jnd28' 
        ? '/api/predictions/stats'
        : `/api/${system}/predictions/stats`;

      const response = await api.get(endpoint);

      if (response.data.status === 'success') {
        setStats(response.data.data);
      } else {
        throw new Error(response.data.message);
      }
    } catch (err) {
      setError(err.message);
      console.error('获取统计数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;
  if (!stats) return null;

  return (
    <div className="stats-grid">
      <div className="stat-card">
        <h3>总预测数</h3>
        <p className="stat-value">{stats.total_predictions}</p>
      </div>
      <div className="stat-card">
        <h3>正确预测</h3>
        <p className="stat-value correct">{stats.correct_predictions}</p>
      </div>
      <div className="stat-card">
        <h3>错误预测</h3>
        <p className="stat-value wrong">{stats.wrong_predictions}</p>
      </div>
      <div className="stat-card">
        <h3>准确率</h3>
        <p className="stat-value accuracy">{stats.accuracy_rate}%</p>
      </div>
    </div>
  );
}

export default PredictionStats;
```

### 示例 3：算法对比组件

```jsx
// src/components/AlgorithmCompare.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  headers: {
    'X-API-Key': process.env.REACT_APP_API_KEY,
  },
});

function AlgorithmCompare() {
  const [system, setSystem] = useState('jnd28');
  const [algorithms, setAlgorithms] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAlgorithmData();
  }, [system]);

  const fetchAlgorithmData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/algorithm/compare', {
        params: { system }
      });

      if (response.data.status === 'success') {
        setAlgorithms(response.data.data);
      }
    } catch (err) {
      console.error('获取算法对比数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="algorithm-compare">
      <h2>算法性能对比</h2>
      
      <div className="system-selector">
        <button 
          onClick={() => setSystem('jnd28')}
          className={system === 'jnd28' ? 'active' : ''}
        >
          加拿大28
        </button>
        <button 
          onClick={() => setSystem('ff28')}
          className={system === 'ff28' ? 'active' : ''}
        >
          分分28
        </button>
        <button 
          onClick={() => setSystem('bit28')}
          className={system === 'bit28' ? 'active' : ''}
        >
          比特28
        </button>
      </div>

      {loading ? (
        <div>加载中...</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>算法</th>
              <th>总预测数</th>
              <th>正确数</th>
              <th>准确率</th>
            </tr>
          </thead>
          <tbody>
            {algorithms.map((algo) => (
              <tr key={algo.algorithm_id}>
                <td>{algo.algorithm}</td>
                <td>{algo.total_predictions}</td>
                <td>{algo.correct_predictions}</td>
                <td>{parseFloat(algo.accuracy_rate).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AlgorithmCompare;
```

---

## 完整应用示例

### 主应用组件

```jsx
// src/App.js
import React, { useState } from 'react';
import PredictionList from './components/PredictionList';
import PredictionStats from './components/PredictionStats';
import AlgorithmCompare from './components/AlgorithmCompare';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('jnd28');

  return (
    <div className="App">
      <header>
        <h1>🎯 PC28预测系统仪表板</h1>
      </header>

      <nav className="tabs">
        <button 
          onClick={() => setActiveTab('jnd28')}
          className={activeTab === 'jnd28' ? 'active' : ''}
        >
          加拿大28
        </button>
        <button 
          onClick={() => setActiveTab('ff28')}
          className={activeTab === 'ff28' ? 'active' : ''}
        >
          分分28
        </button>
        <button 
          onClick={() => setActiveTab('bit28')}
          className={activeTab === 'bit28' ? 'active' : ''}
        >
          比特28
        </button>
      </nav>

      <main>
        <section>
          <PredictionStats system={activeTab} />
        </section>

        <section>
          <PredictionList system={activeTab} />
        </section>

        <section>
          <AlgorithmCompare />
        </section>
      </main>
    </div>
  );
}

export default App;
```

### 样式文件

```css
/* src/App.css */
.App {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen';
}

header {
  text-align: center;
  margin-bottom: 30px;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px;
}

.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  border-bottom: 2px solid #e0e0e0;
}

.tabs button {
  padding: 12px 24px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  color: #666;
  transition: all 0.3s;
}

.tabs button:hover {
  color: #667eea;
}

.tabs button.active {
  color: #667eea;
  border-bottom: 3px solid #667eea;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  text-align: center;
}

.stat-card h3 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #667eea;
  margin: 0;
}

.stat-value.correct {
  color: #10b981;
}

.stat-value.wrong {
  color: #ef4444;
}

.stat-value.accuracy {
  color: #764ba2;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

table thead {
  background: #f8f9fa;
}

table th {
  padding: 15px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #e0e0e0;
}

table td {
  padding: 12px 15px;
  border-bottom: 1px solid #f0f0f0;
}

table tbody tr:hover {
  background: #f8f9fa;
}

.loading, .error {
  padding: 40px;
  text-align: center;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.error {
  color: #ef4444;
  background: #fee;
}

button {
  padding: 10px 20px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s;
}

button:hover {
  background: #5568d3;
  transform: translateY(-2px);
}
```

---

## 自定义 Hook

### useAPI Hook - 可复用的数据获取 Hook

```jsx
// src/hooks/useAPI.js
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  headers: {
    'X-API-Key': process.env.REACT_APP_API_KEY,
  },
});

export function useAPI(endpoint, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    params = {},
    autoFetch = true,
    onSuccess,
    onError,
  } = options;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get(endpoint, { params });

      if (response.data.status === 'success') {
        setData(response.data.data);
        onSuccess?.(response.data.data);
      } else {
        throw new Error(response.data.message || '请求失败');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      setError(errorMessage);
      onError?.(errorMessage);
      console.error('API请求失败:', err);
    } finally {
      setLoading(false);
    }
  }, [endpoint, JSON.stringify(params)]);

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [fetchData, autoFetch]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

// 使用示例
export function usePredictions(system = 'jnd28') {
  const endpoint = system === 'jnd28' 
    ? '/api/predictions' 
    : `/api/${system}/predictions`;
  
  return useAPI(endpoint);
}

export function usePredictionStats(system = 'jnd28') {
  const endpoint = system === 'jnd28'
    ? '/api/predictions/stats'
    : `/api/${system}/predictions/stats`;
  
  return useAPI(endpoint);
}

export function useAlgorithmCompare(system = 'jnd28') {
  return useAPI('/api/algorithm/compare', {
    params: { system }
  });
}
```

### 使用自定义 Hook 的组件

```jsx
// src/components/PredictionDashboard.jsx
import React from 'react';
import { usePredictions, usePredictionStats } from '../hooks/useAPI';

function PredictionDashboard({ system }) {
  const { 
    data: predictions, 
    loading: loadingPredictions, 
    error: errorPredictions,
    refetch: refetchPredictions 
  } = usePredictions(system);

  const { 
    data: stats, 
    loading: loadingStats 
  } = usePredictionStats(system);

  if (loadingPredictions || loadingStats) {
    return <div>加载中...</div>;
  }

  if (errorPredictions) {
    return <div>错误: {errorPredictions}</div>;
  }

  return (
    <div>
      <div className="stats-section">
        <h2>统计数据</h2>
        {stats && (
          <div className="stats-grid">
            <div>总预测: {stats.total_predictions}</div>
            <div>准确率: {stats.accuracy_rate}%</div>
          </div>
        )}
      </div>

      <div className="predictions-section">
        <h2>预测记录</h2>
        <button onClick={refetchPredictions}>刷新</button>
        {/* 渲染预测列表 */}
      </div>
    </div>
  );
}

export default PredictionDashboard;
```

---

## TypeScript 版本

### API 类型定义

```typescript
// src/types/api.ts
export interface Prediction {
  id: number;
  issue: string;
  predicted_size: string;
  predicted_parity: string;
  prediction: string;
  actual_sum?: number;
  actual_size?: string;
  actual_parity?: string;
  actual_result?: string;
  result?: '对' | '错';
  status: 'pending' | 'verified';
  algorithm: string;
  algorithm_id: number;
  created_at: string;
  verified_at?: string;
}

export interface PredictionStats {
  total_predictions: number;
  correct_predictions: number;
  wrong_predictions: number;
  accuracy_rate: number;
}

export interface AlgorithmData {
  algorithm_id: number;
  algorithm: string;
  total_predictions: number;
  correct_predictions: number;
  wrong_predictions: number;
  accuracy_rate: string;
  size_correct_count: number;
  parity_correct_count: number;
}

export interface APIResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}
```

### TypeScript 组件示例

```typescript
// src/components/PredictionList.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Prediction, APIResponse } from '../types/api';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  headers: {
    'X-API-Key': process.env.REACT_APP_API_KEY || '',
  },
});

interface PredictionListProps {
  system?: 'jnd28' | 'ff28' | 'bit28';
}

const PredictionList: React.FC<PredictionListProps> = ({ system = 'jnd28' }) => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPredictions();
  }, [system]);

  const fetchPredictions = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = system === 'jnd28' 
        ? '/api/predictions' 
        : `/api/${system}/predictions`;

      const response = await api.get<APIResponse<Prediction[]>>(endpoint);

      if (response.data.status === 'success' && response.data.data) {
        setPredictions(response.data.data);
      } else {
        throw new Error(response.data.message || '数据加载失败');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      setError(errorMessage);
      console.error('获取预测数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error">错误: {error}</div>;

  return (
    <div className="prediction-list">
      <h2>预测记录</h2>
      <button onClick={fetchPredictions}>刷新</button>
      
      <table>
        <thead>
          <tr>
            <th>期号</th>
            <th>预测</th>
            <th>实际结果</th>
            <th>状态</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          {predictions.map((pred) => (
            <tr key={pred.id}>
              <td>{pred.issue}</td>
              <td>{pred.prediction}</td>
              <td>{pred.actual_result || '-'}</td>
              <td>{pred.status === 'verified' ? '已验证' : '待验证'}</td>
              <td>
                {pred.result === '对' ? '✓ 对' : 
                 pred.result === '错' ? '✗ 错' : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PredictionList;
```

---

## 错误处理

### 完整的错误处理示例

```jsx
// src/utils/apiClient.js
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  timeout: 10000,
  headers: {
    'X-API-Key': process.env.REACT_APP_API_KEY,
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    console.log('API请求:', config.url);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    // 统一处理成功响应
    if (response.data.status === 'success') {
      return response;
    } else {
      return Promise.reject(new Error(response.data.message || '请求失败'));
    }
  },
  (error) => {
    // 统一错误处理
    let errorMessage = '网络错误';

    if (error.response) {
      // 服务器返回错误状态码
      switch (error.response.status) {
        case 401:
          errorMessage = 'API密钥无效';
          break;
        case 403:
          errorMessage = '访问被拒绝';
          break;
        case 404:
          errorMessage = '接口不存在';
          break;
        case 429:
          errorMessage = '请求过于频繁，请稍后再试';
          break;
        case 500:
          errorMessage = '服务器内部错误';
          break;
        default:
          errorMessage = error.response.data?.message || '请求失败';
      }
    } else if (error.request) {
      // 请求已发送但没有收到响应
      errorMessage = '服务器无响应，请检查网络连接';
    } else {
      // 其他错误
      errorMessage = error.message;
    }

    console.error('API错误:', errorMessage, error);
    return Promise.reject(new Error(errorMessage));
  }
);

export default apiClient;
```

### 使用错误处理的组件

```jsx
// src/components/SafePredictionList.jsx
import React, { useState, useEffect } from 'react';
import apiClient from '../utils/apiClient';

function SafePredictionList() {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    fetchPredictions();
  }, [retryCount]);

  const fetchPredictions = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get('/api/predictions');
      setPredictions(response.data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>正在加载数据...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <p className="error-message">❌ {error}</p>
        <button onClick={handleRetry}>重试</button>
      </div>
    );
  }

  if (predictions.length === 0) {
    return <div className="empty-state">暂无数据</div>;
  }

  return (
    <div>
      {/* 渲染预测列表 */}
    </div>
  );
}

export default SafePredictionList;
```

---

## 最佳实践

### 1. 使用 Context 管理 API 配置

```jsx
// src/contexts/APIContext.jsx
import React, { createContext, useContext } from 'react';
import axios from 'axios';

const APIContext = createContext();

export const APIProvider = ({ children }) => {
  const api = axios.create({
    baseURL: process.env.REACT_APP_API_BASE_URL,
    headers: {
      'X-API-Key': process.env.REACT_APP_API_KEY,
    },
  });

  return (
    <APIContext.Provider value={{ api }}>
      {children}
    </APIContext.Provider>
  );
};

export const useAPIContext = () => {
  const context = useContext(APIContext);
  if (!context) {
    throw new Error('useAPIContext must be used within APIProvider');
  }
  return context;
};
```

### 2. 数据缓存策略

```jsx
// src/hooks/useCachedAPI.js
import { useState, useEffect } from 'react';
import apiClient from '../utils/apiClient';

const cache = new Map();
const CACHE_DURATION = 60000; // 1分钟

export function useCachedAPI(endpoint, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      // 检查缓存
      const cached = cache.get(endpoint);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setData(cached.data);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await apiClient.get(endpoint, options);
        const responseData = response.data.data;

        // 更新缓存
        cache.set(endpoint, {
          data: responseData,
          timestamp: Date.now(),
        });

        setData(responseData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [endpoint]);

  return { data, loading, error };
}
```

### 3. 分页和无限滚动

```jsx
// src/components/InfinitePredictions.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../utils/apiClient';

function InfinitePredictions() {
  const [predictions, setPredictions] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const observer = useRef();
  const lastElementRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prev => prev + 1);
      }
    });
    
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  useEffect(() => {
    fetchPredictions();
  }, [page]);

  const fetchPredictions = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/predictions', {
        params: { page, limit: 20 }
      });
      
      const newData = response.data.data || [];
      setPredictions(prev => [...prev, ...newData]);
      setHasMore(newData.length > 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {predictions.map((pred, index) => {
        if (predictions.length === index + 1) {
          return (
            <div ref={lastElementRef} key={pred.id}>
              {/* 渲染预测项 */}
            </div>
          );
        }
        return <div key={pred.id}>{/* 渲染预测项 */}</div>;
      })}
      {loading && <div>加载更多...</div>}
    </div>
  );
}

export default InfinitePredictions;
```

---

## 📚 API 端点速查表

| 端点 | 方法 | 描述 | 需要API Key |
|------|------|------|-------------|
| `/api/health` | GET | 健康检查 | ❌ |
| `/api/predictions` | GET | 加拿大28预测记录 | ✅ |
| `/api/predictions/stats` | GET | 加拿大28统计 | ✅ |
| `/api/ff28/predictions` | GET | 分分28预测记录 | ✅ |
| `/api/ff28/predictions/stats` | GET | 分分28统计 | ✅ |
| `/api/bit28/predictions` | GET | 比特28预测记录 | ✅ |
| `/api/bit28/predictions/stats` | GET | 比特28统计 | ✅ |
| `/api/algorithm/compare?system=jnd28` | GET | 算法对比 | ✅ |
| `/api/algorithm/analysis?system=jnd28` | GET | 算法深度分析 | ✅ |
| `/api/export/predictions?system=jnd28` | GET | 导出CSV | ✅ |

---

## 🎯 快速开始清单

- [ ] 创建 React 项目
- [ ] 安装依赖（axios 可选）
- [ ] 配置 `.env` 文件
- [ ] 创建 API 客户端
- [ ] 实现基础组件
- [ ] 添加错误处理
- [ ] 测试 API 调用
- [ ] 优化性能（缓存、防抖）
- [ ] 部署应用

---

## 📞 遇到问题？

1. 检查 API Key 是否正确配置
2. 确认 API 服务是否运行（访问 health 端点）
3. 查看浏览器控制台的错误信息
4. 检查 CORS 配置
5. 验证网络连接

祝开发顺利！🚀

# API 分页和筛选功能使用指南

## 📋 概述

所有预测API端点现在都支持分页、自定义返回数量和算法筛选功能！

### 支持分页的端点

- ✅ `/api/predictions` - 加拿大28预测记录
- ✅ `/api/ff28/predictions` - 分分28预测记录  
- ✅ `/api/bit28/predictions` - 比特28预测记录

---

## 🎯 URL 参数说明

### 1. `limit` - 返回数量

控制每次请求返回的记录数量。

- **默认值**: 20
- **最大值**: 200
- **最小值**: 1
- **类型**: 整数

**示例：**
```
/api/predictions?limit=50        # 返回50条记录
/api/ff28/predictions?limit=100  # 返回100条记录
/api/bit28/predictions?limit=200 # 返回200条记录（最大值）
```

### 2. `offset` - 偏移量

指定从哪一条记录开始返回（从0开始计数）。

- **默认值**: 0
- **类型**: 整数
- **用途**: 配合limit实现分页

**示例：**
```
/api/predictions?limit=20&offset=0   # 第1-20条
/api/predictions?limit=20&offset=20  # 第21-40条
/api/predictions?limit=20&offset=40  # 第41-60条
```

### 3. `page` - 页码

更直观的分页方式（从1开始）。

- **类型**: 整数
- **说明**: 会自动计算offset，与offset参数二选一
- **计算公式**: `offset = (page - 1) * limit`

**示例：**
```
/api/predictions?limit=20&page=1  # 第1页（第1-20条）
/api/predictions?limit=20&page=2  # 第2页（第21-40条）
/api/predictions?limit=20&page=3  # 第3页（第41-60条）
```

### 4. `algorithm_id` - 算法筛选

按特定算法筛选预测记录。

- **可选值**: 1, 2, 3, 4
  - 1 = 算法1 - 趋势反转
  - 2 = 算法2 - 概率统计
  - 3 = 算法3 - 随机对照
  - 4 = 算法4 - 加权历史
- **类型**: 整数
- **说明**: 可选参数，不传则返回所有算法

**示例：**
```
/api/predictions?algorithm_id=1           # 只返回算法1的预测
/api/predictions?algorithm_id=2&limit=50  # 返回算法2的50条预测
```

---

## 📊 响应格式

### 新增的分页信息字段

```json
{
  "status": "success",
  "count": 20,           // 本次返回的记录数
  "total": 863,          // 总记录数
  "page": 1,             // 当前页码
  "total_pages": 44,     // 总页数
  "limit": 20,           // 每页记录数
  "offset": 0,           // 偏移量
  "data": [...]          // 预测数据数组
}
```

### 字段说明

| 字段 | 说明 | 示例 |
|------|------|------|
| `count` | 本次返回的实际记录数 | 20 |
| `total` | 满足条件的总记录数 | 863 |
| `page` | 当前页码 | 1 |
| `total_pages` | 总页数 | 44 |
| `limit` | 每页记录数 | 20 |
| `offset` | 当前偏移量 | 0 |
| `data` | 预测数据数组 | [...] |

---

## 💡 使用示例

### 示例 1: 获取每个算法的20条数据

如果您需要每个算法都有20条数据（总共80条），可以这样做：

**方法1: 分4次请求（推荐）**

```javascript
// 使用 JavaScript/React
async function fetchAllAlgorithms() {
  const algorithms = [1, 2, 3, 4];
  const allData = [];
  
  for (const algoId of algorithms) {
    const response = await fetch(
      `http://156.67.218.225:5000/api/predictions?algorithm_id=${algoId}&limit=20`,
      {
        headers: {
          'X-API-Key': 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506'
        }
      }
    );
    
    const result = await response.json();
    allData.push({
      algorithm: algoId,
      data: result.data
    });
  }
  
  return allData;
}

// 使用
fetchAllAlgorithms().then(data => {
  console.log('算法1数据:', data[0].data);  // 20条
  console.log('算法2数据:', data[1].data);  // 20条
  console.log('算法3数据:', data[2].data);  // 20条
  console.log('算法4数据:', data[3].data);  // 20条
});
```

**方法2: 一次获取80条（所有算法混合）**

```javascript
async function fetchMixedData() {
  const response = await fetch(
    'http://156.67.218.225:5000/api/predictions?limit=80',
    {
      headers: {
        'X-API-Key': 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506'
      }
    }
  );
  
  const result = await response.json();
  
  // 按算法分组
  const grouped = result.data.reduce((acc, item) => {
    const algoId = item.algorithm_id;
    if (!acc[algoId]) acc[algoId] = [];
    acc[algoId].push(item);
    return acc;
  }, {});
  
  return grouped;
}
```

### 示例 2: 实现分页列表

```javascript
function PaginatedPredictions() {
  const [data, setData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const limit = 20;
  
  const fetchPage = async (page) => {
    const response = await fetch(
      `http://156.67.218.225:5000/api/predictions?limit=${limit}&page=${page}`,
      {
        headers: {
          'X-API-Key': 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506'
        }
      }
    );
    
    const result = await response.json();
    setData(result.data);
    setTotalPages(result.total_pages);
    setCurrentPage(result.page);
  };
  
  return (
    <div>
      {/* 显示数据 */}
      {data.map(item => <div key={item.id}>{item.issue}</div>)}
      
      {/* 分页按钮 */}
      <button 
        onClick={() => fetchPage(currentPage - 1)}
        disabled={currentPage === 1}
      >
        上一页
      </button>
      
      <span>{currentPage} / {totalPages}</span>
      
      <button 
        onClick={() => fetchPage(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        下一页
      </button>
    </div>
  );
}
```

### 示例 3: 无限滚动

```javascript
function InfiniteScroll() {
  const [predictions, setPredictions] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;
  
  const loadMore = async () => {
    const response = await fetch(
      `http://156.67.218.225:5000/api/predictions?limit=${limit}&offset=${offset}`,
      {
        headers: {
          'X-API-Key': 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506'
        }
      }
    );
    
    const result = await response.json();
    
    if (result.data.length > 0) {
      setPredictions(prev => [...prev, ...result.data]);
      setOffset(prev => prev + limit);
    } else {
      setHasMore(false);
    }
  };
  
  return (
    <div>
      {predictions.map(item => <div key={item.id}>{item.issue}</div>)}
      
      {hasMore && (
        <button onClick={loadMore}>加载更多</button>
      )}
    </div>
  );
}
```

### 示例 4: 获取特定算法的大量数据

```javascript
// 获取算法1的100条预测
async function getAlgorithm1Data() {
  const response = await fetch(
    'http://156.67.218.225:5000/api/predictions?algorithm_id=1&limit=100',
    {
      headers: {
        'X-API-Key': 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506'
      }
    }
  );
  
  const result = await response.json();
  console.log(`返回了 ${result.count} 条算法1的数据`);
  console.log(`总共有 ${result.total} 条算法1的数据`);
  
  return result.data;
}
```

---

## 🔧 实用技巧

### 1. 如何获取所有数据？

如果您需要获取所有数据（不推荐，数据量大时会很慢）：

```javascript
async function getAllData() {
  const response = await fetch(
    'http://156.67.218.225:5000/api/predictions?limit=200',
    {
      headers: {
        'X-API-Key': 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506'
      }
    }
  );
  
  const result = await response.json();
  const total = result.total;
  const allData = [...result.data];
  
  // 计算还需要几次请求
  const remainingPages = Math.ceil((total - 200) / 200);
  
  for (let i = 1; i <= remainingPages; i++) {
    const res = await fetch(
      `http://156.67.218.225:5000/api/predictions?limit=200&offset=${i * 200}`,
      {
        headers: {
          'X-API-Key': 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506'
        }
      }
    );
    
    const data = await res.json();
    allData.push(...data.data);
  }
  
  return allData;
}
```

### 2. 参数组合优先级

- 如果同时提供 `page` 和 `offset`，`page` 优先
- `algorithm_id` 可以与任何分页参数组合使用

### 3. 性能优化建议

- ✅ 使用分页，避免一次请求大量数据
- ✅ 使用 `algorithm_id` 筛选，减少不需要的数据传输
- ✅ 合理设置 `limit`，建议 20-50 条
- ❌ 避免频繁请求全量数据

---

## 📋 完整API示例

### cURL 示例

```bash
# 基础请求（默认20条）
curl -H "X-API-Key: jnd28_api_key_5a738f303ae60b7183fa56773e8a3506" \
  http://156.67.218.225:5000/api/predictions

# 获取50条数据
curl -H "X-API-Key: jnd28_api_key_5a738f303ae60b7183fa56773e8a3506" \
  "http://156.67.218.225:5000/api/predictions?limit=50"

# 获取第2页（每页20条）
curl -H "X-API-Key: jnd28_api_key_5a738f303ae60b7183fa56773e8a3506" \
  "http://156.67.218.225:5000/api/predictions?limit=20&page=2"

# 只获取算法1的数据
curl -H "X-API-Key: jnd28_api_key_5a738f303ae60b7183fa56773e8a3506" \
  "http://156.67.218.225:5000/api/predictions?algorithm_id=1"

# 获取算法2的100条数据
curl -H "X-API-Key: jnd28_api_key_5a738f303ae60b7183fa56773e8a3506" \
  "http://156.67.218.225:5000/api/predictions?algorithm_id=2&limit=100"

# 使用offset分页
curl -H "X-API-Key: jnd28_api_key_5a738f303ae60b7183fa56773e8a3506" \
  "http://156.67.218.225:5000/api/predictions?limit=20&offset=40"
```

### Python 示例

```python
import requests

API_KEY = "jnd28_api_key_5a738f303ae60b7183fa56773e8a3506"
BASE_URL = "http://156.67.218.225:5000"

headers = {
    "X-API-Key": API_KEY
}

# 获取每个算法的20条数据
def get_all_algorithms_data():
    all_data = {}
    
    for algo_id in [1, 2, 3, 4]:
        response = requests.get(
            f"{BASE_URL}/api/predictions",
            headers=headers,
            params={
                "algorithm_id": algo_id,
                "limit": 20
            }
        )
        
        result = response.json()
        all_data[f"算法{algo_id}"] = result['data']
    
    return all_data

# 分页获取数据
def get_paginated_data(page=1, limit=20):
    response = requests.get(
        f"{BASE_URL}/api/predictions",
        headers=headers,
        params={
            "page": page,
            "limit": limit
        }
    )
    
    return response.json()

# 使用示例
data = get_all_algorithms_data()
print(f"算法1数据: {len(data['算法1'])} 条")
print(f"算法2数据: {len(data['算法2'])} 条")

paginated = get_paginated_data(page=1, limit=50)
print(f"第1页共 {paginated['count']} 条数据")
print(f"总共 {paginated['total']} 条数据")
print(f"共 {paginated['total_pages']} 页")
```

### Node.js/axios 示例

```javascript
const axios = require('axios');

const API_KEY = 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506';
const BASE_URL = 'http://156.67.218.225:5000';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-API-Key': API_KEY
  }
});

// 获取每个算法的20条数据
async function getAllAlgorithmsData() {
  const algorithms = [1, 2, 3, 4];
  const promises = algorithms.map(id => 
    api.get('/api/predictions', {
      params: { algorithm_id: id, limit: 20 }
    })
  );
  
  const results = await Promise.all(promises);
  
  return results.map((res, idx) => ({
    algorithm: algorithms[idx],
    count: res.data.count,
    data: res.data.data
  }));
}

// 使用
getAllAlgorithmsData().then(data => {
  data.forEach(item => {
    console.log(`算法${item.algorithm}: ${item.count}条数据`);
  });
});
```

---

## ❓ 常见问题

### Q1: 为什么我只能获取20条数据？

**A**: 默认 `limit=20`，请添加 `limit` 参数增加返回数量，最大200。

```
http://156.67.218.225:5000/api/predictions?limit=100
```

### Q2: 如何获取每个算法的20条数据？

**A**: 分别请求每个算法ID：

```javascript
for (let algoId = 1; algoId <= 4; algoId++) {
  fetch(`/api/predictions?algorithm_id=${algoId}&limit=20`)
}
```

### Q3: 分页时，page 和 offset 有什么区别？

**A**: 
- `page`: 更直观，从1开始计数（第1页、第2页...）
- `offset`: 更底层，表示跳过多少条记录（0, 20, 40...）

推荐使用 `page` 参数，更易理解。

### Q4: 能否一次获取所有数据？

**A**: 技术上可以，但不推荐。建议：
- 使用分页，每次获取适量数据
- 最大单次请求限制为200条
- 如需更多，请分多次请求

### Q5: 响应中的 total 和 count 有什么区别？

**A**:
- `total`: 数据库中符合条件的总记录数
- `count`: 本次请求实际返回的记录数

---

## 🎯 总结

现在您可以：

✅ 自定义返回数量（1-200条）  
✅ 使用分页获取大量数据  
✅ 按算法ID筛选数据  
✅ 获取完整的分页信息  

**最佳实践：**
- 需要每个算法20条 → 分4次请求，每次 `algorithm_id` 不同
- 需要大量数据 → 使用分页，避免一次获取所有
- 需要性能优化 → 合理设置 `limit`，使用 `algorithm_id` 筛选

祝使用愉快！🚀

