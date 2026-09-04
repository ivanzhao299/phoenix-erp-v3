import * as fs from 'node:fs';
import * as path from 'node:path';

describe('approved supplier/warehouse production manifest', () => {
  const root = path.resolve(__dirname, '../../../../..');
  const apply = fs.readFileSync(path.join(root, 'scripts/ops/supplier-warehouse-domain-production-apply.sql'), 'utf8');

  it('keeps the purchase receipt and daily egg usage contracts unchanged', () => {
    const service = fs.readFileSync(path.join(root, 'apps/api/src/modules/wms/wms.service.ts'), 'utf8');
    for (const code of ['FEED', 'MEDICINE', 'PURCHASE_RECV', 'RAW_MATERIAL']) expect(service).toContain(`'${code}'`);
    const production = fs.readFileSync(path.join(root, 'apps/api/src/modules/sales-v2/services/production-inbound.service.ts'), 'utf8');
    expect(production).toContain("type = 'EGG_FARM'");
    expect(apply).not.toContain("SET type='STORE'");
  });

  it('pins all 10 store facilities and the two protected domains', () => {
    expect((apply.match(/_001_SALES','EGG_SALES','EGG_SALES','STORE'/g) ?? [])).toHaveLength(10);
    expect(apply).toContain("'CJ-WH-XINGCHI-07','COLD_STORAGE','GENERAL','GENERAL','COLD_CHAIN'");
    expect(apply).toContain("warehouse_code='CJ-WH-XINGCHI-07') <> 'FINANCE_MAPPING'");
    expect(apply).toContain("warehouse_code='WH-0001') <> 'TEST'");
  });

  it('pins the five individually approved supplier rows', () => {
    for (const code of ['LJ-S-006','SUP-00002','SUP-00003','SUP-00004','SUP-00005']) expect(apply).toContain(`'${code}'`);
    expect(apply).toContain("'SUP-00002','张鹏（装修工程）','LOCAL','SERVICE','LOCAL'");
  });
});
