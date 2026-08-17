import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHoldBatchPlan,
  expectedHouseCode,
} from './chanjet-hold-batch-plan-policy.mjs';

test('reviewed house identities resolve only inside the established company policy', () => {
  assert.equal(expectedHouseCode({ companyCode: 'COMP-LAO-AGRI', chanjetName: '1号鸡舍' }), 'HOUSE_MS_01');
  assert.equal(expectedHouseCode({ companyCode: 'COMP-LAO-XINGCHI', chanjetName: '公鸡舍' }), 'HOUSE_DP_06');
  assert.equal(expectedHouseCode({ companyCode: 'COMP-LAO-AGRI', chanjetName: '公鸡舍' }), '');
  assert.equal(expectedHouseCode({ companyCode: 'COMP-LAO-XINGCHI', chanjetName: '育雏舍' }), '');
});

test('house policy is ready only with one exact same-company location', () => {
  const plan = buildHoldBatchPlan({
    audit: {
      auditHash: 'audit',
      sourceReviewHash: 'review',
      items: [{
        mappingId: '1', mappingType: 'WAREHOUSE', bookId: 'BOOK',
        companyCode: 'COMP-LAO-AGRI', chanjetCode: '05', chanjetName: '1号鸡舍',
        disposition: 'ERP_POLICY_REQUIRED', risk: 'MEDIUM', blockers: [],
      }],
    },
    businessPlan: { candidates: [] },
    domainPolicies: {
      candidates: { houseLocations: [{ bookId: 'BOOK', sourceCode: '05', currentPolicy: null }] },
      targets: {
        houses: [{ code: 'HOUSE_MS_01', name: '1号鸡舍' }],
        locations: [{
          code: 'LOC-HOUSE-MS-01', name: '1号鸡舍', warehouse_code: 'WH-1',
          company_code: 'COMP-LAO-AGRI',
        }],
      },
    },
  });
  assert.equal(plan.rows[0].readiness, 'POLICY_TARGET_READY');
  assert.equal(plan.rows[0].erpHouse.code, 'HOUSE_MS_01');
  assert.equal(plan.rows[0].erpLocation.code, 'LOC-HOUSE-MS-01');
  assert.equal(plan.guardrails.writeErpBusinessTables, false);
});

test('ambiguous or cross-company locations fail closed', () => {
  const base = {
    auditHash: 'audit', sourceReviewHash: 'review',
    items: [{
      mappingId: '1', mappingType: 'WAREHOUSE', bookId: 'BOOK',
      companyCode: 'COMP-LAO-AGRI', chanjetCode: '05', chanjetName: '1号鸡舍',
      disposition: 'ERP_POLICY_REQUIRED', risk: 'MEDIUM', blockers: [],
    }],
  };
  const plan = buildHoldBatchPlan({
    audit: base,
    businessPlan: { candidates: [] },
    domainPolicies: {
      candidates: { houseLocations: [] },
      targets: {
        houses: [{ code: 'HOUSE_MS_01', name: '1号鸡舍' }],
        locations: [
          { code: 'A', name: '1号鸡舍', company_code: 'COMP-LAO-AGRI' },
          { code: 'B', name: '1号鸡舍', company_code: 'COMP-LAO-AGRI' },
          { code: 'C', name: '1号鸡舍', company_code: 'COMP-LAO-XINGCHI' },
        ],
      },
    },
  });
  assert.equal(plan.rows[0].readiness, 'AMBIGUOUS_ERP_LOCATION');
  assert.equal(plan.rows[0].exactLocationCandidateCount, 2);
});

test('one exact company warehouse yields a deterministic location-creation proposal', () => {
  const plan = buildHoldBatchPlan({
    audit: {
      auditHash: 'audit', sourceReviewHash: 'review',
      items: [{
        mappingId: '1', mappingType: 'WAREHOUSE', bookId: 'BOOK',
        companyCode: 'COMP-LAO-AGRI', chanjetCode: '05', chanjetName: '1号鸡舍',
        disposition: 'ERP_POLICY_REQUIRED', risk: 'MEDIUM', blockers: [],
      }],
    },
    businessPlan: { candidates: [] },
    domainPolicies: {
      candidates: { houseLocations: [] },
      targets: {
        houses: [{ code: 'HOUSE_MS_01', name: '1号鸡舍' }],
        warehouses: [{ code: 'WH-AGRI', name: '农业仓', company_code: 'COMP-LAO-AGRI' }],
        locations: [],
      },
    },
  });
  assert.equal(plan.rows[0].readiness, 'LOCATION_CREATION_READY');
  assert.deepEqual(plan.rows[0].proposedLocation, {
    code: 'LOC-HOUSE_MS_01',
    name: '1号鸡舍',
    warehouse_code: 'WH-AGRI',
    company_code: 'COMP-LAO-AGRI',
  });
  assert.equal(plan.rows[0].productionWriteNeeded, 'ERP_LOCATION_MASTER_THEN_POLICY');
});

