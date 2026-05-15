/**
 * QR Code encoder — 零依赖 TypeScript 实现，输出 SVG 字符串
 * 端口自 Project Nayuki QR-Code-generator (MIT) 简化为单文件，
 * 支持 BYTE / ALPHANUMERIC / NUMERIC 模式自动选择，ECC L/M/Q/H 全档。
 * 用于追溯码/标签 QR 生成，可直接 dangerouslySetInnerHTML 嵌入 DOM。
 */

export type QrEccLevel = 'L' | 'M' | 'Q' | 'H';

interface QrOptions {
  ecc?: QrEccLevel;
  margin?: number;       // quiet zone modules (default 4)
  scale?: number;        // px per module (default 4)
  dark?: string;
  light?: string;
}

const ECC_CODEWORDS_PER_BLOCK: Record<QrEccLevel, readonly number[]> = {
  L: [-1, 7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  M: [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  Q: [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  H: [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
};
const NUM_ERROR_CORRECTION_BLOCKS: Record<QrEccLevel, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9,10,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81],
};
const ECC_FORMAT_BITS: Record<QrEccLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const NUMERIC_REGEX = /^[0-9]*$/;
const ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+./:-]*$/;

type Mode = 'NUMERIC' | 'ALPHANUMERIC' | 'BYTE';
const MODE_BITS: Record<Mode, number> = { NUMERIC: 0x1, ALPHANUMERIC: 0x2, BYTE: 0x4 };
const NUM_CHAR_COUNT_BITS = (m: Mode, ver: number): number => {
  if (ver < 1 || ver > 40) throw new Error('version out of range');
  const t = ver < 10 ? 0 : ver < 27 ? 1 : 2;
  return ({ NUMERIC: [10, 12, 14], ALPHANUMERIC: [9, 11, 13], BYTE: [8, 16, 16] }[m])[t];
};

/* ─── BitBuffer ────────────────────────────────────────────── */
class BitBuf {
  bits: number[] = [];
  push(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1);
  }
}

/* ─── Encode helpers ───────────────────────────────────────── */
const encodeNumeric = (s: string, bb: BitBuf) => {
  for (let i = 0; i < s.length;) {
    const n = Math.min(3, s.length - i);
    bb.push(parseInt(s.substr(i, n), 10), n * 3 + 1);
    i += n;
  }
};
const encodeAlphanumeric = (s: string, bb: BitBuf) => {
  for (let i = 0; i + 1 < s.length; i += 2) {
    bb.push(ALPHANUMERIC_CHARSET.indexOf(s[i]) * 45 + ALPHANUMERIC_CHARSET.indexOf(s[i + 1]), 11);
  }
  if (s.length % 2 === 1) bb.push(ALPHANUMERIC_CHARSET.indexOf(s[s.length - 1]), 6);
};
const encodeByte = (s: string, bb: BitBuf) => {
  const utf8 = new TextEncoder().encode(s);
  utf8.forEach(b => bb.push(b, 8));
};

const detectMode = (s: string): Mode =>
  NUMERIC_REGEX.test(s) ? 'NUMERIC' : ALPHANUMERIC_REGEX.test(s) ? 'ALPHANUMERIC' : 'BYTE';

const getDataCapacity = (ver: number, ecc: QrEccLevel): number => {
  const rawBits = numRawDataModules(ver);
  const ecBytes = ECC_CODEWORDS_PER_BLOCK[ecc][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecc][ver];
  return Math.floor(rawBits / 8) - ecBytes;
};
const numRawDataModules = (ver: number): number => {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    result -= (25 * n - 10) * n - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
};

/* ─── Reed-Solomon (GF(256)) ───────────────────────────────── */
const RS_GENERATOR = (degree: number): number[] => {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      r[j] = rsMul(r[j], root);
      if (j + 1 < degree) r[j] ^= r[j + 1];
    }
    root = rsMul(root, 2);
  }
  return r;
};
const rsMul = (x: number, y: number): number => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
};
const rsRemainder = (data: number[], divisor: number[]): number[] => {
  const r = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (r.shift() as number);
    r.push(0);
    for (let i = 0; i < divisor.length; i++) r[i] ^= rsMul(divisor[i], factor);
  }
  return r;
};

