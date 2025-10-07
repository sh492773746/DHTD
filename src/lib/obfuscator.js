// ==================== 游戏链接加密/解密 ====================

const SECRET_KEY = 'HORIZONS_GAME_PROTECT_2024'; // 加密密钥

/**
 * 简单的 Base64 编码（防止直接看到URL）
 */
function simpleEncode(str) {
  try {
    return btoa(encodeURIComponent(str));
  } catch (e) {
    console.error('Encode error:', e);
    return str;
  }
}

/**
 * 简单的 Base64 解码
 */
function simpleDecode(str) {
  try {
    return decodeURIComponent(atob(str));
  } catch (e) {
    console.error('Decode error:', e);
    return null;
  }
}

/**
 * 生成时间戳令牌（防止长期有效）
 */
function generateTimeToken() {
  const now = Date.now();
  const hour = Math.floor(now / (1000 * 60 * 60)); // 每小时变化一次
  return hour.toString(36);
}

/**
 * 验证时间戳令牌（允许前后1小时的误差）
 */
function verifyTimeToken(token) {
  const now = Date.now();
  const currentHour = Math.floor(now / (1000 * 60 * 60));
  
  for (let offset = -1; offset <= 1; offset++) {
    const validHour = currentHour + offset;
    if (validHour.toString(36) === token) {
      return true;
    }
  }
  return false;
}

/**
 * 简单的字符串哈希（用于签名）
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * 加密游戏URL
 * @param {string} gameUrl - 原始游戏URL
 * @param {string} gameId - 游戏ID（可选，用于额外验证）
 * @returns {string} - 加密后的token
 */
export function encryptGameUrl(gameUrl, gameId = '') {
  const timeToken = generateTimeToken();
  const payload = JSON.stringify({
    url: gameUrl,
    gid: gameId,
    t: timeToken
  });
  
  const encoded = simpleEncode(payload);
  const signature = simpleHash(SECRET_KEY + encoded + timeToken);
  
  // 格式：编码数据.签名
  return `${encoded}.${signature}`;
}

/**
 * 解密游戏URL
 * @param {string} token - 加密的token
 * @returns {object|null} - 解密后的数据 {url, gameId} 或 null
 */
export function decryptGameUrl(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      console.error('Invalid token format');
      return null;
    }
    
    const [encoded, signature] = parts;
    const payload = simpleDecode(encoded);
    
    if (!payload) {
      console.error('Failed to decode payload');
      return null;
    }
    
    const data = JSON.parse(payload);
    
    // 验证时间令牌
    if (!verifyTimeToken(data.t)) {
      console.error('Token expired');
      return null;
    }
    
    // 验证签名
    const expectedSignature = simpleHash(SECRET_KEY + encoded + data.t);
    if (signature !== expectedSignature) {
      console.error('Invalid signature');
      return null;
    }
    
    return {
      url: data.url,
      gameId: data.gid
    };
  } catch (e) {
    console.error('Decrypt error:', e);
    return null;
  }
}

// ==================== 文本混淆（原有功能）====================

const beautyWords = [
  '水疗', '嫩肤', '焕颜', '紧致', '保湿', '精华', '面膜', '按摩', '护理', 
  '美容', '抗衰', '排毒', '修复', '亮白', '滋养', '活肤', '舒缓', '净化',
  '胶原蛋白', '玻尿酸', '水光针', '热玛吉', '光子嫩肤', '果酸换肤', '精油',
  '美甲', '美睫', '纹绣', '身体磨砂', '芳香疗法', '瑜伽', '冥想', '养生',
  '客户', '预约', '疗程', '套餐', '折扣', '会员', '沙龙', '顾问', '技师',
  '皮肤分析', '定制方案', '高效', '奢华', '体验', '放松', '新生', '光彩'
];

const getRandomWord = () => beautyWords[Math.floor(Math.random() * beautyWords.length)];

const generateObfuscatedText = (length) => {
  let result = '';
  while (result.length < length) {
    result += getRandomWord() + ' ';
  }
  return result.slice(0, length);
};

export const obfuscateText = (text) => {
  if (typeof text !== 'string') return text;

  const words = text.split(/(\s+)/);
  const obfuscatedWords = words.map(word => {
    if (word.trim() === '') {
      return word; 
    }
    const isCapitalized = word[0] >= 'A' && word[0] <= 'Z';
    const hasPunctuation = /[.,!?;:]$/.exec(word);
    
    let newWord = generateObfuscatedText(word.length);
    
    if (isCapitalized) {
       newWord = newWord.charAt(0).toUpperCase() + newWord.slice(1);
    }
    
    if (hasPunctuation) {
        newWord = newWord.slice(0, -1) + hasPunctuation[0];
    }
    return newWord;
  });

  return obfuscatedWords.join('');
};


export const obfuscateNode = (node) => {
  if (node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim() !== '') {
    // Ignore scripts, styles, and elements with data-no-obfuscate attribute
    if (node.parentElement && (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE' || node.parentElement.closest('[data-no-obfuscate]'))) {
      return;
    }
    node.nodeValue = obfuscateText(node.nodeValue);
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    // Stop recursion if the element has data-no-obfuscate
    if (node.hasAttribute('data-no-obfuscate')) return;
    
    // Process attributes like 'alt', 'title', 'placeholder'
    ['alt', 'title', 'placeholder'].forEach(attr => {
      if (node.hasAttribute(attr)) {
        node.setAttribute(attr, obfuscateText(node.getAttribute(attr)));
      }
    });

    for (const child of node.childNodes) {
      obfuscateNode(child);
    }
  }
};