import {
  ChanjetProductNameCanaryService,
  chanjetProductInvariant,
  extractChanjetProductRows,
} from './chanjet-product-name-canary.service';

const mappingId = '307052';
const bookId = '3537748712226818';
const productCode = '0100005';
const originalName = '阿莫西林可溶性分';
const proposedName = '阿莫西林可溶性粉';

function audit() {
  return {
    auditHash: 'audit-hash',
    items: [{
      mappingId,
      mappingType: 'PRODUCT',
      bookId,
      companyCode: 'COMP-LAO-XINGCHI',
      chanjetId: productCode,
      chanjetCode: productCode,
      chanjetName: originalName,
      disposition: 'CHANJET_CHANGE_PROPOSAL',
      chanjetChangeProposal: {
        field: 'name',
        currentValue: originalName,
        proposedValue: proposedName,
        rollbackValue: originalName,
      },
    }],
  };
}

function product(name: string, overrides: Record<string, unknown> = {}) {
  return {
    id: '3557635884849011',
    code: productCode,
    name,
    specNo: '100g/瓶',
    statusEnum: 'A',
    baseUomId: { id: 'UOM-1', uomName: '瓶' },
    parentId: { code: 'VET', name: '兽药' },
    updateStamp: name === originalName ? '100' : '101',
    ...overrides,
  };
}

