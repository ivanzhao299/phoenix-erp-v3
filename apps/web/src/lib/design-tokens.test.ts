import { describe, expect, it } from 'vitest';
import { getSeriesColor, hexToAccent } from './design-tokens';

describe('design token helpers', () => {
  it.each([
    ['#2563eb', 'blue'], ['#3B82F6', 'blue'], ['#16a34a', 'green'], ['#10b981', 'green'],
    ['#d97706', 'amber'], ['#ea580c', 'amber'], ['#dc2626', 'red'], ['#e11d48', 'red'],
    ['#9333ea', 'violet'], ['#0891b2', 'cyan'], ['#unknown', 'slate'], [undefined, 'slate'],
  ] as const)('maps %s to %s', (hex, accent) => expect(hexToAccent(hex)).toBe(accent));
  it('cycles positive indexes', () => expect(getSeriesColor(0)).toBe(getSeriesColor(8)));
  it('cycles negative indexes', () => expect(getSeriesColor(-1)).toBe(getSeriesColor(7)));
});
