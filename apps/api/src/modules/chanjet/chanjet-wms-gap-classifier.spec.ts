import { classifyChanjetWmsGap } from './chanjet-wms-gap-classifier';

describe('classifyChanjetWmsGap', () => {
  it.each([
    ['1号鸡舍', 'HOUSE_INVENTORY_BRIDGE_REQUIRED', 'HOUSE'],
    ['万象仓库', 'WAREHOUSE_MASTER_CANDIDATE', 'WAREHOUSE'],
    ['冷库', 'WAREHOUSE_MASTER_CANDIDATE', 'WAREHOUSE'],
  ])('classifies warehouse identity %s without treating a house as a warehouse', (
    sourceName,
    gapClass,
    suggestedEntityType,
  ) => {
    expect(classifyChanjetWmsGap({
      mappingType: 'WAREHOUSE',
      sourceCode: '01',
      sourceName,
      mapped: false,
      conflict: false,
      exactTargetCount: 0,
    })).toMatchObject({ gapClass, suggestedEntityType, autoCloseEligible: false });
  });

  it.each([
    ['鸡蛋（大）', 'PRODUCT_SKU_MODEL_REQUIRED', 'SKU'],
    ['蛋鸡疫苗', 'MATERIAL_MASTER_CANDIDATE', 'MATERIAL'],
    ['淘汰鸡', 'LIVESTOCK_MASTER_REQUIRED', 'PRODUCT'],
  ])('classifies product identity %s into the correct ERP domain', (
    sourceName,
    gapClass,
    suggestedEntityType,
  ) => {
    expect(classifyChanjetWmsGap({
      mappingType: 'PRODUCT',
      sourceCode: 'P-1',
      sourceName,
      mapped: false,
      conflict: false,
      exactTargetCount: 0,
    })).toMatchObject({ gapClass, suggestedEntityType });
  });

  it.each([
    ['公斤', 'UOM_DEFINITION_CANDIDATE'],
    ['桶', 'SKU_UOM_CONVERSION_REQUIRED'],
    ['只', 'CONTEXTUAL_UOM_REQUIRED'],
  ])('keeps UOM %s fail-closed with an actionable class', (sourceName, gapClass) => {
    expect(classifyChanjetWmsGap({
      mappingType: 'UOM',
      sourceCode: sourceName,
      sourceName,
      mapped: false,
      conflict: false,
      exactTargetCount: 0,
    })).toMatchObject({ gapClass, autoCloseEligible: false });
  });

  it('allows only one exact active target to enter deterministic closure', () => {
    expect(classifyChanjetWmsGap({
      mappingType: 'PRODUCT',
      sourceCode: 'EGG-L',
      sourceName: 'L级鸡蛋',
      mapped: false,
      conflict: false,
      exactTargetCount: 1,
    })).toMatchObject({
      gapClass: 'EXISTING_TARGET_SELECTION_REQUIRED',
      autoCloseEligible: true,
      riskLevel: 'LOW',
    });
  });
});