/* ─── QR Matrix ────────────────────────────────────────────── */
class QrMatrix {
  size: number;
  modules: boolean[][];
  isFunction: boolean[][];
  constructor(public version: number, public ecc: QrEccLevel) {
    this.size = version * 4 + 17;
    this.modules    = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
  }
  drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);

    const alignPositions = getAlignmentPatternPositions(this.version);
    const n = alignPositions.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      this.drawAlignment(alignPositions[i], alignPositions[j]);
    }
    this.drawFormatBits(0);
    this.drawVersionBits();
  }
  setFn(x: number, y: number, isDark: boolean) {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }
  drawFinder(cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      this.setFn(x, y, d !== 2 && d !== 4);
    }
  }
  drawAlignment(cx: number, cy: number) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      this.setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  drawFormatBits(mask: number) {
    const data = (ECC_FORMAT_BITS[this.ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i < 6; i++) this.setFn(8, i, ((bits >>> i) & 1) !== 0);
    this.setFn(8, 7, ((bits >>> 6) & 1) !== 0);
    this.setFn(8, 8, ((bits >>> 7) & 1) !== 0);
    this.setFn(7, 8, ((bits >>> 8) & 1) !== 0);
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, ((bits >>> i) & 1) !== 0);
    for (let i = 0; i < 8; i++) this.setFn(this.size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
    for (let i = 8; i < 15; i++) this.setFn(8, this.size - 15 + i, ((bits >>> i) & 1) !== 0);
    this.setFn(8, this.size - 8, true);
  }
  drawVersionBits() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = this.size - 11 + (i % 3), b = Math.floor(i / 3);
      const bit = ((bits >>> i) & 1) !== 0;
      this.setFn(a, b, bit);
      this.setFn(b, a, bit);
    }
  }
  drawCodewords(data: number[]) {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }
  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      let invert: boolean;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
        case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
        case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
        default: throw new Error('mask 0-7');
      }
      if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
    }
  }
  computePenalty(): number {
    let penalty = 0;
    // Rule 1: 5+ consecutive same color in row/col
    for (let y = 0; y < this.size; y++) {
      let runColor = this.modules[y][0], runLen = 1;
      for (let x = 1; x < this.size; x++) {
        if (this.modules[y][x] === runColor) {
          runLen++;
          if (runLen === 5) penalty += 3;
          else if (runLen > 5) penalty++;
        } else { runColor = this.modules[y][x]; runLen = 1; }
      }
    }
    for (let x = 0; x < this.size; x++) {
      let runColor = this.modules[0][x], runLen = 1;
      for (let y = 1; y < this.size; y++) {
        if (this.modules[y][x] === runColor) {
          runLen++;
          if (runLen === 5) penalty += 3;
          else if (runLen > 5) penalty++;
        } else { runColor = this.modules[y][x]; runLen = 1; }
      }
    }
    // Rule 2: 2x2 same color
    for (let y = 0; y < this.size - 1; y++) for (let x = 0; x < this.size - 1; x++) {
      const c = this.modules[y][x];
      if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) penalty += 3;
    }
    // Rule 4: balance
    let dark = 0;
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) if (this.modules[y][x]) dark++;
    const total = this.size * this.size;
    const ratio = (100 * dark) / total;
    penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10;
    return penalty;
  }
}

const getAlignmentPatternPositions = (ver: number): number[] => {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
};

/* ─── Interleave codewords ─────────────────────────────────── */
const buildInterleavedData = (dataCodewords: number[], ver: number, ecc: QrEccLevel): number[] => {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const rsDiv = RS_GENERATOR(blockEccLen);
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = dataCodewords.slice(k, k + datLen);
    k += datLen;
    const ecBytes = rsRemainder(dat.concat(new Array(blockEccLen).fill(0)).slice(0, datLen + blockEccLen).slice(0), rsDiv);
    // Note: pass only datLen bytes (no zero pad) since rsRemainder maintains running remainder; pad zeros instead:
    const rem = rsRemainder(dat, rsDiv);
    void ecBytes;
    blocks.push(dat.concat(rem));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i]);
    }
  }
  return result;
};

/* ─── Public API ───────────────────────────────────────────── */
export function generateQrSVG(text: string, opt: QrOptions = {}): string {
  const ecc: QrEccLevel = opt.ecc || 'M';
  const margin = opt.margin ?? 4;
  const scale  = opt.scale  ?? 4;
  const dark   = opt.dark   || '#000';
  const light  = opt.light  || '#fff';

  const mode = detectMode(text);
  // Pick smallest version that fits
  let version = 1;
  let bb = new BitBuf();
  for (; version <= 40; version++) {
    bb = new BitBuf();
    bb.push(MODE_BITS[mode], 4);
    bb.push(text.length, NUM_CHAR_COUNT_BITS(mode, version));
    if (mode === 'NUMERIC')      encodeNumeric(text, bb);
    else if (mode === 'ALPHANUMERIC') encodeAlphanumeric(text, bb);
    else                           encodeByte(text, bb);
    const capacityBits = getDataCapacity(version, ecc) * 8;
    if (bb.bits.length <= capacityBits) break;
  }
  if (version > 40) throw new Error('QR data too long');

  const capacityBits = getDataCapacity(version, ecc) * 8;
  // Terminator + bit padding
  bb.push(0, Math.min(4, capacityBits - bb.bits.length));
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);
  // Byte padding 0xEC, 0x11 alternating
  for (let pad = 0xEC; bb.bits.length < capacityBits; pad ^= 0xEC ^ 0x11) {
    for (let i = 7; i >= 0; i--) bb.bits.push((pad >>> i) & 1);
  }

  // Pack bits → bytes
  const data: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bb.bits[i + j];
    data.push(b);
  }

  const codewords = buildInterleavedData(data, version, ecc);
  const matrix = new QrMatrix(version, ecc);
  matrix.drawFunctionPatterns();
  matrix.drawCodewords(codewords);

  // Pick lowest-penalty mask
  let bestMask = 0, bestPenalty = Infinity;
  for (let m = 0; m < 8; m++) {
    matrix.applyMask(m);
    matrix.drawFormatBits(m);
    const p = matrix.computePenalty();
    if (p < bestPenalty) { bestPenalty = p; bestMask = m; }
    matrix.applyMask(m); // undo
  }
  matrix.applyMask(bestMask);
  matrix.drawFormatBits(bestMask);

  // Render SVG
  const size = matrix.size;
  const totalSize = size + margin * 2;
  const w = totalSize * scale;
  let rects = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (matrix.modules[y][x]) {
      rects += `<rect x="${(x + margin) * scale}" y="${(y + margin) * scale}" width="${scale}" height="${scale}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${w}" height="${w}" shape-rendering="crispEdges"><rect width="${w}" height="${w}" fill="${light}"/><g fill="${dark}">${rects}</g></svg>`;
}
