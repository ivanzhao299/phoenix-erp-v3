import { closureBatch } from './chanjet-bidirectional-boundary-status.mjs';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function normalized(value) {
  return text(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000（）()\-—_]+/g, '');
}

export function expectedHouseCode(item) {
  const name = text(item.chanjetName);
  const company = text(item.companyCode);
  const numbered = name.match(/^(\d+)号鸡舍$/);
  if (company === 'COMP-LAO-AGRI' && numbered) {
    const number = Number(numbered[1]);
    return number >= 1 && number <= 6 ? `HOUSE_MS_${String(number).padStart(2, '0')}` : '';
  }
  if (company === 'COMP-LAO-XINGCHI') {
    if (numbered) {
      const number = Number(numbered[1]);
      return number >= 1 && number <= 5 ? `HOUSE_DP_${String(number).padStart(2, '0')}` : '';
    }
    if (name === '公鸡舍') return 'HOUSE_DP_06';
  }
  return '';
}

function exactLocationCandidates(item, locations, expectedCode) {
  return locations.filter((location) => {
    if (text(location.company_code) !== text(item.companyCode)) return false;
    const exactName = normalized(location.name) === normalized(item.chanjetName);
    const code = text(location.code).toUpperCase();
    const houseCode = expectedCode.toUpperCase();
    return exactName || (!!houseCode && (code === houseCode || code.includes(houseCode)));
  });
}

function productDomain(item) {
  const blockers = new Set(item.blockers || []);
  const name = text(item.chanjetName);
  if (blockers.has('LIVESTOCK_MASTER_REQUIRED')
    || /^(蛋鸡|公鸡|小公鸡|雏鸡|母鸡|小鸡苗|小母鸡)$/.test(name)) return 'LIVESTOCK';
  if (blockers.has('MATERIAL_MASTER_CANDIDATE')) return /煤炭/.test(name) ? 'FUEL_MATERIAL' : 'FEED_MATERIAL';
  if (blockers.has('PRODUCT_SKU_MODEL_REQUIRED')) return 'PROCESSED_FOOD';
  if (/筐|框|蛋托|包装|标签|胶带/.test(name)) return 'PACKAGING';
  if (/烧鸡|咸鸡蛋|变蛋/.test(name)) return 'PROCESSED_FOOD';
  return 'VETERINARY_MEDICINE';
}

function policyForSource(domainPolicies, item) {
  return (domainPolicies?.candidates?.houseLocations || []).find((candidate) => (
    text(candidate.bookId) === text(item.bookId)
    && text(candidate.sourceCode).toUpperCase() === text(item.chanjetCode).toUpperCase()
  ));
}

function planHouseLocation(item, domainPolicies) {
  const expectedCode = expectedHouseCode(item);
  const houses = domainPolicies?.targets?.houses || [];
  const warehouses = domainPolicies?.targets?.warehouses || [];
  const locations = domainPolicies?.targets?.locations || [];
  const house = houses.find((candidate) => text(candidate.code) === expectedCode);
  const companyWarehouses = warehouses.filter((warehouse) => (
    text(warehouse.company_code) === text(item.companyCode)
  ));
  const exactWarehouse = companyWarehouses.length === 1 ? companyWarehouses[0] : null;
  const exactLocations = exactLocationCandidates(item, locations, expectedCode);
  const sourcePolicy = policyForSource(domainPolicies, item);
  const currentPolicy = sourcePolicy?.currentPolicy || null;
  const approved = text(currentPolicy?.state) === 'APPROVED';
  const exactLocation = exactLocations.length === 1 ? exactLocations[0] : null;
  let readiness = 'ERP_HOUSE_AND_LOCATION_REQUIRED';
  if (approved) readiness = 'ALREADY_POLICY_APPROVED';
  else if (house && exactLocation) readiness = 'POLICY_TARGET_READY';
  else if (house && exactWarehouse) readiness = 'LOCATION_CREATION_READY';
  else if (house) readiness = exactLocations.length > 1
    ? 'AMBIGUOUS_ERP_LOCATION'
    : companyWarehouses.length > 1
      ? 'WAREHOUSE_OWNER_SELECTION_REQUIRED'
      : 'ERP_WAREHOUSE_OR_LOCATION_REQUIRED';
  else if (exactLocation) readiness = 'ERP_HOUSE_REQUIRED';
  const proposedLocation = readiness === 'LOCATION_CREATION_READY' ? {
    code: `LOC-${expectedCode}`,
    name: text(item.chanjetName),
    warehouse_code: text(exactWarehouse.code),
    company_code: text(item.companyCode),
  } : null;
  return {
    readiness,
    expectedHouseCode: expectedCode,
    erpHouse: house || null,
    erpLocation: exactLocation,
    proposedLocation,
    companyWarehouseCandidateCount: companyWarehouses.length,
    erpWarehouse: exactWarehouse,
    exactLocationCandidateCount: exactLocations.length,
    currentPolicy,
    productionWriteNeeded: approved ? 'NONE' : house && exactLocation
      ? 'ERP_MIDDLE_LAYER_POLICY'
      : house && exactWarehouse
        ? 'ERP_LOCATION_MASTER_THEN_POLICY'
      : 'ERP_MASTER_DATA_THEN_POLICY',
  };
}

