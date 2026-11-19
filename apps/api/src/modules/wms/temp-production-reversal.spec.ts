import {
  classifyTempProductionReversal, exactReversalNumber, reversalPlanHash, reversalReference,
  ReversalFact, REVERSAL_BUSINESS_TYPE, REVERSAL_TYPE, singaporeBusinessDate,
  TEMP_PRODUCTION_REVERSAL_CASE as c, lockTempProductionReferences,
} from './temp-production-reversal';

function completed(): { batches: ReversalFact[]; ledgers: ReversalFact[] } {
  const snapshot = 'a'.repeat(64), release = 'b'.repeat(40), ledger = 'c'.repeat(64);
  return {
    batches: c.targets.map(t => ({ id: t.id, batch_no: t.batchNo, qty: '0', qty_available: '0',
      company_code: c.companyCode, warehouse_code: c.warehouseCode, location_code: c.locationCode,
      source_type: 'TEMP_PRODUCTION', source_no: c.sourceNo, collection_batch_ref: c.collectionRef,
      packaging_batch_ref: null,
      egg_date: c.originalDate, product_code: t.product, sku_code: t.sku, grade_code_std: t.grade,
      quality_grade: t.grade, unit: '枚', spec_code: 'LOOSE', packaging_spec: 'LOOSE',
      base_quantity_version: 1, store_code: null, material_code: null, legacy_source: null, status: 'AVAILABLE', unit_cost: '0.000000' })),
    ledgers: c.targets.flatMap(t => [{ id: t.ledgerId, batch_no: t.batchNo, change_type: 'TEMP_PRODUCTION_INBOUND',
      qty_change: '30', ref_no: c.sourceNo, company_code: c.companyCode, warehouse_code: c.warehouseCode,
      location_code: c.locationCode, sku_code: t.sku, quality_grade: t.grade, log_date: c.originalDate,
      store_code: c.companyCode, unit: null, cost_change: null, business_type: null },
    { id: t.ledgerId + 1000, batch_no: t.batchNo, change_type: REVERSAL_TYPE, qty_change: '-30',
      ref_no: reversalReference(t.ledgerId), company_code: c.companyCode, warehouse_code: c.warehouseCode,
      location_code: c.locationCode, sku_code: t.sku, quality_grade: t.grade, log_date: '2026-11-18',
      store_code: null, unit: '枚', cost_change: null, business_type: REVERSAL_BUSINESS_TYPE, operator: 'owned-operator',
      note: JSON.stringify({ case_id: c.id, version: 1, original_ledger_id: t.ledgerId, original_date: c.originalDate,
        original_cost_evidence: c.costEvidence, cost_status: 'UNKNOWN_PRE_SCHEMA', original_store_code: c.companyCode,
        corrected_store_code: null, approval_ref: 'owned-business-approval', execution_run: 'owned-run', technical_actor: 'owned-operator',
        financial_evidence_ref:'owned-finance',financial_evidence_sha256:'d'.repeat(64),backup_receipt_ref:'owned-backup',backup_archive_sha256:'e'.repeat(64),
        snapshot_sha256: snapshot, release_sha: release, migration_ledger_sha256: ledger,
        plan_sha256: reversalPlanHash(snapshot, release, ledger, '2026-11-18'), execution_date: '2026-11-18' }) }]),
  };
}

