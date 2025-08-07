// 与 Python 版本一致的 codebook（20 个字符）
const codebook = ['؜','᠎','឴','឵','᠍','︀','︂','︃','︄','︅',
                  '︆','︇','︈','︉','︊','︋','︌','︍','︎','️'];

/**
 * 编码函数（与 Python 兼容）
 * 每个字符编码为 UTF-8 字节 -> 每个字节分解成 20 进制的两个数字 -> 映射到 codebook
 */
function encode(input) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  let encoded = '';

  for (let byte of bytes) {
    const high = Math.floor(byte / 20);
    const low = byte % 20;
    encoded += codebook[high] + codebook[low];
  }

  return encoded;
}

/**
 * 解码函数（与 Python 兼容）
 * 每两个字符映射回 20 进制数字 -> 还原为字节 -> 转回 UTF-8 字符串
 */
function decode(input) {
  const codebookMap = {};
  codebook.forEach((ch, i) => {
    codebookMap[ch] = i;
  });

  const bytes = [];

  for (let i = 0; i < input.length; i += 2) {
    const a = codebookMap[input[i]];
    const b = codebookMap[input[i + 1]];
    if (a === undefined || b === undefined) {
      continue; // skip invalid
    }
    const byte = a * 20 + b;
    bytes.push(byte);
  }

  const decoder = new TextDecoder('utf-8');
  return decoder.decode(new Uint8Array(bytes));
}
