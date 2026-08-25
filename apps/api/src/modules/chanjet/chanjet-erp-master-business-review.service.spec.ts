import {
  CHANJET_ERP_MASTER_APPLY_TOKEN,
  CHANJET_ERP_MASTER_REVIEW_ACTION,
  ChanjetErpMasterBusinessReviewService,
} from './chanjet-erp-master-business-review.service';

function source(overrides: Record<string, unknown>) {
  return {
    id: '1',
    mapping_type: 'PROJECT',
    book_id: 'BOOK-1',
    company_code: 'COMP-LAO-AGRI',
    company_name: '凤凰农业',
    chanjet_id: 'SOURCE-1',
    chanjet_code: '0001',
    chanjet_name: '万象直营店',
    raw_data: {
      bizType: { name: '项目' },
      statusEnum: { value: 'A' },
    },
    ...overrides,
  };
}

function createService(
  sources: Array<Record<string, unknown>>,
  targets: {
    cash?: Array<Record<string, unknown>>;
    projects?: Array<Record<string, unknown>>;
    warehouses?: Array<Record<string, unknown>>;
    companies?: Array<Record<string, unknown>>;
    departments?: Array<Record<string, unknown>>;
    stores?: Array<Record<string, unknown>>;
    houses?: Array<Record<string, unknown>>;
    breedingSites?: Array<Record<string, unknown>>;
    productMasters?: Array<Record<string, unknown>>;
    productEvidence?: Array<Record<string, unknown>>;
    departmentEvidence?: Array<Record<string, unknown>>;
  } = {},
) {
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM chanjet_master_mapping')) return sources;
      if (sql.includes('WITH evidence AS')) return targets.productEvidence || [];
      if (sql.includes('raw_data->>\'departmentId\' AS "departmentId"')) {
        return targets.departmentEvidence || [];
      }
      if (sql.includes('AS "targetEntityType"')) return targets.productMasters || [];
      if (sql.includes('FROM fin_cash_accounts')) return targets.cash || [];
      if (sql.includes('FROM biz_projects')) return targets.projects || [];
      if (sql.includes('FROM wms_warehouses')) return targets.warehouses || [];
      if (sql.includes('JOIN LATERAL') && sql.includes('biz_site_aliases')) {
        return targets.breedingSites || [];
      }
      if (sql.includes("department.org_type = 'DEPARTMENT'")) return targets.departments || [];
      if (sql.includes('FROM sys_organizations')) return targets.companies || [];
      if (sql.includes('FROM mst_stores')) return targets.stores || [];
      if (sql.includes('FROM brd_houses')) return targets.houses || [];
      throw new Error(`unexpected query: ${sql}`);
    }),
    createQueryRunner: jest.fn(),
  };
  return { service: new ChanjetErpMasterBusinessReviewService(ds as never), ds };
}

