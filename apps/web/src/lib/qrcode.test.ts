import { describe, expect, it } from 'vitest';
import { generateQrSVG } from './qrcode';

describe('generateQrSVG', () => {
  it.each(['1234567890', 'HELLO WORLD', 'hello 世界', '', 'INV-2026-0001'])(
    'renders valid svg for %j', text => {
      const svg = generateQrSVG(text);
      expect(svg).toMatch(/^<svg/);
      expect(svg).toContain('<rect');
      expect(svg).toContain('viewBox=');
    },
  );
  it.each(['L', 'M', 'Q', 'H'] as const)('supports ECC %s', ecc => expect(generateQrSVG('PHOENIX', { ecc })).toContain('<svg'));
  it('applies colors and scale', () => {
    const svg = generateQrSVG('A', { dark: '#123456', light: '#abcdef', scale: 2, margin: 1 });
    expect(svg).toContain('#123456');
    expect(svg).toContain('#abcdef');
  });
  it('rejects oversized data', () => expect(() => generateQrSVG('x'.repeat(10000))).toThrow('QR data too long'));
});
