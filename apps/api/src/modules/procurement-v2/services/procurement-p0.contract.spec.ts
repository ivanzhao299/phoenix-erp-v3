import * as fs from 'node:fs';
import * as path from 'node:path';

describe('procurement P0 source contracts', () => {
  const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

  it('uses the real shipment terminal state in both dashboard queries', () => {
    const source = read('src/modules/procurement-v2/services/dashboard.service.ts');
    expect(source.match(/status NOT IN \('ARRIVED','CANCELLED'\)/g)).toHaveLength(2);
    expect(source).not.toContain("status NOT IN ('DELIVERED','CANCELLED')");
    expect(source).not.toContain('CUSTOMS_CLEARANCE');
  });

  it('accepts every active purchase type family including construction', () => {
    const source = read('src/modules/procurement-v2/dto/create-purchase-request.dto.ts');
    for (const code of ['STANDARD', 'URGENT', 'STRATEGIC', 'MATERIAL', 'EQUIPMENT', 'SERVICE', 'CONSTRUCTION', 'CROSS_BORDER', 'FIXED_ASSET', 'OTHER']) {
      expect(source).toContain(`'${code}'`);
    }
  });
});
