import { ChanjetIntegrationService } from './chanjet-integration.service';

describe('ChanjetIntegrationService field-gap helpers', () => {
  const service = Object.create(ChanjetIntegrationService.prototype) as any;

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

  it('routes mirror baseline debt to the actual unresolved condition', () => {
    expect(service.mirrorBaselineNextGate({
      missingReportTargets: 1,
      missingTargets: 1,
      staleTargets: 0,
      failedRecentJobs: 0,
    })).toBe('CHANJET_REPORT_ENDPOINT_PARAMETER_REPAIR');
    expect(service.mirrorBaselineNextGate({
      missingReportTargets: 0,
      missingTargets: 0,
      staleTargets: 2,
      failedRecentJobs: 0,
    })).toBe('CHANJET_STALE_READONLY_SCOPE_REFRESH');
    expect(service.mirrorBaselineNextGate({
      missingReportTargets: 0,
      missingTargets: 0,
      staleTargets: 0,
      failedRecentJobs: 0,
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
      erpCode: 'ERP-CASH-101',
      systemApprovalEligible: true,
    });
    expect(wrongCurrency).toMatchObject({
      status: 'NEED_MAPPING',
      erpCode: '',
      systemApprovalEligible: false,
    });
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
      status: 'NEED_MAPPING',
      systemApprovalEligible: false,
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
    expect(subject.runMappingReconciliation).toHaveBeenCalledTimes(1);
    expect(subject.productionReadinessOverview).toHaveBeenCalledTimes(1);
  });

  it('stops the readonly alignment cycle before mapping when mirror sync is HOLD', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.syncReadOnlyMirrorResilient = jest.fn().mockResolvedValue({
      decision: 'HOLD', results: [], attempts: 3, unresolvedFailures: [{ key: 'GL_BALANCE', bookId: 'B1', error: 'timeout' }],
    });
    subject.confirmDeterministicCounterpartyMappings = jest.fn();
    subject.runMappingReconciliation = jest.fn();
    subject.productionReadinessOverview = jest.fn();

    const result = await subject.runReadonlyAlignmentCycle('tester');

    expect(result).toMatchObject({ decision: 'HOLD', stoppedAt: 'READONLY_MIRROR' });
    expect(subject.confirmDeterministicCounterpartyMappings).not.toHaveBeenCalled();
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

  it('uses the verified daily receipt/payment contract in finance reconciliation', async () => {
    const subject: any = Object.create(ChanjetIntegrationService.prototype);
    subject.erpFinanceAggregate = jest.fn().mockResolvedValue({ available: true, value: 0, rows: 0 });
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
      status: 'REVIEWED',
      pushAllowed: false,
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
});
