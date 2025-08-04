// 假名字体映射表
const katakanaMap = {
  'A': 'ㄙ', 'B': 'ㄯ', 'C': 'ㄈ', 'D': 'ワ', 'E': '⋿', 'F': 'チ', 'G': 'Ᏽ', 'H': 'サ',
  'I': 'エ', 'J': '𝙅', 'K': 'ケ', 'L': '㆑', 'M': '巾', 'N': 'ウ', 'O': 'ロ', 'P': 'ア',
  'Q': '∅', 'R': 'Ʀ', 'S': '丂', 'T': 'ナ', 'U': 'ㄩ', 'V': '√', 'W': '山', 'X': 'メ',
  'Y': 'ン', 'Z': 'て', '1': 'イ', '2': 'ㄹ', '3': 'ヨ', '4': 'ㄣ', '5': 'ㄎ',
  '6': '〥', '7': 'フ', '8': 'ㄖ', '9': 'ヌ', '0': 'ㇿ'
};

// 扩展小写映射
Object.keys(katakanaMap).forEach(k => {
  katakanaMap[k.toLowerCase()] = katakanaMap[k];
});

// 生成反向映射（用于解码）
const reverseMap = {};
for (const [key, value] of Object.entries(katakanaMap)) {
  reverseMap[value] = key;
}

/** 编码函数 */
function encode(input) {
  return input.split('').map(ch => katakanaMap[ch] || ch).join('');
}

/** 解码函数 */
function decode(input) {
  return input.split('').map(ch => reverseMap[ch] || ch).join('');
}