function planUom(item, domainPolicies) {
  const candidates = (domainPolicies?.candidates?.uomConversions || []).filter((candidate) => (
    text(candidate.bookId) === text(item.bookId)
    && text(candidate.sourceUom) === text(item.chanjetName)
  ));
  const approved = candidates.filter((candidate) => text(candidate.currentPolicy?.state) === 'APPROVED');
  const stableRatios = item.uomPolicyCandidates || [];
  const physicalRule = ['斤', '吨'].includes(text(item.chanjetName));
  const readiness = candidates.length && approved.length === candidates.length
    ? 'ALREADY_POLICY_APPROVED'
    : stableRatios.length || physicalRule
      ? 'CONVERSION_EVIDENCE_READY'
      : candidates.length
        ? 'PRODUCT_TARGET_AND_RATIO_REQUIRED'
        : 'MORE_TRANSACTION_EVIDENCE_REQUIRED';
  return {
    readiness,
    sourceProductUomCandidates: candidates.length,
    approvedProductUomPolicies: approved.length,
    stableRatios,
    physicalRule,
    productionWriteNeeded: readiness === 'ALREADY_POLICY_APPROVED'
      ? 'NONE'
      : 'ERP_MIDDLE_LAYER_PRODUCT_UOM_POLICY',
  };
}

function planReferenceEvidence(item, exactMatchReadiness, noMatchReadiness) {
  const referenceEvidence = item.referenceEvidence || null;
  const scanned = Number(referenceEvidence?.scannedSnapshotCount || 0);
  const exact = Number(referenceEvidence?.exactSnapshotCount || 0);
  return {
    referenceEvidence,
    readiness: exact > 0
      ? exactMatchReadiness
      : scanned > 0
        ? noMatchReadiness
        : 'SOURCE_MIRROR_COVERAGE_REQUIRED',
  };
}

export function buildHoldBatchPlan({ audit, businessPlan, domainPolicies }) {
  const reviewById = new Map((businessPlan?.candidates || []).map((candidate) => [
    text(candidate.mappingId), candidate,
  ]));
  const rows = (audit?.items || []).map((item) => {
    const batch = closureBatch(item);
    const base = {
      closureBatch: batch,
      mappingId: text(item.mappingId),
      mappingType: text(item.mappingType),
      bookId: text(item.bookId),
      companyCode: text(item.companyCode),
      chanjetCode: text(item.chanjetCode),
      chanjetName: text(item.chanjetName),
      disposition: text(item.disposition),
      risk: text(item.risk),
      blockers: item.blockers || [],
      businessReview: reviewById.get(text(item.mappingId)) || null,
      approvalRequired: true,
      externalWrite: false,
    };
    if (batch === 'B0_INTENTIONAL_NON_MAPPING') {
      return { ...base, readiness: 'READY_FOR_USER_APPROVAL', approvalToken: 'CLOSE_INTENTIONAL_NON_MAPPING' };
    }
    if (batch === 'B1_CHANJET_ONE_ROW_CANARY') {
      return {
        ...base,
        readiness: 'READY_FOR_ONE_ROW_PREFLIGHT_OR_APPROVAL',
        approvalToken: `UPDATE_CHANJET_PRODUCT_NAME_CANARY:${item.mappingId}`,
        externalWrite: true,
        changeProposal: item.chanjetChangeProposal,
      };
    }
    if (batch === 'B3_ORGANIZATION_POLICY') {
      return {
        ...base,
        readiness: 'ORGANIZATION_OWNER_POLICY_REQUIRED',
        proposedPolicy: 'KEEP_ACCOUNTING_GROUP_NOT_TRANSACTION_DEPARTMENT',
        productionWriteNeeded: 'ERP_MIDDLE_LAYER_POLICY',
      };
    }
    if (batch === 'B4_LOCATION_POLICY') {
      return { ...base, ...planHouseLocation(item, domainPolicies) };
    }
    if (batch === 'B5_PRODUCT_UOM_POLICY') {
      return { ...base, ...planUom(item, domainPolicies) };
    }
    if (batch === 'B6_PRODUCT_DOMAIN_POLICY') {
      return {
        ...base,
        readiness: 'BUSINESS_DOMAIN_APPROVAL_REQUIRED',
        proposedDomain: productDomain(item),
        productionWriteNeeded: 'ERP_MASTER_OR_SEMANTIC_MAPPING_AFTER_APPROVAL',
      };
    }
    if (batch === 'B7_BUSINESS_OWNER_REVIEW') {
      return {
        ...base,
        ...planReferenceEvidence(
          item,
          'EXACT_USAGE_EVIDENCE_READY_FOR_OWNER_DECISION',
          'NO_EXACT_USAGE_IN_CURRENT_MIRROR_REQUIRES_OWNER_CONFIRMATION',
        ),
        productionWriteNeeded: 'NONE_UNTIL_OWNER_DECISION',
      };
    }
    return {
      ...base,
      ...planReferenceEvidence(
        item,
        'EXACT_USAGE_EVIDENCE_READY_FOR_DOMAIN_REVIEW',
        'NO_EXACT_USAGE_IN_CURRENT_MIRROR_REQUIRES_FRESH_SOURCE_CONFIRMATION',
      ),
      productionWriteNeeded: 'NONE_UNTIL_EVIDENCE_COMPLETE',
    };
  });
  const byBatch = {};
  const byReadiness = {};
  for (const row of rows) {
    byBatch[row.closureBatch] = (byBatch[row.closureBatch] || 0) + 1;
    byReadiness[row.readiness] = (byReadiness[row.readiness] || 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    auditHash: text(audit?.auditHash),
    sourceReviewHash: text(audit?.sourceReviewHash),
    decision: rows.length ? 'PHASED_APPROVAL_REQUIRED' : 'GO',
    summary: { total: rows.length, byBatch, byReadiness },
    rows,
    guardrails: {
      readOnlyPlan: true,
      writeChanjet: false,
      writeErpBusinessTables: false,
      exactCompanyBoundary: true,
      exactTargetOnly: true,
      fuzzyMapping: false,
      perBatchApprovalRequired: true,
    },
  };
}
