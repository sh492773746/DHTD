import { Redis } from '@upstash/redis';

// Upstash Redis 客戶端（免費方案）
// 獲取免費 Redis：https://console.upstash.com/
let redis = null;

export function getRedisClient() {
  if (redis) return redis;
  
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    console.warn('⚠️ Upstash Redis 未配置，使用內存存儲（生產環境建議配置 Redis）');
    console.warn('📝 獲取免費 Redis：https://console.upstash.com/');
    return null;
  }
  
  try {
    redis = new Redis({
      url,
      token,
    });
    console.log('✅ Upstash Redis 已連接');
    return redis;
  } catch (e) {
    console.error('❌ Redis 連接失敗:', e.message);
    return null;
  }
}

// Rate Limiting 使用 Redis 或內存後備
const memoryStore = new Map();

export async function isRateLimited(key, limit, windowMs) {
  const redis = getRedisClient();
  
  if (redis) {
    try {
      // 使用 Redis
      const windowSeconds = Math.ceil(windowMs / 1000);
      const current = await redis.incr(key);
      
      // 第一次訪問時設置過期時間
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }
      
      return current > limit;
    } catch (e) {
      console.error('Redis rate limit error:', e);
      // Redis 失敗時降級到內存存儲
    }
  }
  
  // 內存存儲後備方案
  const now = Date.now();
  const bucket = memoryStore.get(key) || { count: 0, reset: now + windowMs };
  
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + windowMs;
  }
  
  bucket.count++;
  memoryStore.set(key, bucket);
  
  return bucket.count > limit;
}

// 獲取當前計數
export async function getRateLimitInfo(key) {
  const redis = getRedisClient();
  
  if (redis) {
    try {
      const count = await redis.get(key) || 0;
      const ttl = await redis.ttl(key);
      return { count, ttl };
    } catch (e) {
      console.error('Redis get error:', e);
    }
  }
  
  // 內存存儲
  const bucket = memoryStore.get(key);
  if (!bucket) return { count: 0, ttl: 0 };
  
  const ttl = Math.max(0, Math.ceil((bucket.reset - Date.now()) / 1000));
  return { count: bucket.count, ttl };
}

// 重置限流
export async function resetRateLimit(key) {
  const redis = getRedisClient();
  
  if (redis) {
    try {
      await redis.del(key);
      return true;
    } catch (e) {
      console.error('Redis reset error:', e);
    }
  }
  
  memoryStore.delete(key);
  return true;
}

// 清理過期的內存存儲（每小時運行）
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of memoryStore.entries()) {
    if (now > bucket.reset) {
      memoryStore.delete(key);
    }
  }
}, 60 * 60 * 1000);

