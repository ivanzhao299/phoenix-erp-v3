import { ChanjetHoldResolutionAuditService } from './chanjet-hold-resolution-audit.service';
import { ChanjetErpMasterReviewCandidate } from './chanjet-erp-master-business-review.service';

function candidate(overrides: Partial<ChanjetErpMasterReviewCandidate>): ChanjetErpMasterReviewCandidate {
  return {
    mappingId: '1',
    mappingType: 'PRODUCT',
    bookId: 'BOOK-1',
    companyCode: 'COMP-LAO-AGRI',
    companyName: '凤凰农业',
    chanjetId: 'SOURCE-1',
    chanjetCode: '001',
    chanjetName: '阿莫西林可溶性分',
    decision: 'HOLD',
    targetTable: '',
    targetCode: '',
    targetName: '',
    targetEntityType: '',
    evidence: ['runtime evidence rows 8', 'runtime base UOM 瓶'],
    blockers: ['MATERIAL_TYPE_NOT_DETERMINISTIC'],
    createPayload: null,
    ...overrides,
  };
}

function createService(
  candidates: ChanjetErpMasterReviewCandidate[],
  options: {
    sourceRows?: Array<Record<string, unknown>>;
    ratios?: Array<Record<string, unknown>>;
    referenceEvidence?: Array<Record<string, unknown>>;
  } = {},
) {
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM chanjet_master_mapping')) return options.sourceRows || [];
      if (sql.includes('WITH lines AS')) return options.ratios || [];
      if (sql.includes('WITH targets AS')) return options.referenceEvidence || [];
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
  const businessReview = {
    plan: jest.fn(async () => ({
      reviewHash: 'review-hash',
      candidates,
    })),
  };
  return new ChanjetHoldResolutionAuditService(ds as never, businessReview as never);
}

