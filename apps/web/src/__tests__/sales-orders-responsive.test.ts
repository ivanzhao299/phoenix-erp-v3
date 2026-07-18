import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('sales orders responsive contract', () => {
  const css = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/(admin)/sales2/orders/orders.module.css'),
    'utf8',
  );

  it('keeps the desktop table readable and scrollable on narrow screens', () => {
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('min-width: 920px');
  });

  it('collapses the create form to one column on mobile', () => {
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  });
});
