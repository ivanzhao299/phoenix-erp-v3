export type ChanjetWmsGapMappingType = 'WAREHOUSE' | 'PRODUCT' | 'UOM';

export type ChanjetWmsGapClass =
  | 'CLOSED'
  | 'MAPPING_CONFLICT'
  | 'EXISTING_TARGET_SELECTION_REQUIRED'
  | 'WAREHOUSE_MASTER_CANDIDATE'
  | 'HOUSE_INVENTORY_BRIDGE_REQUIRED'
  | 'WAREHOUSE_CLASSIFICATION_REVIEW_REQUIRED'
  | 'PRODUCT_SKU_MODEL_REQUIRED'
  | 'MATERIAL_MASTER_CANDIDATE'
  | 'LIVESTOCK_MASTER_REQUIRED'
  | 'PRODUCT_MASTER_REVIEW_REQUIRED'
  | 'UOM_DEFINITION_CANDIDATE'
  | 'SKU_UOM_CONVERSION_REQUIRED'
  | 'CONTEXTUAL_UOM_REQUIRED';

export interface ChanjetWmsGapClassification {
  gapClass: ChanjetWmsGapClass;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedEntityType: 'WAREHOUSE' | 'HOUSE' | 'PRODUCT' | 'SKU' | 'MATERIAL' | 'UOM' | '';
  reason: string;
  nextAction: string;
  autoCloseEligible: boolean;
}

interface ClassifyChanjetWmsGapInput {
  mappingType: ChanjetWmsGapMappingType;
  sourceCode: string;
  sourceName: string;
  mapped: boolean;
  conflict: boolean;
  exactTargetCount: number;
}

const normalize = (value: string): string => String(value || '')
  .normalize('NFKC')
  .replace(/[\s\u3000（）()\-—_]+/g, '')
  .toLowerCase();

const includesAny = (value: string, patterns: RegExp[]): boolean => (
  patterns.some((pattern) => pattern.test(value))
);

/**
 * Classifies a source-only Chanjet WMS identity without mutating either system.
 * Classification is intentionally conservative: only one exact active ERP
 * target may be auto-closed by the existing mapping refresh.
 */
