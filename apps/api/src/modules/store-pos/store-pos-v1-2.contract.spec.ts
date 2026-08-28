import * as fs from 'fs';
import * as path from 'path';

describe('Store POS V1-2 database contract', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/1787878800000-EnforceStorePosAtomicSettlement.ts'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, 'services/store-pos.service.ts'), 'utf8');

  it('has database hard gates for payment idempotency and one OPEN shift', () => {
    expect(migration).toContain('uq_store_sale_payment_idempotency');
    expect(migration).toContain("WHERE status='OPEN'");
    expect(migration).toContain('store_sale_allocations');
  });

  it('uses conditional completion and never keeps the old warn-and-continue FIFO path', () => {
    expect(service).toContain("WHERE id = $1 AND status='OPEN'");
    expect(service).toContain('门店仓库存不足');
    expect(service).not.toContain('FIFO deduct warn');
    expect(service).not.toContain('允许继续');
  });

  it('checks guarded UPDATE row counts through SELECT CTE results, not TypeORM raw UPDATE tuples', () => {
    expect(service.match(/WITH changed AS \(/g)).toHaveLength(5);
    expect(service).toContain(') SELECT batch_no FROM changed');
    expect(service.match(/\) SELECT id FROM changed/g)).toHaveLength(4);
  });
});
