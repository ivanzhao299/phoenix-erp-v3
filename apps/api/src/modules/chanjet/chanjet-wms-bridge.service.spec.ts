import { ChanjetWmsBridgeService } from './chanjet-wms-bridge.service';

const repository = (overrides: Record<string, unknown> = {}) => ({
  find: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => ({ id: '1', ...value })),
  createQueryBuilder: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  })),
  ...overrides,
});

describe('ChanjetWmsBridgeService', () => {
  const activeBook = {
    bookid: 'BOOK-1',
    bookName: 'Book',
    companyCode: 'COMP-1',
    companyName: 'Company',
    syncEnabled: true,
  };
  const snapshot = {
    id: '10',
    bookId: 'BOOK-1',
    entityType: 'STOCK_IN',
    externalId: 'CJ-IN-1',
    externalCode: 'IN-001',
    rawData: {
      id: 'CJ-IN-1',
      code: 'IN-001',
      voucherStatusEnum: 'EFFECTIVE',
      bizDate: '2026-07-28',
      warehouseCode: 'WH-CJ',
      voucherDetailList: [{
        id: 'LINE-1',
        productCode: 'SKU-CJ',
        productName: 'Egg',
        warehouseCode: 'WH-CJ',
        transQty: 10,
        transUomName: 'PCS',
      }],
    },
    updatedAt: new Date(),
  };
  const mappings = [
    ['WAREHOUSE', 'WH-CJ', 'WH-ERP'],
    ['PRODUCT', 'SKU-CJ', 'SKU-ERP'],
    ['UOM', 'PCS', 'PCS'],
  ].map(([mappingType, chanjetCode, erpCode]) => ({
    mappingType,
    bookId: 'BOOK-1',
    chanjetCode,
    erpCode,
    reviewStatus: 'APPROVED',
    matchStatus: 'MATCHED',
  }));

  it('builds an approval candidate without touching business tables or external transport', async () => {
    const candidateRepo = repository();
    const service = new ChanjetWmsBridgeService(
      repository({ find: jest.fn().mockResolvedValue([activeBook]) }) as never,
      repository({ find: jest.fn().mockResolvedValue([snapshot]) }) as never,
      repository({ find: jest.fn().mockResolvedValue(mappings) }) as never,
      candidateRepo as never,
      repository() as never,
    );

    const result = await service.refreshPromotionCandidates('admin');

    expect(result).toMatchObject({
      scanned: 1,
      created: 1,
      states: { CANDIDATE: 1 },
      externalWriteExecuted: false,
      erpBusinessTablesMutated: false,
    });
    expect(candidateRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      state: 'CANDIDATE',
      companyCode: 'COMP-1',
      erpDirection: 'INBOUND',
      erpDocumentType: 'PURCHASE_INBOUND',
      blockers: [],
      conditions: [],
    }));
  });

  it('fails closed when an exact reviewed master mapping is missing', async () => {
    const candidateRepo = repository();
    const service = new ChanjetWmsBridgeService(
      repository({ find: jest.fn().mockResolvedValue([activeBook]) }) as never,
      repository({ find: jest.fn().mockResolvedValue([snapshot]) }) as never,
      repository({ find: jest.fn().mockResolvedValue(mappings.filter((item) => item.mappingType !== 'PRODUCT')) }) as never,
      candidateRepo as never,
      repository() as never,
    );

    const result = await service.refreshPromotionCandidates('admin');

    expect(result.states.NEED_MAPPING).toBe(1);
    expect(candidateRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      state: 'NEED_MAPPING',
      conditions: expect.arrayContaining(['PRODUCT_MAPPING_REQUIRED:SKU-CJ']),
    }));
  });

  it('persists missing source identity as HOLD evidence instead of skipping it', async () => {
    const candidateRepo = repository();
    const identityMissingSnapshot = {
      ...snapshot,
      externalId: '',
      externalCode: '',
      rawData: {
        ...snapshot.rawData,
        id: '',
        code: '',
      },
    };
    const service = new ChanjetWmsBridgeService(
      repository({ find: jest.fn().mockResolvedValue([activeBook]) }) as never,
      repository({ find: jest.fn().mockResolvedValue([identityMissingSnapshot]) }) as never,
      repository({ find: jest.fn().mockResolvedValue(mappings) }) as never,
      candidateRepo as never,
      repository() as never,
    );

    const result = await service.refreshPromotionCandidates('admin');

    expect(result.states.HOLD).toBe(1);
    expect(candidateRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      state: 'HOLD',
      externalDocumentId: 'SNAPSHOT-10',
      blockers: expect.arrayContaining(['EXTERNAL_DOCUMENT_IDENTITY_MISSING']),
    }));
  });

  it('routes code-only source identity to manual review', async () => {
    const candidateRepo = repository();
    const codeOnlySnapshot = {
      ...snapshot,
      externalId: '',
      rawData: {
        ...snapshot.rawData,
        id: '',
      },
    };
    const service = new ChanjetWmsBridgeService(
      repository({ find: jest.fn().mockResolvedValue([activeBook]) }) as never,
      repository({ find: jest.fn().mockResolvedValue([codeOnlySnapshot]) }) as never,
      repository({ find: jest.fn().mockResolvedValue(mappings) }) as never,
      candidateRepo as never,
      repository() as never,
    );

    const result = await service.refreshPromotionCandidates('admin');

    expect(result.states.NEED_MANUAL_REVIEW).toBe(1);
    expect(candidateRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      state: 'NEED_MANUAL_REVIEW',
      conditions: expect.arrayContaining(['EXTERNAL_ID_MISSING_CODE_FALLBACK_USED']),
    }));
  });

  it('rejects unsupported candidate review decisions', async () => {
    const service = new ChanjetWmsBridgeService(
      repository() as never,
      repository() as never,
      repository() as never,
      repository() as never,
      repository() as never,
    );

    await expect(service.reviewPromotionCandidate(
      '1',
      'INVALID' as 'APPROVE',
      'admin',
    )).rejects.toThrow('decision must be APPROVE or REJECT');
  });

  it('requires an explicit approval reference even to prepare a local outbox row', async () => {
    const service = new ChanjetWmsBridgeService(
      repository({ findOne: jest.fn().mockResolvedValue(activeBook) }) as never,
      repository() as never,
      repository() as never,
      repository() as never,
      repository() as never,
    );

    await expect(service.prepareWriteback({
      bookId: 'BOOK-1',
      companyCode: 'COMP-1',
      documentType: 'PURCHASE_INBOUND',
      erpDocumentNo: 'IN-001',
      canonicalPayload: { code: 'IN-001' },
      approvalReference: '',
      approvalConfirmed: false,
    }, 'admin')).rejects.toThrow('explicit approval reference');
  });

  it('rejects document types outside the reviewed WMS policy set', async () => {
    const service = new ChanjetWmsBridgeService(
      repository({ findOne: jest.fn().mockResolvedValue(activeBook) }) as never,
      repository() as never,
      repository() as never,
      repository() as never,
      repository() as never,
    );

    await expect(service.prepareWriteback({
      bookId: 'BOOK-1',
      companyCode: 'COMP-1',
      documentType: 'UNREVIEWED_DOCUMENT',
      erpDocumentNo: 'DOC-001',
      canonicalPayload: { code: 'DOC-001' },
      approvalReference: 'APPROVAL-001',
      approvalConfirmed: true,
    }, 'admin')).rejects.toThrow('unsupported WMS writeback document type');
  });

  it('has no executable external write path', async () => {
    const service = new ChanjetWmsBridgeService(
      repository() as never,
      repository() as never,
      repository() as never,
      repository() as never,
      repository() as never,
    );

    await expect(service.executeExternalWrite()).rejects.toThrow(
      'CHANJET_WMS_EXTERNAL_WRITE_DISABLED',
    );
  });
});
