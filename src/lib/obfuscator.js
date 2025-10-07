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