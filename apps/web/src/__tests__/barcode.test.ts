import { describe, it, expect } from 'vitest';
import { code128auto, generateCode128SVG } from '@/lib/barcode';

/**
 * Code128 条码编码器（纯 TS，零依赖）。
 * 测编码不变量：模式串长度规律、Start/Stop 终止符、Code C 数字压缩、空输入处理。
 * 不去硬编码逐位 pattern（避免脆性），而是验证可观测的结构属性。
 */

const STOP_PAT = '1100011101011';

describe('code128auto', () => {
  it('returns null for empty input', () => {
    expect(code128auto('')).toBeNull();
  });

  it('produces a bit-string ending with the Code128 STOP pattern', () => {
    const pat = code128auto('A');
    expect(pat).not.toBeNull();
    expect(pat!.endsWith(STOP_PAT)).toBe(true);
  });

  it('every data/control symbol is an 11-unit module except the 13-unit STOP', () => {
    const pat = code128auto('AB12')!;
    // 去掉末尾 STOP（13 位），剩余必须是 11 的整数倍
    expect(pat.length).toBeGreaterThan(STOP_PAT.length);
    const body = pat.slice(0, pat.length - STOP_PAT.length);
    expect(body.length % 11).toBe(0);
  });

  it('compresses an even run of digits via Code C (fewer symbols than Code B)', () => {
    // "12345678" = 8 digits. Code C encodes 2 digits/symbol.
    const digitsPat = code128auto('12345678')!;
    // Same length text but non-digit -> Code B (1 char/symbol) yields more symbols.
    const lettersPat = code128auto('abcdefgh')!;
    expect(digitsPat.length).toBeLessThan(lettersPat.length);
  });

  it('handles a mix of letters and digits without throwing', () => {
    expect(() => code128auto('SKU-2026-0042')).not.toThrow();
    expect(code128auto('SKU-2026-0042')).not.toBeNull();
  });
});

describe('generateCode128SVG', () => {
  it('wraps the pattern in a valid SVG element with a viewBox', () => {
    const svg = generateCode128SVG('TEST123');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('<rect'); // 至少一条 bar
  });

  it('renders the human-readable text by default and omits it when showText=false', () => {
    expect(generateCode128SVG('HELLO')).toContain('>HELLO<');
    expect(generateCode128SVG('HELLO', { showText: false })).not.toContain('>HELLO<');
  });

  it('physicalDpi mode emits a millimetre width for thermal printing', () => {
    const svg = generateCode128SVG('123', { physicalDpi: 203 });
    expect(svg).toMatch(/width="[\d.]+mm"/);
  });
});
