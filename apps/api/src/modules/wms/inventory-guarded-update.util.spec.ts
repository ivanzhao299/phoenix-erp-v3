import { guardedBatchUpdate, GuardedBatchUpdateSpec } from './inventory-guarded-update.util';

/**
 * INV-301b 守卫化 UPDATE 统一入口契约：SQL 形态钉死。
 *
 * 每个守卫维度生成的 SET/WHERE 片段与占位符布局都必须逐字稳定——
 * legacy-managed-allocation / legacy-managed-pos-allocation 两个行为型
 * SQL fixture 依赖归一化前缀 `WITH changed AS ( UPDATE inv_batches`，
 * 且引擎迁移后占位符顺序变化只能来自这里的确定性布局。
 */
describe('guardedBatchUpdate (INV-301b shared guard util)', () => {
  function makeEm(rows: unknown = [{ batch_no: 'B-1' }]) {
    const query = jest.fn().mockResolvedValue(rows);
    return { em: { query }, query };
  }

  it('pins the egg allocateByFIFO shape (deduct available + full guard set + extra where)', async () => {
    const { em, query } = makeEm();
    const changed = await guardedBatchUpdate(em, {
      batchNo: 'B-1',
      companyCode: 'COMP-A',
      warehouseCode: 'WH-A',
      deltaAvailable: -3,
      requireStatus: 'AVAILABLE',
      expireGuard: true,
      excludeLegacy: true,
      extraWheres: [{ sql: `inv_batches.inventory_class IN ('STANDARD','DEFECT_SALE')` }],
    });
    expect(changed).toBe(1);
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toBe(`WITH changed AS (
           UPDATE inv_batches AS inv_batches
              SET qty_available = qty_available - $4, updated_at=NOW()
            WHERE batch_no = $1
              AND company_code = $2
              AND warehouse_code = $3
              AND status='AVAILABLE'
              AND qty_available >= $4
              AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
              AND legacy_source IS NULL
              AND (inv_batches.inventory_class IN ('STANDARD','DEFECT_SALE'))
            RETURNING batch_no
         ) SELECT batch_no FROM changed`);
    expect(params).toEqual(['B-1', 'COMP-A', 'WH-A', -3]);
    // Behavioral SQL fixtures (legacy-managed-*) normalize whitespace and match
    // on this prefix — the CTE-wrapped UPDATE form is part of the contract.
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    expect(normalized.startsWith('WITH changed AS ( UPDATE inv_batches')).toBe(true);
    expect(normalized).toContain('SET qty_available = qty_available - $4');
  });

  it('pins the egg releaseInventory shape (return available with the <= qty cap guard)', async () => {
    const { em, query } = makeEm();
    await guardedBatchUpdate(em, {
      batchNo: 'B-2',
      companyCode: 'COMP-A',
      warehouseCode: 'WH-A',
      deltaAvailable: 5,
      requireStatus: 'AVAILABLE',
    });
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toBe(`WITH changed AS (
           UPDATE inv_batches AS inv_batches
              SET qty_available = qty_available + $4, updated_at=NOW()
            WHERE batch_no = $1
              AND company_code = $2
              AND warehouse_code = $3
              AND status='AVAILABLE'
              AND qty_available + $4 <= qty
            RETURNING batch_no
         ) SELECT batch_no FROM changed`);
    expect(params).toEqual(['B-2', 'COMP-A', 'WH-A', 5]);
  });

  it('pins the egg confirmOutbound shape (deduct qty, no available guard, expiry guard)', async () => {
    const { em, query } = makeEm();
    await guardedBatchUpdate(em, {
      batchNo: 'B-3',
      companyCode: 'COMP-A',
      warehouseCode: 'WH-A',
      deltaQty: -2,
      requireStatus: 'AVAILABLE',
      expireGuard: true,
    });
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain('SET qty = qty - $4, updated_at=NOW()');
    expect(String(sql)).toContain('AND qty >= $4');
    expect(String(sql)).not.toContain('qty_available');
    expect(params).toEqual(['B-3', 'COMP-A', 'WH-A', -2]);
  });

  it('pins the POS fifoDeductItems shape (both deltas share the batch row, available keeps $5)', async () => {
    const { em, query } = makeEm();
    await guardedBatchUpdate(em, {
      batchNo: 'B-4',
      companyCode: 'COMP-A',
      warehouseCode: 'WH-A',
      deltaQty: -3,
      deltaAvailable: -3,
      requireStatus: 'AVAILABLE',
      expireGuard: true,
      excludeLegacy: true,
    });
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toBe(`WITH changed AS (
           UPDATE inv_batches AS inv_batches
              SET qty = qty - $4, qty_available = qty_available - $5, updated_at=NOW()
            WHERE batch_no = $1
              AND company_code = $2
              AND warehouse_code = $3
              AND status='AVAILABLE'
              AND qty >= $4
              AND qty_available >= $5
              AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
              AND legacy_source IS NULL
            RETURNING batch_no
         ) SELECT batch_no FROM changed`);
    expect(params).toEqual(['B-4', 'COMP-A', 'WH-A', -3, -3]);
  });

  it('emits a positive qty delta without a lower-bound guard and an IN list for multi-status guards', async () => {
    const { em, query } = makeEm([]);
    const changed = await guardedBatchUpdate(em, {
      batchNo: 'B-5',
      deltaQty: 7,
      requireStatus: ['QUARANTINE', 'DAMAGED'],
    });
    expect(changed).toBe(0); // guard missed → caller fails closed on !== 1
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain('SET qty = qty + $2, updated_at=NOW()');
    expect(String(sql)).toContain("AND status IN ('QUARANTINE','DAMAGED')");
    expect(String(sql)).not.toContain('qty >= ');
    expect(params).toEqual(['B-5', 7]);
  });

  it('appends extra-where params after the fixed guard params ($6 onward)', async () => {
    const { em, query } = makeEm();
    await guardedBatchUpdate(em, {
      batchNo: 'B-6',
      companyCode: 'COMP-A',
      warehouseCode: 'WH-A',
      deltaQty: -1,
      deltaAvailable: -1,
      requireStatus: 'AVAILABLE',
      extraWheres: [
        { sql: 'inv_batches.inventory_class = $6', params: ['STANDARD'] },
        { sql: 'EXISTS (SELECT 1 FROM t WHERE t.x = $7)', params: [9] },
      ],
    });
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain('AND (inv_batches.inventory_class = $6)');
    expect(String(sql)).toContain('AND (EXISTS (SELECT 1 FROM t WHERE t.x = $7))');
    expect(params).toEqual(['B-6', 'COMP-A', 'WH-A', -1, -1, 'STANDARD', 9]);
  });

  it('fails fast on invalid specs instead of emitting a silently-matching guard', async () => {
    const { em, query } = makeEm();
    const base: GuardedBatchUpdateSpec = { batchNo: 'B-7', deltaAvailable: -1 };
    await expect(guardedBatchUpdate(em, { ...base, batchNo: '' })).rejects.toThrow('batchNo is required');
    await expect(guardedBatchUpdate(em, { batchNo: 'B-7' })).rejects.toThrow('at least one');
    await expect(guardedBatchUpdate(em, { ...base, requireStatus: 'AVAILABLEE' })).rejects.toThrow("unknown status guard 'AVAILABLEE'");
    await expect(guardedBatchUpdate(em, { ...base, requireStatus: [] })).rejects.toThrow('must not be empty');
    expect(query).not.toHaveBeenCalled();
  });

  it('returns the changed-row count and falls back to 0 for non-array contract-mock results', async () => {
    const one = makeEm();
    await expect(guardedBatchUpdate(one.em, { batchNo: 'B-8', deltaQty: -1 })).resolves.toBe(1);

    const empty = makeEm([]);
    await expect(guardedBatchUpdate(empty.em, { batchNo: 'B-8', deltaQty: -1 })).resolves.toBe(0);

    // The CTE SELECT makes real drivers return a plain row array (that is the
    // whole point of wrapping the UPDATE); a non-array result only happens in
    // contract mocks — treat it as "nothing provably changed" so callers fail closed.
    // (null, not undefined: undefined would trip makeEm's default parameter.)
    const notArray = makeEm(null);
    await expect(guardedBatchUpdate(notArray.em, { batchNo: 'B-8', deltaQty: -1 })).resolves.toBe(0);
  });
});
