/**
 * 将字符转换为小写十六进制 Unicode 并加 h
 * 例如 "A" -> "41h"
 */
function encode(input) {
  let result = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    result += code.toString(16) + 'h';
  }
  return result;
}

/**
 * 将小写十六进制 Unicode+h 格式还原为原文
 * 例如 "41h" -> "A"
 */
function decode(input) {
  // 按 h 分割（去掉末尾空串）
  const parts = input.split('h').filter(Boolean);
  let result = '';
  for (let hex of parts) {
    // 解析十六进制
    const code = parseInt(hex, 16);
    if (!isNaN(code)) {
      result += String.fromCharCode(code);
    }
  }
  return result;
}
