import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertApprovedExecutionPreflight,
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

test('B4 AGRI binds the exact six-row location policy and protected evidence', () => {
  const items = [1, 2, 3, 4, 5, 6].map((number, index) => ({
    mappingId: String(307155 + index),
    mappingType: 'WAREHOUSE',
    bookId: '3533914511118750',
    companyCode: 'COMP-LAO-AGRI',
    chanjetCode: String(4 + number).padStart(2, '0'),
    chanjetName: `${number}号鸡舍`,
    disposition: 'ERP_POLICY_REQUIRED',
  }));
  const execution = buildApprovedExecution({ auditHash, items }, {
    batch: 'B4_HOUSE_LOCATION_AGRI',
    confirmation: 'CREATE_HOUSE_LOCATIONS_AND_APPROVE_POLICY:COMP-LAO-AGRI:6',
  });
  assert.equal(execution.expectedWriteCount, 6);
  assert.equal(execution.companyCode, 'COMP-LAO-AGRI');
  assert.equal(
    execution.path,
    '/api/chanjet/integration/erp-master-gap-closure/house-location-policy/close',
  );
  assert.doesNotThrow(() => assertApprovedExecutionPreflight(execution, {
    result: {
      auditHash,
      companyCode: 'COMP-LAO-AGRI',
      ready: true,
      targets: items.map((item) => ({ mappingId: item.mappingId, blockers: [] })),
      schema: { missingColumns: [] },
      writeChanjet: false,
      writeErpMasterTables: false,
      writeErpBusinessFacts: false,
    },
  }));
  assert.doesNotThrow(() => assertApprovedExecutionResult(execution, {
    result: {
      auditHash,
      companyCode: 'COMP-LAO-AGRI',
      closed: items.map((item) => ({ mappingId: item.mappingId, matchStatus: 'NOT_APPLICABLE' })),
      preStateBackup: items.map((item) => ({ mappingId: item.mappingId })),
      writeChanjet: false,
      writeErpMasterTables: true,
      writeErpBusinessFacts: false,
      automaticRollbackOnFailure: true,
    },
  }));
});

test('B4 fails closed on partial or changed company target sets', () => {
  assert.throws(() => buildApprovedExecution({
    auditHash,
    items: [{
      mappingId: '307155', mappingType: 'WAREHOUSE', bookId: '3533914511118750',
      companyCode: 'COMP-LAO-AGRI', chanjetCode: '05', chanjetName: '1号鸡舍',
      disposition: 'ERP_POLICY_REQUIRED',
    }],
  }, {
    batch: 'B4_HOUSE_LOCATION_AGRI',
    confirmation: 'CREATE_HOUSE_LOCATIONS_AND_APPROVE_POLICY:COMP-LAO-AGRI:6',
  }), /exact identity set changed/);
});

test('B4 XINGCHI keeps the rooster house in the same six-row company batch', () => {
  const names = ['1号鸡舍', '2号鸡舍', '3号鸡舍', '4号鸡舍', '5号鸡舍', '公鸡舍'];
  const items = names.map((chanjetName, index) => ({
    mappingId: String(307170 + index), mappingType: 'WAREHOUSE',
    bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI',
    chanjetCode: String(101 + index), chanjetName, disposition: 'ERP_POLICY_REQUIRED',
  }));
  const execution = buildApprovedExecution({ auditHash, items }, {
    batch: 'B4_HOUSE_LOCATION_XINGCHI',
    confirmation: 'CREATE_HOUSE_LOCATIONS_AND_APPROVE_POLICY:COMP-LAO-XINGCHI:6',
  });
  assert.equal(execution.companyCode, 'COMP-LAO-XINGCHI');
  assert.equal(execution.expectedWriteCount, 6);
  assert.equal(execution.body.companyCode, 'COMP-LAO-XINGCHI');
});

test('B4 preflight blocks production execution on any schema or identity blocker', () => {
  const execution = {
    preflightPath: '/preflight', auditHash, companyCode: 'COMP-LAO-AGRI', expectedWriteCount: 1,
  };
  assert.throws(() => assertApprovedExecutionPreflight(execution, {
    result: {
      auditHash,
      companyCode: 'COMP-LAO-AGRI',
      ready: false,
      targets: [{ blockers: ['LOCATION_IDENTITY_CONFLICT'] }],
      schema: { missingColumns: [] },
      writeChanjet: false,
      writeErpMasterTables: false,
      writeErpBusinessFacts: false,
    },
  }), /preflight is incomplete or HOLD/);
});
