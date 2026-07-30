import { createHash } from 'crypto';

export interface ChanjetGapSource {
  bookId: string;
  companyCode: string;
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  currency: string;
}

export interface ChanjetFinanceGapCandidate extends ChanjetGapSource {
  domain: string;
  closureState: string;
  blockerCode: string;
}

export interface ChanjetWmsGapRow extends Omit<ChanjetGapSource, 'sourceId' | 'currency'> {
  id: string;
  mappingType: 'WAREHOUSE' | 'PRODUCT' | 'UOM';
  closureState: string;
  gapClass: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedEntityType: string;
  classificationReason: string;
  nextAction: string;
}

export interface ChanjetErpMasterGapProposal {
  proposalId: string;
  sourceDomain: string;
  companyCode: string;
  sourceCode: string;
  sourceName: string;
  currency: string;
  sourceCount: number;
  sources: ChanjetGapSource[];
  gapClass: string;
  targetEntityType: string;
  targetTable: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  blockerCodes: string[];
  requiredFields: string[];
  validationCommands: string[];
  acceptanceCriteria: string[];
  proposedAction: string;
  autoCreateAllowed: false;
  requiresApproval: true;
  allowedPaths: string[];
  forbiddenPaths: string[];
}

const normalize = (value: unknown): string => String(value || '')
  .normalize('NFKC')
  .trim()
  .replace(/[\s\u3000（）()\-—_]+/g, '')
  .toUpperCase();

const text = (value: unknown): string => String(value || '').trim();

const proposalId = (prefix: string, key: string): string => (
  `${prefix}-${createHash('sha256').update(key).digest('hex').slice(0, 16).toUpperCase()}`
);

export const financeGapSourceKey = (source: Pick<ChanjetGapSource, 'bookId' | 'sourceId'> & { domain: string }): string => (
  `${source.domain}:${source.bookId}:${source.sourceId}`
);

export const wmsGapSourceKey = (source: Pick<ChanjetWmsGapRow, 'mappingType' | 'bookId' | 'id'>): string => (
  `${source.mappingType}:${source.bookId}:${source.id}`
);

function financePolicy(domain: string) {
  if (domain === 'DEPARTMENT') {
    return {
      targetEntityType: 'DEPARTMENT',
      targetTable: 'sys_organizations',
      riskLevel: 'MEDIUM' as const,
      requiredFields: ['org_code', 'org_name', 'company_code', 'status'],
      proposedAction: 'CREATE_OR_ACTIVATE_ERP_DEPARTMENT_AFTER_ORG_SCOPE_REVIEW',
      validationCommands: ['verify unique org_code within company', 'verify parent organization and DataScope'],
      acceptanceCriteria: ['active department exists in the same company', 'source identity has one exact ERP target'],
    };
  }
  if (domain === 'PROJECT') {
    return {
      targetEntityType: 'PROJECT',
      targetTable: 'biz_projects',
      riskLevel: 'MEDIUM' as const,
      requiredFields: ['project_code', 'project_name', 'company_code', 'status'],
      proposedAction: 'CREATE_OR_ACTIVATE_ERP_PROJECT_AFTER_BUSINESS_OWNER_REVIEW',
      validationCommands: ['verify unique project_code within company', 'verify project company and active status'],
      acceptanceCriteria: ['active project exists in the same company', 'source identity has one exact ERP target'],
    };
  }
  return {
    targetEntityType: 'CASH_ACCOUNT',
    targetTable: 'fin_cash_accounts',
    riskLevel: 'HIGH' as const,
    requiredFields: [
      'account_code',
      'account_name',
      'company_code',
      'currency_code',
      'account_type',
      'status',
    ],
    proposedAction: 'CREATE_OR_ACTIVATE_ERP_CASH_ACCOUNT_AFTER_FINANCE_OWNERSHIP_REVIEW',
    validationCommands: [
      'verify normalized name and currency within company',
      'verify bank or cash ownership without copying balances',
    ],
    acceptanceCriteria: [
      'active account exists in the same company and currency',
      'opening/current balance is not inferred from the master directory',
    ],
  };
}