test('ambiguous warehouse ownership exposes exact same-company candidates for approval', () => {
  const plan = buildHoldBatchPlan({
    audit: {
      auditHash: 'audit', sourceReviewHash: 'review',
      items: [{
        mappingId: '1', mappingType: 'WAREHOUSE', bookId: 'BOOK',
        companyCode: 'COMP-LAO-AGRI', chanjetCode: '05', chanjetName: '1号鸡舍',
        disposition: 'ERP_POLICY_REQUIRED', risk: 'MEDIUM', blockers: [],
      }],
    },
    businessPlan: { candidates: [] },
    domainPolicies: {
      candidates: { houseLocations: [] },
      targets: {
        houses: [{ code: 'HOUSE_MS_01', name: '1号鸡舍' }],
        warehouses: [
          {
            code: 'WH-AGRI-A', name: '农业一仓', company_code: 'COMP-LAO-AGRI',
            warehouse_type: 'RAW_MATERIAL', status: 'ACTIVE',
          },
          {
            code: 'WH-AGRI-B', name: '农业二仓', company_code: 'COMP-LAO-AGRI',
            warehouse_type: 'FINISHED_GOODS', status: 'ACTIVE',
          },
          {
            code: 'WH-XC', name: '兴驰仓', company_code: 'COMP-LAO-XINGCHI',
            warehouse_type: 'FINISHED_GOODS', status: 'ACTIVE',
          },
        ],
        locations: [],
      },
    },
  });
  assert.equal(plan.rows[0].readiness, 'WAREHOUSE_OWNER_SELECTION_REQUIRED');
  assert.equal(plan.rows[0].companyWarehouseCandidateCount, 2);
  assert.deepEqual(plan.rows[0].erpWarehouseCandidates, [
    {
      code: 'WH-AGRI-A', name: '农业一仓', warehouseType: 'RAW_MATERIAL',
      companyCode: 'COMP-LAO-AGRI', status: 'ACTIVE',
    },
    {
      code: 'WH-AGRI-B', name: '农业二仓', warehouseType: 'FINISHED_GOODS',
      companyCode: 'COMP-LAO-AGRI', status: 'ACTIVE',
    },
  ]);
});

test('product policies remain explicit business decisions', () => {
  const plan = buildHoldBatchPlan({
    audit: {
      auditHash: 'audit', sourceReviewHash: 'review',
      items: [{
        mappingId: '2', mappingType: 'PRODUCT', bookId: 'BOOK', companyCode: 'COMP',
        chanjetCode: 'P1', chanjetName: '蛋鸡', disposition: 'ERP_POLICY_REQUIRED',
        risk: 'MEDIUM', blockers: ['LIVESTOCK_MASTER_REQUIRED'],
      }],
    },
    businessPlan: { candidates: [] },
    domainPolicies: {},
  });
  assert.equal(plan.rows[0].readiness, 'BUSINESS_DOMAIN_APPROVAL_REQUIRED');
  assert.equal(plan.rows[0].proposedDomain, 'LIVESTOCK');
});

test('explicit livestock names override incomplete upstream blocker codes', () => {
  const plan = buildHoldBatchPlan({
    audit: {
      auditHash: 'audit', sourceReviewHash: 'review',
      items: [{
        mappingId: '3', mappingType: 'PRODUCT', bookId: 'BOOK', companyCode: 'COMP',
        chanjetCode: 'CHICK', chanjetName: '雏鸡', disposition: 'ERP_POLICY_REQUIRED',
        risk: 'MEDIUM', blockers: ['PRODUCT_MASTER_REVIEW_REQUIRED'],
      }],
    },
    businessPlan: { candidates: [] },
    domainPolicies: {},
  });
  assert.equal(plan.rows[0].proposedDomain, 'LIVESTOCK');
});

test('exact mirror usage evidence advances B7 and B8 without authorizing writes', () => {
  const sharedEvidence = {
    source: 'ERP_READONLY_MIRROR',
    matchingMode: 'EXACT_IDENTIFIER_ONLY',
    scannedSnapshotCount: 50,
    exactSnapshotCount: 4,
    headerMatchCount: 2,
    lineMatchCount: 3,
    entityTypes: ['SALE_STOCK_OUT'],
    firstSeenAt: '2026-07-01T00:00:00.000Z',
    lastSeenAt: '2026-08-01T00:00:00.000Z',
  };
  const plan = buildHoldBatchPlan({
    audit: {
      auditHash: 'audit', sourceReviewHash: 'review',
      items: [
        {
          mappingId: '7', mappingType: 'WAREHOUSE', bookId: 'BOOK', companyCode: 'COMP',
          chanjetCode: '01', chanjetName: '总仓', disposition: 'CROSS_SYSTEM_REVIEW_REQUIRED',
          risk: 'HIGH', blockers: [], referenceEvidence: sharedEvidence,
        },
        {
          mappingId: '8', mappingType: 'PRODUCT', bookId: 'BOOK', companyCode: 'COMP',
          chanjetCode: 'P8', chanjetName: '马利克', disposition: 'KEEP_HOLD',
          risk: 'MEDIUM', blockers: [], referenceEvidence: sharedEvidence,
        },
      ],
    },
    businessPlan: { candidates: [] },
    domainPolicies: {},
  });
  assert.equal(plan.rows[0].readiness, 'EXACT_USAGE_EVIDENCE_READY_FOR_OWNER_DECISION');
  assert.equal(plan.rows[1].readiness, 'EXACT_USAGE_EVIDENCE_READY_FOR_DOMAIN_REVIEW');
  assert.equal(plan.guardrails.writeChanjet, false);
  assert.equal(plan.guardrails.writeErpBusinessTables, false);
});

test('zero exact mirror matches remain fail-closed', () => {
  const plan = buildHoldBatchPlan({
    audit: {
      auditHash: 'audit', sourceReviewHash: 'review',
      items: [{
        mappingId: '9', mappingType: 'DEPARTMENT', bookId: 'BOOK', companyCode: 'COMP',
        chanjetCode: '07', chanjetName: '拉邦酒店', disposition: 'KEEP_HOLD',
        risk: 'MEDIUM', blockers: [],
        referenceEvidence: { scannedSnapshotCount: 50, exactSnapshotCount: 0 },
      }],
    },
    businessPlan: { candidates: [] },
    domainPolicies: {},
  });
  assert.equal(
    plan.rows[0].readiness,
    'NO_EXACT_USAGE_IN_CURRENT_MIRROR_REQUIRES_FRESH_SOURCE_CONFIRMATION',
  );
});
