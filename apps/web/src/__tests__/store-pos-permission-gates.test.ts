import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync(path.join(process.cwd(), 'src/app/(admin)/store-pos/page.tsx'), 'utf8');

describe('store POS permission gates', () => {
  it('uses menu-aware action flags and never checks bare action codes', () => {
    expect(page).not.toMatch(/hasPerm\(['"](?:C|D|E)['"]\)/);
    expect(page).toContain('canCreate && <button onClick={() => setShowShiftModal');
    expect(page).toContain("canDelete && s.status === 'OPEN'");
    expect(page).toContain("canDelete && s.status === 'COMPLETED'");
    expect(page).toContain('canCreate && canEdit && <button onClick={handleCheckout}');
  });
});
