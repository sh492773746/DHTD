import { useState, useEffect, useCallback } from 'react';

// 預測系統 API 配置
const PREDICTION_API_BASE = 'http://156.67.218.225:5000';
const PREDICTION_API_KEY = 'jnd28_api_key_5a738f303ae60b7183fa56773e8a3506';

// 創建 API 調用函數
async function callPredictionAPI(endpoint, params = {}) {
  const url = new URL(`${PREDICTION_API_BASE}${endpoint}`);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': PREDICTION_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.status !== 'success') {
    throw new Error(data.message || '數據加載失敗');
  }

  return data.data;
}

// Hook: 獲取預測記錄
export function usePredictions(system = 'jnd28') {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = system === 'jnd28' 
        ? '/api/predictions' 
        : `/api/${system}/predictions`;

      const result = await callPredictionAPI(endpoint);
      setData(result || []);
    } catch (err) {
      setError(err.message);
      console.error('獲取預測數據失敗:', err);
    } finally {
      setLoading(false);
    }
  }, [system]);

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

