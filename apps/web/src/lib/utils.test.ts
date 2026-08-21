import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it.each([
    [[], ''],
    [['base', false && 'hidden', 'active'], 'base active'],
    [['p-2', 'p-4'], 'p-4'],
    [['text-red-500', 'text-blue-500'], 'text-blue-500'],
    [[['a', 'b'], { c: true, d: false }], 'a b c'],
  ] as const)('merges classes %#', (input, expected) => expect(cn(...input)).toBe(expected));
});