function createRunner(expectedMirrorName = proposedName) {
  return {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql: string) => {
      if (sql.includes('pg_try_advisory_xact_lock')) return [{ locked: true }];
      if (sql.includes('FOR UPDATE')) {
        return [{
          id: mappingId,
          mapping_type: 'PRODUCT',
          book_id: bookId,
          chanjet_id: productCode,
          chanjet_code: productCode,
          chanjet_name: originalName,
          match_status: 'SOURCE_ONLY',
          review_status: 'APPROVED',
        }];
      }
      if (sql.includes('UPDATE chanjet_master_mapping')) return [];
      if (sql.includes("raw_data->'productNameCanary'")) {
        return [{ chanjet_name: expectedMirrorName, evidence: { verifiedName: expectedMirrorName } }];
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
}

function createService(callApiResults: unknown[], expectedMirrorName = proposedName) {
  const runner = createRunner(expectedMirrorName);
  const auth = { callApi: jest.fn() };
  for (const result of callApiResults) auth.callApi.mockResolvedValueOnce(result);
  const ds = {
    createQueryRunner: jest.fn(() => runner),
    query: jest.fn().mockResolvedValue([{
      id: mappingId,
      mapping_type: 'PRODUCT',
      book_id: bookId,
      chanjet_id: productCode,
      chanjet_code: productCode,
      chanjet_name: originalName,
      match_status: 'SOURCE_ONLY',
      review_status: 'APPROVED',
    }]),
  };
  const holdAudit = { audit: jest.fn().mockResolvedValue(audit()) };
  const service = new ChanjetProductNameCanaryService(ds as never, auth as never, holdAudit as never);
  return { service, runner, auth, holdAudit };
}

const input = {
  mappingId,
  auditHash: 'audit-hash',
  approveProduction: true,
  confirmation: `UPDATE_CHANJET_PRODUCT_NAME_CANARY:${mappingId}`,
};

describe('ChanjetProductNameCanaryService', () => {
  it('unwraps the official product list envelope and locks nested business names', () => {
    expect(extractChanjetProductRows({ data: { rows: [product(originalName)] } })).toHaveLength(1);
    expect(chanjetProductInvariant(product(originalName))).toBe(chanjetProductInvariant(product(proposedName)));
    expect(chanjetProductInvariant(product(originalName))).not.toBe(chanjetProductInvariant(product(
      proposedName,
      { parentId: { code: 'VET', name: '另一个分类' } },
    )));
  });

  it('updates exactly one product name and verifies provider plus ERP mirror readback', async () => {
    const before = product(originalName);
    const after = product(proposedName);
    const { service, runner, auth } = createService([
      { success: true, data: { rows: [before] } },
      { success: true, data: [] },
      { success: true, data: { rows: [after] } },
    ]);

    const result = await service.execute(input, 'tester');

    expect(result).toMatchObject({
      outcome: 'UPDATED_AND_VERIFIED',
      writeChanjet: true,
      providerCalls: 3,
      changedFields: ['name'],
      evidence: {
        providerWriteSucceeded: true,
        providerReadbackVerified: true,
        erpMirrorReadbackVerified: true,
        rollbackAttempted: false,
      },
    });
    expect(auth.callApi).toHaveBeenNthCalledWith(
      1,
      `/accounting/openapi/cc/product/list/${bookId}`,
      { method: 'POST', body: { codes: [productCode], pageSize: 20, pageNo: 1 }, kind: 'READ' },
    );
    expect(auth.callApi).toHaveBeenNthCalledWith(
      2,
      `/accounting/openapi/cc/product/update/${bookId}`,
      { method: 'POST', body: [{ productCode, productName: proposedName }], kind: 'WRITE' },
    );
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('preflights the current official product query grant with one read and zero writes', async () => {
    const { service, auth, runner } = createService([
      { success: true, data: { rows: [product(originalName)] } },
    ]);

    const result = await service.preflight({ mappingId, auditHash: 'audit-hash' });

    expect(result).toMatchObject({
      decision: 'READY_FOR_EXPLICIT_APPROVAL',
      currentName: originalName,
      proposedName,
      providerCalls: 1,
      writeChanjet: false,
      writeErpBusinessTables: false,
    });
    expect(auth.callApi).toHaveBeenCalledWith(
      `/accounting/openapi/cc/product/list/${bookId}`,
      { method: 'POST', body: { codes: [productCode], pageSize: 20, pageNo: 1 }, kind: 'READ' },
    );
    expect(runner.startTransaction).not.toHaveBeenCalled();
  });

  it('treats an already-correct provider row as idempotent and performs no provider write', async () => {
    const { service, runner, auth } = createService([
      { success: true, data: { rows: [product(proposedName)] } },
    ]);

    const result = await service.execute(input, 'tester');

    expect(result).toMatchObject({
      outcome: 'IDEMPOTENT_PROVIDER_ALREADY_CORRECT',
      writeChanjet: false,
      providerCalls: 1,
    });
    expect(auth.callApi).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('restores the original name when provider readback changes any non-name field', async () => {
    const before = product(originalName);
    const drifted = product(proposedName, { specNo: '200g/瓶' });
    const restored = product(originalName);
    const { service, runner, auth } = createService([
      { success: true, data: { rows: [before] } },
      { success: true, data: [] },
      { success: true, data: { rows: [drifted] } },
      { success: true, data: [] },
      { success: true, data: { rows: [restored] } },
    ]);

    await expect(service.execute(input, 'tester')).rejects.toMatchObject({
      name: 'ChanjetProductNameCanaryError',
      evidence: {
        rollbackAttempted: true,
        rollbackSucceeded: true,
        erpMirrorReadbackVerified: false,
      },
    });
    expect(auth.callApi).toHaveBeenNthCalledWith(
      4,
      `/accounting/openapi/cc/product/update/${bookId}`,
      { method: 'POST', body: [{ productCode, productName: originalName }], kind: 'WRITE' },
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });

  it('fails closed and restores the original name on an ambiguous row-level update result', async () => {
    const before = product(originalName);
    const restored = product(originalName);
    const { service, runner, auth } = createService([
      { success: true, data: { rows: [before] } },
      { success: true, data: [{ productCode: 'ANOTHER-SKU' }] },
      { success: true, data: [] },
      { success: true, data: { rows: [restored] } },
    ]);

    await expect(service.execute(input, 'tester')).rejects.toMatchObject({
      name: 'ChanjetProductNameCanaryError',
      evidence: {
        providerWriteAttempted: true,
        providerWriteSucceeded: false,
        rollbackAttempted: true,
        rollbackSucceeded: true,
      },
    });
    expect(auth.callApi).toHaveBeenNthCalledWith(
      3,
      `/accounting/openapi/cc/product/update/${bookId}`,
      { method: 'POST', body: [{ productCode, productName: originalName }], kind: 'WRITE' },
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });

  it('fails before any provider call when the exact production confirmation is absent', async () => {
    const { service, auth } = createService([]);

    await expect(service.execute({ ...input, confirmation: 'UPDATE_PRODUCT' }, 'tester'))
      .rejects.toThrow(`UPDATE_CHANJET_PRODUCT_NAME_CANARY:${mappingId}`);
    expect(auth.callApi).not.toHaveBeenCalled();
  });
});
