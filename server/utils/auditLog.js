// 審計日誌系統
// 記錄所有敏感操作，用於安全審計和問題追溯

// 確保審計日誌表存在
let __auditTableEnsured = false;
let __globalClient = null;

// 設置全局客戶端（在 server/index.js 中調用）
export function setGlobalClient(client) {
  __globalClient = client;
}

async function ensureAuditLogTable() {
  if (__auditTableEnsured) return;
  if (!__globalClient) {
    console.warn('⚠️ 全局客戶端未設置，無法創建審計日誌表');
    return;
  }
  
  try {
    const client = __globalClient;
    
    // 創建審計日誌表
    await client.execute(`
      create table if not exists audit_logs (
        id integer primary key autoincrement,
        user_id text not null,
        action text not null,
        resource_type text,
        resource_id text,
        details text,
        ip_address text,
        user_agent text,
        status text default 'success',
        error_message text,
        created_at text default (datetime('now'))
      )
    `);
    
    // 創建索引
    await client.execute(`
      create index if not exists idx_audit_logs_user_created 
      on audit_logs(user_id, created_at desc)
    `);
    
    await client.execute(`
      create index if not exists idx_audit_logs_action_created 
      on audit_logs(action, created_at desc)
    `);
    
    await client.execute(`
      create index if not exists idx_audit_logs_resource 
      on audit_logs(resource_type, resource_id)
    `);
    
    __auditTableEnsured = true;
    console.log('✅ 審計日誌表已準備');
  } catch (e) {
    console.error('❌ 創建審計日誌表失敗:', e.message);
  }
}

// 記錄審計日誌
export async function auditLog(options) {
  try {
    await ensureAuditLogTable();
    
    const {
      userId,
      action,
      resourceType = null,
      resourceId = null,
      details = null,
      ipAddress = null,
      userAgent = null,
      status = 'success',
      errorMessage = null,
    } = options;
    
    if (!userId || !action) {
      console.warn('審計日誌缺少必要參數');
      return;
    }
    
    if (!__globalClient) {
      console.warn('⚠️ 全局客戶端未設置，無法記錄審計日誌');
      return;
    }
    
    const client = __globalClient;
    
    await client.execute(
      `insert into audit_logs 
       (user_id, action, resource_type, resource_id, details, ip_address, user_agent, status, error_message, created_at) 
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        resourceType,
        resourceId,
        details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent,
        status,
        errorMessage,
        new Date().toISOString(),
      ]
    );
    
    // 可選：輸出到控制台（開發環境）
    if (process.env.NODE_ENV === 'development') {
      console.log(`📝 [AUDIT] ${action} by ${userId}`, resourceType ? `[${resourceType}:${resourceId}]` : '');
    }
  } catch (e) {
    // 審計日誌失敗不應影響主要業務
    console.error('審計日誌記錄失敗:', e.message);
  }
}

// 獲取客戶端信息的輔助函數
export function getClientInfo(c) {
  const ipAddress = c.req.header('cf-connecting-ip') || 
                    c.req.header('x-forwarded-for') || 
                    c.req.header('x-real-ip') || 
                    'unknown';
  
  const userAgent = c.req.header('user-agent') || 'unknown';
  
  return { ipAddress, userAgent };
}

// 審計日誌操作類型常量
export const AuditActions = {
  // 用戶操作
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_REGISTER: 'user.register',
  USER_UPDATE_PROFILE: 'user.update_profile',
  USER_DELETE: 'user.delete',
  
  // 帖子操作
  POST_CREATE: 'post.create',
  POST_UPDATE: 'post.update',
  POST_DELETE: 'post.delete',
  POST_PIN: 'post.pin',
  POST_MODERATE: 'post.moderate',
  
  // 評論操作
  COMMENT_CREATE: 'comment.create',
  COMMENT_DELETE: 'comment.delete',
  
  // 積分操作
  POINTS_CHECKIN: 'points.checkin',
  POINTS_EXCHANGE: 'points.exchange',
  POINTS_ADMIN_ADJUST: 'points.admin_adjust',
  
  // 商城操作
  SHOP_REDEEM: 'shop.redeem',
  SHOP_PRODUCT_CREATE: 'shop.product_create',
  SHOP_PRODUCT_UPDATE: 'shop.product_update',
  
  // 管理員操作
  ADMIN_USER_BAN: 'admin.user_ban',
  ADMIN_USER_ROLE_CHANGE: 'admin.user_role_change',
  ADMIN_SETTINGS_UPDATE: 'admin.settings_update',
  ADMIN_TENANT_CREATE: 'admin.tenant_create',
  ADMIN_TENANT_DELETE: 'admin.tenant_delete',
  
  // 系統操作
  SYSTEM_DATABASE_CREATE: 'system.database_create',
  SYSTEM_BRANCH_CREATE: 'system.branch_create',
};

// 資源類型常量
export const ResourceTypes = {
  USER: 'user',
  POST: 'post',
  COMMENT: 'comment',
  PRODUCT: 'product',
  TENANT: 'tenant',
  SETTINGS: 'settings',
};

