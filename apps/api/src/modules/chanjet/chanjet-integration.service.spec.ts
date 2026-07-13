import { ChanjetIntegrationService } from './chanjet-integration.service';

describe('ChanjetIntegrationService field-gap helpers', () => {
  const service = Object.create(ChanjetIntegrationService.prototype) as any;

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

  it('matches a counterparty by exact ERP code without auto-approving it', () => {
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
      requiresApproval: true,
      canAutoApprove: false,
    });
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
});
