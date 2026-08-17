import assert from 'node:assert/strict';
import test from 'node:test';

import {
  closureBatch,
  publicUserSummary,
  rowsOf,
  summarizeBy,
} from './chanjet-bidirectional-boundary-status.mjs';

test('rowsOf unwraps supported API envelopes', () => {
  assert.deepEqual(rowsOf({ data: [{ id: 1 }] }), [{ id: 1 }]);
  assert.deepEqual(rowsOf({ result: { mappings: [{ id: 2 }] } }), [{ id: 2 }]);
  assert.deepEqual(rowsOf(null), []);
});

test('closureBatch routes every HOLD disposition to a bounded batch', () => {
  assert.equal(closureBatch({ disposition: 'NO_ERP_MASTER_REQUIRED' }), 'B0_INTENTIONAL_NON_MAPPING');
  assert.equal(closureBatch({ disposition: 'CHANJET_CHANGE_PROPOSAL' }), 'B1_CHANJET_ONE_ROW_CANARY');
  assert.equal(closureBatch({ disposition: 'ERP_AUTO_APPLY_ELIGIBLE' }), 'B2_ERP_LOW_RISK_MASTER');
  assert.equal(closureBatch({ disposition: 'ERP_POLICY_REQUIRED', mappingType: 'DEPARTMENT' }), 'B3_ORGANIZATION_POLICY');
  assert.equal(closureBatch({ disposition: 'ERP_POLICY_REQUIRED', mappingType: 'WAREHOUSE' }), 'B4_LOCATION_POLICY');
  assert.equal(closureBatch({ disposition: 'ERP_POLICY_REQUIRED', mappingType: 'UOM' }), 'B5_PRODUCT_UOM_POLICY');
  assert.equal(closureBatch({ disposition: 'ERP_POLICY_REQUIRED', mappingType: 'PRODUCT' }), 'B6_PRODUCT_DOMAIN_POLICY');
  assert.equal(closureBatch({ disposition: 'CROSS_SYSTEM_REVIEW_REQUIRED' }), 'B7_BUSINESS_OWNER_REVIEW');
  assert.equal(closureBatch({ disposition: 'KEEP_HOLD' }), 'B8_EVIDENCE_COLLECTION');
});

test('publicUserSummary never exposes user identifiers or contact fields', () => {
  const summary = publicUserSummary({
    id: 17,
    username: 'finance.director',
    real_name_zh: 'Sensitive Name',
    email: 'secret@example.com',
    phone: '123',
    status: 'ACTIVE',
  }, [{ id: 1 }]);
  assert.match(summary.identityHash, /^[a-f0-9]{16}$/);
  assert.equal(summary.hasOrgBinding, true);
  assert.equal(summary.orgBindingCount, 1);
  assert.equal(JSON.stringify(summary).includes('finance.director'), false);
  assert.equal(JSON.stringify(summary).includes('secret@example.com'), false);
});

test('summarizeBy counts stable categories', () => {
  assert.deepEqual(summarizeBy([{ type: 'A' }, { type: 'A' }, { type: 'B' }], 'type'), { A: 2, B: 1 });
});
