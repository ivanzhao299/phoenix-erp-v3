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
  manager: {
    query: jest.fn().mockResolvedValue([]),
  },
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

  it('creates exact and source-only WMS mapping evidence without touching business tables', async () => {
    const mappingRepo = repository({
      find: jest.fn().mockResolvedValue([]),
      manager: {
        query: jest.fn()
          .mockResolvedValueOnce([{ code: 'WH-CJ', name: 'Warehouse', company_code: 'COMP-1', entity_type: 'WAREHOUSE' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ code: 'PCS', name: 'PCS', company_code: '', entity_type: 'UOM' }]),
      },
    });
    const service = new ChanjetWmsBridgeService(
      repository({ find: jest.fn().mockResolvedValue([activeBook]) }) as never,
      repository({ find: jest.fn().mockResolvedValue([snapshot]) }) as never,
      mappingRepo as never,
      repository() as never,
      repository() as never,
    );

    const result = await service.refreshMasterMappingCandidates('admin');

    expect(result).toMatchObject({
      sourceIdentities: 3,
      exactMatched: 2,
      sourceOnly: 1,
      conflicts: 0,
      erpBusinessTablesMutated: false,
      externalWriteExecuted: false,
    });
    expect(mappingRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      mappingType: 'WAREHOUSE',
      chanjetCode: 'WH-CJ',
      erpCode: 'WH-CJ',
      matchStatus: 'MATCHED',
      reviewStatus: 'APPROVED',
    }));
    expect(mappingRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      mappingType: 'PRODUCT',
      chanjetCode: 'SKU-CJ',
      erpCode: '',
      matchStatus: 'SOURCE_ONLY',
      reviewStatus: 'APPROVED',
    }));
  });

  it('upgrades an approved source-only identity when a unique exact ERP master appears', async () => {
    const sourceOnly = {
      mappingType: 'PRODUCT',
      bookId: 'BOOK-1',
      chanjetId: 'SKU-CJ',
      chanjetCode: 'SKU-CJ',
      chanjetName: 'Egg',
      erpCode: '',
      erpName: '',
      matchStatus: 'SOURCE_ONLY',
      reviewStatus: 'APPROVED',
      confidence: '1.00',
      rawData: {},
    };
    const mappingRepo = repository({
      find: jest.fn().mockResolvedValue([sourceOnly]),
      manager: {
        query: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ code: 'EGG', name: 'Egg', company_code: '', entity_type: 'PRODUCT' }])
          .mockResolvedValueOnce([]),
      },
    });
    const service = new ChanjetWmsBridgeService(
      repository({ find: jest.fn().mockResolvedValue([activeBook]) }) as never,
      repository({ find: jest.fn().mockResolvedValue([snapshot]) }) as never,
      mappingRepo as never,
      repository() as never,
      repository() as never,
    );

    const result = await service.refreshMasterMappingCandidates('admin');

    expect(result.exactMatched).toBe(1);
    const candidateQueries = mappingRepo.manager.query.mock.calls.map(([sql]) => String(sql));
    expect(candidateQueries.join('\n')).not.toContain('sku_name_zh');
    expect(candidateQueries.join('\n')).not.toContain('material_name_zh');
    expect(mappingRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      mappingType: 'PRODUCT',
      chanjetId: 'SKU-CJ',
      erpCode: 'EGG',
      matchStatus: 'MATCHED',
      reviewStatus: 'APPROVED',
    }));
  });

  it('maps kg to the dimension-preserving ERP unit 公斤 and keeps other units fail-closed', async () => {
    const kgSnapshot = {
      ...snapshot,
      rawData: {
        ...snapshot.rawData,
        voucherDetailList: [{
          ...snapshot.rawData.voucherDetailList[0],
          transUomName: 'kg',
        }],
      },
    };
    const mappingRepo = repository({
      find: jest.fn().mockResolvedValue([]),
      manager: {
        query: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ code: '公斤', name: '公斤', company_code: '', entity_type: 'UOM' }]),
      },
    });
    const service = new ChanjetWmsBridgeService(
      repository({ find: jest.fn().mockResolvedValue([activeBook]) }) as never,
      repository({ find: jest.fn().mockResolvedValue([kgSnapshot]) }) as never,
      mappingRepo as never,
      repository() as never,
      repository() as never,
    );

    const result = await service.refreshMasterMappingCandidates('admin');

    expect(result.exactMatched).toBe(1);
    expect(mappingRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      mappingType: 'UOM',
      chanjetCode: 'kg',
      erpCode: '公斤',
      matchStatus: 'MATCHED',
      reviewStatus: 'APPROVED',
      rawData: expect.objectContaining({
        rule: 'reviewed dimension-preserving UOM alias kg -> 公斤',
      }),
    }));
  });

  it('requires both primary and secondary UOM mappings before promotion', async () => {
    const candidateRepo = repository();
    const dualUomSnapshot = {
      ...snapshot,
      rawData: {
        ...snapshot.rawData,
        voucherDetailList: [{
          ...snapshot.rawData.voucherDetailList[0],
          trans2UomName: 'BOX',
        }],
      },
    };
    const service = new ChanjetWmsBridgeService(
      repository({ find: jest.fn().mockResolvedValue([activeBook]) }) as never,
      repository({ find: jest.fn().mockResolvedValue([dualUomSnapshot]) }) as never,
      repository({ find: jest.fn().mockResolvedValue(mappings) }) as never,
      candidateRepo as never,
      repository() as never,
    );

    const result = await service.refreshPromotionCandidates('admin');

    expect(result.states.NEED_MAPPING).toBe(1);
    expect(candidateRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      conditions: expect.arrayContaining(['UOM_MAPPING_REQUIRED:BOX']),
    }));
  });

  it('persists an explicit WMS master mapping only after validating the active ERP target', async () => {
    const sourceOnly = {
      id: '88',
      mappingType: 'WAREHOUSE',
      bookId: 'BOOK-1',
      chanjetId: 'WH-CJ',
      chanjetCode: 'WH-CJ',
      chanjetName: 'Source warehouse',
      erpCode: '',
      erpName: '',
      matchStatus: 'SOURCE_ONLY',
      reviewStatus: 'APPROVED',
      confidence: '1.00',
      rawData: { sourceCompanyCode: 'COMP-1' },
    };
    const mappingRepo = repository({
      findOne: jest.fn().mockResolvedValue(sourceOnly),
      manager: {
        query: jest.fn()
          .mockResolvedValueOnce([{ code: 'WH-ERP', name: 'ERP warehouse', company_code: 'COMP-1', entity_type: 'WAREHOUSE' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
    });
    const service = new ChanjetWmsBridgeService(
      repository() as never,
      repository() as never,
      mappingRepo as never,
      repository() as never,
      repository() as never,
    );

    const result = await service.reviewMasterMapping(
      '88',
      { decision: 'APPROVE', erpCode: 'WH-ERP', erpEntityType: 'WAREHOUSE' },
      'admin',
    );

    expect(result.mapping).toMatchObject({
      erpCode: 'WH-ERP',
      erpName: 'ERP warehouse',
      matchStatus: 'MANUAL',
      reviewStatus: 'APPROVED',
      reviewedBy: 'admin',
    });
    expect(mappingRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      rawData: expect.objectContaining({
        manualMappingEvidence: expect.objectContaining({
          sourceIdentity: 'WAREHOUSE:BOOK-1:WH-CJ',
        }),
      }),
    }));
  });

  it('rejects a warehouse mapping target outside the source account-book company', async () => {
    const mappingRepo = repository({
      findOne: jest.fn().mockResolvedValue({
        id: '88',
        mappingType: 'WAREHOUSE',
        bookId: 'BOOK-1',
        chanjetId: 'WH-CJ',
        rawData: { sourceCompanyCode: 'COMP-1' },
      }),
      manager: {
        query: jest.fn()
          .mockResolvedValueOnce([{ code: 'WH-ERP', name: 'Wrong warehouse', company_code: 'COMP-2', entity_type: 'WAREHOUSE' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
    });
    const service = new ChanjetWmsBridgeService(
      repository() as never,
      repository() as never,
      mappingRepo as never,
      repository() as never,
      repository() as never,
    );

    await expect(service.reviewMasterMapping(
      '88',
      { decision: 'APPROVE', erpCode: 'WH-ERP', erpEntityType: 'WAREHOUSE' },
      'admin',
    )).rejects.toThrow('outside the source account-book company');
  });

  it('blocks promotion approval while the readonly provider baseline is incomplete', async () => {
    const candidateRepo = repository({
      findOne: jest.fn().mockResolvedValue({
        id: '1',
        state: 'CANDIDATE',
        blockers: [],
        conditions: [],
      }),
    });
    const service = new ChanjetWmsBridgeService(
      repository() as never,
      repository() as never,
      repository() as never,
      candidateRepo as never,
      repository() as never,
      {
        wmsReadonlyAlignmentOverview: jest.fn().mockResolvedValue({
          decision: 'HOLD',
          conditions: ['6 scopes blocked by provider permissions'],
        }),
      } as never,
    );

    await expect(service.reviewPromotionCandidate('1', 'APPROVE', 'admin'))
      .rejects.toThrow('all provider scopes must be fresh and successful');
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
