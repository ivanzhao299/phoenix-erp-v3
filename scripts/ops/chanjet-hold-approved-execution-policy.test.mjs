import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertApprovedExecutionResult,
  buildApprovedExecution,
} from './chanjet-hold-approved-execution-policy.mjs';

const auditHash = 'audit-hash';

test('B0 requires the frozen three-row identity set', () => {
  const execution = buildApprovedExecution({
    auditHash,
    items: [
      { mappingId: '1', disposition: 'NO_ERP_MASTER_REQUIRED', mappingType: 'CASH_ACCOUNT', companyCode: 'COMP-LAO-FOOD', chanjetCode: 'YHZZ', chanjetName: '银行转账' },
      { mappingId: '2', disposition: 'NO_ERP_MASTER_REQUIRED', mappingType: 'DEPARTMENT', companyCode: 'COMP-LAO-AGRI', chanjetCode: '15', chanjetName: '直营店' },
      { mappingId: '3', disposition: 'NO_ERP_MASTER_REQUIRED', mappingType: 'DEPARTMENT', companyCode: 'COMP-LAO-XINGCHI', chanjetCode: '10', chanjetName: '鸡舍' },
    ],
  }, {
    batch: 'B0_INTENTIONAL_NON_MAPPING',
    confirmation: 'CLOSE_INTENTIONAL_NON_MAPPING',
  });
  assert.equal(execution.expectedWriteCount, 3);
  assert.equal(execution.body.auditHash, auditHash);
  assert.equal(execution.body.approveProduction, true);
});

test('B0 fails closed when an identity changed', () => {
  assert.throws(() => buildApprovedExecution({
    auditHash,
    items: [{
      mappingId: '1', disposition: 'NO_ERP_MASTER_REQUIRED', mappingType: 'DEPARTMENT',
      companyCode: 'COMP', chanjetCode: 'X', chanjetName: 'unexpected',
    }],
  }, {
    batch: 'B0_INTENTIONAL_NON_MAPPING',
    confirmation: 'CLOSE_INTENTIONAL_NON_MAPPING',
  }), /identity set changed/);
});

test('B1 binds confirmation, mapping and current audit hash', () => {
  const execution = buildApprovedExecution({
    auditHash,
    items: [{
      mappingId: '307052', mappingType: 'PRODUCT', disposition: 'CHANJET_CHANGE_PROPOSAL',
      chanjetChangeProposal: { field: 'name' },
    }],
  }, {
    batch: 'B1_PRODUCT_NAME_CANARY',
    mappingId: '307052',
    confirmation: 'UPDATE_CHANJET_PRODUCT_NAME_CANARY:307052',
  });
  assert.equal(execution.path, '/api/chanjet/integration/product-name-canary/execute');
  assert.equal(execution.body.mappingId, '307052');
  assert.equal(execution.body.auditHash, auditHash);
});

test('execution evidence requires rollback and dual readback', () => {
  const execution = { batch: 'B1_PRODUCT_NAME_CANARY', auditHash, mappingId: '307052' };
  assert.doesNotThrow(() => assertApprovedExecutionResult(execution, {
    result: {
      auditHash,
      outcome: 'UPDATED_AND_VERIFIED',
      automaticRollbackOnFailure: true,
      evidence: {
        mappingId: '307052',
        providerReadbackVerified: true,
        erpMirrorReadbackVerified: true,
      },
    },
  }));
  assert.throws(() => assertApprovedExecutionResult(execution, {
    result: { auditHash, outcome: 'UPDATED_AND_VERIFIED', evidence: {} },
  }), /evidence is incomplete/);
});

test('B3 binds the exact brooding accounting-group policy and evidence', () => {
  const execution = buildApprovedExecution({
    auditHash,
    items: [{
      mappingId: '6198', mappingType: 'DEPARTMENT', bookId: '3537748712226818',
      companyCode: 'COMP-LAO-XINGCHI', chanjetCode: '100', chanjetName: '育雏',
      disposition: 'ERP_POLICY_REQUIRED',
    }],
  }, {
    batch: 'B3_ORGANIZATION_POLICY',
    confirmation: 'CLOSE_ORGANIZATION_POLICY:6198',
  });
  assert.equal(execution.path, '/api/chanjet/integration/erp-master-gap-closure/organization-policy/close');
  assert.equal(execution.expectedWriteCount, 1);
  assert.doesNotThrow(() => assertApprovedExecutionResult(execution, {
    result: {
      auditHash,
      closed: [{
        mappingId: '6198',
        matchStatus: 'NOT_APPLICABLE',
        policy: 'KEEP_ACCOUNTING_GROUP_NOT_TRANSACTION_DEPARTMENT',
      }],
      writeChanjet: false,
      writeErpBusinessTables: false,
      automaticRollbackOnFailure: true,
    },
  }));
  assert.throws(() => buildApprovedExecution({ auditHash, items: [] }, {
    batch: 'B3_ORGANIZATION_POLICY',
    confirmation: 'CLOSE_ORGANIZATION_POLICY:6198',
  }), /exact organization-policy target/);
});
