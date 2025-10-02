// N+1 查詢優化工具
// 批量獲取關聯數據，避免循環查詢數據庫

import { eq, inArray, sql } from 'drizzle-orm';
import cache, { CacheKeys } from './cache.js';

// 批量獲取用戶資料（解決 N+1）
export async function batchGetProfiles(db, userIds, profilesTable) {
  if (!userIds || userIds.length === 0) return new Map();
  
  const uniqueIds = [...new Set(userIds)];
  
  // 嘗試從緩存批量獲取
  const cacheKey = CacheKeys.userProfiles(uniqueIds);
  const cached = await cache.get(cacheKey);
  if (cached) {
    return new Map(cached);
  }
  
  // 一次性查詢所有用戶
  const profiles = await db
    .select()
    .from(profilesTable)
    .where(inArray(profilesTable.id, uniqueIds));
  
  // 轉換為 Map 便於快速查找
  const profileMap = new Map();
  for (const profile of profiles) {
    profileMap.set(profile.id, {
      id: profile.id,
      username: profile.username || '未知用戶',
      avatarUrl: profile.avatarUrl || profile.avatar_url,
      uid: profile.uid,
    });
  }
  
  // 緩存結果（5 分鐘）
  await cache.set(cacheKey, Array.from(profileMap.entries()), 5 * 60 * 1000);
  
  return profileMap;
}

// 批量獲取帖子的統計數據（likes, comments）
export async function batchGetPostStats(db, postIds, likesTable, commentsTable) {
  if (!postIds || postIds.length === 0) return { likes: new Map(), comments: new Map() };
  
  const uniqueIds = [...new Set(postIds)];
  
  // 批量查詢點讚數
  const likesQuery = await db
    .select({
      postId: likesTable.postId,
      count: sql`COUNT(*)`.as('count'),
    })
    .from(likesTable)
    .where(inArray(likesTable.postId, uniqueIds))
    .groupBy(likesTable.postId);
  
  const likesMap = new Map();
  for (const item of likesQuery) {
    likesMap.set(item.postId, Number(item.count));
  }
  
  // 批量查詢評論數
  const commentsQuery = await db
    .select({
      postId: commentsTable.postId,
      count: sql`COUNT(*)`.as('count'),
    })
    .from(commentsTable)
    .where(inArray(commentsTable.postId, uniqueIds))
    .groupBy(commentsTable.postId);
  
  const commentsMap = new Map();
  for (const item of commentsQuery) {
    commentsMap.set(item.postId, Number(item.count));
  }
  
  return { likes: likesMap, comments: commentsMap };
}

// 檢查用戶是否點讚過這些帖子（批量）
export async function batchCheckUserLikes(db, postIds, userId, likesTable) {
  if (!postIds || postIds.length === 0 || !userId) return new Set();
  
  const uniqueIds = [...new Set(postIds)];
  
  const likes = await db
    .select({ postId: likesTable.postId })
    .from(likesTable)
    .where(
      inArray(likesTable.postId, uniqueIds),
      eq(likesTable.userId, userId)
    );
  
  return new Set(likes.map(like => like.postId));
}

// 優化的帖子列表查詢（解決所有 N+1 問題）
export async function enrichPostsOptimized(db, posts, likesTable, commentsTable, profilesTable, userId = null) {
  if (!posts || posts.length === 0) return [];
  
  // 1. 收集所有需要的 ID
  const postIds = posts.map(p => p.id);
  const authorIds = posts.map(p => p.authorId || p.author_id).filter(Boolean);
  
  // 2. 批量獲取數據（3 個並行查詢，而不是 N 個）
  const [profilesMap, stats, userLikes] = await Promise.all([
    batchGetProfiles(db, authorIds, profilesTable),
    batchGetPostStats(db, postIds, likesTable, commentsTable),
    userId ? batchCheckUserLikes(db, postIds, userId, likesTable) : Promise.resolve(new Set()),
  ]);
  
  // 3. 組裝數據
  const enriched = posts.map(post => {
    const authorId = post.authorId || post.author_id;
    const author = profilesMap.get(authorId) || {
      id: authorId,
      username: '未知用戶',
      avatarUrl: null,
    };
    
    return {
      ...post,
      author,
      likesCount: stats.likes.get(post.id) || 0,
      commentsCount: stats.comments.get(post.id) || 0,
      isLiked: userId ? userLikes.has(post.id) : false,
    };
  });
  
  return enriched;
}

// 緩存的站點設置獲取
export async function getCachedSettings(db, settingsTable, tenantId) {
  const cacheKey = CacheKeys.settings(tenantId);
  
  return await cache.cached(cacheKey, async () => {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.tenantId, tenantId));
    
    // 轉換為 Map
    const settingsMap = {};
    for (const row of rows) {
      settingsMap[row.key] = row.value;
    }
    
    return settingsMap;
  }, 10 * 60 * 1000); // 緩存 10 分鐘
}

// 緩存的頁面內容獲取
export async function getCachedPageContent(db, pageContentTable, tenantId, page) {
  const cacheKey = CacheKeys.pageContent(tenantId, page);
  
  return await cache.cached(cacheKey, async () => {
    const rows = await db
      .select()
      .from(pageContentTable)
      .where(
        eq(pageContentTable.tenantId, tenantId),
        eq(pageContentTable.page, page)
      )
      .orderBy(pageContentTable.position);
    
    // 轉換為 section -> content 的結構
    const content = {};
    for (const row of rows) {
      try {
        content[row.section] = JSON.parse(row.content || '{}');
      } catch {
        content[row.section] = row.content;
      }
    }
    
    return content;
  }, 10 * 60 * 1000); // 緩存 10 分鐘
}

// 緩存的租戶解析
export async function getCachedTenantResolve(db, branchesTable, hostname) {
  const cacheKey = CacheKeys.tenantResolve(hostname);
  
  return await cache.cached(cacheKey, async () => {
    // 查詢邏輯（這裡簡化，實際從您的代碼中提取）
    const rows = await db
      .select()
      .from(branchesTable)
      .where(sql`custom_domain = ${hostname}`)
      .limit(1);
    
    return rows[0]?.tenantId || 0;
  }, 30 * 60 * 1000); // 緩存 30 分鐘（域名很少變）
}

// 清理過期的內存緩存（定時任務）
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of memoryCache.entries()) {
    if (now >= entry.expiresAt) {
      memoryCache.delete(key);
      const idx = cacheAccessOrder.indexOf(key);
      if (idx > -1) cacheAccessOrder.splice(idx, 1);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 清理了 ${cleaned} 個過期緩存項`);
  }
}, 5 * 60 * 1000); // 每 5 分鐘清理一次

// 性能統計
export function logCachePerformance() {
  const stats = getCacheStats();
  console.log('📊 緩存性能統計:', {
    命中率: stats.hitRate,
    總命中: stats.hits,
    內存命中: stats.memoryHits,
    Redis命中: stats.redisHits,
    未命中: stats.misses,
    緩存大小: `${stats.memorySize}/${stats.maxMemorySize}`,
  });
}

// 每小時輸出統計
setInterval(logCachePerformance, 60 * 60 * 1000);

export default {
  get: getCache,
  set: setCache,
  delete: deleteCache,
  deletePattern: deleteCachePattern,
  cached,
  batchGetProfiles,
  batchGetPostStats,
  batchCheckUserLikes,
  enrichPostsOptimized,
  getCachedSettings,
  getCachedPageContent,
  getCachedTenantResolve,
  stats: getCacheStats,
  clear: clearAllCache,
  warmup: warmupCache,
  keys: CacheKeys,
};

