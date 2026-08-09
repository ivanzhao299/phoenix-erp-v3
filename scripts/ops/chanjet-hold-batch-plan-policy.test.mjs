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
