import { getRedisClient } from './redis.js';

// 雙層查詢緩存系統
// L1: 內存緩存（快速，但有大小限制）
// L2: Redis 緩存（持久化，多實例共享）

// L1: 內存緩存配置
const MAX_MEMORY_CACHE_SIZE = 500; // 最多緩存 500 個項目
const memoryCache = new Map();
const cacheAccessOrder = []; // LRU 順序

// 緩存統計
const cacheStats = {
  hits: 0,
  misses: 0,
  memoryHits: 0,
  redisHits: 0,
};

// LRU 清理（移除最少使用的項）
function evictLRU() {
  if (memoryCache.size <= MAX_MEMORY_CACHE_SIZE) return;
  
  // 移除最舊的項
  const oldestKey = cacheAccessOrder.shift();
  if (oldestKey) {
    memoryCache.delete(oldestKey);
  }
}

// 更新訪問順序
function touchKey(key) {
  const idx = cacheAccessOrder.indexOf(key);
  if (idx > -1) {
    cacheAccessOrder.splice(idx, 1);
  }
  cacheAccessOrder.push(key);
}

// 獲取緩存
export async function getCache(key) {
  // L1: 檢查內存緩存
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry) {
    const now = Date.now();
    if (now < memoryEntry.expiresAt) {
      touchKey(key);
      cacheStats.hits++;
      cacheStats.memoryHits++;
      return memoryEntry.value;
    } else {
      // 過期，移除
      memoryCache.delete(key);
    }
  }
  
  // L2: 檢查 Redis
  const redis = getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached !== null) {
        // 解析並存入內存緩存
        const value = JSON.parse(cached);
        cacheStats.hits++;
        cacheStats.redisHits++;
        
        // 回填到內存緩存（假設 5 分鐘過期）
        setMemoryCache(key, value, 5 * 60 * 1000);
        
        return value;
      }
    } catch (e) {
      console.error('Redis get error:', e);
    }
  }
  
  cacheStats.misses++;
  return null;
}

// 設置緩存
export async function setCache(key, value, ttlMs = 5 * 60 * 1000) {
  // L1: 內存緩存
  setMemoryCache(key, value, ttlMs);
  
  // L2: Redis 緩存
  const redis = getRedisClient();
  if (redis) {
    try {
      const ttlSeconds = Math.ceil(ttlMs / 1000);
      await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
    } catch (e) {
      console.error('Redis set error:', e);
    }
  }
}

// 設置內存緩存
function setMemoryCache(key, value, ttlMs) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  touchKey(key);
  evictLRU();
}

// 刪除緩存
export async function deleteCache(key) {
  // L1: 內存
  memoryCache.delete(key);
  const idx = cacheAccessOrder.indexOf(key);
  if (idx > -1) {
    cacheAccessOrder.splice(idx, 1);
  }
  
  // L2: Redis
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(key);
    } catch (e) {
      console.error('Redis delete error:', e);
    }
  }
}

// 批量刪除（使用模式匹配）
export async function deleteCachePattern(pattern) {
  // L1: 內存（簡單字符串匹配）
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
      const idx = cacheAccessOrder.indexOf(key);
      if (idx > -1) cacheAccessOrder.splice(idx, 1);
    }
  }
  
  // L2: Redis（使用 SCAN）
  const redis = getRedisClient();
  if (redis) {
    try {
      // Upstash 支持 keys 命令（小規模數據）
      const keys = await redis.keys(`${pattern}*`);
      if (keys && keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (e) {
      console.error('Redis pattern delete error:', e);
    }
  }
}

// 緩存包裝器（自動緩存函數結果）
export async function cached(key, fn, ttlMs = 5 * 60 * 1000) {
  // 嘗試從緩存獲取
  const cached = await getCache(key);
  if (cached !== null) {
    return cached;
  }
  
  // 執行函數
  const result = await fn();
  
  // 存入緩存
  await setCache(key, result, ttlMs);
  
  return result;
}

// 獲取緩存統計
export function getCacheStats() {
  const hitRate = cacheStats.hits + cacheStats.misses > 0
    ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(2)
    : 0;
  
  return {
    ...cacheStats,
    hitRate: `${hitRate}%`,
    memorySize: memoryCache.size,
    maxMemorySize: MAX_MEMORY_CACHE_SIZE,
  };
}

// 清空所有緩存
export async function clearAllCache() {
  memoryCache.clear();
  cacheAccessOrder.length = 0;
  
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.flushdb();
    } catch (e) {
      console.error('Redis flush error:', e);
    }
  }
}

// 預熱緩存（應用啟動時）
export async function warmupCache() {
  console.log('🔥 開始預熱緩存...');
  
  try {
    // 可以在這裡預加載常用數據
    // 例如：站點設置、常用配置等
    
    console.log('✅ 緩存預熱完成');
  } catch (e) {
    console.error('❌ 緩存預熱失敗:', e);
  }
}

// 緩存鍵生成器（統一命名規範）
export const CacheKeys = {
  // 站點設置
  settings: (tenantId) => `settings:${tenantId}`,
  
  // 用戶資料
  profile: (userId) => `profile:${userId}`,
  userProfiles: (userIds) => `profiles:${userIds.sort().join(',')}`,
  
  // 帖子
  post: (postId) => `post:${postId}`,
  posts: (tenantId, page, limit) => `posts:${tenantId}:${page}:${limit}`,
  userPosts: (userId, page) => `posts:user:${userId}:${page}`,
  
  // 評論
  postComments: (postId) => `comments:post:${postId}`,
  
  // 積分
  pointsHistory: (userId) => `points:history:${userId}`,
  
  // 商品
  shopProducts: (tenantId) => `shop:products:${tenantId}`,
  
  // 頁面內容
  pageContent: (tenantId, page) => `page:${tenantId}:${page}`,
  
  // 租戶
  tenantResolve: (hostname) => `tenant:resolve:${hostname}`,
  
  // 管理員
  isSuperAdmin: (userId) => `admin:super:${userId}`,
  tenantAdmin: (userId) => `admin:tenant:${userId}`,
};

// 緩存失效策略
export const CacheInvalidation = {
  // 用戶更新時
  onUserUpdate: async (userId) => {
    await deleteCache(CacheKeys.profile(userId));
    await deleteCachePattern(`posts:user:${userId}`);
  },
  
  // 帖子創建/更新/刪除時
  onPostChange: async (tenantId, userId = null) => {
    await deleteCachePattern(`posts:${tenantId}`);
    if (userId) {
      await deleteCachePattern(`posts:user:${userId}`);
    }
  },
  
  // 設置更新時
  onSettingsUpdate: async (tenantId) => {
    await deleteCache(CacheKeys.settings(tenantId));
  },
  
  // 評論變化時
  onCommentChange: async (postId) => {
    await deleteCache(CacheKeys.postComments(postId));
    await deleteCache(CacheKeys.post(postId)); // 帖子的評論數會變
  },
};

export default {
  get: getCache,
  set: setCache,
  delete: deleteCache,
  deletePattern: deleteCachePattern,
  cached,
  stats: getCacheStats,
  clear: clearAllCache,
  warmup: warmupCache,
  keys: CacheKeys,
  invalidate: CacheInvalidation,
};