describe('ChanjetErpMasterBusinessReviewService', () => {
  it('keeps the production audit action code within sys_operation_logs varchar(32)', () => {
    expect(CHANJET_ERP_MASTER_REVIEW_ACTION.length).toBeLessThanOrEqual(32);
  });

  it('verifies a department target with company ownership resolved from its parent chain', async () => {
    const { service } = createService([]);
    const runner = {
      query: jest.fn(async (sql: string) => {
        expect(sql).toContain('LEFT JOIN sys_organizations parent');
        expect(sql).toContain("parent.org_type = 'COMPANY'");
        return [{
          code: 'DEPT-SITE-MENGSAI-LAYER-PROD',
          name: '孟赛蛋鸡养殖场-生产部',
          company: 'COMP-LAO-AGRI',
        }];
      }),
    };

    await expect((service as any).assertTarget(runner, {
      targetTable: 'sys_organizations',
      targetCode: 'DEPT-SITE-MENGSAI-LAYER-PROD',
      targetName: '孟赛蛋鸡养殖场-生产部',
      companyCode: 'COMP-LAO-AGRI',
    })).resolves.toBeUndefined();
    expect(runner.query).toHaveBeenCalledWith(expect.any(String), [
      'DEPT-SITE-MENGSAI-LAYER-PROD',
    ]);
  });

  it('creates only semantically complete masters and holds unsafe dimensions', async () => {
    const { service } = createService([
      source({ id: '1' }),
      source({
        id: '2',
        mapping_type: 'WAREHOUSE',
        chanjet_id: 'WH-HOUSE',
        chanjet_code: '05',
        chanjet_name: '1号鸡舍',
        raw_data: {
          erpMasterGapProposal: { gapClass: 'HOUSE_INVENTORY_BRIDGE_REQUIRED' },
        },
      }),
      source({
        id: '3',
        mapping_type: 'WAREHOUSE',
        chanjet_id: 'WH-GENERIC-1',
        chanjet_code: '01',
        chanjet_name: '总仓',
        raw_data: {
          erpMasterGapProposal: { gapClass: 'WAREHOUSE_MASTER_CANDIDATE' },
        },
      }),
      source({
        id: '4',
        mapping_type: 'WAREHOUSE',
        chanjet_id: 'WH-GENERIC-2',
        chanjet_code: '88',
        chanjet_name: '总库',
        raw_data: {
          erpMasterGapProposal: { gapClass: 'WAREHOUSE_MASTER_CANDIDATE' },
        },
      }),
      source({
        id: '5',
        mapping_type: 'CASH_ACCOUNT',
        chanjet_id: 'CA-WECHAT',
        chanjet_code: '02',
        chanjet_name: '微信',
        raw_data: { currencyCode: 'CNY' },
      }),
      source({
        id: '6',
        mapping_type: 'CASH_ACCOUNT',
        chanjet_id: 'CA-TRANSFER',
        chanjet_code: 'YHZZ',
        chanjet_name: '银行转账',
        raw_data: { currencyCode: 'CNY' },
      }),
    ]);

    const plan = await service.plan();

    expect(plan.summary.total).toBe(6);
    expect(plan.candidates.find((item) => item.mappingId === '1')?.decision).toBe('CREATE_MASTER');
    expect(plan.candidates.find((item) => item.mappingId === '2')?.decision).toBe('HOLD');
    expect(plan.candidates.find((item) => item.mappingId === '3')?.decision).toBe('HOLD');
    expect(plan.candidates.find((item) => item.mappingId === '4')?.decision).toBe('HOLD');
    expect(plan.candidates.find((item) => item.mappingId === '5')?.decision).toBe('CREATE_MASTER');
    expect(plan.candidates.find((item) => item.mappingId === '5')?.createPayload).toMatchObject({
      accountType: 'VIRTUAL',
      bankName: null,
      bankAccountNo: null,
    });
    expect(plan.candidates.find((item) => item.mappingId === '6')?.decision).toBe('HOLD');
    expect(plan.guardrails.chanjetWrite).toBe(false);
    expect(plan.guardrails.financialBalanceImport).toBe(false);
  });

  it('maps an exact same-company same-currency cash account instead of creating a duplicate', async () => {
    const { service } = createService(
      [
        source({
          id: '7',
          mapping_type: 'CASH_ACCOUNT',
          chanjet_id: 'CA-BCEL',
          chanjet_code: '10',
          chanjet_name: '公司直管客户BCEL140',
          raw_data: {
            currencyCode: 'LAK',
            accountNo: '0631246702140',
            openingBank: 'BCEL',
          },
        }),
      ],
      {
        cash: [
          {
            code: 'ERP-BCEL-140',
            name: 'BCEL公司账户',
            companyCode: 'COMP-LAO-AGRI',
            currencyCode: 'LAK',
            accountNo: '0631 2467 02140',
            targetTable: 'fin_cash_accounts',
          },
        ],
      },
    );

    const plan = await service.plan();

    expect(plan.summary.mapExisting).toBe(1);
    expect(plan.candidates[0]).toMatchObject({
      decision: 'MAP_EXISTING',
      targetCode: 'ERP-BCEL-140',
      targetTable: 'fin_cash_accounts',
    });
  });

  it('classifies mixed Chanjet departments and maps only deterministic existing ERP targets', async () => {
    const { service } = createService(
      [
        source({
          id: 'dept-company',
          mapping_type: 'DEPARTMENT',
          chanjet_name: '公司总部',
        }),
        source({
          id: 'dept-store',
          mapping_type: 'DEPARTMENT',
          chanjet_name: '孟赛直营店',
        }),
        source({
          id: 'dept-house',
          mapping_type: 'DEPARTMENT',
          chanjet_name: '2号鸡舍',
        }),
        source({
          id: 'dept-workshop',
          mapping_type: 'DEPARTMENT',
          chanjet_name: '变蛋车间',
        }),
        source({
          id: 'dept-group',
          mapping_type: 'DEPARTMENT',
          chanjet_name: '鸡舍',
        }),
        source({
          id: 'dept-store-warehouse-alias',
          mapping_type: 'DEPARTMENT',
          chanjet_name: '万象仓库直营店',
        }),
        source({
          id: 'dept-store-cooperative-alias',
          mapping_type: 'DEPARTMENT',
          chanjet_name: '波利坎赛合作店',
        }),
        source({
          id: 'dept-production-typo',
          mapping_type: 'DEPARTMENT',
          chanjet_name: '生成部',
        }),
      ],
      {
        companies: [{
          code: 'COMP-LAO-AGRI',
          name: '老挝凤凰农业发展有限公司',
          companyCode: 'COMP-LAO-AGRI',
        }],
        stores: [{
          code: 'STORE-MX-001',
          name: '孟赛直营店',
          companyCode: 'COMP-LAO-AGRI',
        }, {
          code: 'STORE-VTE-WH-001',
          name: '万象仓储中心店',
          companyCode: 'COMP-LAO-AGRI',
          operationType: '直营店',
        }, {
          code: 'STORE-BKX-001',
          name: '波利坎赛省直营店',
          companyCode: 'COMP-LAO-AGRI',
          operationType: '代理商合作店',
        }],
        departments: [{
          code: 'DEPT-SITE-MENGSAI-LAYER-PROD',
          name: '孟赛蛋鸡养殖场-生产部',
          companyCode: 'COMP-LAO-AGRI',
        }],
        houses: [{
          code: 'HOUSE_MS_02',
          name: '2号鸡舍',
          companyCode: 'COMP-LAO-AGRI',
        }],
      },
    );

    const plan = await service.plan();

    expect(plan.summary.mapExisting).toBe(6);
    expect(plan.candidates.find((item) => item.mappingId === 'dept-company')).toMatchObject({
      decision: 'MAP_EXISTING',
      targetTable: 'sys_organizations',
      targetEntityType: 'COMPANY',
    });
    expect(plan.candidates.find((item) => item.mappingId === 'dept-store')).toMatchObject({
      decision: 'MAP_EXISTING',
      targetTable: 'mst_stores',
      targetEntityType: 'STORE',
    });
    expect(plan.candidates.find((item) => item.mappingId === 'dept-house')).toMatchObject({
      decision: 'MAP_EXISTING',
      targetTable: 'brd_houses',
      targetEntityType: 'HOUSE',
    });
    expect(plan.candidates.find((item) => item.mappingId === 'dept-workshop')?.decision).toBe('HOLD');
    expect(plan.candidates.find((item) => item.mappingId === 'dept-group')?.decision).toBe('HOLD');
    expect(plan.candidates.find((item) => item.mappingId === 'dept-store-warehouse-alias')).toMatchObject({
      decision: 'MAP_EXISTING',
      targetCode: 'STORE-VTE-WH-001',
      targetEntityType: 'STORE',
    });
    expect(plan.candidates.find((item) => item.mappingId === 'dept-store-cooperative-alias')).toMatchObject({
      decision: 'MAP_EXISTING',
      targetCode: 'STORE-BKX-001',
      targetEntityType: 'STORE',
    });
    expect(plan.candidates.find((item) => item.mappingId === 'dept-production-typo')).toMatchObject({
      decision: 'MAP_EXISTING',
      targetCode: 'DEPT-SITE-MENGSAI-LAYER-PROD',
      targetEntityType: 'DEPARTMENT',
    });
  });

  it('holds reviewed department aliases when their ERP target is not unique', async () => {
    const { service } = createService([
      source({
        id: 'dept-production-ambiguous',
        mapping_type: 'DEPARTMENT',
        chanjet_name: '生成部',
      }),
    ], {
      departments: [{
        code: 'DEPT-PROD-1',
        name: '第一生产部',
        companyCode: 'COMP-LAO-AGRI',
      }, {
        code: 'DEPT-PROD-2',
        name: '第二生产部',
        companyCode: 'COMP-LAO-AGRI',
      }],
    });

    const plan = await service.plan();

    expect(plan.candidates[0]).toMatchObject({
      decision: 'HOLD',
      blockers: ['MULTIPLE_ERP_PRODUCTION_DEPARTMENT_TARGETS'],
    });
  });

  it('creates a canonical house only with one breeding site and repeated operational evidence', async () => {
    const { service } = createService([
      source({
        id: 'dept-house-create',
        mapping_type: 'DEPARTMENT',
        company_code: 'COMP-LAO-XINGCHI',
        chanjet_id: 'DEPT-HOUSE-1',
        chanjet_code: '101',
        chanjet_name: '1号鸡舍',
      }),
    ], {
      breedingSites: [{
        code: 'FARM-DP',
        name: '东鹏蛋鸡场',
        companyCode: 'COMP-LAO-XINGCHI',
        farmCode: 'FARM-DP',
        siteCode: 'SITE-DONGPENG-LAYER',
        projectCode: 'PRJ_DONGPENG_LAYER',
      }],
      departmentEvidence: [{
        bookId: 'BOOK-1',
        departmentId: 'DEPT-HOUSE-1',
        evidenceCount: 12,
        finishedGoodsStockInCount: 4,
        materialStockOutCount: 7,
        otherStockOutCount: 1,
        firstSeenAt: '2026-06-01T00:00:00Z',
        lastSeenAt: '2026-08-01T00:00:00Z',
      }],
    });

    const plan = await service.plan();

    expect(plan.candidates[0]).toMatchObject({
      decision: 'CREATE_MASTER',
      targetTable: 'brd_houses',
      targetCode: 'HOUSE_DP_01',
      targetEntityType: 'HOUSE',
      createPayload: {
        farmCode: 'FARM-DP',
        siteCode: 'SITE-DONGPENG-LAYER',
        projectCode: 'PRJ_DONGPENG_LAYER',
      },
    });
    expect(plan.candidates[0].evidence).toContain('operational documents 12');
  });

  it('creates a house without retired ownership snapshot columns', async () => {
    const { service } = createService([]);
    const runner = { query: jest.fn().mockResolvedValue([{ house_code: 'HOUSE_DP_01' }]) };

    await expect((service as any).createMaster(runner, {
      targetTable: 'brd_houses',
      createPayload: {
        houseCode: 'HOUSE_DP_01', houseName: '1号鸡舍', farmCode: 'FARM-DP',
        farmName: '东鹏蛋鸡场', houseType: '蛋鸡舍', projectCode: 'PRJ-DP',
        companyCode: 'COMP-DP', siteCode: 'SITE-DP',
      },
    })).resolves.toBe(true);
    const sql = runner.query.mock.calls[0][0];
    expect(sql).not.toContain('company_code');
    expect(sql).not.toContain('site_code');
    expect(runner.query.mock.calls[0][1]).toEqual([
      'HOUSE_DP_01', '1号鸡舍', 'FARM-DP', '东鹏蛋鸡场', '蛋鸡舍', 'PRJ-DP',
    ]);
  });

  it('maps an operational workshop to the unique same-company production department', async () => {
    const { service } = createService([
      source({
        id: 'dept-workshop-map',
        mapping_type: 'DEPARTMENT',
        company_code: 'COMP-LAO-XINGCHI',
        chanjet_id: 'DEPT-WORKSHOP-1',
        chanjet_name: '变蛋车间',
      }),
    ], {
      departments: [{
        code: 'DEPT-SITE-DONGPENG-LAYER-PROD',
        name: '东鹏蛋鸡养殖场-生产部',
        companyCode: 'COMP-LAO-XINGCHI',
      }],
      departmentEvidence: [{
        bookId: 'BOOK-1',
        departmentId: 'DEPT-WORKSHOP-1',
        evidenceCount: 8,
        finishedGoodsStockInCount: 4,
        materialStockOutCount: 3,
        otherStockOutCount: 1,
        firstSeenAt: '2026-07-01T00:00:00Z',
        lastSeenAt: '2026-08-01T00:00:00Z',
      }],
    });

    const plan = await service.plan();

    expect(plan.candidates[0]).toMatchObject({
      decision: 'MAP_EXISTING',
      targetTable: 'sys_organizations',
      targetCode: 'DEPT-SITE-DONGPENG-LAYER-PROD',
      targetEntityType: 'DEPARTMENT',
    });
  });

  it('keeps brooding dimensions on hold until their distinct house-code policy is approved', async () => {
    const { service } = createService([
      source({
        id: 'dept-brooding-hold',
        mapping_type: 'DEPARTMENT',
        company_code: 'COMP-LAO-XINGCHI',
        chanjet_id: 'DEPT-BROODING',
        chanjet_code: '100',
        chanjet_name: '育雏',
      }),
    ], {
      breedingSites: [{
        code: 'FARM-DP',
        name: '东鹏蛋鸡场',
        companyCode: 'COMP-LAO-XINGCHI',
        farmCode: 'FARM-DP',
        siteCode: 'SITE-DONGPENG-LAYER',
        projectCode: 'PRJ_DONGPENG_LAYER',
      }],
      departmentEvidence: [{
        bookId: 'BOOK-1',
        departmentId: 'DEPT-BROODING',
        evidenceCount: 80,
        finishedGoodsStockInCount: 1,
        materialStockOutCount: 79,
        otherStockOutCount: 0,
        firstSeenAt: '2026-05-01T00:00:00Z',
        lastSeenAt: '2026-08-01T00:00:00Z',
      }],
    });

    const plan = await service.plan();

    expect(plan.candidates[0]).toMatchObject({
      decision: 'HOLD',
      blockers: [
        'HOUSE_CANONICAL_CODE_POLICY_REQUIRED',
        'BROODING_HOUSE_REQUIRES_DISTINCT_TYPE_AND_CODE_POLICY',
      ],
    });
  });

  it('rejects apply before any database write when approval token is missing', async () => {
    const { service, ds } = createService([]);

    await expect(service.apply({
      reviewHash: 'x',
      approvalToken: `${CHANJET_ERP_MASTER_APPLY_TOKEN}-WRONG`,
      actor: 'test',
    })).rejects.toThrow('CHANJET_ERP_MASTER_MAPPING_APPROVAL_TOKEN_INVALID');
    expect(ds.createQueryRunner).not.toHaveBeenCalled();
  });

  it('rejects an empty or unknown mapping scope before opening a transaction', async () => {
    const { service, ds } = createService([]);
    jest.spyOn(service, 'plan').mockResolvedValue({
      generatedAt: new Date().toISOString(),
      reviewHash: 'review-hash',
      decision: 'HOLD',
      summary: {
        total: 0,
        actionable: 0,
        mapExisting: 0,
        createMaster: 0,
        hold: 0,
        byMappingType: {},
      },
      candidates: [],
      guardrails: {
        systemBusinessReview: true,
        exactCompanyBoundary: true,
        fuzzyMapping: false,
        chanjetWrite: false,
        financialBalanceImport: false,
        inventoryFactImport: false,
        ambiguousRowsHeld: true,
        authoritySource: 'CHANJET',
        activeSyncDirection: 'CHANJET_TO_ERP',
        erpMasterWrite: true,
        reverseWriteCapability: 'READY_BUT_LOCKED',
        bidirectionalContractReady: true,
      },
    });

    await expect(service.apply({
      reviewHash: 'review-hash',
      approvalToken: CHANJET_ERP_MASTER_APPLY_TOKEN,
      mappingTypes: [],
      actor: 'test',
    })).rejects.toThrow('CHANJET_ERP_MASTER_MAPPING_SCOPE_EMPTY');
    await expect(service.apply({
      reviewHash: 'review-hash',
      approvalToken: CHANJET_ERP_MASTER_APPLY_TOKEN,
      mappingTypes: ['NOT_A_MAPPING_TYPE'],
      actor: 'test',
    })).rejects.toThrow('CHANJET_ERP_MASTER_MAPPING_SCOPE_INVALID:NOT_A_MAPPING_TYPE');
    expect(ds.createQueryRunner).not.toHaveBeenCalled();
  });

  it('does not apply actionable candidates outside the approved mapping scope', async () => {
    const { service, ds } = createService([]);
    jest.spyOn(service, 'plan').mockResolvedValue({
      generatedAt: new Date().toISOString(),
      reviewHash: 'scoped-review-hash',
      decision: 'READY_TO_APPLY',
      summary: {
        total: 1,
        actionable: 1,
        mapExisting: 0,
        createMaster: 1,
        hold: 0,
        byMappingType: { CASH_ACCOUNT: { MAP_EXISTING: 0, CREATE_MASTER: 1, HOLD: 0 } },
      },
      candidates: [{
        mappingId: 'cash-1',
        mappingType: 'CASH_ACCOUNT',
        bookId: 'BOOK-1',
        companyCode: 'COMP-LAO-AGRI',
        companyName: '凤凰农业',
        chanjetId: 'CA-1',
        chanjetCode: '01',
        chanjetName: '备用金',
        decision: 'CREATE_MASTER',
        targetTable: 'fin_cash_accounts',
        targetCode: 'CJ-CA-1',
        targetName: '备用金',
        targetEntityType: 'CASH_ACCOUNT',
        evidence: [],
        blockers: [],
        createPayload: { accountCode: 'CJ-CA-1' },
      }],
      guardrails: {
        systemBusinessReview: true,
        exactCompanyBoundary: true,
        fuzzyMapping: false,
        chanjetWrite: false,
        financialBalanceImport: false,
        inventoryFactImport: false,
        ambiguousRowsHeld: true,
        authoritySource: 'CHANJET',
        activeSyncDirection: 'CHANJET_TO_ERP',
        erpMasterWrite: true,
        reverseWriteCapability: 'READY_BUT_LOCKED',
        bidirectionalContractReady: true,
      },
    });

    await expect(service.apply({
      reviewHash: 'scoped-review-hash',
      approvalToken: CHANJET_ERP_MASTER_APPLY_TOKEN,
      mappingTypes: ['DEPARTMENT'],
      actor: 'test',
    })).resolves.toMatchObject({
      created: 0,
      mappedExisting: 0,
      appliedMappingTypes: ['DEPARTMENT'],
      results: [],
    });
    expect(ds.createQueryRunner).not.toHaveBeenCalled();
  });

  it('creates a source-preserving egg SKU only with repeated runtime UOM evidence', async () => {
    const { service } = createService([
      source({
        id: 'egg-red-1',
        mapping_type: 'PRODUCT',
        chanjet_code: '901',
        chanjet_name: '1号红蛋',
        raw_data: { erpMasterGapProposal: { gapClass: 'PRODUCT_SKU_MODEL_REQUIRED' } },
      }),
    ], {
      productEvidence: [{
        bookId: 'BOOK-1',
        productCode: '901',
        productName: '1号红蛋',
        evidenceCount: 20,
        baseUoms: ['枚'],
        specs: [],
      }],
    });

    const plan = await service.plan();

    expect(plan.candidates[0]).toMatchObject({
      decision: 'CREATE_MASTER',
      targetTable: 'product_skus',
      targetEntityType: 'SKU',
      createPayload: {
        productCode: 'EGG',
        gradeCode: 'CJ_G1',
        specCode: 'CJ_RED_STD',
        baseUom: '枚',
      },
    });
    expect(String(plan.candidates[0].createPayload?.gradeCode)).toHaveLength(5);
    expect(String(plan.candidates[0].createPayload?.specCode).length).toBeLessThanOrEqual(16);
  });

  it('keeps unclassified egg SKU dimension codes within the production schema limit', async () => {
    const { service } = createService([
      source({
        id: 'egg-natural-broken',
        mapping_type: 'PRODUCT',
        chanjet_code: '902',
        chanjet_name: '破损鸡蛋',
        raw_data: { erpMasterGapProposal: { gapClass: 'PRODUCT_SKU_MODEL_REQUIRED' } },
      }),
    ], {
      productEvidence: [{
        bookId: 'BOOK-1',
        productCode: '902',
        productName: '破损鸡蛋',
        evidenceCount: 8,
        baseUoms: ['枚'],
        specs: [],
      }],
    });

    const plan = await service.plan();
    const payload = plan.candidates[0].createPayload;

    expect(payload).toMatchObject({ gradeCode: 'CJ_GX', specCode: 'CJ_NAT_BRK' });
    expect(String(payload?.gradeCode).length).toBeLessThanOrEqual(16);
    expect(String(payload?.specCode).length).toBeLessThanOrEqual(16);
  });

  it('creates a material identity only when its base UOM and specification evidence are stable', async () => {
    const { service } = createService([
      source({
        id: 'material-1',
        mapping_type: 'PRODUCT',
        chanjet_code: '01063',
        chanjet_name: '头孢噻肟钠',
        raw_data: { erpMasterGapProposal: { gapClass: 'MATERIAL_MASTER_CANDIDATE' } },
      }),
    ], {
      productEvidence: [{
        bookId: 'BOOK-1',
        productCode: '01063',
        productName: '头孢噻肟钠',
        evidenceCount: 16,
        baseUoms: ['kg'],
        specs: ['50kg'],
      }],
    });

    const plan = await service.plan();

    expect(plan.candidates[0]).toMatchObject({
      decision: 'CREATE_MASTER',
      targetTable: 'mst_materials',
      targetEntityType: 'MATERIAL',
      createPayload: {
        materialName: '头孢噻肟钠',
        materialType: 'VET_DRUG',
        unit: '公斤',
        spec: '50kg',
      },
    });
  });

  it('holds a material whose runtime base UOM requires a conversion policy', async () => {
    const { service } = createService([
      source({
        id: 'feed-1',
        mapping_type: 'PRODUCT',
        chanjet_code: '106',
        chanjet_name: '蛋鸡料',
        raw_data: { erpMasterGapProposal: { gapClass: 'MATERIAL_MASTER_CANDIDATE' } },
      }),
    ], {
      productEvidence: [{
        bookId: 'BOOK-1',
        productCode: '106',
        productName: '蛋鸡料',
        evidenceCount: 100,
        baseUoms: ['斤'],
        specs: [],
      }],
    });

    const plan = await service.plan();

    expect(plan.candidates[0].decision).toBe('HOLD');
    expect(plan.candidates[0].blockers).toContain(
      'MASS_UNIT_CONVERSION_POLICY_REQUIRED_BEFORE_MASTER_CREATION',
    );
  });
});
