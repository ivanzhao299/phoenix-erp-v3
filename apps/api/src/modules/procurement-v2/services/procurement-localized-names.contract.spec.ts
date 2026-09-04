import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (name: string) => fs.readFileSync(path.join(process.cwd(), 'src/modules/procurement-v2/services', name), 'utf8');

describe('procurement localized-name API contracts', () => {
  it('keeps supplier performance grouped by code/currency before joining names', () => {
    const source = read('dashboard.service.ts');
    expect(source).toContain('WITH aggregate_by_supplier AS');
    expect(source).toContain('GROUP BY po.supplier_code, po.currency_code');
    expect(source).toContain('LEFT JOIN prc2_suppliers s ON s.supplier_code = a.supplier_code');
    expect(source).toContain('supplierSnapshotName');
  });

  it('adds real multilingual master names without deleting snapshot fields', () => {
    const orders = read('orders.service.ts');
    expect(orders).toContain('supplierMasterNameEn');
    expect(orders).toContain('material_name_en');
    expect(orders).toContain('...po');
    expect(read('requests.service.ts')).toContain('material_name_lo');
    const receipts = read('receipts.service.ts');
    expect(receipts).toContain('warehouse_name_en');
    expect(receipts).toContain('sku_name_lo');
    expect(receipts).toContain('...rcp');
  });

  it('projects canonical purchase-request company, project, and requester in list and detail', () => {
    const requests = read('requests.service.ts');
    expect((requests.match(/company_org\.org_type = 'COMPANY'/g) ?? [])).toHaveLength(2);
    expect((requests.match(/COALESCE\(company_org\.company_code, company_org\.org_code\) = r\.company_code/g) ?? [])).toHaveLength(2);
    expect((requests.match(/project\.project_code = r\.project_code/g) ?? [])).toHaveLength(2);
    expect((requests.match(/requester\.user_id = r\.requester_id/g) ?? [])).toHaveLength(2);
    for (const alias of ['companyDisplayName', 'projectDisplayName', 'requesterRealName', 'requesterUsername']) {
      expect(requests).toContain(alias);
    }
    expect(requests).toContain('r.companyName ?? r.companyCode');
    expect(requests).toContain('r.projectName ?? r.projectCode');
  });
});
