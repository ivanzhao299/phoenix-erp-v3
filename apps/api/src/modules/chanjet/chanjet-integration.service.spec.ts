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

    expect(supplier.erpTable).toBe('mst_suppliers');
    expect(customer.erpTable).toBe('mst_customers');
    expect(ambiguous.erpTable).toBe('chanjet_master_mapping');
  });

  it('creates stable hash-based external IDs when Chanjet rows lack real IDs', () => {
    const one = service.normalizeExternalEntity({ subjectName: '甲', endbalance: 12.3 }, 'AP_STATISTICS', 0, 'PAYABLE_STATISTICS');
    const two = service.normalizeExternalEntity({ subjectName: '乙', endbalance: 45.6 }, 'AP_STATISTICS', 1, 'PAYABLE_STATISTICS');

    expect(one.externalId).toMatch(/^AP_STATISTICS:PAYABLE_STATISTICS:/);
    expect(two.externalId).toMatch(/^AP_STATISTICS:PAYABLE_STATISTICS:/);
    expect(one.externalId).not.toBe(two.externalId);
  });
});