function wmsPolicy(row: ChanjetWmsGapRow) {
  const policies: Record<string, {
    targetEntityType: string;
    targetTable: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    requiredFields: string[];
    proposedAction: string;
    validationCommands: string[];
    acceptanceCriteria: string[];
  }> = {
    EXISTING_TARGET_SELECTION_REQUIRED: {
      targetEntityType: row.suggestedEntityType || row.mappingType,
      targetTable: 'chanjet_master_mapping',
      riskLevel: 'LOW',
      requiredFields: ['one exact active ERP target'],
      proposedAction: 'RERUN_DETERMINISTIC_EXACT_MAPPING',
      validationCommands: ['verify one source identity maps to one active ERP target'],
      acceptanceCriteria: ['mapping becomes APPROVED/MATCHED without fuzzy matching'],
    },
    WAREHOUSE_MASTER_CANDIDATE: {
      targetEntityType: 'WAREHOUSE',
      targetTable: 'wms_warehouses',
      riskLevel: 'MEDIUM',
      requiredFields: ['warehouse_code', 'warehouse_name', 'company_code', 'warehouse_type', 'status'],
      proposedAction: 'CREATE_OR_ACTIVATE_COMPANY_WAREHOUSE_THEN_MAP',
      validationCommands: ['verify warehouse belongs to source company', 'verify code uniqueness and active status'],
      acceptanceCriteria: ['canonical warehouse exists in the same company', 'source identity has one exact target'],
    },
    HOUSE_INVENTORY_BRIDGE_REQUIRED: {
      targetEntityType: 'HOUSE_LOCATION_POLICY',
      targetTable: 'chanjet_wms_house_location_policies',
      riskLevel: 'HIGH',
      requiredFields: ['house_code', 'warehouse_code', 'location_code', 'company_code'],
      proposedAction: 'LINK_HOUSE_TO_CANONICAL_WAREHOUSE_LOCATION',
      validationCommands: ['verify active brd_houses row', 'verify active same-company warehouse/location'],
      acceptanceCriteria: ['approved policy exists', 'chicken house is not represented as a warehouse master'],
    },
    PRODUCT_SKU_MODEL_REQUIRED: {
      targetEntityType: 'SKU',
      targetTable: 'product_skus',
      riskLevel: 'MEDIUM',
      requiredFields: ['sku_code', 'product_code', 'grade_code', 'spec_code', 'base_uom', 'status'],
      proposedAction: 'MAP_TO_OR_CREATE_CANONICAL_EGG_SKU',
      validationCommands: ['verify product grade and packaging semantics', 'verify active SKU uniqueness'],
      acceptanceCriteria: ['source product maps to one canonical active SKU', 'package conversion is product-specific'],
    },
    MATERIAL_MASTER_CANDIDATE: {
      targetEntityType: 'MATERIAL',
      targetTable: 'mst_materials',
      riskLevel: 'MEDIUM',
      requiredFields: ['material_code', 'material_name', 'material_type', 'base_uom', 'status'],
      proposedAction: 'CREATE_OR_ACTIVATE_MATERIAL_MASTER_THEN_MAP',
      validationCommands: ['verify material category and base UOM', 'verify no duplicate active material'],
      acceptanceCriteria: ['source product maps to one canonical active material'],
    },
    LIVESTOCK_MASTER_REQUIRED: {
      targetEntityType: 'LIVESTOCK_PRODUCT_POLICY',
      targetTable: 'chanjet_master_mapping',
      riskLevel: 'HIGH',
      requiredFields: ['livestock category', 'inventory ownership policy', 'base count UOM'],
      proposedAction: 'DEFINE_LIVESTOCK_PRODUCT_AND_WMS_ACCOUNTING_POLICY',
      validationCommands: ['verify livestock is not treated as an egg SKU or material'],
      acceptanceCriteria: ['approved livestock accounting and inventory policy exists'],
    },
    UOM_DEFINITION_CANDIDATE: {
      targetEntityType: 'UOM',
      targetTable: 'sys_dict',
      riskLevel: 'MEDIUM',
      requiredFields: ['dict_type=INV_UOM', 'dict_code', 'dict label', 'status'],
      proposedAction: 'DEFINE_CANONICAL_BASE_UOM_THEN_MAP',
      validationCommands: ['verify dimensional meaning', 'verify active INV_UOM uniqueness'],
      acceptanceCriteria: ['canonical active UOM exists', 'source UOM has one exact dimensional match'],
    },
    SKU_UOM_CONVERSION_REQUIRED: {
      targetEntityType: 'PRODUCT_UOM_POLICY',
      targetTable: 'chanjet_wms_uom_conversion_policies',
      riskLevel: 'HIGH',
      requiredFields: ['source_product_code', 'source_uom', 'erp_product_code', 'erp_base_uom', 'conversion_ratio'],
      proposedAction: 'DEFINE_PRODUCT_SPECIFIC_UOM_CONVERSION',
      validationCommands: ['verify conversion against the exact product specification'],
      acceptanceCriteria: ['approved positive conversion exists for the exact product and source UOM'],
    },
    CONTEXTUAL_UOM_REQUIRED: {
      targetEntityType: 'CONTEXTUAL_UOM_POLICY',
      targetTable: 'chanjet_wms_uom_conversion_policies',
      riskLevel: 'HIGH',
      requiredFields: ['product/livestock context', 'source_uom', 'base_uom', 'conversion_ratio'],
      proposedAction: 'DEFINE_CONTEXTUAL_COUNT_UOM_POLICY',
      validationCommands: ['verify count unit meaning for the exact product or livestock category'],
      acceptanceCriteria: ['approved contextual policy exists', 'no global count-unit conversion is used'],
    },
  };
  return policies[row.gapClass] || {
    targetEntityType: row.suggestedEntityType || row.mappingType,
    targetTable: 'chanjet_master_mapping',
    riskLevel: row.riskLevel,
    requiredFields: ['explicit domain classification', 'one active ERP target'],
    proposedAction: row.nextAction || 'MANUAL_DOMAIN_CLASSIFICATION_REQUIRED',
    validationCommands: ['verify source semantics and company boundary'],
    acceptanceCriteria: ['one explicit non-fuzzy target or policy is approved'],
  };
}

