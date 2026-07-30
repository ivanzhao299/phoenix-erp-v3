import {
  buildFinanceMasterGapProposals,
  buildWmsMasterGapProposals,
  summarizeMasterGapProposals,
} from './chanjet-erp-master-gap-closure';

describe('Chanjet ERP master gap closure proposals', () => {
  it('deduplicates the same finance identity across books without auto-creating masters', () => {
    const proposals = buildFinanceMasterGapProposals([
      {
        domain: 'PROJECT',
        bookId: 'BOOK-1',
        companyCode: 'COMP-1',
        sourceId: 'PROJECT-1',
        sourceCode: 'P001',
        sourceName: '试点项目',
        currency: '',
        closureState: 'ERP_MASTER_MISSING',
        blockerCode: 'ERP_MASTER_NOT_FOUND',
      },
      {
        domain: 'PROJECT',
        bookId: 'BOOK-2',
        companyCode: 'COMP-1',
        sourceId: 'PROJECT-2',
        sourceCode: 'P001',
        sourceName: '试点项目',
        currency: '',
        closureState: 'ERP_MASTER_MISSING',
        blockerCode: 'ERP_MASTER_NOT_FOUND',
      },
    ]);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      sourceDomain: 'PROJECT',
      sourceCount: 2,
      targetTable: 'biz_projects',
      autoCreateAllowed: false,
      requiresApproval: true,
    });
  });

  it('keeps cash-account proposals separated by currency and forbids balance inference', () => {
    const base = {
      domain: 'CASH_ACCOUNT',
      bookId: 'BOOK-1',
      companyCode: 'COMP-1',
      sourceId: 'ACCOUNT-1',
      sourceCode: 'BANK-1',
      sourceName: '总部银行',
      closureState: 'ERP_MASTER_MISSING',
      blockerCode: 'ERP_MASTER_NOT_FOUND',
    };
    const proposals = buildFinanceMasterGapProposals([
      { ...base, currency: 'CNY' },
      { ...base, sourceId: 'ACCOUNT-2', currency: 'LAK' },
    ]);

    expect(proposals).toHaveLength(2);
    expect(proposals.every((proposal) => (
      proposal.riskLevel === 'HIGH'
      && proposal.acceptanceCriteria.some((criterion) => criterion.includes('balance is not inferred'))
    ))).toBe(true);
  });

  it('routes houses and packaging units to policy tables instead of fake masters', () => {
    const proposals = buildWmsMasterGapProposals([
      {
        id: '1',
        mappingType: 'WAREHOUSE',
        bookId: 'BOOK-1',
        companyCode: 'COMP-1',
        sourceCode: 'HOUSE-01',
        sourceName: '1号鸡舍',
        closureState: 'NEED_MAPPING',
        gapClass: 'HOUSE_INVENTORY_BRIDGE_REQUIRED',
        riskLevel: 'HIGH',
        suggestedEntityType: 'HOUSE',
        classificationReason: 'CHANJET_WAREHOUSE_DIMENSION_CONTAINS_BREEDING_HOUSE',
        nextAction: 'LINK_BRD_HOUSE_TO_CANONICAL_WMS_WAREHOUSE_LOCATION',
      },
      {
        id: '2',
        mappingType: 'UOM',
        bookId: 'BOOK-1',
        companyCode: 'COMP-1',
        sourceCode: '箱',
        sourceName: '箱',
        closureState: 'NEED_MAPPING',
        gapClass: 'SKU_UOM_CONVERSION_REQUIRED',
        riskLevel: 'HIGH',
        suggestedEntityType: 'UOM',
        classificationReason: 'PACKAGING_UOM_REQUIRES_PRODUCT_SPECIFIC_CONVERSION_FACTOR',
        nextAction: 'DEFINE_SKU_UOM_CONVERSION_BEFORE_MAPPING',
      },
    ]);

    expect(proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gapClass: 'HOUSE_INVENTORY_BRIDGE_REQUIRED',
        targetTable: 'chanjet_wms_house_location_policies',
        autoCreateAllowed: false,
      }),
      expect.objectContaining({
        gapClass: 'SKU_UOM_CONVERSION_REQUIRED',
        targetTable: 'chanjet_wms_uom_conversion_policies',
        autoCreateAllowed: false,
      }),
    ]));
  });

  it('reports proposal groups and source rows separately', () => {
    const finance = buildFinanceMasterGapProposals([{
      domain: 'DEPARTMENT',
      bookId: 'BOOK-1',
      companyCode: 'COMP-1',
      sourceId: 'DEPT-1',
      sourceCode: 'D01',
      sourceName: '财务部',
      currency: '',
      closureState: 'ERP_MASTER_MISSING',
      blockerCode: 'ERP_MASTER_NOT_FOUND',
    }]);
    const wms = buildWmsMasterGapProposals([{
      id: '3',
      mappingType: 'PRODUCT',
      bookId: 'BOOK-1',
      companyCode: 'COMP-1',
      sourceCode: 'EGG-L',
      sourceName: 'L级鸡蛋',
      closureState: 'NEED_MAPPING',
      gapClass: 'PRODUCT_SKU_MODEL_REQUIRED',
      riskLevel: 'MEDIUM',
      suggestedEntityType: 'SKU',
      classificationReason: 'SOURCE_PRODUCT_REQUIRES_GRADE_AND_PACKAGING_SKU',
      nextAction: 'MAP_TO_OR_CREATE_CANONICAL_EGG_SKU',
    }]);

    expect(summarizeMasterGapProposals(finance, wms)).toMatchObject({
      proposalGroups: 2,
      sourceRows: 2,
      financeProposalGroups: 1,
      wmsProposalGroups: 1,
      autoCreateAllowed: 0,
      requiresApproval: 2,
    });
  });
});
