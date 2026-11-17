import { writeInvLedger, WriteInvLedgerParams } from './inventory-ledger.writer';

/**
 * INV-301a 共享写入器契约：列序钉死。
 * 核心七列固定（$5 恒为 store_code —— INV-104 铁律的回归锚点），
 * 可选列按固定顺序追加，undefined 省列 / null 显式写 NULL。
 */
describe('writeInvLedger (INV-301a shared writer)', () => {
  function makeEm(result: unknown[] = [{ id: 42 }]) {
    const query = jest.fn().mockResolvedValue(result);
    return { em: { query }, query };
  }

  const fullParams: WriteInvLedgerParams = {
    batchNo: 'B-1',
    changeType: 'FIFO_OUT',
    qtyChange: -3,
    operator: 'alice',
    storeCode: 'STORE-1',
    refNo: 'SO-1',
    note: '出库',
    batchExpireDate: '2026-12-01',
    qualityGrade: 'A',
    companyCode: 'COMP-A',
    skuCode: 'SKU-1',
    logDate: '2026-11-17',
    warehouseCode: 'WH-1',
    locationCode: 'LOC-1',
    materialCode: 'MAT-1',
    businessType: 'SALE',
    unit: '枚',
    destinationType: 'CUSTOMER',
    destinationCode: 'CUST-1',
    projectCode: 'PRJ-1',
    departmentCode: 'DEPT-1',
    houseCode: 'HOUSE-1',
  };

  it('writes the full superset in the canonical column order with sequential placeholders', async () => {
    const { em, query } = makeEm();
    const id = await writeInvLedger(em, fullParams);
    expect(id).toBe(42);

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toBe(
      `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note, ` +
      `batch_expire_date, quality_grade, company_code, sku_code, log_date, warehouse_code, location_code, ` +
      `material_code, business_type, unit, destination_type, destination_code, project_code, department_code, house_code)\n` +
      `       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)\n` +
      `       RETURNING id`,
    );
    expect(params).toEqual([
      'B-1', 'FIFO_OUT', -3, 'alice', 'STORE-1', 'SO-1', '出库',
      '2026-12-01', 'A', 'COMP-A', 'SKU-1', '2026-11-17', 'WH-1', 'LOC-1',
      'MAT-1', 'SALE', '枚', 'CUSTOMER', 'CUST-1', 'PRJ-1', 'DEPT-1', 'HOUSE-1',
    ]);
  });

  it('keeps $5 as store_code for every statement shape (INV-104 regression anchor)', async () => {
    for (const storeCode of ['STORE-9', null, undefined]) {
      const { em, query } = makeEm();
      await writeInvLedger(em, {
        batchNo: 'B-2', changeType: 'INBOUND', qtyChange: 5, operator: 'bob',
        storeCode, refNo: 'WI-1', note: '入库', skuCode: null, companyCode: 'COMP-B',
      });
      const [sql, params] = query.mock.calls[0];
      const columns = String(sql)
        .match(/INSERT INTO inv_ledger \(([^)]+)\)/)![1]
        .split(',')
        .map(c => c.trim());
      const storeIndex = columns.indexOf('store_code');
      expect(storeIndex).toBe(4); // $5
      const placeholders = String(sql).match(/VALUES \(([^)]+)\)/)![1].split(',').map(p => p.trim());
      expect(placeholders[storeIndex]).toBe(`$${storeIndex + 1}`);
      expect(params[storeIndex]).toBe(storeCode ?? null);
    }
  });

  it('omits optional columns when undefined and writes explicit NULL when null', async () => {
    const { em, query } = makeEm();
    await writeInvLedger(em, {
      batchNo: 'B-3', changeType: 'STOCKTAKE_UP', qtyChange: 2, operator: 'sys',
      refNo: 'ST-1', note: '盘盈', businessType: 'STOCKTAKE_GAIN',
    });
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain(
      'INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note, business_type)',
    );
    expect(params).toEqual(['B-3', 'STOCKTAKE_UP', 2, 'sys', null, 'ST-1', '盘盈', 'STOCKTAKE_GAIN']);
  });

  it('writes house_code only when a real value is provided (column not in migration chain)', async () => {
    const withNull = makeEm();
    await writeInvLedger(withNull.em, {
      batchNo: 'B-4', changeType: 'MED_OUTBOUND', qtyChange: -1, operator: 'vet',
      refNo: 'REC-1', note: '用药', houseCode: null,
    });
    expect(String(withNull.query.mock.calls[0][0])).not.toContain('house_code');

    const withValue = makeEm();
    await writeInvLedger(withValue.em, {
      batchNo: 'B-4', changeType: 'MED_OUTBOUND', qtyChange: -1, operator: 'vet',
      refNo: 'REC-1', note: '用药', houseCode: 'HOUSE-1',
    });
    const [sql, params] = withValue.query.mock.calls[0];
    expect(String(sql)).toContain(', house_code)');
    expect(params[params.length - 1]).toBe('HOUSE-1');
  });

  it('returns the numeric id and falls back to 0 for SQL-contract mocks without rows', async () => {
    const { em } = makeEm([{ id: '12345' }]);
    await expect(writeInvLedger(em, {
      batchNo: 'B-5', changeType: 'INBOUND', qtyChange: 1, operator: 'op',
      refNo: 'R', note: 'n',
    })).resolves.toBe(12345);

    const empty = makeEm([]);
    await expect(writeInvLedger(empty.em, {
      batchNo: 'B-5', changeType: 'INBOUND', qtyChange: 1, operator: 'op',
      refNo: 'R', note: 'n',
    })).resolves.toBe(0);
  });
});
