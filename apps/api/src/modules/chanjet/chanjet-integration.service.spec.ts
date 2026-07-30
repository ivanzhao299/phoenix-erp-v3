import {
  ChanjetIntegrationService,
  classifyChanjetSyncFailure,
} from './chanjet-integration.service';

describe('Chanjet provider failure classification', () => {
  it('does not retry permanent permission or unsupported endpoint failures', () => {
    expect(classifyChanjetSyncFailure('HTTP 403 code=50111 openToken无调用该接口的权限'))
      .toEqual({ retryEligible: false, capability: 'PERMISSION_HOLD' });
    expect(classifyChanjetSyncFailure('unsupported endpoint'))
      .toEqual({ retryEligible: false, capability: 'UNSUPPORTED' });
  });

  it('keeps transient network failures retryable', () => {
    expect(classifyChanjetSyncFailure('HTTP 502 upstream timeout'))
      .toEqual({ retryEligible: true, capability: 'SUPPORTED' });
  });

  it('never computes a total cash difference across incompatible currency scopes', () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);

    const result = subject.buildFinanceReconciliationItem({
      key: 'CASH_BALANCE',
      label: '现金 / 银行余额',
      priority: 'P0',
      chanjetEndpointKeys: ['GL_BALANCE'],
      chanjetEntityTypes: ['GL_BALANCE'],
      erpSources: ['fin_cash_accounts.current_balance'],
      chanjet: { available: true, value: 1_634_534.07, rows: 31, latestPulledAt: '2026-07-30T00:00:00.000Z' },
      erp: { available: true, value: 2_054_822_167.04, rows: 42 },
      reason: 'cash balance reconciliation',
      comparisonComparable: false,
      comparisonReason: 'Chanjet CNY base balance cannot be compared with ERP original-currency balances.',
      chanjetBreakdown: [{ currency: 'CNY', amount: 1_634_534.07, rows: 31 }],
      erpBreakdown: [
        { currency: 'CNY', amount: 172_153.29, rows: 9 },
        { currency: 'LAK', amount: 2_054_645_246.75, rows: 29 },
      ],
    });

    expect(result).toMatchObject({
      status: 'WARN',
      comparisonComparable: false,
      diff: null,
      diffRate: null,
    });
    expect(result.erpBreakdown).toHaveLength(2);
    expect(result.recommendedAction).toContain('不显示总额差异');
  });

  it('groups ERP cash account balances by currency without claiming a comparable total', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.ds = {
      query: jest.fn().mockResolvedValue([
        { currency: 'CNY', value: '172153.29', rows: '9' },
        { currency: 'LAK', value: '2054645246.75', rows: '29' },
        { currency: 'USD', value: '141', rows: '2' },
      ]),
    };

    const result = await subject.erpCashBalanceAggregate();

    expect(result).toMatchObject({
      available: true,
      rows: 40,
      breakdown: [
        { currency: 'CNY', amount: 172153.29, rows: 9 },
        { currency: 'LAK', amount: 2054645246.75, rows: 29 },
        { currency: 'USD', amount: 141, rows: 2 },
      ],
    });
    expect(subject.ds.query).toHaveBeenCalledTimes(1);
  });

  it('keeps the finance card cash diff disabled when the read model is not comparable', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.financeReadModelOverview = jest.fn().mockResolvedValue({
      metrics: [
        { key: 'AR_OPEN', status: 'AUTHORITY_READY', displayValue: 100, erpAuxiliaryValue: 100, sourceEntityTypes: ['AR_STATISTICS'] },
        { key: 'AP_OPEN', status: 'AUTHORITY_READY', displayValue: 80, erpAuxiliaryValue: 80, sourceEntityTypes: ['AP_STATISTICS'] },
        {
          key: 'CASH_BALANCE',
          status: 'AUTHORITY_READY',
          displayValue: 1_634_534.07,
          erpAuxiliaryValue: 2_054_822_167.04,
          comparisonComparable: false,
          comparisonReason: 'Cross-currency totals are not comparable.',
          chanjetBreakdown: [{ currency: 'CNY', amount: 1_634_534.07, rows: 31 }],
          erpBreakdown: [{ currency: 'LAK', amount: 2_054_645_246.75, rows: 29 }],
          sourceEntityTypes: ['GL_BALANCE'],
        },
      ],
    });
    subject.financeReceiptPaymentDateStatusLockOverview = jest.fn().mockResolvedValue({ locks: [] });
    subject.financeReceiptPaymentDailyReconciliationOverview = jest.fn().mockResolvedValue({
      summary: { authorityReady: 0 },
      metrics: [],
    });

    const result = await subject.financeCardAuthorityOverview();
    const cashCard = result.cards.find((card: any) => card.cardKey === 'cashBalance');

    expect(cashCard).toMatchObject({
      authorityEnabled: true,
      comparisonComparable: false,
      diff: null,
    });
    expect(cashCard.erpBreakdown).toEqual([{ currency: 'LAK', amount: 2_054_645_246.75, rows: 29 }]);
  });
});

