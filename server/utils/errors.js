// 統一錯誤處理系統
// 標準化 API 響應格式，提升用戶體驗和調試效率

// 自定義 API 錯誤類
export class APIError extends Error {
  constructor(message, code = 500, details = null) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.details = details;
  }
}

// 常見錯誤類型（便於使用）
export class UnauthorizedError extends APIError {
  constructor(message = '未授權，請先登入') {
    super(message, 401);
  }
}

export class ForbiddenError extends APIError {
  constructor(message = '無權限訪問此資源') {
    super(message, 403);
  }
}

export class NotFoundError extends APIError {
  constructor(resource = '資源', id = '') {
    super(`${resource}不存在${id ? `: ${id}` : ''}`, 404);
  }
}

export class ValidationError extends APIError {
  constructor(message = '請求參數無效', details = null) {
    super(message, 400, details);
  }
}

export class RateLimitError extends APIError {
  constructor(retryAfter = 60) {
    super('請求過於頻繁，請稍後再試', 429, { retryAfter });
  }
}

export class ConflictError extends APIError {
  constructor(message = '資源衝突') {
    super(message, 409);
  }
}

// 統一成功響應格式
export function successResponse(data = null, message = null) {
  const response = {
    success: true,
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  if (message) {
    response.message = message;
  }
  
  return response;
}

// 統一錯誤響應格式
export function errorResponse(error, includeStack = false) {
  const response = {
    success: false,
    error: {
      message: error.message || '未知錯誤',
      code: error.code || 500,
    },
  };
  
  // 添加詳細信息（如果有）
  if (error.details) {
    response.error.details = error.details;
  }
  
  // 開發環境添加堆棧追蹤
  if (includeStack && error.stack) {
    response.error.stack = error.stack;
  }
  
  return response;
}

// Hono 全局錯誤處理中間件
export function setupErrorHandler(app) {
  app.onError((err, c) => {
    // 記錄錯誤
    console.error('❌ API Error:', err);
    
    // APIError 類型（我們自定義的錯誤）
    if (err instanceof APIError) {
      const includeStack = process.env.NODE_ENV !== 'production';
      return c.json(errorResponse(err, includeStack), err.code);
    }
    
    // Drizzle/數據庫錯誤
    if (err.name === 'DrizzleError' || err.message?.includes('SQLITE')) {
      const message = process.env.NODE_ENV === 'production' 
        ? '數據庫操作失敗' 
        : err.message;
      
      return c.json(errorResponse(new APIError(message, 500)), 500);
    }
    
    // 未知錯誤
    const message = process.env.NODE_ENV === 'production'
      ? '服務器內部錯誤，請稍後重試'
      : err.message;
    
    const includeStack = process.env.NODE_ENV !== 'production';
    return c.json(errorResponse(new APIError(message, 500), includeStack), 500);
  });
  
  // 404 處理
  app.notFound((c) => {
    return c.json({
      success: false,
      error: {
        message: '請求的資源不存在',
        code: 404,
        path: c.req.path,
      },
    }, 404);
  });
}

// 異步錯誤包裝器（自動捕獲異常）
export function asyncHandler(fn) {
  return async (c) => {
    try {
      return await fn(c);
    } catch (err) {
      throw err;  // 讓全局錯誤處理器處理
    }
  };
}

// 驗證輔助函數
export function validate(condition, message, code = 400) {
  if (!condition) {
    throw new ValidationError(message);
  }
}

export function requireAuth(userId, message = '需要登入') {
  if (!userId) {
    throw new UnauthorizedError(message);
  }
}

/**
 * 驗證管理員權限（用於中間件/驗證函數）
 * @param {boolean} isAdmin - 是否為管理員
 * @param {string} message - 錯誤消息
 */
export function requireAdminRole(isAdmin, message = '需要管理員權限') {
  if (!isAdmin) {
    throw new ForbiddenError(message);
  }
}

/**
 * 從 Hono context 中提取並驗證管理員JWT
 * @param {Object} c - Hono context
 * @returns {Object} { ok: boolean, userId?: string, reason?: string }
 */
export function requireAdmin(c) {
  try {
    const authHeader = c.req.header('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { ok: false, reason: 'missing_token' };
    }

    const token = authHeader.substring(7);
    if (!token) {
      return { ok: false, reason: 'invalid_token' };
    }

    // 驗證 JWT (使用 Supabase JWT secret)
    const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';
    if (!SUPABASE_JWT_SECRET) {
      console.error('❌ SUPABASE_JWT_SECRET not configured');
      return { ok: false, reason: 'server_config_error' };
    }

    let payload;
    try {
      const jwt = require('jsonwebtoken');
      payload = jwt.verify(token, SUPABASE_JWT_SECRET);
    } catch (err) {
      // JWT 驗證失敗（生產環境必須成功）
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ JWT verification failed:', err.message);
        return { ok: false, reason: 'invalid_token' };
      }
      // 開發環境：fallback 到 decode
      const jwt = require('jsonwebtoken');
      payload = jwt.decode(token);
      if (!payload) {
        return { ok: false, reason: 'invalid_token' };
      }
    }

    const userId = payload?.sub;
    if (!userId) {
      return { ok: false, reason: 'no_user_id' };
    }

    return { ok: true, userId };
  } catch (error) {
    console.error('❌ requireAdmin error:', error);
    return { ok: false, reason: 'auth_error' };
  }
}