describe('exact erroneous production inbound evidence', () => {
  it('recognizes the complete two-batch pair while preserving original day and unknown cost', () => {
    const f = completed();
    expect(classifyTempProductionReversal(f.batches, f.ledgers)).toBe('REVERSED');
    expect(f.ledgers[0].log_date).toBe('2026-11-17');
    expect(f.ledgers[1].log_date).toBe('2026-11-18');
    expect(f.ledgers[1].cost_change).toBeNull();
  });
  it('does not treat zero stock or a normal consumed batch as reversal evidence', () => {
    const f = completed();
    f.ledgers = f.ledgers.filter(row => row.change_type !== REVERSAL_TYPE);
    expect(classifyTempProductionReversal(f.batches, f.ledgers)).toBe('OPEN');
    f.ledgers.push({ batch_no: c.targets[0].batchNo, change_type: 'FIFO_OUT', qty_change: -30 });
    expect(classifyTempProductionReversal(f.batches, f.ledgers)).toBe('OPEN');
  });
  it.each(['qty', 'qty_available'])('fails closed if a corrected batch is revived through %s', field => {
    const f = completed(); f.batches[0][field] = 30;
    expect(() => classifyTempProductionReversal(f.batches, f.ledgers)).toThrow('批次身份或更正后数量不符');
  });
  it.each(['company_code', 'warehouse_code', 'location_code', 'sku_code', 'source_no', 'collection_batch_ref', 'unit'])('rejects a changed %s identity', field => {
    const f = completed(); f.batches[0][field] = 'OTHER';
    expect(() => classifyTempProductionReversal(f.batches, f.ledgers)).toThrow();
  });
  it('rejects a partial pair or an extra business ledger', () => {
    const f = completed(); f.ledgers.pop();
    expect(() => classifyTempProductionReversal(f.batches, f.ledgers)).toThrow();
    const g = completed(); g.ledgers.push({ batch_no: c.targets[0].batchNo, change_type: 'RESERVED', qty_change: -1 });
    expect(() => classifyTempProductionReversal(g.batches, g.ledgers)).toThrow();
  });
  it.each([null, 'WRONG_TYPE'])('does not lose a known reversal marker when its type becomes %s', type => {
    const f = completed(); f.ledgers.filter(row => row.change_type === REVERSAL_TYPE).forEach(row => { row.change_type = type; });
    expect(() => classifyTempProductionReversal(f.batches, f.ledgers)).toThrow();
  });
  it('holds malformed explicit case evidence instead of returning OPEN', () => {
    const f = completed();
    for (const row of f.ledgers.filter(row => row.change_type === REVERSAL_TYPE)) {
      row.change_type = null; row.ref_no = null; row.note = '{"case_id":"' + c.id;
    }
    expect(() => classifyTempProductionReversal(f.batches, f.ledgers)).toThrow();
  });
  it.each([null, undefined, '1.5'])('holds unproven or changed batch cost %s', value => {
    const f = completed(); f.batches[0].unit_cost = value;
    expect(() => classifyTempProductionReversal(f.batches, f.ledgers)).toThrow('批次成本');
  });
  it.each([undefined, 0, '30.00'])('holds a missing or changed original cost movement %s', value => {
    const f = completed(); f.ledgers[0].cost_change = value;
    expect(() => classifyTempProductionReversal(f.batches, f.ledgers)).toThrow();
  });
  it.each(['log_date', 'store_code', 'cost_change', 'ref_no'])('rejects a fabricated or inconsistent compensation %s', field => {
    const f = completed(); f.ledgers[1][field] = field === 'cost_change' ? 0 : 'OTHER';
    expect(() => classifyTempProductionReversal(f.batches, f.ledgers)).toThrow();
  });
  it('binds the plan digest and both execution identities', () => {
    const f = completed(); const note = JSON.parse(String(f.ledgers[1].note));
    note.plan_sha256 = 'f'.repeat(64); f.ledgers[1].note = JSON.stringify(note);
    expect(() => classifyTempProductionReversal(f.batches, f.ledgers)).toThrow();
    const g = completed(); const other = JSON.parse(String(g.ledgers[1].note));
    other.approval_ref = 'different-approval'; g.ledgers[1].note = JSON.stringify(other);
    expect(() => classifyTempProductionReversal(g.batches, g.ledgers)).toThrow('两笔更正批准');
  });
  it('requires the stored ledger actor and both receipt references to agree with their trace',()=>{
    const f=completed();f.ledgers[1].operator='another-actor';
    expect(()=>classifyTempProductionReversal(f.batches,f.ledgers)).toThrow();
    const g=completed();const note=JSON.parse(String(g.ledgers[1].note));delete note.financial_evidence_ref;g.ledgers[1].note=JSON.stringify(note);
    expect(()=>classifyTempProductionReversal(g.batches,g.ledgers)).toThrow();
  });
  it('never converts missing or invalid quantities into zero', () => {
    for (const value of [null, undefined, '', ' ', 'NaN', Infinity]) expect(exactReversalNumber(value)).toBeNull();
    expect(exactReversalNumber('0.00')).toBe(0);
    expect(exactReversalNumber('-30')).toBe(-30);
  });
  it('uses Singapore midnight for the new ledger day', () => {
    expect(singaporeBusinessDate(new Date('2026-11-17T15:59:59.999Z'))).toBe('2026-11-17');
    expect(singaporeBusinessDate(new Date('2026-11-17T16:00:00.000Z'))).toBe('2026-11-18');
    expect(reversalPlanHash('a'.repeat(64),'b'.repeat(40),'c'.repeat(64),'2026-11-17'))
      .not.toBe(reversalPlanHash('a'.repeat(64),'b'.repeat(40),'c'.repeat(64),'2026-11-18'));
  });
  it('short-circuits all ordinary batches without any new query or lock', async () => {
    const db = { query: jest.fn() };
    await lockTempProductionReferences(db, ['ORDINARY-ZERO', null, 'OTHER']);
    expect(db.query).not.toHaveBeenCalled();
  });
});