describe('ChanjetIntegrationService field-gap helpers', () => {
  const service = Object.create(ChanjetIntegrationService.prototype) as any;

  it('preserves reviewed field decisions when the catalog is analyzed again', async () => {
    const subject = Object.create(ChanjetIntegrationService.prototype) as any;
    subject.fieldCatalogRepo = {
      find: jest.fn().mockResolvedValue([{
        apiPath: '/accounting/test',
        fieldPath: 'data.rows[].amount',
        sampleType: 'number',
        sampleValueMasked: '***',
      }]),
    };
    subject.fieldMappingRepo = {
      find: jest.fn().mockResolvedValue([{
        chanjetEndpoint: '/accounting/test',
        chanjetFieldPath: 'data.rows[].amount',
        erpDomain: 'finance',
        erpField: 'amount',
        decisionStatus: 'APPROVED',
      }]),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    subject.suggestErpFieldMapping = jest.fn().mockReturnValue({
      erpDomain: 'finance',
      erpTable: 'chanjet_entity_snapshot',
      erpField: 'amount',
      erpType: 'numeric',
      transformRule: 'decimal',
      matchStatus: 'TRANSFORM_REQUIRED',
      riskLevel: 'HIGH',
      analysisNote: 'reviewed mapping',
    });
    subject.deprecateFakeCounterpartyTargets = jest.fn().mockResolvedValue(undefined);
    subject.deprecateApiEnvelopeBusinessTargets = jest.fn().mockResolvedValue(undefined);

    await subject.analyzeFieldGaps();

    expect(subject.fieldMappingRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ decisionStatus: 'APPROVED' }),
      expect.any(Object),
    );
  });

  it('builds the documented readonly report period contracts', () => {
    const gl = service.buildProbeRequest({
      key: 'GL_BALANCE',
      query: {},
      body: { type: '0', showAssistant: false },
      periodBody: 'RANGE',
    }, '202607');
    const balanceSheet = service.buildProbeRequest({
      key: 'BALANCE_SHEET',
      query: { isReorg: 'false' },
      periodQuery: true,
    }, '202607');
    const incomeStatement = service.buildProbeRequest({
      key: 'INCOME_STATEMENT',
      query: { isQuarter: 'false', enableNewEdition: 'true' },
      periodQuery: true,
    }, '202607');
    const cashFlow = service.buildProbeRequest({
      key: 'CASH_FLOW',
      query: { isQuarter: 'false' },
      periodQuery: true,
    }, '202607');

    expect(gl).toMatchObject({
      period: '202607',
      query: {},
      body: { period: '202607-202607', type: '0', showAssistant: false },
    });
    expect(balanceSheet.query).toEqual({ isReorg: 'false', period: '202607' });
    expect(incomeStatement.query).toEqual({
      isQuarter: 'false',
      enableNewEdition: 'true',
      period: '202607',
    });
    expect(cashFlow.query).toEqual({ isQuarter: 'false', period: '202607' });
  });

  it('uses the official readonly department and subject contracts', () => {
    const department = service.buildProbeRequest({
      key: 'DEPARTMENT',
      query: {},
      body: { pageSize: 1000, pageNo: 1 },
    }, '202607');
    const subject = service.buildProbeRequest({
      key: 'SUBJECT',
      query: {},
    }, '202607');

    expect(department.body).toEqual({ pageSize: 1000, pageNo: 1 });
    expect(subject).toMatchObject({ query: {}, body: {} });
  });

  it('registers the complete book-scoped readonly inventory baseline', () => {
    const endpoints = service.listProbeEndpoints()
      .filter((endpoint: { apiDomain: string }) => endpoint.apiDomain === 'inventory');
    expect(endpoints).toHaveLength(11);
    expect(endpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'STOCK_IN',
        path: '/accounting/openapi/cc/purchasestockin/list/{bookid}',
        requiresBook: true,
        paginated: true,
      }),
      expect.objectContaining({
        key: 'SALES_STOCK_OUT',
        path: '/accounting/openapi/cc/salesstockout/list/{bookid}',
        requiresBook: true,
        paginated: true,
      }),
      expect.objectContaining({
        key: 'INVENTORY_ON_HAND',
        path: '/accounting/openapi/cc/inv/onhandqty/{bookid}',
        requiresBook: true,
        paginated: true,
      }),
      expect.objectContaining({
        key: 'INVENTORY_ON_HAND_LOT',
        path: '/accounting/openapi/cc/inv/onhandqtylot/{bookid}',
        requiresBook: true,
        paginated: true,
      }),
      expect.objectContaining({ key: 'FINISHED_GOODS_STOCK_IN' }),
      expect.objectContaining({ key: 'MATERIAL_STOCK_OUT' }),
      expect.objectContaining({ key: 'OTHER_STOCK_IN' }),
      expect.objectContaining({ key: 'OTHER_STOCK_OUT' }),
      expect.objectContaining({ key: 'STOCK_TRANSFER' }),
      expect.objectContaining({ key: 'STOCK_COUNT' }),
      expect.objectContaining({
        key: 'RETAIL_STOCK_OUT',
        path: '/accounting/openapi/cc/retailstock/list/{bookid}',
        requiresBook: true,
        paginated: true,
      }),
    ]));
  });

  it('collects every readonly inventory page without writing Chanjet', async () => {
    const subject = Object.create(ChanjetIntegrationService.prototype) as any;
    subject.auth = {
      callApi: jest
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: { rows: [{ id: '1' }, { id: '2' }], count: 3, totalPage: 2 },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { rows: [{ id: '3' }], count: 3, totalPage: 2 },
        }),
    };
    const response = await subject.fetchProbePayload({
      key: 'STOCK_IN',
      method: 'POST',
      pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 2, maxPages: 10 },
    }, '/accounting/openapi/cc/purchasestockin/list/BOOK-1', {
      query: {},
      body: { page: 1, pageSize: 2 },
    });

    expect(response.data.rows).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
    expect(response.erpReadonlyPagination).toMatchObject({
      pagesFetched: 2,
      rowsFetched: 3,
      truncated: false,
    });
    expect(subject.auth.callApi).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
      body: { page: 2, pageSize: 2 },
    }));
  });

  it('continues after provider-capped short pages until an empty page', async () => {
    const subject = Object.create(ChanjetIntegrationService.prototype) as any;
    subject.auth = {
      callApi: jest
        .fn()
        .mockResolvedValueOnce({ success: true, data: { rows: [{ id: '1' }] } })
        .mockResolvedValueOnce({ success: true, data: { rows: [{ id: '2' }] } })
        .mockResolvedValueOnce({ success: true, data: { rows: [] } }),
    };

    const response = await subject.fetchProbePayload({
      key: 'MATERIAL_STOCK_OUT',
      method: 'POST',
      pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 10 },
    }, '/accounting/openapi/cc/inv/materialstock/list/BOOK-1', {
      query: {},
      body: { page: 1, pageSize: 100 },
    });

    expect(response.data.rows).toEqual([{ id: '1' }, { id: '2' }]);
    expect(response.erpReadonlyPagination).toMatchObject({
      pagesFetched: 3,
      rowsFetched: 2,
      truncated: false,
    });
  });

  it('fails closed when a provider repeats the same page', async () => {
    const subject = Object.create(ChanjetIntegrationService.prototype) as any;
    subject.auth = {
      callApi: jest.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ id: 'same-page' }] },
      }),
    };

    await expect(subject.fetchProbePayload({
      key: 'OTHER_STOCK_OUT',
      method: 'POST',
      pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 10 },
    }, '/accounting/openapi/cc/inv/stockout/list/BOOK-1', {
      query: {},
      body: { page: 1, pageSize: 100 },
    })).rejects.toThrow('接口可能忽略分页参数');
  });

  it('routes mirror baseline debt to the actual unresolved condition', () => {
    expect(service.mirrorBaselineNextGate({
      missingReportTargets: 1,
      missingTargets: 1,
      staleTargets: 0,
      failedRecentJobs: 0,
      providerPermissionHolds: 0,
    })).toBe('CHANJET_REPORT_ENDPOINT_PARAMETER_REPAIR');
    expect(service.mirrorBaselineNextGate({
      missingReportTargets: 0,
      missingTargets: 6,
      staleTargets: 0,
      failedRecentJobs: 6,
      providerPermissionHolds: 6,
    })).toBe('CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR');
    expect(service.mirrorBaselineNextGate({
      missingReportTargets: 0,
      missingTargets: 0,
      staleTargets: 2,
      failedRecentJobs: 0,
      providerPermissionHolds: 0,
    })).toBe('CHANJET_STALE_READONLY_SCOPE_REFRESH');
    expect(service.mirrorBaselineNextGate({
      missingReportTargets: 0,
      missingTargets: 0,
      staleTargets: 0,
      failedRecentJobs: 0,
      providerPermissionHolds: 0,
    })).toBe('KEEP_SCHEDULED_READONLY_SYNC');
  });

  it('never extracts a Chanjet business failure envelope as an entity row', () => {
    expect(service.extractRows({
      success: false,
      code: 'saas.app.e0001',
      msg: '系统错误',
      data: null,
      requestId: 'REQ-FAILED',
    })).toEqual([]);
  });

  it('filters business failure envelopes nested inside response arrays', () => {
    expect(service.extractRows({
      data: [
        { code: '50000', message: 'service unavailable', requestId: 'REQ-FAILED' },
        { id: 'PROJECT-1', code: '001', name: '测试项目' },
      ],
    })).toEqual([{ id: 'PROJECT-1', code: '001', name: '测试项目' }]);
  });

  it('rejects historical master-data failure residue without raw evidence', () => {
    expect(service.isValidMasterDataReviewSnapshot({
      rawData: null,
      externalId: '50000',
      externalCode: '50000',
      externalName: '50000',
    })).toBe(false);
    expect(service.isValidMasterDataReviewSnapshot({
      rawData: { code: '210', accountName: '琅勃拉邦银行BCEL' },
      externalId: '210',
      externalCode: '210',
      externalName: '210',
    })).toBe(true);
  });

  it('normalizes project and cash-account fields without numeric-name fallback', () => {
    expect(service.normalizeExternalEntity({
      code: '210',
      accountName: '琅勃拉邦银行BCEL',
      currencyCode: 'LAK',
    }, 'CASH_ACCOUNT', 0, 'FIN_ACCOUNT')).toMatchObject({
      externalCode: '210',
      externalName: '琅勃拉邦银行BCEL',
      currency: 'LAK',
    });
    expect(service.normalizeExternalEntity({
      projectId: 'PROJECT-1',
      projectCode: 'P001',
      projectName: '孟赛项目',
    }, 'PROJECT', 0, 'PROJECT')).toMatchObject({
      externalId: 'PROJECT-1',
      externalCode: 'P001',
      externalName: '孟赛项目',
    });
  });

  it('normalizes the official subject list field names', () => {
    expect(service.normalizeExternalEntity({
      glAccountId: '1001',
      glAccountCode: '1001',
      glAccountName: '库存现金',
      baseEndingBalance: '125.50',
      statusEnum: 'A',
    }, 'SUBJECT', 0, 'SUBJECT')).toMatchObject({
      externalId: '1001',
      externalCode: '1001',
      externalName: '库存现金',
      amount: '125.50',
      status: 'A',
    });
  });

  it('keeps Chanjet subjects as readonly source references when ERP has no chart-of-accounts master', () => {
    const candidate = service.buildMasterDataReviewCandidate({
      snapshotId: 'subject-1',
      domain: 'SUBJECT',
      bookId: 'BOOK-1',
      companyCode: 'COMP-1',
      chanjetId: '1001',
      chanjetCode: '1001',
      chanjetName: '库存现金',
      currency: '',
    }, []);

    expect(candidate).toMatchObject({
      status: 'SOURCE_REFERENCE',
      systemApprovalEligible: false,
      requiresApproval: false,
    });
  });

  it('matches cash accounts only by mapped company, normalized exact name and currency', () => {
    const exact = service.buildMasterDataReviewCandidate({
      snapshotId: 'cash-1',
      domain: 'CASH_ACCOUNT',
      bookId: 'BOOK-1',
      companyCode: 'COMP-1',
      chanjetId: 'CJ-101',
      chanjetCode: '101',
      chanjetName: '　总部现金人民币',
      currency: 'CNY',
    }, [{
      domain: 'CASH_ACCOUNT',
      code: 'ERP-CASH-101',
      name: '总部现金人民币',
      companyCode: 'COMP-1',
      currency: 'CNY',
      status: 'ACTIVE',
    }]);
    const wrongCurrency = service.buildMasterDataReviewCandidate({
      snapshotId: 'cash-2',
      domain: 'CASH_ACCOUNT',
      bookId: 'BOOK-1',
      companyCode: 'COMP-1',
      chanjetId: 'CJ-102',
      chanjetCode: '102',
      chanjetName: '总部现金人民币',
      currency: 'LAK',
    }, [{
      domain: 'CASH_ACCOUNT',
      code: 'ERP-CASH-101',
      name: '总部现金人民币',
      companyCode: 'COMP-1',
      currency: 'CNY',
      status: 'ACTIVE',
    }]);

    expect(exact).toMatchObject({
      status: 'EXACT_MATCH',
      closureState: 'EXACT_AUTO_CONFIRMABLE',
      erpCode: 'ERP-CASH-101',
      systemApprovalEligible: true,
    });
    expect(wrongCurrency).toMatchObject({
      status: 'SOURCE_REFERENCE',
      closureState: 'ERP_MASTER_MISSING',
      blockerCode: 'ERP_MASTER_NOT_FOUND',
      erpCode: '',
      systemApprovalEligible: true,
      usableForErpWrite: false,
    });
  });

  it('blocks multiple Chanjet source identities from sharing one ERP target', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.entitySnapshotRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'S1',
          entityType: 'CASH_ACCOUNT',
          bookId: 'BOOK-1',
          externalId: 'CJ-1',
          externalCode: '001',
          externalName: '总部现金',
          currency: 'CNY',
          rawData: { id: 'CJ-1', accountCode: '001', accountName: '总部现金', currencyCode: 'CNY' },
        },
        {
          id: 'S2',
          entityType: 'CASH_ACCOUNT',
          bookId: 'BOOK-1',
          externalId: 'CJ-2',
          externalCode: '002',
          externalName: '总部现金',
          currency: 'CNY',
          rawData: { id: 'CJ-2', accountCode: '002', accountName: '总部现金', currencyCode: 'CNY' },
        },
      ]),
    };
    subject.bookCompanyMapRepo = {
      find: jest.fn().mockResolvedValue([{
        bookid: 'BOOK-1',
        companyCode: 'COMP-1',
        syncEnabled: true,
      }]),
    };
    subject.ds = {
      query: jest.fn().mockResolvedValue([{
        domain: 'CASH_ACCOUNT',
        code: 'ERP-CASH-1',
        name: '总部现金',
        company_code: 'COMP-1',
        currency: 'CNY',
        status: 'ACTIVE',
      }]),
    };

    const result = await subject.masterDataMappingReview();

    expect(result.summary.conflicts).toBe(2);
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        closureState: 'SOURCE_COLLISION_ON_ERP_TARGET',
        blockerCode: 'MULTIPLE_CHANJET_SOURCES_SHARE_ONE_ERP_TARGET',
        systemApprovalEligible: false,
      }),
    ]));
  });

  it('does not fuzzy-match project names or cross company boundaries', () => {
    const candidate = service.buildMasterDataReviewCandidate({
      snapshotId: 'project-1',
      domain: 'PROJECT',
      bookId: 'BOOK-1',
      companyCode: 'COMP-1',
      chanjetId: 'CJ-PROJECT-1',
      chanjetCode: '0001',
      chanjetName: '孟赛直营店',
      currency: '',
    }, [
      {
        domain: 'PROJECT',
        code: 'PRJ_MENGSAI_LAYER',
        name: '孟赛蛋鸡场经营项目',
        companyCode: 'COMP-1',
        currency: '',
        status: 'ACTIVE',
      },
      {
        domain: 'PROJECT',
        code: '0001',
        name: '孟赛直营店',
        companyCode: 'COMP-2',
        currency: '',
        status: 'ACTIVE',
      },
    ]);

    expect(candidate).toMatchObject({
      status: 'SOURCE_REFERENCE',
      systemApprovalEligible: true,
      usableForErpWrite: false,
    });
  });

  it('keeps incomplete Chanjet identities unresolved instead of guessing a mapping', () => {
    const candidate = service.buildMasterDataReviewCandidate({
      snapshotId: 'project-incomplete',
      domain: 'PROJECT',
      bookId: 'BOOK-1',
      companyCode: '',
      chanjetId: 'CJ-PROJECT-2',
      chanjetCode: '0002',
      chanjetName: '未绑定公司项目',
      currency: '',
    }, []);

    expect(candidate).toMatchObject({
      status: 'NEED_MAPPING',
      systemApprovalEligible: false,
      usableForErpWrite: false,
    });
  });

  it('does not infer financial amount fields from response metadata', () => {
    const candidates = service.matchSemanticFieldCandidates('ending_amount', [
      { path: '$.requestId', sampleType: 'string', sampleValue: '20260720-999', observedCount: 1 },
      { path: '$.msg', sampleType: 'string', sampleValue: 'total amount error', observedCount: 1 },
      { path: '$.data.endingAmount', sampleType: 'number', sampleValue: '88.5', observedCount: 1 },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].path).toBe('$.data.endingAmount');
  });

  it('promotes valid aggregate AR evidence without requiring invoice-level fields', () => {
    const metric = service.buildFinanceReadModelMetric({
      key: 'AR_OPEN',
      label: '应收待收',
      priority: 'P0',
      chanjetValue: 100,
      erpValue: 80,
      diff: 20,
      status: 'MISMATCH',
      evidence: { chanjetRows: 3, latestPulledAt: '2026-07-20T00:00:00.000Z', erpRows: 2 },
      chanjetEntityTypes: ['AR_STATISTICS'],
      semanticLock: {
        authorityEligible: true,
        pendingFields: ['aging_bucket', 'invoice_level_fields'],
      },
      reason: 'aggregate evidence',
      recommendedAction: 'keep diff visible',
    }, {
      status: 'PARTIAL',
      authorityEligible: false,
      sampleRows: 3,
      latestPulledAt: '2026-07-20T00:00:00.000Z',
      fieldCandidates: [],
      missingRequiredFields: ['aging_bucket', 'invoice_level_fields'],
    });

    expect(metric.status).toBe('AUTHORITY_READY');
    expect(metric.displayValue).toBe(100);
    expect(metric.erpAuxiliaryValue).toBe(80);
  });

  it('treats root Chanjet response envelope fields as API metadata', () => {
    const suggestion = service.suggestErpFieldMapping({
      apiDomain: 'report',
      apiPath: '/accounting/asr/CashFlow/3533914511118750',
      fieldPath: '$.success',
      sampleType: 'string',
      sampleValueMasked: 'true',
    });

    expect(suggestion).toMatchObject({
      erpDomain: 'api_metadata',
      erpTable: 'chanjet_read_snapshots',
      erpField: 'raw_payload',
      matchStatus: 'MATCHED',
      riskLevel: 'LOW',
    });
  });

  it('does not use a fake combined customer/supplier table target', () => {
    const supplier = service.suggestErpFieldMapping({
      apiDomain: 'master-data',
      apiPath: '/accounting/openapi/cc/party/custvendor/query/3533914511118750',
      fieldPath: '$.data[0].supplierName',
      sampleType: 'string',
      sampleValueMasked: '供应商A',
    });
    const customer = service.suggestErpFieldMapping({
      apiDomain: 'master-data',
      apiPath: '/accounting/openapi/cc/party/custvendor/query/3533914511118750',
      fieldPath: '$.data[0].customerName',
      sampleType: 'string',
      sampleValueMasked: '客户A',
    });
    const ambiguous = service.suggestErpFieldMapping({
      apiDomain: 'master-data',
      apiPath: '/accounting/openapi/cc/party/custvendor/query/3533914511118750',
      fieldPath: '$.data[0].partyName',
      sampleType: 'string',
      sampleValueMasked: '往来单位A',
    });

    expect(supplier.erpTable).toBe('prc2_suppliers');
    expect(customer.erpTable).toBe('sal_customers');
    expect(ambiguous.erpTable).toBe('chanjet_master_mapping');
  });

  it('creates stable hash-based external IDs when Chanjet rows lack real IDs', () => {
    const one = service.normalizeExternalEntity({ subjectName: '甲', endbalance: 12.3 }, 'AP_STATISTICS', 0, 'PAYABLE_STATISTICS');
    const two = service.normalizeExternalEntity({ subjectName: '乙', endbalance: 45.6 }, 'AP_STATISTICS', 1, 'PAYABLE_STATISTICS');

    expect(one.externalId).toMatch(/^AP_STATISTICS:PAYABLE_STATISTICS:/);
    expect(two.externalId).toMatch(/^AP_STATISTICS:PAYABLE_STATISTICS:/);
    expect(one.externalId).not.toBe(two.externalId);
  });

  it('ignores aggregate statistics sentinel IDs so rows do not overwrite each other', () => {
    const one = service.normalizeExternalEntity({ id: 0, subjectName: '甲', endbalance: 12.3 }, 'AP_STATISTICS', 0, 'PAYABLE_STATISTICS');
    const two = service.normalizeExternalEntity({ id: 0, subjectName: '乙', endbalance: 45.6 }, 'AP_STATISTICS', 1, 'PAYABLE_STATISTICS');

    expect(one.externalId).toMatch(/^AP_STATISTICS:PAYABLE_STATISTICS:/);
    expect(two.externalId).toMatch(/^AP_STATISTICS:PAYABLE_STATISTICS:/);
    expect(one.externalId).not.toBe(two.externalId);
  });

  it('allows system confirmation for a unique exact ERP code in the mapped company', () => {
    const candidate = service.buildCounterpartyMappingCandidate(
      {
        id: '11',
        bookId: 'BOOK-1',
        externalId: 'CJ-1',
        externalCode: 'CUS-001',
        externalName: '测试客户有限公司',
        rawData: { customerCode: 'CUS-001', customerName: '测试客户有限公司' },
      },
      'CUSTOMER',
      'CUSTOMER',
      'COMP-1',
      [{ mappingType: 'CUSTOMER', code: 'CUS_001', name: '其他名称', companyCode: 'COMP-1', status: 'ACTIVE' }],
    );

    expect(candidate).toMatchObject({
      matchStatus: 'MATCHED',
      confidence: 100,
      erpCode: 'CUS_001',
      requiresApproval: false,
      canAutoApprove: true,
      matchKind: 'EXACT_CODE',
      systemApprovalEligible: true,
    });
  });

  it('allows system confirmation when code and name both match in the mapped company', () => {
    const candidate = service.buildCounterpartyMappingCandidate(
      {
        id: '13',
        bookId: 'BOOK-1',
        externalId: 'CJ-3',
        externalCode: 'CUS-001',
        externalName: '测试客户有限公司',
        rawData: { customerCode: 'CUS-001', customerName: '测试客户有限公司' },
      },
      'CUSTOMER',
      'CUSTOMER',
      'COMP-1',
      [{ mappingType: 'CUSTOMER', code: 'CUS_001', name: '测试客户公司', companyCode: 'COMP-1', status: 'ACTIVE' }],
    );

    expect(candidate).toMatchObject({
      matchStatus: 'MATCHED',
      matchKind: 'EXACT_CODE_AND_NAME',
      systemApprovalEligible: true,
      requiresApproval: false,
      canAutoApprove: true,
    });
  });

  it('allows system confirmation for a unique normalized-name match in the mapped company', () => {
    const candidate = service.buildCounterpartyMappingCandidate(
      {
        id: '15',
        bookId: 'BOOK-1',
        externalId: 'CJ-4',
        externalCode: 'CHANJET-ONLY-CODE',
        externalName: '金凤凰食品有限公司',
        rawData: { customerCode: 'CHANJET-ONLY-CODE', customerName: '金凤凰食品有限公司' },
      },
      'CUSTOMER',
      'CUSTOMER',
      'COMP-1',
      [{ mappingType: 'CUSTOMER', code: 'ERP-CUS-1', name: '金凤凰食品公司', companyCode: 'COMP-1', status: 'ACTIVE' }],
    );

    expect(candidate).toMatchObject({
      matchStatus: 'MATCHED',
      matchKind: 'EXACT_NAME',
      systemApprovalEligible: true,
      requiresApproval: false,
      canAutoApprove: true,
    });
  });

  it('allows system confirmation for a unique active group-shared supplier', () => {
    const candidate = service.buildCounterpartyMappingCandidate(
      {
        id: '16',
        bookId: 'BOOK-1',
        externalId: 'CJ-SHARED-1',
        externalCode: '010001',
        externalName: '集团共享饲料供应商',
        rawData: { partyRoleTypeId: '100101' },
      },
      'SUPPLIER',
      'SUPPLIER',
      'COMP-1',
      [{ mappingType: 'SUPPLIER', code: 'SUP-SHARED-1', name: '集团共享饲料供应商', companyCode: '', status: 'ACTIVE' }],
    );

    expect(candidate).toMatchObject({
      matchStatus: 'MATCHED',
      matchKind: 'EXACT_NAME',
      systemApprovalEligible: true,
      requiresApproval: false,
      canAutoApprove: true,
    });
    expect(candidate.systemApprovalReason).toContain('集团共享主档');
  });

  it('blocks an exact match owned by another company', () => {
    const candidate = service.buildCounterpartyMappingCandidate(
      {
        id: '17',
        bookId: 'BOOK-1',
        externalId: 'CJ-OTHER-COMPANY',
        externalCode: 'SUP-OTHER-1',
        externalName: '其他公司供应商',
        rawData: { partyRoleTypeId: '100101' },
      },
      'SUPPLIER',
      'SUPPLIER',
      'COMP-1',
      [{ mappingType: 'SUPPLIER', code: 'SUP-OTHER-1', name: '其他公司供应商', companyCode: 'COMP-2', status: 'ACTIVE' }],
    );

    expect(candidate).toMatchObject({
      matchStatus: 'SOURCE_ONLY',
      systemApprovalEligible: false,
      sourceIdentityEligible: true,
    });
  });

  it('resolves a complete Chanjet-only counterparty as an isolated readonly source identity', () => {
    const candidate = service.buildCounterpartyMappingCandidate(
      {
        id: '14',
        bookId: 'BOOK-1',
        externalId: 'CJ-ONLY-1',
        externalCode: 'C-9001',
        externalName: '好业财独有客户',
        rawData: { partyRoleTypeId: 100001, customerCode: 'C-9001', customerName: '好业财独有客户' },
      },
      'CUSTOMER',
      'CUSTOMER',
      'COMP-1',
      [],
    );

    expect(candidate).toMatchObject({
      matchStatus: 'SOURCE_ONLY',
      matchKind: 'SOURCE_IDENTITY',
      confidence: 100,
      erpCode: 'CJRO:BOOK-1:C:C9001',
      erpName: '好业财独有客户',
      sourceIdentityEligible: true,
      systemApprovalEligible: false,
      requiresApproval: false,
      canAutoApprove: true,
    });
    expect(candidate.evidence.join(' ')).toContain('不写入 sal_customers / prc2_suppliers');
  });

  it('keeps readonly source identity codes deterministic and role-specific', () => {
    const customer = service.buildCounterpartySourceIdentityCode('BOOK-1', 'CUSTOMER', 'C-9001', 'CJ-1');
    const supplier = service.buildCounterpartySourceIdentityCode('BOOK-1', 'SUPPLIER', 'C-9001', 'CJ-1');

    expect(customer).toBe('CJRO:BOOK-1:C:C9001');
    expect(service.buildCounterpartySourceIdentityCode('BOOK-1', 'CUSTOMER', 'C-9001', 'CJ-1')).toBe(customer);
    expect(supplier).toBe('CJRO:BOOK-1:S:C9001');
  });

  it('identifies a pending mapping whose historical role no longer matches the source role', () => {
    const candidates = [
      { bookId: 'BOOK-1', chanjetId: 'PARTY-1', mappingType: 'SUPPLIER' },
    ];

    expect(service.isStaleCounterpartyRoleMapping(
      { bookId: 'BOOK-1', chanjetId: 'PARTY-1', mappingType: 'CUSTOMER' },
      candidates,
    )).toBe(true);
    expect(service.isStaleCounterpartyRoleMapping(
      { bookId: 'BOOK-1', chanjetId: 'PARTY-1', mappingType: 'SUPPLIER' },
      candidates,
    )).toBe(false);
  });

  it('holds duplicate normalized-name matches for manual disambiguation', () => {
    const candidate = service.buildCounterpartyMappingCandidate(
      {
        id: '12',
        bookId: 'BOOK-1',
        externalId: 'CJ-2',
        externalCode: '',
        externalName: '金凤凰食品有限公司',
        rawData: { supplierName: '金凤凰食品有限公司' },
      },
      'SUPPLIER',
      'SUPPLIER',
      'COMP-1',
      [
        { mappingType: 'SUPPLIER', code: 'SUP-1', name: '金凤凰食品公司', companyCode: 'COMP-1', status: 'ACTIVE' },
        { mappingType: 'SUPPLIER', code: 'SUP-2', name: '金凤凰食品有限公司', companyCode: 'COMP-1', status: 'ACTIVE' },
      ],
    );

    expect(candidate.matchStatus).toBe('CONFLICT');
    expect(candidate.erpCode).toBe('');
    expect(candidate.alternatives).toHaveLength(2);
  });

  it('does not infer a role from an explicitly false supplier flag', () => {
    expect(service.detectCounterpartyRole({ isSupplier: false, note: '普通往来单位' })).toBe('UNKNOWN');
    expect(service.detectCounterpartyRole({ isCustomer: true, customerName: '甲客户' })).toBe('CUSTOMER');
  });

  it('locks observed Chanjet partyRoleTypeId values without amount-based guessing', () => {
    expect(service.detectCounterpartyRole({ partyRoleTypeId: 100001 })).toBe('CUSTOMER');
    expect(service.detectCounterpartyRole({ partyRoleTypeId: 100101 })).toBe('SUPPLIER');
    expect(service.detectCounterpartyRole({ partyRoleTypeId: 100400 })).toBe('BOTH');
    expect(service.detectCounterpartyRole({ partyRoleTypeId: 999999, arAmount: 100, apAmount: 0 })).toBe('UNKNOWN');
  });

  it('extracts and deduplicates nested tenant account books from the real response shape', () => {
    const books = service.extractBooks({
      data: [
        { tenant: { id: 3533914511118750, name: '农业账套' }, isDefault: true },
        { tenant: { id: 3533914511118750, name: '农业账套' }, isDefault: false },
        { tenant: { id: 3537748712226818, name: '星驰账套' }, isDefault: false },
      ],
    });

    expect(books).toHaveLength(2);
    expect(books[0]).toMatchObject({ bookId: '3533914511118750', bookName: '农业账套' });
    expect(books[1]).toMatchObject({ bookId: '3537748712226818', bookName: '星驰账套' });
  });

  it('normalizes nested account-book tenant identity for entity snapshots', () => {
    const normalized = service.normalizeExternalEntity(
      { tenant: { id: 3533914511118750, name: '农业账套', statusEnum: 'ACTIVE' } },
      'ACCOUNT_BOOK',
      0,
      'ACCOUNT_BOOKS',
    );

    expect(normalized).toMatchObject({
      externalId: '3533914511118750',
      externalName: '农业账套',
      status: 'ACTIVE',
    });
  });

  it('persists account books with configured company mapping and approved middle-layer mapping', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.extractBooks = jest.fn().mockReturnValue([
      { bookId: 'BOOK-1', bookName: '测试账套', rawData: { tenant: { id: 'BOOK-1' } } },
    ]);
    subject.bookCompanyMapRepo = {
      find: jest.fn().mockResolvedValue([
        { bookid: 'BOOK-1', companyCode: 'COMP-1', companyName: '测试公司', syncEnabled: true },
      ]),
    };
    subject.accountBookRepo = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    subject.upsertMasterMapping = jest.fn().mockResolvedValue(undefined);

    const books = await subject.persistAccountBooks({});

    expect(books).toHaveLength(1);
    expect(subject.accountBookRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'BOOK-1', companyCode: 'COMP-1', enabled: true,
    }));
    expect(subject.upsertMasterMapping).toHaveBeenCalledWith(expect.objectContaining({
      mappingType: 'COMPANY', bookId: 'BOOK-1', erpCode: 'COMP-1', reviewStatus: 'APPROVED',
    }));
  });

  it('rejects an approval that conflicts with an existing one-to-one mapping', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.mappingRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: '2', mappingType: 'CUSTOMER', bookId: 'BOOK-1', erpCode: 'CUS-1', chanjetId: 'CJ-2',
        matchStatus: 'MATCHED', reviewStatus: 'PENDING',
      }),
      find: jest.fn().mockResolvedValue([{
        id: '1', mappingType: 'CUSTOMER', bookId: 'BOOK-1', erpCode: 'CUS-1', chanjetId: 'CJ-1',
        matchStatus: 'MATCHED', reviewStatus: 'APPROVED',
      }]),
      save: jest.fn(),
    };
    subject.bookCompanyMapRepo = {
      findOneBy: jest.fn().mockResolvedValue({ bookid: 'BOOK-1', syncEnabled: true }),
    };

    await expect(subject.updateMappingReview('2', 'APPROVED', 'reviewer'))
      .rejects.toThrow('一对一映射冲突');
    expect(subject.mappingRepo.save).not.toHaveBeenCalled();
  });

  it('runs the ERP middle-layer mapping canary and restores the original row', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    let stored: any = {
      id: '91', mappingType: 'PROJECT', bookId: 'BOOK-1', erpCode: '', chanjetId: 'CJ-P-1',
      matchStatus: 'SOURCE_ONLY', reviewStatus: 'APPROVED', reviewedBy: 'system:source',
      reviewedAt: new Date('2026-07-20T00:00:00Z'), rawData: { resolutionKind: 'CHANJET_READONLY_SOURCE_IDENTITY' },
    };
    subject.mappingRepo = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve({ ...stored })),
      findOneBy: jest.fn().mockImplementation(() => Promise.resolve({ ...stored })),
      save: jest.fn().mockImplementation((value) => {
        stored = { ...stored, ...value };
        return Promise.resolve({ ...stored });
      }),
      count: jest.fn().mockResolvedValue(1),
    };
    subject.createJob = jest.fn().mockResolvedValue({ id: 'JOB-1' });
    subject.finishJob = jest.fn().mockResolvedValue(undefined);
    subject.log = { error: jest.fn() };

    const result = await subject.runMinimalMappingWriteCanary('tester');

    expect(result).toMatchObject({
      decision: 'GO', mappingId: '91', readbackPassed: true,
      idempotencyPassed: true, compensatingRollbackPassed: true,
      writeChanjet: false, writeErpBusinessTables: false,
    });
    expect(stored.rawData).toEqual({ resolutionKind: 'CHANJET_READONLY_SOURCE_IDENTITY' });
    expect(stored.reviewedBy).toBe('system:source');
    expect(subject.mappingRepo.count).toHaveBeenCalledWith({
      where: {
        mappingType: 'PROJECT', bookId: 'BOOK-1', erpCode: '', chanjetId: 'CJ-P-1',
      },
    });
    expect(subject.finishJob).toHaveBeenCalledWith(expect.anything(), 'SUCCESS', expect.objectContaining({
      compensatingRollbackPassed: true,
    }));
  });

  it('keeps the same Chanjet master ID isolated by account book', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const stored: any[] = [];
    subject.masterDataMappingReview = jest.fn().mockResolvedValue({
      summary: { conflicts: 0, needMapping: 0 },
      candidates: [
        {
          snapshotId: 'S1', domain: 'CASH_ACCOUNT', bookId: 'BOOK-LAK', companyCode: 'COMP-LAK',
          chanjetId: '12', chanjetCode: '12', chanjetName: '琅勃拉邦直营店备用金', currency: 'LAK',
          status: 'SOURCE_REFERENCE', erpCode: '', erpName: '', evidence: ['source identity'],
        },
        {
          snapshotId: 'S2', domain: 'CASH_ACCOUNT', bookId: 'BOOK-THB', companyCode: 'COMP-THB',
          chanjetId: '12', chanjetCode: '12', chanjetName: '泰铢（现金）', currency: 'THB',
          status: 'SOURCE_REFERENCE', erpCode: '', erpName: '', evidence: ['source identity'],
        },
      ],
    });
    subject.mappingRepo = {
      find: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(
        stored.filter((row) => row.mappingType === where.mappingType && row.bookId === where.bookId),
      )),
      create: jest.fn((value) => ({ id: `M${stored.length + 1}`, ...value })),
      save: jest.fn().mockImplementation((value) => {
        stored.push({ ...value });
        return Promise.resolve(value);
      }),
    };
    subject.updateMappingReview = jest.fn();

    const result = await subject.confirmDeterministicMasterDataMappings('tester');

    expect(result).toMatchObject({
      reviewed: 2, sourceOnlyApproved: 2, conflicts: 0, unresolved: 0, errors: [],
    });
    expect(stored).toHaveLength(2);
    expect(stored.map((row) => [row.bookId, row.chanjetId, row.chanjetName, row.rawData.currency])).toEqual([
      ['BOOK-LAK', '12', '琅勃拉邦直营店备用金', 'LAK'],
      ['BOOK-THB', '12', '泰铢（现金）', 'THB'],
    ]);
  });

  it('retries failed readonly mirror targets and reports the recovered attempt', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.syncReadOnlyMirror = jest
      .fn()
      .mockResolvedValueOnce({
        requestedScope: ['GL_BALANCE'],
        books: ['BOOK-1'],
        results: [{ key: 'GL_BALANCE', bookId: 'BOOK-1', status: 'FAIL', error: 'temporary timeout' }],
        fieldGapSummary: { scanned: 1, upserted: 1, statusCounts: {} },
      })
      .mockResolvedValueOnce({
        requestedScope: ['GL_BALANCE'],
        books: ['BOOK-1'],
        results: [{ key: 'GL_BALANCE', bookId: 'BOOK-1', status: 'SUCCESS', rows: 8 }],
        fieldGapSummary: { scanned: 1, upserted: 1, statusCounts: {} },
      });
    subject.analyzeFieldGaps = jest.fn().mockResolvedValue({ scanned: 1, upserted: 1, statusCounts: {} });

    const result = await subject.syncReadOnlyMirrorResilient(['GL_BALANCE'], 'BOOK-1', '202607', 3);

    expect(result.decision).toBe('GO');
    expect(result.attempts).toBe(2);
    expect(result.unresolvedFailures).toEqual([]);
    expect(result.results[0]).toMatchObject({ status: 'SUCCESS', attempt: 2, rows: 8 });
  });

  it('runs the complete readonly alignment cycle in a fixed safe order', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.syncReadOnlyMirrorResilient = jest.fn().mockResolvedValue({
      decision: 'GO', results: [], attempts: 1, unresolvedFailures: [],
    });
    subject.confirmDeterministicCounterpartyMappings = jest.fn().mockResolvedValue({
      generated: {}, eligible: 2, approved: 2, skipped: 0, errors: [],
    });
    subject.confirmDeterministicMasterDataMappings = jest.fn().mockResolvedValue({
      reviewed: 4, exactApproved: 1, sourceOnlyApproved: 3, unchanged: 0, conflicts: 0, unresolved: 0, errors: [],
    });
    subject.runMappingReconciliation = jest.fn().mockResolvedValue({
      scanned: 4, created: 1, unchanged: 2, autoResolved: 1, statusCounts: {}, results: [],
    });
    subject.productionReadinessOverview = jest.fn().mockResolvedValue({ decision: 'GO_WITH_CONDITIONS' });

    const result = await subject.runReadonlyAlignmentCycle('tester', [], undefined, '202607', 3);

    expect(result).toMatchObject({
      decision: 'GO_WITH_CONDITIONS',
      requestedBy: 'tester',
      writeChanjet: false,
      writeErpBusinessTables: false,
      stoppedAt: null,
    });
    expect(subject.confirmDeterministicCounterpartyMappings).toHaveBeenCalledWith('tester');
    expect(subject.confirmDeterministicMasterDataMappings).toHaveBeenCalledWith('tester');
    expect(subject.runMappingReconciliation).toHaveBeenCalledTimes(1);
    expect(subject.productionReadinessOverview).toHaveBeenCalledTimes(1);
  });

  it('returns bounded alignment evidence for background scheduler runs', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.syncReadOnlyMirrorResilient = jest.fn().mockResolvedValue({
      decision: 'GO', results: [], attempts: 1, unresolvedFailures: [],
    });
    subject.confirmDeterministicCounterpartyMappings = jest.fn().mockResolvedValue({
      generated: { preview: { candidates: new Array(1_000).fill({ rawData: 'large' }) } },
      eligible: 10,
      approved: 8,
      skipped: 2,
      sourceOnlyResolved: 5,
      remainingPending: 1,
      remainingConflicts: 0,
      errors: new Array(30).fill(null).map((_, index) => ({ candidateKey: String(index), error: 'x' })),
    });
    subject.confirmDeterministicMasterDataMappings = jest.fn().mockResolvedValue({
      reviewed: 4, exactApproved: 1, sourceOnlyApproved: 3, unchanged: 0, conflicts: 0, unresolved: 0, errors: [],
    });
    subject.runMappingReconciliation = jest.fn().mockResolvedValue({
      scanned: 4,
      created: 1,
      unchanged: 2,
      autoResolved: 1,
      statusCounts: { WARN: 1 },
      results: new Array(1_000).fill({ rawData: 'large' }),
    });
    subject.productionReadinessOverview = jest.fn().mockResolvedValue({ decision: 'GO' });

    const result = await subject.runReadonlyAlignmentCycle(
      'system:scheduler',
      [],
      undefined,
      '202607',
      3,
      { compact: true },
    );

    expect(result.exactMappings).not.toHaveProperty('generated');
    expect(result.exactMappings?.errors).toHaveLength(20);
    expect(result.reconciliation).not.toHaveProperty('results');
    expect(result).toMatchObject({
      decision: 'GO',
      exactMappings: { approved: 8 },
      reconciliation: { created: 1, autoResolved: 1 },
    });
  });

  it('stops the readonly alignment cycle before mapping when mirror sync is HOLD', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.syncReadOnlyMirrorResilient = jest.fn().mockResolvedValue({
      decision: 'HOLD', results: [], attempts: 3, unresolvedFailures: [{ key: 'GL_BALANCE', bookId: 'B1', error: 'timeout' }],
    });
    subject.confirmDeterministicCounterpartyMappings = jest.fn();
    subject.confirmDeterministicMasterDataMappings = jest.fn();
    subject.runMappingReconciliation = jest.fn();
    subject.productionReadinessOverview = jest.fn();

    const result = await subject.runReadonlyAlignmentCycle('tester');

    expect(result).toMatchObject({ decision: 'HOLD', stoppedAt: 'READONLY_MIRROR' });
    expect(subject.confirmDeterministicCounterpartyMappings).not.toHaveBeenCalled();
    expect(subject.confirmDeterministicMasterDataMappings).not.toHaveBeenCalled();
    expect(subject.runMappingReconciliation).not.toHaveBeenCalled();
  });

  it('keeps open reconciliation issues idempotent and resolves disappeared issues', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const activeMapping = { id: '1', mappingType: 'CUSTOMER', bookId: 'B1', erpCode: 'C1', erpName: '客户一', chanjetId: 'CJ1', chanjetCode: 'C1', chanjetName: '客户甲' };
    const existingOpen = {
      id: 'R1', reconciliationType: 'MASTER_MAPPING', resolved: false,
      subjectType: 'CUSTOMER', bookId: 'B1', subjectKey: 'C1', status: 'WARN', diffSummary: '名称不一致',
    };
    const disappearedOpen = {
      id: 'R2', reconciliationType: 'MASTER_MAPPING', resolved: false,
      subjectType: 'SUPPLIER', bookId: 'B1', subjectKey: 'S1', status: 'HOLD', diffSummary: '待映射',
    };
    subject.mappingRepo = { find: jest.fn().mockResolvedValue([activeMapping]) };
    subject.reconciliationRepo = {
      find: jest.fn().mockResolvedValue([existingOpen, disappearedOpen]),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    subject.mappingIssue = jest.fn().mockReturnValue({
      status: 'WARN', severity: 'MEDIUM', diffSummary: '名称不一致', actionRequired: '复核',
    });
    subject.createJob = jest.fn().mockResolvedValue({});
    subject.finishJob = jest.fn().mockResolvedValue(undefined);

    const result = await subject.runMappingReconciliation();

    expect(result).toMatchObject({ scanned: 1, created: 0, unchanged: 1, autoResolved: 1 });
    expect(disappearedOpen).toMatchObject({
      resolved: true,
      resolvedBy: 'system:chanjet-reconciliation',
      resolvedAt: expect.any(Date),
    });
    expect(subject.reconciliationRepo.save).toHaveBeenCalledTimes(1);
  });

  it('publishes one ordered P0-P5 runtime state with all external writes disabled', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.productionReadinessOverview = jest.fn().mockResolvedValue({
      phases: [
        { key: 'P0', status: 'READY', score: 100, evidence: ['46/46 fresh'], nextAction: 'KEEP_MIRROR_FRESH' },
        { key: 'P2', status: 'READY_WITH_CONDITIONS', score: 90, evidence: [], nextAction: 'FIX_FIELDS' },
        { key: 'P4', status: 'READY', score: 100, evidence: [], nextAction: 'KEEP_RECONCILING' },
        { key: 'P5', status: 'READY', score: 100, evidence: ['token ready'], nextAction: 'KEEP_SCHEDULED_READONLY_SYNC' },
      ],
      blockers: [],
      conditions: ['one visible condition'],
      summary: { mirrorFreshRate: 100, recentJobSuccessRate: 100 },
    });
    subject.financeReadModelOverview = jest.fn().mockResolvedValue({
      decision: 'GO_WITH_CONDITIONS',
      summary: { p0Blocked: 0 },
    });
    subject.financeCardAuthorityOverview = jest.fn().mockResolvedValue({
      decision: 'GO_WITH_CONDITIONS',
      summary: { totalCards: 8, authorityReady: 2, readonlyReady: 6, nextGate: 'KEEP_GUARDED_AUTHORITY' },
    });
    subject.masterDataAlignmentOverview = jest.fn().mockResolvedValue({
      decision: 'GO_WITH_CONDITIONS',
      summary: { totalDomains: 7, readyDomains: 6, needReviewDomains: 1, holdDomains: 0, nextGate: 'FIX_ONE_DOMAIN' },
    });
    subject.masterDataMappingReview = jest.fn().mockResolvedValue({
      decision: 'GO_WITH_CONDITIONS',
      summary: {
        validSourceRows: 59,
        invalidSourceRowsExcluded: 0,
        exactMatches: 41,
        needMapping: 18,
        conflicts: 0,
        nextGate: 'CHANJET_P2_EXACT_MAPPING_APPROVAL_GATE',
      },
    });
    subject.financeReconciliationOverview = jest.fn().mockResolvedValue({
      summary: { mismatch: 0, needMapping: 1, needManualReview: 0, hold: 0 },
    });
    subject.overview = jest.fn().mockResolvedValue({
      voucherDrafts: 3,
      pushReadyDrafts: 1,
      fieldMappings: 1714,
      unmappedFields: 20,
    });
    subject.voucherDraftRepo = { count: jest.fn().mockResolvedValue(0) };

    const result = await subject.currentStateOverview();

    expect(result.decision).toBe('GO_WITH_CONDITIONS');
    expect(result.productionReadiness.summary.mirrorFreshRate).toBe(100);
    expect(result.implementationOrder.map((item: { phase: string }) => item.phase)).toEqual(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
    expect(result.summary).toMatchObject({
      fieldMappings: 1714,
      unmappedFields: 20,
      mappingReadyDomains: 41,
      mappingDomains: 59,
      externalWriteEnabled: false,
    });
    expect(subject.productionReadinessOverview.mock.invocationCallOrder[0]).toBeLessThan(
      subject.financeReadModelOverview.mock.invocationCallOrder[0],
    );
    expect(subject.productionReadinessOverview.mock.invocationCallOrder[0]).toBeLessThan(
      subject.financeCardAuthorityOverview.mock.invocationCallOrder[0],
    );
    expect(subject.masterDataAlignmentOverview).not.toHaveBeenCalled();
    expect(result.guardrails).toMatchObject({ chanjetWrite: false, voucherPush: false, erpBusinessOverwrite: false });
  });

  it('deduplicates concurrent production readiness calculations and serves the short cache', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const result = {
      generatedAt: '2026-07-29T00:00:00.000Z',
      decision: 'GO_WITH_CONDITIONS',
      score: 90,
      grade: 'A',
      summary: { mirrorFreshRate: 90 },
      phases: [],
      blockers: [],
      conditions: [],
      tokenHealth: {},
      guardrails: { chanjetWrite: false },
    };
    subject.computeProductionReadinessOverview = jest.fn().mockResolvedValue(result);

    const [first, second] = await Promise.all([
      subject.productionReadinessOverview(),
      subject.productionReadinessOverview(),
    ]);
    const cached = await subject.productionReadinessOverview();

    expect(first).toBe(result);
    expect(second).toBe(result);
    expect(cached).toBe(result);
    expect(subject.computeProductionReadinessOverview).toHaveBeenCalledTimes(1);
  });

  it('loads mirror readiness evidence without materializing raw JSON documents', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.ds = {
      query: jest.fn((sql: string) => {
        if (sql.includes('FROM chanjet_account_books')) {
          return Promise.resolve([{
            book_id: 'BOOK-1',
            book_name: '账套一',
            company_code: 'COMP-1',
            company_name: '公司一',
            enabled: true,
          }]);
        }
        if (sql.includes('FROM chanjet_read_snapshots')) {
          return Promise.resolve([{
            endpoint_key: 'GL_BALANCE',
            book_id: 'BOOK-1',
            row_count: 12,
            pulled_at: new Date('2026-07-29T00:00:00.000Z'),
            envelope_success: 'true',
            envelope_code: 'openApi.e0000',
            envelope_message: 'success',
            envelope_request_id: 'REQ-1',
            envelope_status: '200',
            envelope_null_data: false,
            envelope_has_error: false,
          }]);
        }
        if (sql.includes('FROM chanjet_entity_snapshots')) {
          return Promise.resolve([{
            endpoint_key: 'GL_BALANCE',
            book_id: 'BOOK-1',
            entity_type: 'GL_BALANCE',
            amount: '10.50',
            updated_at: new Date('2026-07-29T00:00:00.000Z'),
            envelope_success: null,
            envelope_code: '',
            envelope_message: '',
            envelope_request_id: '',
            envelope_status: '',
            envelope_null_data: false,
            envelope_has_error: false,
          }]);
        }
        if (sql.includes('FROM chanjet_sync_jobs')) {
          return Promise.resolve([{
            endpoint_key: 'GL_BALANCE',
            book_id: 'BOOK-1',
            status: 'SUCCESS',
            error_message: null,
            updated_at: new Date('2026-07-29T00:00:00.000Z'),
          }]);
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const [first, second] = await Promise.all([
      subject.loadMirrorEvidence(),
      subject.loadMirrorEvidence(),
    ]);
    const cached = await subject.loadMirrorEvidence();

    expect(first).toBe(second);
    expect(cached).toBe(first);
    expect(subject.ds.query).toHaveBeenCalledTimes(4);
    expect(first).toMatchObject({
      books: [{ bookId: 'BOOK-1', enabled: true }],
      snapshots: [{ endpointKey: 'GL_BALANCE', rowCount: 12 }],
      entities: [{ entityType: 'GL_BALANCE', amount: 10.5 }],
      jobs: [{ endpointKey: 'GL_BALANCE', status: 'SUCCESS' }],
    });
    expect(JSON.stringify(first)).not.toContain('raw_payload');
    expect(JSON.stringify(first)).not.toContain('raw_data');
  });

  it('clears a failed current-state calculation so the next request can retry', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const recovered = {
      generatedAt: '2026-07-29T00:00:00.000Z',
      decision: 'GO_WITH_CONDITIONS',
      authoritativeEvidence: 'RUNTIME_CURRENT_STATE',
      productionReadiness: {},
      implementationOrder: [],
      summary: {},
      blockers: [],
      conditions: [],
      staleEvidencePolicy: 'runtime only',
      guardrails: { chanjetWrite: false },
    };
    subject.computeCurrentStateOverview = jest.fn()
      .mockRejectedValueOnce(new Error('transient aggregate failure'))
      .mockResolvedValueOnce(recovered);

    await expect(subject.currentStateOverview()).rejects.toThrow('transient aggregate failure');
    await expect(subject.currentStateOverview()).resolves.toBe(recovered);

    expect(subject.computeCurrentStateOverview).toHaveBeenCalledTimes(2);
  });

  it('uses the verified daily receipt/payment contract in finance reconciliation', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.erpFinanceAggregate = jest.fn().mockResolvedValue({ available: true, value: 0, rows: 0 });
    subject.erpCashBalanceAggregate = jest.fn().mockResolvedValue({
      available: true,
      value: 0,
      rows: 0,
      breakdown: [],
    });
    subject.chanjetEntityAggregate = jest.fn().mockResolvedValue({
      available: true,
      value: 0,
      rows: 1,
      latestPulledAt: '2026-07-20T00:00:00.000Z',
    });
    subject.chanjetCashBalanceAggregate = jest.fn().mockResolvedValue({
      available: true,
      value: 0,
      rows: 1,
      latestPulledAt: '2026-07-20T00:00:00.000Z',
    });
    subject.financeReceiptPaymentDailyReconciliationOverview = jest.fn().mockResolvedValue({
      metrics: [
        {
          key: 'TODAY_RECEIPT',
          status: 'AUTHORITY_READY',
          readyForCardAuthority: true,
          amount: 125,
          effectiveRows: 1,
          latestPulledAt: '2026-07-20T00:00:00.000Z',
          reason: 'verified receipt contract',
        },
        {
          key: 'TODAY_PAYMENT',
          status: 'AUTHORITY_READY',
          readyForCardAuthority: true,
          amount: 250,
          effectiveRows: 2,
          latestPulledAt: '2026-07-20T00:00:00.000Z',
          reason: 'verified payment contract',
        },
      ],
    });
    subject.financeSemanticExtractorsOverview = jest.fn().mockResolvedValue({ extractors: [] });

    const result = await subject.financeReconciliationOverview();
    const receipt = result.items.find((item: { key: string }) => item.key === 'TODAY_RECEIPT');
    const payment = result.items.find((item: { key: string }) => item.key === 'TODAY_PAYMENT');

    expect(receipt).toMatchObject({
      chanjetValue: 125,
      status: 'MISMATCH',
      reason: 'verified receipt contract',
      semanticLock: { status: 'LOCKED', authorityEligible: true, pendingFields: [] },
    });
    expect(payment).toMatchObject({
      chanjetValue: 250,
      status: 'MISMATCH',
      reason: 'verified payment contract',
      semanticLock: { status: 'LOCKED', authorityEligible: true, pendingFields: [] },
    });
    expect(result.summary.needManualReview).toBe(0);
    expect(result.summary.needMapping).toBe(5);
  });

  it('keeps readonly statements row-based instead of publishing fake scalar zeroes', () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const item = {
      key: 'BALANCE_SHEET',
      label: '资产负债表关键项',
      priority: 'P0',
      status: 'WARN',
      chanjetEndpointKeys: ['BALANCE_SHEET'],
      chanjetEntityTypes: ['BALANCE_SHEET'],
      erpSources: ['chanjet_entity_snapshots.BALANCE_SHEET only'],
      chanjetValue: null,
      erpValue: null,
      diff: null,
      diffRate: null,
      evidence: { chanjetRows: 50, latestPulledAt: '2026-07-20T00:00:00.000Z', erpRows: 0 },
      reason: 'row model ready',
      recommendedAction: 'readonly only',
      semanticLock: subject.financeSemanticLockFor('BALANCE_SHEET'),
    };
    const extractor = {
      key: 'BALANCE_SHEET',
      label: '资产负债表关键项',
      status: 'READY',
      authorityEligible: false,
      sourceEntityTypes: ['BALANCE_SHEET'],
      sampleRows: 50,
      latestPulledAt: '2026-07-20T00:00:00.000Z',
      fieldCandidates: [
        { semanticField: 'line_no', candidatePaths: [{ path: '$.lineNo', sampleType: 'number', sampleValue: '1', observedCount: 1 }], required: true, status: 'FOUND' },
        { semanticField: 'ending_amount', candidatePaths: [{ path: '$.asset.baseEndingBalance', sampleType: 'number', sampleValue: '100', observedCount: 1 }], required: true, status: 'FOUND' },
      ],
      extractedFields: 2,
      requiredFields: 2,
      missingRequiredFields: [],
      reason: 'ready',
      nextAction: 'readonly',
    };

    const metric = subject.buildFinanceReadModelMetric(item, extractor);

    expect(item.semanticLock).toMatchObject({ status: 'LOCKED', authorityEligible: false, pendingFields: [] });
    expect(metric).toMatchObject({
      status: 'READONLY_READY',
      authorityEligible: false,
      displayValue: null,
      valueSource: 'chanjet_entity_snapshots.BALANCE_SHEET.rawData semantic rows',
      missingRequiredFields: [],
    });
  });

  it('marks vouchers readonly-ready only when header and line adapters are both complete', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const mappedFields = [
      'voucherId', 'voucherNo', 'bookId', 'period', 'voucherDate', 'postingDate', 'status', 'summary',
      'maker', 'reviewer', 'lineNo', 'subjectCode', 'subjectName', 'debitAmount', 'creditAmount',
      'currency', 'counterpartyName', 'projectName', 'departmentName',
    ];
    subject.financeReadonlyFieldAdaptersOverview = jest.fn().mockResolvedValue({
      adapters: [
        {
          adapterKey: 'CHANJET_VOUCHER_HEADER',
          status: 'READY',
          mappedFields: mappedFields.slice(0, 10),
          sampleRows: 60,
          latestPulledAt: '2026-07-20T00:00:00.000Z',
        },
        {
          adapterKey: 'CHANJET_VOUCHER_LINE',
          status: 'READY',
          mappedFields: mappedFields.slice(10),
          sampleRows: 160,
          latestPulledAt: '2026-07-20T00:00:01.000Z',
        },
      ],
    });

    const result = await subject.buildFinanceSemanticExtractor(subject.financeSemanticLockFor('VOUCHER_LIST'));

    expect(result).toMatchObject({
      key: 'VOUCHER_LIST',
      status: 'READY',
      authorityEligible: false,
      sampleRows: 220,
      missingRequiredFields: [],
    });
    expect(result.fieldCandidates).toHaveLength(19);
  });

  it('locks receipt direction from the direction-specific Chanjet entity contract', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.entitySnapshotRepo = {
      find: jest.fn().mockResolvedValue([{
        rawData: {
          bizDate: '2026-07-20',
          approvedDate: '2026-07-20',
          voucherStatusEnum: 'EFFECTIVE',
          totalAmount: '125.00',
        },
        updatedAt: new Date('2026-07-20T00:00:00.000Z'),
      }]),
    };

    const result = await subject.buildReceiptPaymentDateStatusLock(
      'TODAY_RECEIPT',
      '今日收款',
      'AR_RECEIPT',
    );

    expect(result.status).toBe('LOCKED');
    expect(result.missingDimensions).toEqual([]);
    expect(result.safeQueryFilter.direction).toBe('derived_from_PAYMENT_AR_AR_RECEIPT_contract');
    expect(result.fieldCandidates.find((item: any) => item.semanticField === 'direction')).toMatchObject({
      status: 'FOUND',
      candidatePaths: [{
        path: '$.__derived.entityTypeDirection',
        sampleValue: 'RECEIPT',
        observedCount: 1,
      }],
    });
    expect(result.readyForFinanceReview).toBe(true);
    expect(result.readyForCardAuthority).toBe(false);
  });

  it('advances the read model gate after both receipt and payment locks are complete', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.financeReconciliationOverview = jest.fn().mockResolvedValue({ items: [] });
    subject.financeSemanticExtractorsOverview = jest.fn().mockResolvedValue({ extractors: [] });
    subject.financeReceiptPaymentDateStatusLockOverview = jest.fn().mockResolvedValue({
      locks: [{ status: 'LOCKED' }, { status: 'LOCKED' }],
    });
    subject.financeReceiptPaymentDailyReconciliationOverview = jest.fn().mockResolvedValue({ metrics: [] });

    const result = await subject.financeReadModelOverview();

    expect(result.summary.nextGate).toBe('CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING');
    expect(result.guardrails).toMatchObject({ chanjetWrite: false, voucherPush: false });
  });

  it('promotes system-reconciled daily receipts into the read model', () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const metric = subject.buildFinanceReadModelMetric(
      {
        key: 'TODAY_RECEIPT',
        label: '今日收款',
        priority: 'P0',
        chanjetEntityTypes: ['AR_RECEIPT'],
        chanjetValue: 9999,
        erpValue: 100,
        status: 'NEED_MANUAL_REVIEW',
        evidence: { chanjetRows: 3, latestPulledAt: '2026-07-20T00:00:00.000Z', erpRows: 1 },
        semanticLock: { authorityEligible: false, pendingFields: ['direction'] },
      },
      { status: 'PARTIAL', authorityEligible: false, sampleRows: 3, missingRequiredFields: ['direction'], fieldCandidates: [] },
      {
        key: 'TODAY_RECEIPT',
        entityType: 'AR_RECEIPT',
        status: 'AUTHORITY_READY',
        amount: 125.5,
        sourceRows: 3,
        latestPulledAt: '2026-07-20T00:01:00.000Z',
        readyForCardAuthority: true,
        sourceFields: {
          businessDate: 'rawData.bizDate',
          status: 'rawData.voucherStatusEnum',
          amount: 'rawData.totalAmount',
          direction: 'entity_type_contract',
        },
        reason: 'system daily reconciliation passed',
        nextAction: 'keep readonly reconciliation',
      },
    );

    expect(metric).toMatchObject({
      status: 'AUTHORITY_READY',
      displayValue: 125.5,
      missingRequiredFields: [],
      reason: 'system daily reconciliation passed',
    });
    expect(metric.valueSource).toContain('rawData.bizDate/voucherStatusEnum/totalAmount');
  });

  it('closes authority wiring and advances locked receipt/payment cards to daily reconciliation', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.financeReadModelOverview = jest.fn().mockResolvedValue({
      summary: { nextGate: 'CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING' },
      metrics: [
        { key: 'AR_OPEN', status: 'AUTHORITY_READY', displayValue: 100, sourceEntityTypes: ['AR_STATISTICS'] },
        { key: 'AP_OPEN', status: 'AUTHORITY_READY', displayValue: 80, sourceEntityTypes: ['AP_STATISTICS'] },
        { key: 'TODAY_RECEIPT', status: 'NEED_MANUAL_REVIEW', sourceEntityTypes: ['AR_RECEIPT'] },
        { key: 'TODAY_PAYMENT', status: 'NEED_MANUAL_REVIEW', sourceEntityTypes: ['AP_PAYMENT'] },
      ],
    });
    subject.financeReceiptPaymentDateStatusLockOverview = jest.fn().mockResolvedValue({
      locks: [
        { key: 'TODAY_RECEIPT', status: 'LOCKED', readyForCardAuthority: false, reason: 'daily reconciliation required' },
        { key: 'TODAY_PAYMENT', status: 'LOCKED', readyForCardAuthority: false, reason: 'daily reconciliation required' },
      ],
    });
    subject.financeReceiptPaymentDailyReconciliationOverview = jest.fn().mockResolvedValue({
      businessDate: '2026-07-20',
      summary: { authorityReady: 0 },
      metrics: [
        { key: 'TODAY_RECEIPT', status: 'WAITING_SAMPLE', readyForCardAuthority: false, reason: 'daily evidence required' },
        { key: 'TODAY_PAYMENT', status: 'WAITING_SAMPLE', readyForCardAuthority: false, reason: 'daily evidence required' },
      ],
    });

    const result = await subject.financeCardAuthorityOverview();

    expect(result.summary).toMatchObject({
      authorityReady: 2,
      authorityWiringVerified: true,
      nextGate: 'CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION',
    });
    expect(result.cards.find((card: any) => card.cardKey === 'todayInflow')).toMatchObject({
      authorityEnabled: false,
      receiptPaymentLockStatus: 'LOCKED',
    });
    expect(result.guardrails).toMatchObject({
      todayAmountAggregation: 'blocked_until_daily_filter_and_status_reconciliation',
      chanjetWrite: false,
    });
  });

  it('reconciles receipt and payment by bizDate and EFFECTIVE status only', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const now = new Date();
    const row = (entityType: string, externalId: string, rawData: Record<string, unknown>) => ({
      id: externalId,
      bookId: 'BOOK-1',
      entityType,
      externalId,
      externalCode: externalId,
      rawData,
      updatedAt: now,
    });
    subject.entitySnapshotRepo = {
      find: jest.fn().mockImplementation(({ where }: any) => where.entityType === 'AR_RECEIPT'
        ? [
            row('AR_RECEIPT', 'R-1', { bizDate: '2026-07-20', voucherStatusEnum: 'EFFECTIVE', totalAmount: '125.50', approvedDate: '2026-07-20' }),
            row('AR_RECEIPT', 'R-2', { bizDate: '2026-07-20', voucherStatusEnum: 'SUBMITTED' }),
            row('AR_RECEIPT', 'R-3', { bizDate: '2026-07-19', voucherStatusEnum: 'EFFECTIVE', approvedDate: '2026-07-20' }),
          ]
        : [
            row('AP_PAYMENT', 'P-1', { bizDate: '2026-07-20', voucherStatusEnum: 'EFFECTIVE', totalAmount: '80.00', approvedDate: '2026-07-20' }),
            row('AP_PAYMENT', 'P-2', { bizDate: '2026-07-20', voucherStatusEnum: 'CANCELLED', totalAmount: '10.00' }),
          ]),
    };

    const result = await subject.financeReceiptPaymentDailyReconciliationOverview('2026-07-20');

    expect(result.decision).toBe('GO');
    expect(result.summary).toMatchObject({ authorityReady: 2, effectiveRows: 2, excludedRows: 2 });
    expect(result.metrics.find((metric: any) => metric.key === 'TODAY_RECEIPT')).toMatchObject({
      amount: 125.5,
      effectiveRows: 1,
      excludedByStatus: { SUBMITTED: 1 },
      readyForCardAuthority: true,
      sourceFields: {
        businessDate: 'rawData.bizDate',
        status: 'rawData.voucherStatusEnum',
        amount: 'rawData.totalAmount',
        direction: 'entity_type_contract',
      },
    });
    expect(result.metrics.find((metric: any) => metric.key === 'TODAY_PAYMENT')).toMatchObject({
      amount: 80,
      excludedByStatus: { CANCELLED: 1 },
      readyForCardAuthority: true,
    });
    expect(result.guardrails).toMatchObject({ chanjetWrite: false, dbWrite: false, effectiveStatus: 'EFFECTIVE' });
  });

  it('fails closed when an EFFECTIVE row on the requested day has no valid amount', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const now = new Date();
    subject.entitySnapshotRepo = {
      find: jest.fn().mockImplementation(({ where }: any) => [{
        id: `${where.entityType}-1`,
        bookId: 'BOOK-1',
        entityType: where.entityType,
        externalId: `${where.entityType}-1`,
        externalCode: `${where.entityType}-1`,
        rawData: where.entityType === 'AR_RECEIPT'
          ? { bizDate: '2026-07-20', voucherStatusEnum: 'EFFECTIVE' }
          : { bizDate: '2026-07-20', voucherStatusEnum: 'EFFECTIVE', totalAmount: '80.00' },
        updatedAt: now,
      }]),
    };

    const result = await subject.financeReceiptPaymentDailyReconciliationOverview('2026-07-20');

    expect(result.decision).toBe('HOLD');
    expect(result.metrics.find((metric: any) => metric.key === 'TODAY_RECEIPT')).toMatchObject({
      status: 'HOLD',
      invalidContractRows: 1,
      readyForCardAuthority: false,
    });
  });

  it('switches reconciled daily receipt/payment cards without using cumulative totals', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.financeReadModelOverview = jest.fn().mockResolvedValue({
      metrics: [
        { key: 'AR_OPEN', status: 'AUTHORITY_READY', displayValue: 100, erpAuxiliaryValue: 90, sourceEntityTypes: ['AR_STATISTICS'] },
        { key: 'AP_OPEN', status: 'AUTHORITY_READY', displayValue: 80, erpAuxiliaryValue: 70, sourceEntityTypes: ['AP_STATISTICS'] },
        { key: 'TODAY_RECEIPT', status: 'NEED_MANUAL_REVIEW', displayValue: 9999, erpAuxiliaryValue: 10, sourceEntityTypes: ['AR_RECEIPT'] },
        { key: 'TODAY_PAYMENT', status: 'NEED_MANUAL_REVIEW', displayValue: 8888, erpAuxiliaryValue: 20, sourceEntityTypes: ['AP_PAYMENT'] },
      ],
    });
    subject.financeReceiptPaymentDateStatusLockOverview = jest.fn().mockResolvedValue({
      locks: [
        { key: 'TODAY_RECEIPT', status: 'LOCKED', readyForCardAuthority: false },
        { key: 'TODAY_PAYMENT', status: 'LOCKED', readyForCardAuthority: false },
      ],
    });
    subject.financeReceiptPaymentDailyReconciliationOverview = jest.fn().mockResolvedValue({
      businessDate: '2026-07-20',
      summary: { authorityReady: 2 },
      metrics: [
        { key: 'TODAY_RECEIPT', entityType: 'AR_RECEIPT', businessDate: '2026-07-20', status: 'AUTHORITY_READY', amount: 125.5, readyForCardAuthority: true },
        { key: 'TODAY_PAYMENT', entityType: 'AP_PAYMENT', businessDate: '2026-07-20', status: 'AUTHORITY_READY', amount: 80, readyForCardAuthority: true },
      ],
    });

    const result = await subject.financeCardAuthorityOverview();

    expect(result.summary).toMatchObject({ authorityReady: 4, nextGate: 'CHANJET_P3_CASH_BALANCE_FIELD_LOCK' });
    expect(result.cards.find((card: any) => card.cardKey === 'todayInflow')).toMatchObject({
      authorityEnabled: true,
      displayValue: 125.5,
      businessDate: '2026-07-20',
    });
    expect(result.cards.find((card: any) => card.cardKey === 'todayOutflow')).toMatchObject({
      authorityEnabled: true,
      displayValue: 80,
    });
    expect(result.guardrails.todayAmountAggregation).toContain('rawData.bizDate');
  });

  it('locks cash balance to latest-period 1001/1002 leaf base balances', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const now = new Date();
    const gl = (
      id: string,
      bookId: string,
      period: string,
      glAccountCode: string,
      baseEndingBalance: number,
      currency = '',
      endingBalance = 0,
      leaf = true,
    ) => ({
      id,
      bookId,
      entityType: 'GL_BALANCE',
      externalId: id,
      period,
      rawData: {
        glAccountCode,
        glAccountName: `科目-${glAccountCode}`,
        baseEndingBalance,
        endingBalance,
        currency,
        leaf,
      },
      updatedAt: now,
    });
    subject.accountBookRepo = {
      find: jest.fn().mockResolvedValue([
        { bookId: 'BOOK-1', companyCode: 'COMP-1', bookName: '账套 1', enabled: true },
        { bookId: 'BOOK-2', companyCode: 'COMP-2', bookName: '账套 2', enabled: true },
      ]),
    };
    subject.entitySnapshotRepo = {
      find: jest.fn().mockImplementation(({ where }: any) => where.entityType === 'CASH_ACCOUNT'
        ? [{
            id: 'ACCOUNT-1',
            bookId: 'BOOK-1',
            entityType: 'CASH_ACCOUNT',
            rawData: { accountName: '库存现金', currencyCode: 'CNY' },
            updatedAt: now,
          }]
        : [
            gl('OLD-1', 'BOOK-1', '202606', '100101', 999),
            gl('PARENT-1', 'BOOK-1', '202607', '1001', 999, '', 0, false),
            gl('GL-1', 'BOOK-1', '202607', '100101', 100),
            gl('GL-2', 'BOOK-1', '202607', '100201', -20),
            gl('GL-3', 'BOOK-1', '202607', '100202', 50, 'LAK', 150000),
            gl('GL-4', 'BOOK-2', '202607', '100101', 30),
            gl('OTHER-1', 'BOOK-2', '202607', '220201', 500),
          ]),
    };

    const result = await subject.financeCashBalanceFieldLockOverview();

    expect(result.lock).toMatchObject({
      status: 'AUTHORITY_READY',
      readyForCardAuthority: true,
      totalBaseBalance: 160,
      eligibleBalanceRows: 4,
      invalidContractRows: 0,
      duplicateContractRows: 0,
      coveredBooks: 2,
      requiredBooks: 2,
      sourceFields: {
        baseBalance: 'rawData.baseEndingBalance',
        originalBalance: 'rawData.endingBalance',
      },
    });
    expect(result.lock.currencyBalances).toEqual(expect.arrayContaining([
      { currency: 'CNY', amount: 110, rows: 3 },
      { currency: 'LAK', amount: 150000, rows: 1 },
    ]));
  });

  it('uses the account-book-scoped master mapping key for a new readonly source identity', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.mappingRepo = {
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
    };

    await subject.upsertMasterMapping({
      mappingType: 'PROJECT',
      bookId: 'BOOK-1',
      erpCode: '',
      chanjetId: 'PROJECT-1',
      chanjetCode: 'PROJECT-1',
      chanjetName: 'Project 1',
    });

    expect(subject.mappingRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingType: 'PROJECT',
        bookId: 'BOOK-1',
        chanjetId: 'PROJECT-1',
      }),
      expect.objectContaining({
        conflictPaths: ['mappingType', 'bookId', 'erpCode', 'chanjetId'],
      }),
    );
  });

  it('preserves an approved ERP mapping when readonly refresh observes the same Chanjet source', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const approved = {
      mappingType: 'CASH_ACCOUNT',
      bookId: 'BOOK-1',
      erpCode: 'BANK-001',
      erpName: '银行账户',
      chanjetId: 'CJ-ACCOUNT-1',
      chanjetCode: '100201',
      chanjetName: '旧名称',
      matchStatus: 'MATCHED',
      confidence: '1.00',
      reviewStatus: 'APPROVED',
      reviewedBy: 'finance-admin',
      reviewedAt: new Date('2026-07-01T00:00:00Z'),
      rawData: { old: true },
      updatedAt: new Date(),
    };
    subject.mappingRepo = {
      find: jest.fn().mockResolvedValue([approved]),
      save: jest.fn().mockImplementation(async (value) => value),
      upsert: jest.fn(),
    };

    await subject.upsertMasterMapping({
      mappingType: 'CASH_ACCOUNT',
      bookId: 'BOOK-1',
      erpCode: '',
      chanjetId: 'CJ-ACCOUNT-1',
      chanjetCode: '100201',
      chanjetName: '最新名称',
      matchStatus: 'PENDING',
      reviewStatus: 'PENDING',
      rawData: { fresh: true },
    });

    expect(subject.mappingRepo.upsert).not.toHaveBeenCalled();
    expect(subject.mappingRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      erpCode: 'BANK-001',
      erpName: '银行账户',
      chanjetName: '最新名称',
      matchStatus: 'MATCHED',
      reviewStatus: 'APPROVED',
      reviewedBy: 'finance-admin',
      rawData: { fresh: true },
    }));
  });

  it('fails closed when one Chanjet source has multiple approved ERP targets', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.mappingRepo = {
      find: jest.fn().mockResolvedValue([
        {
          mappingType: 'CASH_ACCOUNT', bookId: 'BOOK-1', chanjetId: 'CJ-1',
          erpCode: 'BANK-1', reviewStatus: 'APPROVED', matchStatus: 'MATCHED',
        },
        {
          mappingType: 'CASH_ACCOUNT', bookId: 'BOOK-1', chanjetId: 'CJ-1',
          erpCode: 'BANK-2', reviewStatus: 'APPROVED', matchStatus: 'MATCHED',
        },
      ]),
      save: jest.fn(),
      upsert: jest.fn(),
    };

    await expect(subject.upsertMasterMapping({
      mappingType: 'CASH_ACCOUNT',
      bookId: 'BOOK-1',
      chanjetId: 'CJ-1',
    })).rejects.toThrow('CHANJET_MAPPING_SOURCE_IDENTITY_CONFLICT');
    expect(subject.mappingRepo.save).not.toHaveBeenCalled();
    expect(subject.mappingRepo.upsert).not.toHaveBeenCalled();
  });

  it('accepts a legitimate exact zero cash balance', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const now = new Date();
    subject.accountBookRepo = {
      find: jest.fn().mockResolvedValue([
        { bookId: 'BOOK-1', companyCode: 'COMP-1', bookName: '账套 1', enabled: true },
      ]),
    };
    subject.entitySnapshotRepo = {
      find: jest.fn().mockImplementation(({ where }: any) => where.entityType === 'CASH_ACCOUNT' ? [] : [{
        id: 'GL-ZERO',
        bookId: 'BOOK-1',
        entityType: 'GL_BALANCE',
        externalId: 'GL-ZERO',
        period: '202607',
        rawData: {
          glAccountCode: '100101',
          glAccountName: '库存现金',
          baseEndingBalance: 0,
          endingBalance: 0,
          currency: '',
          leaf: true,
        },
        updatedAt: now,
      }]),
    };

    const result = await subject.financeCashBalanceFieldLockOverview();

    expect(result.lock).toMatchObject({
      status: 'AUTHORITY_READY',
      readyForCardAuthority: true,
      totalBaseBalance: 0,
      blockerReasons: [],
    });
  });

  it('fails cash balance closed for duplicate rows or missing enabled books', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const now = new Date();
    const duplicate = (id: string) => ({
      id,
      bookId: 'BOOK-1',
      entityType: 'GL_BALANCE',
      externalId: id,
      period: '202607',
      rawData: {
        glAccountCode: '100101',
        glAccountName: '库存现金',
        baseEndingBalance: 10,
        endingBalance: 0,
        currency: '',
        leaf: true,
      },
      updatedAt: now,
    });
    subject.accountBookRepo = {
      find: jest.fn().mockResolvedValue([
        { bookId: 'BOOK-1', companyCode: 'COMP-1', bookName: '账套 1', enabled: true },
        { bookId: 'BOOK-2', companyCode: 'COMP-2', bookName: '账套 2', enabled: true },
      ]),
    };
    subject.entitySnapshotRepo = {
      find: jest.fn().mockImplementation(({ where }: any) => where.entityType === 'CASH_ACCOUNT'
        ? []
        : [duplicate('GL-1'), duplicate('GL-2')]),
    };

    const result = await subject.financeCashBalanceFieldLockOverview();

    expect(result.decision).toBe('HOLD');
    expect(result.lock.readyForCardAuthority).toBe(false);
    expect(result.lock.totalBaseBalance).toBeNull();
    expect(result.lock.blockerReasons).toEqual(expect.arrayContaining([
      'duplicate_cash_balance_contract_rows:2',
      'missing_cash_balance_books:BOOK-2',
    ]));
  });

  it('validates balanced voucher candidates without enabling Chanjet push', () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const result = subject.validateVoucherDraftInput({
      sourceBizType: 'PROCUREMENT_PAYMENT',
      sourceBizId: 'PAY-001',
      voucherLines: [
        { subjectCode: '100201', summary: '采购付款', debitAmount: 120.5, creditAmount: 0 },
        { subjectCode: '220201', summary: '采购付款', debitAmount: 0, creditAmount: 120.5 },
      ],
    });

    expect(result).toMatchObject({
      valid: true,
      debitTotal: '120.50',
      creditTotal: '120.50',
      pushEnabled: false,
      errors: [],
    });
  });

  it('fails closed for unbalanced voucher candidates', () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const result = subject.validateVoucherDraftInput({
      sourceBizType: 'PROCUREMENT_PAYMENT',
      sourceBizId: 'PAY-002',
      voucherLines: [
        { subjectCode: '100201', summary: '不平分录', debitAmount: 100, creditAmount: 0 },
        { subjectCode: '220201', summary: '不平分录', debitAmount: 0, creditAmount: 90 },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.pushEnabled).toBe(false);
    expect(result.errors.join(' ')).toContain('借贷不平');
  });

  it('keeps PUSH_READY as an internal candidate state with push disabled', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const draft: any = {
      id: '1',
      sourceBizType: 'PROCUREMENT_PAYMENT',
      sourceBizId: 'PAY-003',
      status: 'APPROVED',
      pushAllowed: false,
      createdBy: 'maker',
      approvedBy: 'approver',
      approvedAt: new Date(),
      rawData: {},
      voucherLines: [
        { subjectCode: '100201', summary: '付款', debitAmount: 100, creditAmount: 0 },
        { subjectCode: '220201', summary: '付款', debitAmount: 0, creditAmount: 100 },
      ],
    };
    subject.voucherDraftRepo = {
      findOneBy: jest.fn().mockResolvedValue(draft),
      save: jest.fn((value) => Promise.resolve(value)),
    };

    const result = await subject.updateVoucherDraftStatus('1', 'PUSH_READY', 'reviewer');

    expect(result.status).toBe('PUSH_READY');
    expect(result.pushAllowed).toBe(false);
  });

  it('enforces maker and reviewer separation', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.voucherDraftRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: '2',
        sourceBizType: 'PROCUREMENT_PAYMENT',
        sourceBizId: 'PAY-004',
        status: 'VALIDATED',
        createdBy: 'maker',
        validatedAt: new Date(),
        rawData: {},
        voucherLines: [
          { subjectCode: '100201', debitAmount: 100, creditAmount: 0 },
          { subjectCode: '220201', debitAmount: 0, creditAmount: 100 },
        ],
      }),
      save: jest.fn(),
    };

    await expect(subject.updateVoucherDraftStatus('2', 'REVIEWED', 'maker'))
      .rejects.toThrow('VOUCHER_DUAL_CONTROL_REQUIRED');
  });

  it('prepares one idempotent ERP-only outbox record without external transport', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const draft = {
      id: '3',
      sourceBizType: 'PROCUREMENT_PAYMENT',
      sourceBizId: 'PAY-005',
      companyCode: 'COMP-1',
      bookId: 'BOOK-1',
      period: '202607',
      title: '采购付款',
      voucherLines: [
        { subjectCode: '100201', debitAmount: 100, creditAmount: 0 },
        { subjectCode: '220201', debitAmount: 0, creditAmount: 100 },
      ],
      status: 'PUSH_READY',
      approvedBy: 'approver',
      approvedAt: new Date(),
      idempotencyKey: 'idem-1',
      payloadHash: '',
    };
    draft.payloadHash = subject.hashVoucherPayload(draft);
    subject.voucherDraftRepo = { findOneBy: jest.fn().mockResolvedValue(draft) };
    subject.writebackOutboxRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve({ id: '9', ...value })),
    };

    const result = await subject.prepareVoucherWritebackOutbox('3', 'operator');

    expect(result).toMatchObject({
      idempotencyKey: 'idem-1',
      state: 'READY',
      externalWriteEnabled: false,
    });
  });

  it('reports writeback preparation ready while external transport remains disabled', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.voucherDraftRepo = {
      count: jest.fn().mockResolvedValue(0),
    };
    subject.writebackOutboxRepo = {
      count: jest.fn().mockResolvedValue(0),
    };

    const result = await subject.writebackPreparationOverview();

    expect(result).toMatchObject({
      decision: 'GO_WITH_CONDITIONS',
      externalWriteEnabled: false,
      externalNetworkTransportImplemented: false,
      unsafeDrafts: 0,
      unsafeOutbox: 0,
      nextGate: 'CHANJET_WAVE_7_EXTERNAL_MINIMAL_WRITE_APPROVAL',
    });
  });

  it('moves retryable provider simulation to dead letter after the bounded retry budget', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const outbox = {
      id: '11',
      state: 'RETRYABLE',
      attemptCount: 2,
      maxAttempts: 3,
      payloadHash: 'payload',
      externalWriteEnabled: false,
      stateHistory: [],
    };
    subject.writebackOutboxRepo = {
      findOneBy: jest.fn().mockResolvedValue(outbox),
      save: jest.fn((value) => Promise.resolve(value)),
    };

    const result = await subject.simulateWritebackOutbox('11', 'RETRYABLE', 'operator');

    expect(result).toMatchObject({
      state: 'DEAD_LETTER',
      attemptCount: 3,
      externalWriteEnabled: false,
      nextAttemptAt: null,
    });
    expect(result.providerReceipt).toMatchObject({ simulator: true, externalNetworkCalled: false });
  });

  it('simulates a reversible provider receipt without calling the provider', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const outbox = {
      id: '12',
      state: 'ACKNOWLEDGED',
      attemptCount: 1,
      maxAttempts: 3,
      payloadHash: 'payload',
      externalWriteEnabled: false,
      providerReceipt: { outcome: 'ACKNOWLEDGED', attempt: 1 },
      stateHistory: [],
    };
    subject.writebackOutboxRepo = {
      findOneBy: jest.fn().mockResolvedValue(outbox),
      save: jest.fn((value) => Promise.resolve(value)),
    };

    const result = await subject.simulateWritebackOutbox('12', 'REVERSED', 'operator');

    expect(result).toMatchObject({ state: 'REVERSED', externalWriteEnabled: false });
    expect(result.compensationRef).toBe('STUB-REVERSAL-12-2');
    expect(result.providerReceipt).toMatchObject({ simulator: true, externalNetworkCalled: false });
  });

  it('holds an incomplete Wave 7 external approval package without any provider call', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.writebackOutboxRepo = { findOneBy: jest.fn() };
    subject.voucherDraftRepo = { findOneBy: jest.fn() };

    const result = await subject.precheckExternalMinimalWriteApproval({
      decision: 'APPROVE',
      environmentType: 'STAGING',
    });

    expect(result.decision).toBe('HOLD');
    expect(result.missingFields).toContain('targetOutboxId');
    expect(result.externalWriteEnabled).toBe(false);
    expect(result.externalNetworkCalled).toBe(false);
    expect(subject.writebackOutboxRepo.findOneBy).not.toHaveBeenCalled();
  });

  it('holds an expired Wave 7 approval package even when the approval is explicit', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.writebackOutboxRepo = { findOneBy: jest.fn().mockResolvedValue(null) };
    subject.voucherDraftRepo = { findOneBy: jest.fn() };
    const expired = new Date(Date.now() - 60_000).toISOString();

    const result = await subject.precheckExternalMinimalWriteApproval({
      approvalId: 'CHANJET-W7-EXPIRED',
      decision: 'APPROVE',
      targetOutboxId: '404',
      environmentName: 'staging',
      environmentType: 'STAGING',
      bookId: 'BOOK-1',
      bookName: '测试账套',
      companyCode: 'COMP-1',
      sourceBusinessType: 'PROCUREMENT_PAYMENT',
      sourceBusinessId: 'PAY-1',
      documentType: 'VOUCHER',
      payloadHash: 'a'.repeat(64),
      debitTotal: '100.00',
      creditTotal: '100.00',
      currency: 'CNY',
      period: '202607',
      maker: 'maker',
      reviewer: 'reviewer',
      operator: 'operator',
      idempotencyKey: 'idem-1',
      readback: { method: 'GET', endpoint: '/accounting/readback', expectedIdentity: 'PAY-1', expectedStatus: 'posted', expectedAmount: '100.00' },
      compensation: { method: 'REVERSAL_VOUCHER', owner: 'reviewer' },
      executionWindow: { startsAt: expired, endsAt: expired, expiresAt: expired },
      stopRules: ['timeout', 'mismatch', 'duplicate', 'missing receipt'],
      providerContractConfirmed: true,
      approvedBy: 'owner',
      approvedAt: expired,
    });

    expect(result.decision).toBe('HOLD');
    expect(result.conflicts.join(' ')).toContain('expired');
    expect(result.externalNetworkCalled).toBe(false);
  });

  it('marks one exact Wave 7 approval package ready for A2/A1/A7 review only', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    const now = Date.now();
    const draft = {
      id: '31',
      sourceBizType: 'PROCUREMENT_PAYMENT',
      sourceBizId: 'PAY-031',
      companyCode: 'COMP-1',
      bookId: 'BOOK-1',
      period: '202607',
      title: '单笔受控验证',
      voucherLines: [
        { subjectCode: '100201', debitAmount: 100, creditAmount: 0 },
        { subjectCode: '220201', debitAmount: 0, creditAmount: 100 },
      ],
      status: 'PUSH_READY',
      pushAllowed: false,
      createdBy: 'maker',
      approvedBy: 'reviewer',
      approvedAt: new Date(now - 60_000),
    };
    const outbox = {
      id: '41',
      draftId: '31',
      state: 'READY',
      payloadHash: 'b'.repeat(64),
      idempotencyKey: 'idem-41',
      externalWriteEnabled: false,
    };
    subject.writebackOutboxRepo = { findOneBy: jest.fn().mockResolvedValue(outbox) };
    subject.voucherDraftRepo = { findOneBy: jest.fn().mockResolvedValue(draft) };

    const result = await subject.precheckExternalMinimalWriteApproval({
      approvalId: 'CHANJET-W7-CANARY-001',
      decision: 'APPROVE',
      targetOutboxId: '41',
      environmentName: 'chanjet-staging',
      environmentType: 'STAGING',
      bookId: 'BOOK-1',
      bookName: '受控验证账套',
      companyCode: 'COMP-1',
      sourceBusinessType: 'PROCUREMENT_PAYMENT',
      sourceBusinessId: 'PAY-031',
      documentType: 'VOUCHER',
      payloadHash: outbox.payloadHash,
      debitTotal: '100.00',
      creditTotal: '100.00',
      currency: 'CNY',
      period: '202607',
      maker: 'maker',
      reviewer: 'reviewer',
      operator: 'operator',
      idempotencyKey: outbox.idempotencyKey,
      readback: { method: 'GET', endpoint: '/accounting/voucher/readback', expectedIdentity: 'PAY-031', expectedStatus: 'posted', expectedAmount: '100.00' },
      compensation: { method: 'REVERSAL_VOUCHER', owner: 'reviewer' },
      executionWindow: {
        startsAt: new Date(now + 10 * 60_000).toISOString(),
        endsAt: new Date(now + 40 * 60_000).toISOString(),
        expiresAt: new Date(now + 50 * 60_000).toISOString(),
      },
      stopRules: ['timeout means HOLD', 'amount mismatch means HOLD', 'duplicate means HOLD', 'missing receipt means HOLD'],
      providerContractConfirmed: true,
      approvedBy: 'business-owner',
      approvedAt: new Date(now - 60_000).toISOString(),
    });

    expect(result).toMatchObject({
      decision: 'READY_FOR_A2_A1_A7_REVIEW',
      missingFields: [],
      conflicts: [],
      externalWriteEnabled: false,
      externalNetworkCalled: false,
      nextGate: 'CHANJET_WAVE_7_A2_A1_A7_PRE_EXECUTION_REVIEW',
    });
    expect(result.evidence).toMatchObject({
      outboxId: '41',
      draftId: '31',
      payloadHashMatched: true,
      idempotencyKeyMatched: true,
      debitTotal: '100.00',
      creditTotal: '100.00',
    });
  });
});
