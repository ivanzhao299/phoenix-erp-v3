import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/lib/mobile-api.ts'), 'utf8');

describe('mobile scope-sensitive reads', () => {
  it('always requests flock and house scope so a changed permission version can return 401', () => {
    expect(source).not.toContain('getCached(`flocks:${tok()}`');
    expect(source).not.toContain('getCached(`feedHousesDetail:${tok()}`');
    expect(source).toContain("get<{ data: FlockRecord[]; total: number }>('/api/crud/brd_flocks");
    expect(source).toContain("get<Array<{ house_code: string; house_name: string; capacity?: number | null }>>('/api/farm/feed/houses')");
  });
});
