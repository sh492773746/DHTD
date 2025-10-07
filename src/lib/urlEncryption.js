/**
 * URL加密工具 - 防止爬虫直接提取游戏链接
 * 使用 Base64 + XOR 加密
 */

// 加密密钥（可以在环境变量中配置）
const ENCRYPTION_KEY = import.meta.env.VITE_URL_ENCRYPTION_KEY || 'dh-team-2024-secure-gaming-platform';

/**
 * 简单的XOR加密
 */
function xorEncrypt(text, key) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return result;
}

/**
 * Base64 编码（支持中文）
 */
function base64Encode(str) {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode('0x' + p1);
    }));
  } catch (e) {
    console.error('Base64 encode error:', e);
    return str;
  }
}

/**
 * Base64 解码（支持中文）
 */
function base64Decode(str) {
  try {
    return decodeURIComponent(atob(str).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  } catch (e) {
    console.error('Base64 decode error:', e);
    return str;
  }
}

/**
 * 加密URL
 * @param {string} url - 原始URL
 * @returns {string} 加密后的URL
 */
export function encryptUrl(url) {
  if (!url || typeof url !== 'string') return url;
  
  // 不加密外部链接（以http://或https://开头）
  if (/^https?:\/\//i.test(url)) {
    // 对于外部链接，添加一个标记并加密
    const encrypted = xorEncrypt(url, ENCRYPTION_KEY);
    return 'ext:' + base64Encode(encrypted);
  }
  
  // 内部路径加密
  const encrypted = xorEncrypt(url, ENCRYPTION_KEY);
  return 'int:' + base64Encode(encrypted);
}

/**
 * 解密URL
 * @param {string} encryptedUrl - 加密的URL
 * @returns {string} 解密后的URL
 */
export function decryptUrl(encryptedUrl) {
  if (!encryptedUrl || typeof encryptedUrl !== 'string') return encryptedUrl;
  
  // 如果不是加密格式，直接返回（向后兼容）
  if (!encryptedUrl.startsWith('ext:') && !encryptedUrl.startsWith('int:')) {
    return encryptedUrl;
  }
  
  try {
    // 移除前缀
    const base64Data = encryptedUrl.substring(4);
    const decoded = base64Decode(base64Data);
    const decrypted = xorEncrypt(decoded, ENCRYPTION_KEY);
    return decrypted;
  } catch (e) {
    console.error('URL解密失败:', e);
    return encryptedUrl;
  }
}

/**
 * 检查是否为加密URL
 * @param {string} url - URL
 * @returns {boolean} 是否为加密URL
 */
export function isEncryptedUrl(url) {
  return typeof url === 'string' && (url.startsWith('ext:') || url.startsWith('int:'));
}

/**
 * 批量加密URL（用于批量导入）
 * @param {Array} items - 游戏卡片数组
 * @returns {Array} 加密后的数组
 */
export function encryptGameCards(items) {
  return items.map(item => ({
    ...item,
    path: encryptUrl(item.path)
  }));
}

/**
 * 批量解密URL（用于显示）
 * @param {Array} items - 游戏卡片数组
 * @returns {Array} 解密后的数组
 */
export function decryptGameCards(items) {
  return items.map(item => ({
    ...item,
    path: decryptUrl(item.path)
  }));
}