export function buildFinanceMasterGapProposals(
  candidates: ChanjetFinanceGapCandidate[],
): ChanjetErpMasterGapProposal[] {
  const groups = new Map<string, ChanjetFinanceGapCandidate[]>();
  for (const candidate of candidates) {
    if (!['ERP_MASTER_MISSING', 'UNRESOLVED'].includes(candidate.closureState)) continue;
    if (!['DEPARTMENT', 'PROJECT', 'CASH_ACCOUNT'].includes(candidate.domain)) continue;
    const identity = normalize(candidate.sourceCode) || normalize(candidate.sourceName);
    const key = [
      candidate.domain,
      candidate.companyCode,
      identity,
      candidate.domain === 'CASH_ACCOUNT' ? normalize(candidate.currency) : '',
    ].join(':');
    groups.set(key, [...(groups.get(key) || []), candidate]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const first = rows[0];
    const policy = financePolicy(first.domain);
    return {
      proposalId: proposalId('ERP-FIN-GAP', key),
      sourceDomain: first.domain,
      companyCode: first.companyCode,
      sourceCode: first.sourceCode,
      sourceName: first.sourceName,
      currency: first.currency,
      sourceCount: rows.length,
      sources: rows.map((row) => ({
        bookId: row.bookId,
        companyCode: row.companyCode,
        sourceId: row.sourceId,
        sourceCode: row.sourceCode,
        sourceName: row.sourceName,
        currency: row.currency,
      })),
      gapClass: 'ERP_MASTER_MISSING',
      targetEntityType: policy.targetEntityType,
      targetTable: policy.targetTable,
      riskLevel: policy.riskLevel,
      blockerCodes: [...new Set(rows.map((row) => row.blockerCode).filter(Boolean))],
      requiredFields: policy.requiredFields,
      validationCommands: policy.validationCommands,
      acceptanceCriteria: policy.acceptanceCriteria,
      proposedAction: policy.proposedAction,
      autoCreateAllowed: false as const,
      requiresApproval: true as const,
      allowedPaths: ['apps/api/src/modules/chanjet/**', 'docs/ops/**'],
      forbiddenPaths: ['Chanjet external write API', 'ERP finance business facts', 'automatic master creation'],
    };
  }).sort((left, right) => left.proposalId.localeCompare(right.proposalId));
}

export function buildWmsMasterGapProposals(
  rows: ChanjetWmsGapRow[],
): ChanjetErpMasterGapProposal[] {
  const groups = new Map<string, ChanjetWmsGapRow[]>();
  for (const row of rows) {
    if (row.closureState === 'MAPPED') continue;
    const identity = normalize(row.sourceCode) || normalize(row.sourceName);
    const key = [row.mappingType, row.companyCode, row.gapClass, identity].join(':');
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.entries()].map(([key, grouped]) => {
    const first = grouped[0];
    const policy = wmsPolicy(first);
    return {
      proposalId: proposalId('ERP-WMS-GAP', key),
      sourceDomain: first.mappingType,
      companyCode: first.companyCode,
      sourceCode: first.sourceCode,
      sourceName: first.sourceName,
      currency: '',
      sourceCount: grouped.length,
      sources: grouped.map((row) => ({
        bookId: row.bookId,
        companyCode: row.companyCode,
        sourceId: row.id,
        sourceCode: row.sourceCode,
        sourceName: row.sourceName,
        currency: '',
      })),
      gapClass: first.gapClass,
      targetEntityType: policy.targetEntityType,
      targetTable: policy.targetTable,
      riskLevel: policy.riskLevel,
      blockerCodes: [...new Set(grouped.map((row) => row.classificationReason).filter(Boolean))],
      requiredFields: policy.requiredFields,
      validationCommands: policy.validationCommands,
      acceptanceCriteria: policy.acceptanceCriteria,
      proposedAction: policy.proposedAction,
      autoCreateAllowed: false as const,
      requiresApproval: true as const,
      allowedPaths: ['apps/api/src/modules/chanjet/**', 'docs/ops/**'],
      forbiddenPaths: ['Chanjet external write API', 'ERP inventory facts', 'fuzzy or cross-company mapping'],
    };
  }).sort((left, right) => left.proposalId.localeCompare(right.proposalId));
}

export function summarizeMasterGapProposals(
  finance: ChanjetErpMasterGapProposal[],
  wms: ChanjetErpMasterGapProposal[],
) {
  const proposals = [...finance, ...wms];
  const sourceRows = proposals.reduce((sum, proposal) => sum + proposal.sourceCount, 0);
  return {
    proposalGroups: proposals.length,
    sourceRows,
    financeProposalGroups: finance.length,
    financeSourceRows: finance.reduce((sum, proposal) => sum + proposal.sourceCount, 0),
    wmsProposalGroups: wms.length,
    wmsSourceRows: wms.reduce((sum, proposal) => sum + proposal.sourceCount, 0),
    highRiskGroups: proposals.filter((proposal) => proposal.riskLevel === 'HIGH').length,
    autoCreateAllowed: 0,
    requiresApproval: proposals.length,
  };
}
