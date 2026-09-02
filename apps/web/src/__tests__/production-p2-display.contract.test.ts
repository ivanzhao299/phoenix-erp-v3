import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('production P2 localized display', () => {
  it('formats egg-ledger grade and house while retaining their codes', () => {
    const source = read('src/app/(admin)/breeding/daily-inbound-ledger/page.tsx');
    expect(source).toContain("formatMasterData(row, 'grade_name', row.grade, lang)");
    expect(source).toContain("formatMasterData(row, 'house_name', row.house_code, lang)");
  });

  it('formats PDA source-house cards and mobile grade reports through the shared helper', () => {
    expect(read('src/app/(terminal)/terminal/packaging/source-receive/page.tsx')).toContain("formatMasterData(h, 'house_name', h.house_code, lang)");
    for (const page of ['packaging', 'dashboard']) {
      expect(read(`src/app/(mobile)/mobile/${page}/page.tsx`)).toContain("formatMasterData(g, 'grade_name', g.grade, lang)");
    }
  });
});
