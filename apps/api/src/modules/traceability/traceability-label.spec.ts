import { TraceabilityService } from './traceability.service';

describe('TraceabilityService box code lookup', () => {
  const scope: any = { isGlobal: false, allowedCompanyCodes: ['C1'], allowedWarehouseCodes: ['W1'] };

  function setup(query: jest.Mock, rows: jest.Mock) {
    const history: any = { rows };
    const manager = { query, queryRunner: { isTransactionActive: true } };
    const ds = { query, manager, transaction: (_isolation: string, callback: (tx: any) => unknown) => callback(manager) };
    const service = new TraceabilityService(ds as any, history);
    return service;
  }

  it('uses a BOUND registry claim and receipt mapping before returning batch level downstream evidence', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ normalized_code: 'PBX-1', state: 'BOUND', owner_box_id: 'box-1' }])
      .mockResolvedValueOnce([{
        kind: 'CANONICAL', normalized_code: 'PBX-1', box_id: 'box-1', packing_id: 'packing-1',
        packing_code: 'PKG-1', output_ordinal: 2, box_ordinal: 1, original_qty: 20,
      }]);
    const packing = {
      id: 'packing-1', code: 'PKG-1', company_code: 'C1', total_eggs: 20,
      commit_receipt: { groups: [{ skuCode: 'SKU-1', specCode: 'S', productCode: 'P', qty: 20,
        batchNo: 'BATCH-1', ledgerId: 'LEDGER-1', outputOrdinals: [2], companyCode: 'C1',
        warehouseCode: 'W1', locationCode: 'L1' }] },
      inventory: [{ batch_no: 'BATCH-1', qty: 15, qty_available: 15, company_code: 'C1', warehouse_code: 'W1', location_code: 'L1' }],
      ledger: [{ id: 'LEDGER-1', batch_no: 'BATCH-1', qty_change: 20, ref_no: 'PKG-1', change_type: 'PACKAGING_INBOUND', company_code: 'C1', warehouse_code: 'W1', location_code: 'L1' }],
    };
    const rows = jest.fn().mockResolvedValue([packing]);
    const service = setup(query, rows);
    jest.spyOn(service, 'traceByBatch').mockResolvedValue({ found: true, sales: { storeSales: [] }, lineage: [] });

    await expect(service.traceByLabel(' PBX-1 ', ['C1'], scope)).resolves.toMatchObject({
      found: true,
      identity: { kind: 'CANONICAL', boxId: 'box-1', boxOrdinal: 1 },
      packaging: { packingCode: 'PKG-1', outputOrdinal: 2, receiptState: 'RECORDED' },
      outputGroup: { batchNo: 'BATCH-1', ledgerId: 'LEDGER-1', outputOrdinals: [2] },
      inventory: { mappingPrecision: 'OUTPUT_GROUP', batch: { batch_no: 'BATCH-1' }, ledger: { id: 'LEDGER-1' } },
      downstream: { precision: 'BATCH_ALLOCATION' },
    });
    expect(rows).toHaveBeenCalledWith(scope, expect.anything(), 'PKG-1');
    expect(service.traceByBatch).toHaveBeenCalledWith('BATCH-1', ['C1'], scope);
  });

  it('downgrades a receipt group when its referenced posting ledger does not corroborate it', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ normalized_code: 'PBX-1', state: 'BOUND', owner_box_id: 'box-1' }])
      .mockResolvedValueOnce([{
        kind: 'CANONICAL', normalized_code: 'PBX-1', box_id: 'box-1', packing_id: 'packing-1',
        packing_code: 'PKG-1', output_ordinal: 0, box_ordinal: 1, original_qty: 20,
      }]);
    const packing = {
      id: 'packing-1', code: 'PKG-1', company_code: 'C1', total_eggs: 20,
      commit_receipt: { groups: [{ skuCode: 'SKU-1', qty: 20, batchNo: 'BATCH-1', ledgerId: 'MISSING',
        outputOrdinals: [0], companyCode: 'C1', warehouseCode: 'W1', locationCode: 'L1' }] },
      inventory: [{ batch_no: 'BATCH-1', company_code: 'C1', warehouse_code: 'W1', location_code: 'L1' }],
      ledger: [],
    };
    const service = setup(query, jest.fn().mockResolvedValue([packing]));
    const traceByBatch = jest.spyOn(service, 'traceByBatch');

    await expect(service.traceByLabel('PBX-1', ['C1'], scope)).resolves.toMatchObject({
      found: true,
      outputGroup: null,
      inventory: { mappingPrecision: 'PACKING_RECORD_ONLY', receiptState: 'MAPPING_UNAVAILABLE' },
      downstream: { precision: 'NOT_ATTRIBUTABLE_TO_BOX' },
    });
    expect(traceByBatch).not.toHaveBeenCalled();
  });

  it('infers an old receipt group only from complete output identity, quantity and posting evidence', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ normalized_code: 'PBX-1', state: 'BOUND', owner_box_id: 'box-1' }])
      .mockResolvedValueOnce([{
        kind: 'CANONICAL', normalized_code: 'PBX-1', box_id: 'box-1', packing_id: 'packing-1',
        packing_code: 'PKG-1', output_ordinal: 1, box_ordinal: 2, original_qty: 20,
      }]);
    const packing = {
      id: 'packing-1', code: 'PKG-1', company_code: 'C1', total_eggs: 40,
      commit_receipt: {
        outputBindings: [
          { outputOrdinal: 0, skuCode: 'SKU-1', specCode: 'S', productCode: 'P', qty: 20 },
          { outputOrdinal: 1, skuCode: 'SKU-1', specCode: 'S', productCode: 'P', qty: 20 },
        ],
        groups: [{ skuCode: 'SKU-1', specCode: 'S', productCode: 'P', qty: 40, batchNo: 'BATCH-1',
          ledgerId: 'LEDGER-1', companyCode: 'C1', warehouseCode: 'W1', locationCode: 'L1' }],
      },
      inventory: [{ batch_no: 'BATCH-1', qty: 40, company_code: 'C1', warehouse_code: 'W1', location_code: 'L1' }],
      ledger: [{ id: 'LEDGER-1', batch_no: 'BATCH-1', qty_change: 40, ref_no: 'PKG-1', change_type: 'PACKAGING_INBOUND', company_code: 'C1', warehouse_code: 'W1', location_code: 'L1' }],
    };
    const service = setup(query, jest.fn().mockResolvedValue([packing]));
    jest.spyOn(service, 'traceByBatch').mockResolvedValue({ found: true, sales: {}, lineage: [] });

    await expect(service.traceByLabel('PBX-1', ['C1'], scope)).resolves.toMatchObject({
      found: true,
      outputGroup: { batchNo: 'BATCH-1', ledgerId: 'LEDGER-1', qty: 40, outputOrdinals: [0, 1] },
      inventory: { mappingPrecision: 'OUTPUT_GROUP' },
    });
  });

  it.each(['RETIRED', 'AMBIGUOUS'])('does not fall back to legacy labels when the registry is %s', async state => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ normalized_code: 'PBX-1', state, owner_box_id: null }])
      .mockResolvedValueOnce([]);
    const service = setup(query, jest.fn());
    await expect(service.traceByLabel('PBX-1', ['C1'], scope)).resolves.toMatchObject({ found: false });
    expect(query).toHaveBeenCalledTimes(state === 'RETIRED' ? 2 : 1);
  });

  it('distinguishes a retired code only when its sole void owner is in scope', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ normalized_code: 'PBX-1', state: 'RETIRED', owner_box_id: null }])
      .mockResolvedValueOnce([{ status: 'VOID', box_id: 'box-1', packing_code: 'PKG-1' }]);
    const service = setup(query, jest.fn().mockResolvedValue([{ id: 'packing-1', code: 'PKG-1', company_code: 'C1' }]));
    await expect(service.traceByLabel('PBX-1', ['C1'], scope)).resolves.toEqual({
      found: false, entry: 'label', key: 'PBX-1', registryState: 'RETIRED',
    });
  });

  it('uses the legacy batch lookup only when no registry row exists', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ label_no: 'OLD-1', batch_no: 'BATCH-OLD', product_code: 'P', qty: 10 }]);
    const service = setup(query, jest.fn());
    jest.spyOn(service, 'traceByBatch').mockResolvedValue({ found: true, sales: {}, lineage: [] });

    await expect(service.traceByLabel('OLD-1', ['C1'], scope)).resolves.toMatchObject({
      found: true,
      packaging: { precision: 'LEGACY_BATCH_ONLY' },
      downstream: { precision: 'BATCH_ALLOCATION' },
    });
    expect(service.traceByBatch).toHaveBeenCalledWith('BATCH-OLD', ['C1'], scope);
  });

  it('returns the same not-found result for a registry code outside the caller scope', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ normalized_code: 'PBX-1', state: 'BOUND', owner_box_id: 'box-1' }])
      .mockResolvedValueOnce([{
        kind: 'ALIAS', normalized_code: 'PBX-1', box_id: 'box-1', packing_id: 'packing-1',
        packing_code: 'PKG-1', output_ordinal: 0, box_ordinal: 1, original_qty: 20,
      }]);
    const service = setup(query, jest.fn().mockResolvedValue([]));
    await expect(service.traceByLabel('PBX-1', ['C1'], scope)).resolves.toEqual({
      found: false, entry: 'label', key: 'PBX-1',
    });
  });
});
