/**
 * Code128B 条码生成器 — 纯 TS 实现，零依赖
 * 输出 SVG 字符串，可直接 dangerouslySetInnerHTML 嵌入 DOM
 * 参考 ISO/IEC 15417 Code128 spec；端口自 V2 phoenix-frontend/utils/barcode.js
 */

// 每个字符对应 11-unit bar/space 模式
const CODE128B_TABLE: readonly string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011', // Stop
];

const STOP_PAT = '1100011101011';

/** Code128 auto 模式：自动在 Code B 和 Code C 之间切换，最大压缩连续数字 */
export function code128auto(text: string): string | null {
  const chars: number[] = [];
  let isCodeC = false;
  let i = 0;

  while (i < text.length) {
    let digits = 0;
    while (i + digits < text.length && text[i + digits] >= '0' && text[i + digits] <= '9') {
      digits++;
    }
    if (!isCodeC) {
      if (i === 0 && digits >= 2) {
        isCodeC = true;
        chars.push(105); // Start C
      } else if (digits >= 4) {
        isCodeC = true;
        chars.push(99); // Switch to Code C
      } else if (i === 0) {
        chars.push(104); // Start B
      }
    }
    if (isCodeC) {
      if (digits >= 2) {
        const pair = parseInt(text.substring(i, i + 2), 10);
        chars.push(pair);
        i += 2;
      } else {
        isCodeC = false;
        chars.push(100); // Switch to Code B
        if (i < text.length) {
          chars.push(text.charCodeAt(i) - 32);
          i++;
        }
      }
    } else {
      chars.push(text.charCodeAt(i) - 32);
      i++;
    }
  }

  if (chars.length === 0) return null;

  let checksum = chars[0];
  for (let j = 1; j < chars.length; j++) checksum += chars[j] * j;
  checksum %= 103;

  const patterns = chars.map((c) => CODE128B_TABLE[c]);
  patterns.push(CODE128B_TABLE[checksum]);
  patterns.push(STOP_PAT);
  return patterns.join('');
}

export interface Code128SVGOptions {
  height?: number;
  moduleWidth?: number;
  showText?: boolean;
  fontSize?: number;
  color?: string;
  background?: string;
  responsive?: boolean;     // true 时 width/height 都用 100%
  physicalDpi?: number;     // 指定 DPI 后，width 输出为 mm 单位（用于热敏打印）
}

/** 生成 Code128 SVG 字符串 */
export function generateCode128SVG(text: string, opts: Code128SVGOptions = {}): string {
  const {
    height = 60,
    moduleWidth = 2,
    showText = true,
    fontSize = 10,
    color = '#000000',
    background = '#ffffff',
    responsive = false,
    physicalDpi,
  } = opts;

  const pattern = code128auto(text);
  if (!pattern) return '<svg><text fill="red">Invalid</text></svg>';

  const textH = showText ? fontSize + 6 : 0;
  const totalH = height + textH;
  const totalW = pattern.length * moduleWidth + 20;

  let bars = '';
  let x = 10;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      bars += `<rect x="${x}" y="0" width="${moduleWidth}" height="${height}" fill="${color}"/>`;
    }
    x += moduleWidth;
  }

  const textEl = showText
    ? `<text x="${totalW / 2}" y="${height + fontSize + 3}" text-anchor="middle" font-family="monospace" font-weight="900" font-size="${fontSize}" textLength="${totalW * 0.95}" lengthAdjust="spacing" fill="${color}">${text}</text>`
    : '';

  let sizeAttr: string;
  if (physicalDpi) {
    const mmPerDot = 25.4 / physicalDpi;
    sizeAttr = `width="${totalW * mmPerDot}mm" height="100%"`;
  } else if (responsive) {
    sizeAttr = 'width="100%" height="100%"';
  } else {
    sizeAttr = `width="${totalW}" height="${totalH}"`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" ${sizeAttr} viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${totalW}" height="${totalH}" fill="${background}"/>${bars}${textEl}</svg>`;
}