describe('ChanjetHoldResolutionAuditService', () => {
  it('keeps the audit hash stable when database-backed evidence sets change order', async () => {
    const firstCandidate = candidate({ mappingId: '1' });
    const secondCandidate = candidate({
      mappingId: '2',
      chanjetCode: '002',
      chanjetId: 'SOURCE-2',
      chanjetName: '鸡舍',
      mappingType: 'DEPARTMENT',
    });
    const first = createService([firstCandidate, secondCandidate]);
    const second = createService([secondCandidate, firstCandidate]);

    const [firstAudit, secondAudit] = await Promise.all([first.audit(), second.audit()]);

    expect(firstAudit.auditHash).toBe(secondAudit.auditHash);
  });

  it('separates intentional non-mapping, source repair and ERP policy rows', async () => {
    const service = createService([
      candidate({
        mappingId: '1',
        mappingType: 'CASH_ACCOUNT',
        chanjetName: '银行转账',
      }),
      candidate({
        mappingId: '2',
        mappingType: 'DEPARTMENT',
        chanjetName: '鸡舍',
      }),
      candidate({
        mappingId: '3',
        mappingType: 'PRODUCT',
        chanjetName: '阿莫西林可溶性分',
      }),
      candidate({
        mappingId: '4',
        mappingType: 'PRODUCT',
        chanjetName: '蛋鸡',
      }),
    ]);

    const audit = await service.audit();

    expect(audit.summary.total).toBe(4);
    expect(audit.items[0].disposition).toBe('NO_ERP_MASTER_REQUIRED');
    expect(audit.items[1].disposition).toBe('NO_ERP_MASTER_REQUIRED');
    expect(audit.items[2]).toMatchObject({
      disposition: 'CHANJET_CHANGE_PROPOSAL',
      requiresChanjetApproval: true,
      chanjetChangeProposal: {
        currentValue: '阿莫西林可溶性分',
        proposedValue: '阿莫西林可溶性粉',
        rollbackValue: '阿莫西林可溶性分',
      },
    });
    expect(audit.items[3]).toMatchObject({
      disposition: 'ERP_POLICY_REQUIRED',
      authorityOwner: 'ERP_OPERATIONS',
    });
    expect(audit.guardrails.chanjetWrite).toBe(false);
    expect(audit.guardrails.externalChangeRequiresExplicitApproval).toBe(true);
  });

  it('derives product-specific packaging conversions but never a global unit alias', async () => {
    const service = createService([
      candidate({
        mappingType: 'UOM',
        chanjetName: '提',
        chanjetCode: 'UOM-TI',
      }),
    ], {
      ratios: [{
        bookId: 'BOOK-1',
        productCode: 'EGG-01',
        productName: '鸡蛋',
        sourceUom: '提',
        baseUom: '枚',
        observationCount: 12,
        conversionFactor: 180,
        minFactor: 180,
        maxFactor: 180,
      }],
    });

    const audit = await service.audit();

    expect(audit.items[0]).toMatchObject({
      disposition: 'ERP_POLICY_REQUIRED',
      confidence: 0.99,
      uomPolicyCandidates: [{
        productCode: 'EGG-01',
        sourceUom: '提',
        baseUom: '枚',
        conversionFactor: 180,
      }],
    });
    expect(audit.items[0].recommendedAction).toContain('产品级');
  });

  it('does not invent a specific external update when bank identity evidence is incomplete', async () => {
    const mappingId = '5';
    const service = createService([
      candidate({
        mappingId,
        mappingType: 'CASH_ACCOUNT',
        chanjetName: '总部人民币银行',
      }),
    ], {
      sourceRows: [{
        id: mappingId,
        raw_data: { accountNo: '8888', openingBank: '--' },
      }],
    });

    const audit = await service.audit();

    expect(audit.items[0]).toMatchObject({
      disposition: 'CROSS_SYSTEM_REVIEW_REQUIRED',
      risk: 'HIGH',
      requiresChanjetApproval: false,
      chanjetChangeProposal: null,
    });
    expect(audit.recommendedCanary).toBeNull();
  });

  it('queries mapping source rows with the production bigint primary-key type', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM chanjet_master_mapping')) return [];
      if (sql.includes('WITH lines AS')) return [];
      if (sql.includes('WITH targets AS')) return [];
      throw new Error(`unexpected query: ${sql}`);
    });
    const businessReview = {
      plan: jest.fn(async () => ({
        reviewHash: 'review-hash',
        candidates: [candidate({ mappingId: '42' })],
      })),
    };
    const service = new ChanjetHoldResolutionAuditService(
      { query } as never,
      businessReview as never,
    );

    await service.audit();

    expect(query.mock.calls[0][0]).toContain('ANY($1::bigint[])');
    expect(query.mock.calls[0][1]).toEqual([['42']]);
  });

  it('never upgrades a business-review HOLD to automatic creation from a veterinary-looking name', async () => {
    const service = createService([
      candidate({
        mappingId: '43',
        chanjetName: '新流腺',
        evidence: ['runtime evidence rows 14', 'runtime base UOM 瓶'],
        blockers: ['PRODUCT_MASTER_REVIEW_REQUIRED', 'PRODUCT_SEMANTIC_OWNER_REQUIRES_EXPLICIT_POLICY'],
      }),
    ], {
      sourceRows: [{
        id: '43',
        raw_data: { erpMasterGapProposal: { gapClass: 'PRODUCT_MASTER_REVIEW_REQUIRED' } },
      }],
    });

    const audit = await service.audit();

    expect(audit.items[0]).toMatchObject({
      disposition: 'ERP_POLICY_REQUIRED',
      authorityOwner: 'ERP_OPERATIONS',
      autoApplyEligible: false,
      risk: 'MEDIUM',
    });
    expect(audit.items[0].evidence).toContain(
      'authoritative business review remains HOLD (PRODUCT_MASTER_REVIEW_REQUIRED)',
    );
  });

  it('does not describe every unresolved packaging unit as livestock pieces', async () => {
    const service = createService([
      candidate({ mappingId: '44', mappingType: 'UOM', chanjetName: '瓶' }),
    ]);

    const audit = await service.audit();

    expect(audit.items[0].recommendedAction).toContain('产品级换算');
    expect(audit.items[0].recommendedAction).not.toContain('禽只');
  });

  it('attaches exact read-only mirror reference evidence to unresolved rows', async () => {
    const service = createService([
      candidate({
        mappingId: '45',
        mappingType: 'WAREHOUSE',
        chanjetId: 'SOURCE-WH-1',
        chanjetCode: '01',
        chanjetName: '总仓',
      }),
    ], {
      referenceEvidence: [{
        mappingId: '45',
        scannedSnapshotCount: 120,
        exactSnapshotCount: 8,
        headerMatchCount: 5,
        lineMatchCount: 4,
        entityTypes: ['PURCHASE_STOCK_IN', 'SALE_STOCK_OUT'],
        firstSeenAt: '2026-07-01T00:00:00.000Z',
        lastSeenAt: '2026-08-08T00:00:00.000Z',
      }],
    });

    const audit = await service.audit();

    expect(audit.items[0].referenceEvidence).toEqual({
      source: 'ERP_READONLY_MIRROR',
      matchingMode: 'EXACT_IDENTIFIER_ONLY',
      scannedSnapshotCount: 120,
      exactSnapshotCount: 8,
      headerMatchCount: 5,
      lineMatchCount: 4,
      entityTypes: ['PURCHASE_STOCK_IN', 'SALE_STOCK_OUT'],
      firstSeenAt: '2026-07-01T00:00:00.000Z',
      lastSeenAt: '2026-08-08T00:00:00.000Z',
    });
  });

  it('closes only audit-proven intentional non-mappings in one rollback-safe transaction', async () => {
    const runner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('FOR UPDATE')) {
          return [{
            id: String(params[0]),
            mapping_type: 'DEPARTMENT',
            book_id: 'BOOK-1',
            chanjet_id: 'SOURCE-2',
            chanjet_code: '10',
            chanjet_name: '鸡舍',
            match_status: 'SOURCE_ONLY',
            review_status: 'APPROVED',
          }];
        }
        if (sql.includes('UPDATE chanjet_master_mapping')) return [];
        if (sql.includes('id = ANY')) {
          return [{ id: '2', match_status: 'NOT_APPLICABLE', review_status: 'APPROVED' }];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const service = createService([]);
    (service as any).ds.createQueryRunner = jest.fn(() => runner);
    jest.spyOn(service, 'audit').mockResolvedValue({
      auditHash: 'audit-hash',
      items: [{
        mappingId: '2', mappingType: 'DEPARTMENT', bookId: 'BOOK-1', companyCode: 'COMP-1',
        chanjetId: 'SOURCE-2', chanjetCode: '10', chanjetName: '鸡舍', authorityOwner: 'SHARED_MASTER_POLICY',
        disposition: 'NO_ERP_MASTER_REQUIRED', confidence: 1, risk: 'LOW', sourceQualityIssues: [],
        evidence: [], blockers: [], recommendedAction: 'intentional grouping', autoApplyEligible: false,
        requiresChanjetApproval: false, chanjetChangeProposal: null, uomPolicyCandidates: [],
      }],
    } as any);

    const result = await service.closeIntentionalNonMappings({
      auditHash: 'audit-hash',
      approveProduction: true,
      confirmation: 'CLOSE_INTENTIONAL_NON_MAPPING',
    }, 'tester');

    expect(result.closed).toHaveLength(1);
    expect(result.closed[0]).toMatchObject({ mappingId: '2', matchStatus: 'NOT_APPLICABLE' });
    expect(result.writeChanjet).toBe(false);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('rolls back intentional non-mapping closure when a source identity changed', async () => {
    const runner = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(),
      query: jest.fn(async () => [{
        mapping_type: 'DEPARTMENT', book_id: 'BOOK-1', chanjet_id: 'SOURCE-2',
        chanjet_code: '10', chanjet_name: 'renamed', match_status: 'SOURCE_ONLY', review_status: 'APPROVED',
      }]),
    };
    const service = createService([]);
    (service as any).ds.createQueryRunner = jest.fn(() => runner);
    jest.spyOn(service, 'audit').mockResolvedValue({
      auditHash: 'audit-hash',
      items: [{
        mappingId: '2', mappingType: 'DEPARTMENT', bookId: 'BOOK-1', companyCode: 'COMP-1',
        chanjetId: 'SOURCE-2', chanjetCode: '10', chanjetName: '鸡舍', authorityOwner: 'SHARED_MASTER_POLICY',
        disposition: 'NO_ERP_MASTER_REQUIRED', confidence: 1, risk: 'LOW', sourceQualityIssues: [],
        evidence: [], blockers: [], recommendedAction: 'intentional grouping', autoApplyEligible: false,
        requiresChanjetApproval: false, chanjetChangeProposal: null, uomPolicyCandidates: [],
      }],
    } as any);

    await expect(service.closeIntentionalNonMappings({
      auditHash: 'audit-hash', approveProduction: true, confirmation: 'CLOSE_INTENTIONAL_NON_MAPPING',
    }, 'tester')).rejects.toThrow('changed after audit');
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });

  it('closes only the exact brooding accounting grouping with transactional readback', async () => {
    const runner = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FOR UPDATE')) {
          return [{
            id: '6198', mapping_type: 'DEPARTMENT', book_id: '3537748712226818',
            chanjet_id: '3551710443738513', chanjet_code: '100', chanjet_name: '育雏',
            match_status: 'SOURCE_ONLY', review_status: 'APPROVED',
          }];
        }
        if (sql.includes('UPDATE chanjet_master_mapping')) return [];
        if (sql.includes("raw_data->'holdResolution'")) {
          return [{
            id: '6198', match_status: 'NOT_APPLICABLE', review_status: 'APPROVED',
            policy: 'KEEP_ACCOUNTING_GROUP_NOT_TRANSACTION_DEPARTMENT',
          }];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const service = createService([]);
    (service as any).ds.createQueryRunner = jest.fn(() => runner);
    jest.spyOn(service, 'audit').mockResolvedValue({
      auditHash: 'audit-hash',
      items: [{
        mappingId: '6198', mappingType: 'DEPARTMENT', bookId: '3537748712226818',
        companyCode: 'COMP-LAO-XINGCHI', chanjetId: '3551710443738513',
        chanjetCode: '100', chanjetName: '育雏', authorityOwner: 'ERP_OPERATIONS',
        disposition: 'ERP_POLICY_REQUIRED', confidence: 0.99, risk: 'MEDIUM', sourceQualityIssues: [],
        evidence: [], blockers: [
          'HOUSE_CANONICAL_CODE_POLICY_REQUIRED',
          'BROODING_HOUSE_REQUIRES_DISTINCT_TYPE_AND_CODE_POLICY',
        ], recommendedAction: 'policy', autoApplyEligible: false, requiresChanjetApproval: false,
        chanjetChangeProposal: null, uomPolicyCandidates: [], referenceEvidence: null,
      }],
    } as any);

    const result = await service.closeOrganizationPolicy({
      auditHash: 'audit-hash',
      approveProduction: true,
      confirmation: 'CLOSE_ORGANIZATION_POLICY:6198',
    }, 'tester');

    expect(result.closed).toEqual([expect.objectContaining({
      mappingId: '6198',
      matchStatus: 'NOT_APPLICABLE',
      policy: 'KEEP_ACCOUNTING_GROUP_NOT_TRANSACTION_DEPARTMENT',
    })]);
    expect(result.writeChanjet).toBe(false);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('preflights the exact B4 production schema and company boundary without writes', async () => {
    const targets = [1, 2, 3, 4, 5, 6].map((number, index) => ({
      mappingId: String(307155 + index),
      bookId: '3533914511118750',
      companyCode: 'COMP-LAO-AGRI',
      chanjetCode: String(4 + number).padStart(2, '0'),
      chanjetName: `${number}号鸡舍`,
      houseCode: `HOUSE_MS_${String(number).padStart(2, '0')}`,
    }));
    const requiredColumns = [
      'location_code', 'warehouse_code', 'zone_code', 'location_name', 'capacity_qty',
      'status', 'store_code', 'created_at', 'updated_at',
    ];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('information_schema.columns')) {
        return requiredColumns.map((column_name) => ({ column_name }));
      }
      if (sql.includes('FROM chanjet_master_mapping')) {
        return targets.map((target) => ({
          id: target.mappingId,
          mapping_type: 'WAREHOUSE',
          book_id: target.bookId,
          chanjet_code: target.chanjetCode,
          chanjet_name: target.chanjetName,
          match_status: 'SOURCE_ONLY',
          review_status: 'APPROVED',
        }));
      }
      if (sql.includes('FROM brd_houses')) {
        return targets.map((target) => ({ house_code: target.houseCode, status: 'ACTIVE' }));
      }
      if (sql.includes('FROM wms_warehouses')) {
        return [{
          warehouse_code: 'LPH_MS_EGG_FARM', company_code: 'COMP-LAO-AGRI', status: 'ACTIVE',
        }];
      }
      if (sql.includes('FROM wms_locations')) return [];
      if (sql.includes('FROM chanjet_wms_house_location_policies')) return [];
      throw new Error(`unexpected query: ${sql}`);
    });
    const service = new ChanjetHoldResolutionAuditService(
      { query } as never,
      { plan: jest.fn() } as never,
    );
    jest.spyOn(service, 'audit').mockResolvedValue({
      auditHash: 'audit-hash',
      items: targets.map((target) => ({
        mappingId: target.mappingId, mappingType: 'WAREHOUSE', bookId: target.bookId,
        companyCode: target.companyCode, chanjetId: `SOURCE-${target.mappingId}`,
        chanjetCode: target.chanjetCode, chanjetName: target.chanjetName,
        authorityOwner: 'ERP_OPERATIONS', disposition: 'ERP_POLICY_REQUIRED', confidence: 0.99,
        risk: 'MEDIUM', sourceQualityIssues: [], evidence: [], blockers: [],
        recommendedAction: 'policy', autoApplyEligible: false, requiresChanjetApproval: false,
        chanjetChangeProposal: null, uomPolicyCandidates: [], referenceEvidence: null,
      })),
    } as any);

    const result = await service.preflightHouseLocationPolicies({
      companyCode: 'COMP-LAO-AGRI', auditHash: 'audit-hash',
    });

    expect(result.ready).toBe(true);
    expect(result.targets).toHaveLength(6);
    expect(result.targets.every((target) => target.blockers.length === 0)).toBe(true);
    expect(result.schema.missingColumns).toEqual([]);
    expect(result.writeErpMasterTables).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).match(/INSERT|UPDATE|DELETE/))).toBe(false);
  });

  it('creates one company house-location batch with pre-state backup and dual readback', async () => {
    const targets = [1, 2, 3, 4, 5, 6].map((number, index) => ({
      mappingId: String(307155 + index),
      bookId: '3533914511118750',
      companyCode: 'COMP-LAO-AGRI',
      chanjetId: `SOURCE-${number}`,
      chanjetCode: String(4 + number).padStart(2, '0'),
      chanjetName: `${number}号鸡舍`,
      houseCode: `HOUSE_MS_${String(number).padStart(2, '0')}`,
      locationCode: `LOC-HOUSE_MS_${String(number).padStart(2, '0')}`,
    }));
    const runner = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(),
      query: jest.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('JOIN chanjet_wms_house_location_policies')) {
          return targets.map((target) => ({
            id: target.mappingId,
            match_status: 'NOT_APPLICABLE',
            review_status: 'APPROVED',
            company_code: target.companyCode,
            source_warehouse_code: target.chanjetCode,
            source_warehouse_name: target.chanjetName,
            erp_house_code: target.houseCode,
            erp_warehouse_code: 'LPH_MS_EGG_FARM',
            erp_location_code: target.locationCode,
            state: 'APPROVED',
            location_warehouse_code: 'LPH_MS_EGG_FARM',
            location_name: target.chanjetName,
            location_status: 'ACTIVE',
          }));
        }
        if (sql.includes('FROM chanjet_master_mapping') && sql.includes('FOR UPDATE')) {
          const target = targets.find((item) => item.mappingId === String(params[0]));
          return target ? [{
            id: target.mappingId,
            mapping_type: 'WAREHOUSE',
            book_id: target.bookId,
            chanjet_id: target.chanjetId,
            chanjet_code: target.chanjetCode,
            chanjet_name: target.chanjetName,
            match_status: 'SOURCE_ONLY',
            review_status: 'APPROVED',
          }] : [];
        }
        if (sql.includes('FROM brd_houses')) return [{ house_code: params[0], status: 'ACTIVE' }];
        if (sql.includes('FROM wms_warehouses')) {
          return [{ warehouse_code: params[0], company_code: 'COMP-LAO-AGRI', status: 'ACTIVE' }];
        }
        if (sql.includes('FROM wms_locations')) return [];
        if (sql.includes('FROM chanjet_wms_house_location_policies')) return [];
        if (sql.includes('INSERT INTO wms_locations')) return [];
        if (sql.includes('INSERT INTO chanjet_wms_house_location_policies')) return [];
        if (sql.includes('UPDATE chanjet_master_mapping')) return [];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const service = createService([]);
    (service as any).ds.createQueryRunner = jest.fn(() => runner);
    jest.spyOn(service, 'audit').mockResolvedValue({
      auditHash: 'audit-hash',
      items: targets.map((target) => ({
        mappingId: target.mappingId, mappingType: 'WAREHOUSE', bookId: target.bookId,
        companyCode: target.companyCode, chanjetId: target.chanjetId,
        chanjetCode: target.chanjetCode, chanjetName: target.chanjetName,
        authorityOwner: 'ERP_OPERATIONS', disposition: 'ERP_POLICY_REQUIRED',
        confidence: 0.99, risk: 'MEDIUM', sourceQualityIssues: [], evidence: [], blockers: [],
        recommendedAction: 'policy', autoApplyEligible: false, requiresChanjetApproval: false,
        chanjetChangeProposal: null, uomPolicyCandidates: [], referenceEvidence: null,
      })),
    } as any);

    const result = await service.closeHouseLocationPolicies({
      companyCode: 'COMP-LAO-AGRI',
      auditHash: 'audit-hash',
      approveProduction: true,
      confirmation: 'CREATE_HOUSE_LOCATIONS_AND_APPROVE_POLICY:COMP-LAO-AGRI:6',
    }, 'tester');

    expect(result.closed).toHaveLength(6);
    expect(result.preStateBackup).toHaveLength(6);
    expect(result.closed.every((row) => row.locationCreated && row.policyCreated)).toBe(true);
    expect(result).toMatchObject({
      companyCode: 'COMP-LAO-AGRI',
      writeChanjet: false,
      writeErpMasterTables: true,
      writeErpBusinessFacts: false,
      automaticRollbackOnFailure: true,
    });
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('rolls back the complete house-location company batch on a location conflict', async () => {
    const runner = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(),
      query: jest.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('FROM chanjet_master_mapping')) {
          return [{
            id: String(params[0]), mapping_type: 'WAREHOUSE', book_id: '3533914511118750',
            chanjet_id: 'SOURCE-1', chanjet_code: '05', chanjet_name: '1号鸡舍',
            match_status: 'SOURCE_ONLY', review_status: 'APPROVED',
          }];
        }
        if (sql.includes('FROM brd_houses')) return [{ house_code: params[0], status: 'ACTIVE' }];
        if (sql.includes('FROM wms_warehouses')) {
          return [{ warehouse_code: params[0], company_code: 'COMP-LAO-AGRI', status: 'ACTIVE' }];
        }
        if (sql.includes('FROM wms_locations')) {
          return [{
            location_code: params[0], warehouse_code: 'WRONG-WAREHOUSE',
            location_name: '1号鸡舍', status: 'ACTIVE',
          }];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const service = createService([]);
    (service as any).ds.createQueryRunner = jest.fn(() => runner);
    jest.spyOn(service, 'audit').mockResolvedValue({
      auditHash: 'audit-hash',
      items: [1, 2, 3, 4, 5, 6].map((number, index) => ({
        mappingId: String(307155 + index), mappingType: 'WAREHOUSE',
        bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI',
        chanjetId: `SOURCE-${number}`, chanjetCode: String(4 + number).padStart(2, '0'),
        chanjetName: `${number}号鸡舍`, authorityOwner: 'ERP_OPERATIONS',
        disposition: 'ERP_POLICY_REQUIRED', confidence: 0.99, risk: 'MEDIUM',
        sourceQualityIssues: [], evidence: [], blockers: [], recommendedAction: 'policy',
        autoApplyEligible: false, requiresChanjetApproval: false, chanjetChangeProposal: null,
        uomPolicyCandidates: [], referenceEvidence: null,
      })),
    } as any);

    await expect(service.closeHouseLocationPolicies({
      companyCode: 'COMP-LAO-AGRI', auditHash: 'audit-hash', approveProduction: true,
      confirmation: 'CREATE_HOUSE_LOCATIONS_AND_APPROVE_POLICY:COMP-LAO-AGRI:6',
    }, 'tester')).rejects.toThrow('conflicts with approved target');
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });
});