export function classifyChanjetWmsGap(
  input: ClassifyChanjetWmsGapInput,
): ChanjetWmsGapClassification {
  if (input.mapped) {
    return {
      gapClass: 'CLOSED',
      riskLevel: 'LOW',
      suggestedEntityType: '',
      reason: 'APPROVED_ERP_MAPPING_EXISTS',
      nextAction: 'NONE',
      autoCloseEligible: false,
    };
  }
  if (input.conflict) {
    return {
      gapClass: 'MAPPING_CONFLICT',
      riskLevel: 'HIGH',
      suggestedEntityType: '',
      reason: 'MULTIPLE_EXACT_ERP_TARGETS',
      nextAction: 'RESOLVE_MAPPING_CONFLICT',
      autoCloseEligible: false,
    };
  }
  if (input.exactTargetCount === 1) {
    return {
      gapClass: 'EXISTING_TARGET_SELECTION_REQUIRED',
      riskLevel: 'LOW',
      suggestedEntityType: input.mappingType,
      reason: 'ONE_EXACT_ACTIVE_ERP_TARGET_EXISTS',
      nextAction: 'REFRESH_AND_CONFIRM_EXACT_MAPPING',
      autoCloseEligible: true,
    };
  }

  const identity = normalize(`${input.sourceCode}${input.sourceName}`);
  if (input.mappingType === 'WAREHOUSE') {
    if (includesAny(identity, [/鸡舍/, /育雏舍/, /公鸡舍/, /栏舍/])) {
      return {
        gapClass: 'HOUSE_INVENTORY_BRIDGE_REQUIRED',
        riskLevel: 'HIGH',
        suggestedEntityType: 'HOUSE',
        reason: 'CHANJET_WAREHOUSE_DIMENSION_CONTAINS_BREEDING_HOUSE',
        nextAction: 'LINK_BRD_HOUSE_TO_CANONICAL_WMS_WAREHOUSE_LOCATION',
        autoCloseEligible: false,
      };
    }
    if (includesAny(identity, [/仓库/, /总仓/, /总库/, /粮仓/, /冷库/, /成品仓/, /原料仓/, /仓$/])) {
      return {
        gapClass: 'WAREHOUSE_MASTER_CANDIDATE',
        riskLevel: 'MEDIUM',
        suggestedEntityType: 'WAREHOUSE',
        reason: 'SOURCE_IDENTITY_HAS_WAREHOUSE_SEMANTICS',
        nextAction: 'CREATE_OR_ACTIVATE_COMPANY_WAREHOUSE_THEN_MAP',
        autoCloseEligible: false,
      };
    }
    return {
      gapClass: 'WAREHOUSE_CLASSIFICATION_REVIEW_REQUIRED',
      riskLevel: 'HIGH',
      suggestedEntityType: '',
      reason: 'SOURCE_WAREHOUSE_SEMANTICS_ARE_AMBIGUOUS',
      nextAction: 'CLASSIFY_AS_WAREHOUSE_HOUSE_OR_LOCATION',
      autoCloseEligible: false,
    };
  }

  if (input.mappingType === 'PRODUCT') {
    if (
      includesAny(identity, [/鸡苗/, /淘汰鸡/, /活鸡/, /蛋鸡/, /肉鸡/, /公鸡/, /母鸡/])
      && !includesAny(identity, [/疫苗/, /药/, /饲料/, /消毒/, /料$/])
    ) {
      return {
        gapClass: 'LIVESTOCK_MASTER_REQUIRED',
        riskLevel: 'HIGH',
        suggestedEntityType: 'PRODUCT',
        reason: 'SOURCE_PRODUCT_IS_LIVESTOCK_NOT_INVENTORY_SKU',
        nextAction: 'DEFINE_LIVESTOCK_PRODUCT_AND_WMS_ACCOUNTING_POLICY',
        autoCloseEligible: false,
      };
    }
    if (includesAny(identity, [
      /鸡蛋/, /鲜蛋/, /蛋品/, /种蛋/, /破损蛋/, /脏蛋/, /水洗蛋/,
      /红蛋/, /粉蛋/, /变蛋/, /咸蛋/, /号.*蛋/,
    ])) {
      return {
        gapClass: 'PRODUCT_SKU_MODEL_REQUIRED',
        riskLevel: 'MEDIUM',
        suggestedEntityType: 'SKU',
        reason: 'SOURCE_PRODUCT_REQUIRES_GRADE_AND_PACKAGING_SKU',
        nextAction: 'MAP_TO_OR_CREATE_CANONICAL_EGG_SKU',
        autoCloseEligible: false,
      };
    }
    if (includesAny(identity, [
      /疫苗/, /药/, /消毒/, /维生素/, /饲料/, /料$/, /玉米/, /豆粕/, /麸/, /石粉/,
      /柴油/, /汽油/, /燃油/, /煤/, /蛋托/, /托盘/, /纸箱/, /包装/, /标签/,
      /注射液/, /口服液/, /可溶性粉/, /稀释液/, /葡萄糖/, /碳酸氢/, /多维/,
      /霉素/, /沙星/, /青霉/, /头孢/, /新城疫/, /流感/, /二联/, /四系/,
    ])) {
      return {
        gapClass: 'MATERIAL_MASTER_CANDIDATE',
        riskLevel: 'MEDIUM',
        suggestedEntityType: 'MATERIAL',
        reason: 'SOURCE_PRODUCT_HAS_MATERIAL_OR_CONSUMABLE_SEMANTICS',
        nextAction: 'CREATE_OR_ACTIVATE_MATERIAL_MASTER_THEN_MAP',
        autoCloseEligible: false,
      };
    }
    return {
      gapClass: 'PRODUCT_MASTER_REVIEW_REQUIRED',
      riskLevel: 'HIGH',
      suggestedEntityType: 'PRODUCT',
      reason: 'PRODUCT_SEMANTICS_REQUIRE_DOMAIN_REVIEW',
      nextAction: 'CLASSIFY_AS_PRODUCT_SKU_MATERIAL_OR_LIVESTOCK',
      autoCloseEligible: false,
    };
  }

  if (includesAny(identity, [/只/, /头/, /羽/])) {
    return {
      gapClass: 'CONTEXTUAL_UOM_REQUIRED',
      riskLevel: 'HIGH',
      suggestedEntityType: 'UOM',
      reason: 'COUNT_UOM_DEPENDS_ON_PRODUCT_OR_LIVESTOCK_CONTEXT',
      nextAction: 'DEFINE_CONTEXTUAL_UOM_POLICY_BEFORE_MAPPING',
      autoCloseEligible: false,
    };
  }
  if (includesAny(identity, [/件/, /提/, /桶/, /瓶/, /盘/, /袋/, /包/, /箱/, /支/])) {
    return {
      gapClass: 'SKU_UOM_CONVERSION_REQUIRED',
      riskLevel: 'HIGH',
      suggestedEntityType: 'UOM',
      reason: 'PACKAGING_UOM_REQUIRES_PRODUCT_SPECIFIC_CONVERSION_FACTOR',
      nextAction: 'DEFINE_SKU_UOM_CONVERSION_BEFORE_MAPPING',
      autoCloseEligible: false,
    };
  }
  return {
    gapClass: 'UOM_DEFINITION_CANDIDATE',
    riskLevel: 'MEDIUM',
    suggestedEntityType: 'UOM',
    reason: 'BASE_UOM_IS_MISSING_FROM_ERP_CATALOG',
    nextAction: 'DEFINE_CANONICAL_UOM_THEN_MAP',
    autoCloseEligible: false,
  };
}
