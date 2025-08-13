// 与 Python 版本一致的 codebook
const codebook = ['看看腿', '看看手', '看看女装', '看看黑丝', '看看白丝', '看看~', '看看嘛~', '草我', '超我', '喵', '主人~', '主人草饲我~', '草饲我', '❤', '我喜欢你', '跟我做爱'];

/**
 * 编码函数
 * 将字符串转为 UTF-8 字节数组 -> 每个字节拆成高4位/低4位 -> 映射到 codebook
 */
function encode(input) {
  const encoder = new TextEncoder();        // 浏览器原生 UTF-8 编码
  const bytes = encoder.encode(input);
  let encoded = '';

  for (let byte of bytes) {
    const high = (byte >> 4) & 0x0F;
    const low = byte & 0x0F;
    encoded += codebook[high] + codebook[low];
  }

  return encoded;
}

/**
 * 解码函数
 * 将 codebook 字符转回 4位 -> 组合成字节 -> 转 UTF-8 字符串
 */
function decode(input) {
  // 创建反向映射
  const codebookMap = {};
  codebook.forEach((char, index) => {
    codebookMap[char] = index;
  });

  const bytes = [];
  for (let i = 0; i < input.length; i += 2) {
    const high = codebookMap[input[i]];
    const low = codebookMap[input[i + 1]];
    if (high === undefined || low === undefined) continue;
    const byte = (high << 4) | low;
    bytes.push(byte);
  }

  const decoder = new TextDecoder('utf-8');
  return decoder.decode(new Uint8Array(bytes));
}
