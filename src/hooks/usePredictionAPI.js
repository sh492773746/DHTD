import { useState, useEffect, useCallback } from 'react';

// 使用后端代理调用外部预测 API
// 避免 CORS 和 Mixed Content 问题
const USE_PROXY = true; // 是否使用后端代理

// 外部预测 API 配置（仅在不使用代理时）
const EXTERNAL_API_BASE = 'http://156.67.218.225:5000';
const EXTERNAL_API_KEY = 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506';

// 創建 API 調用函數
async function callPredictionAPI(endpoint, params = {}) {
  let url, headers;
  
  if (USE_PROXY) {
    // 通过后端代理调用
    url = new URL(`/api/prediction-proxy${endpoint}`, window.location.origin);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    
    headers = {
      'Content-Type': 'application/json',
    };
  } else {
    // 直接调用外部 API（开发环境）
    url = new URL(`${EXTERNAL_API_BASE}${endpoint}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    
    headers = {
      'X-API-Key': EXTERNAL_API_KEY,
      'Content-Type': 'application/json',
    };
  }

  console.log('📡 Fetching prediction data:', url.toString());

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  console.log('📥 Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ API Error:', errorText);
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  console.log('✅ Response data:', data);
  
  if (USE_PROXY) {
    // 后端代理返回的格式
    if (data.success === false) {
      throw new Error(data.error || '數據加載失敗');
    }
    return data.data;
  } else {
    // 外部 API 返回的格式
    if (data.status !== 'success') {
      throw new Error(data.message || '數據加載失敗');
    }
    return data.data;
  }
}

// Hook: 獲取預測記錄
// 支持分页和算法筛选（API已更新支持limit、offset、page、algorithm_id参数）
export function usePredictions(system = 'jnd28', options = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = system === 'jnd28' 
        ? '/api/predictions' 
        : `/api/${system}/predictions`;

      // 支持 limit, offset, page, algorithm_id 参数
      const result = await callPredictionAPI(endpoint, options);
      
      setData(result || []);
      
      // 如果API返回了分页信息，保存它
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        setPagination({
          total: result.total,
          count: result.count,
          page: result.page,
          totalPages: result.total_pages,
          limit: result.limit,
          offset: result.offset,
        });
      }
    } catch (err) {
      setError(err.message);
      console.error('獲取預測數據失敗:', err);
    } finally {
      setLoading(false);
    }
  }, [system, JSON.stringify(options)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, pagination, refetch: fetchData };
}

// Hook: 獲取所有算法的預測記錄（每個算法獲取指定數量）
export function useAllAlgorithmPredictions(system = 'jnd28', limitPerAlgorithm = 20) {
  const [data, setData] = useState({ 1: [], 2: [], 3: [], 4: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = system === 'jnd28' 
        ? '/api/predictions' 
        : `/api/${system}/predictions`;

      // 並行請求4個算法的數據
      const algorithms = [1, 2, 3, 4];
      const promises = algorithms.map(algoId => 
        callPredictionAPI(endpoint, { 
          algorithm_id: algoId, 
          limit: limitPerAlgorithm 
        })
      );

      const results = await Promise.all(promises);
      
      // 組織數據：{ 1: [...], 2: [...], 3: [...], 4: [...] }
      const organizedData = {};
      algorithms.forEach((algoId, index) => {
        organizedData[algoId] = results[index] || [];
      });

      setData(organizedData);
    } catch (err) {
      setError(err.message);
      console.error('獲取所有算法數據失敗:', err);
    } finally {
      setLoading(false);
    }
  }, [system, limitPerAlgorithm]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// Hook: 獲取統計數據
export function usePredictionStats(system = 'jnd28') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = system === 'jnd28'
        ? '/api/predictions/stats'
        : `/api/${system}/predictions/stats`;

      const result = await callPredictionAPI(endpoint);
      setData(result);
    } catch (err) {
      setError(err.message);
      console.error('獲取統計數據失敗:', err);
    } finally {
      setLoading(false);
    }
  }, [system]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// Hook: 獲取算法對比數據
export function useAlgorithmCompare(system = 'jnd28') {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await callPredictionAPI('/api/algorithm/compare', { system });
      setData(result || []);
    } catch (err) {
      setError(err.message);
      console.error('獲取算法對比數據失敗:', err);
    } finally {
      setLoading(false);
    }
  }, [system]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

