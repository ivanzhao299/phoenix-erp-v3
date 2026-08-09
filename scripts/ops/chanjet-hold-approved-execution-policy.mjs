const B0_EXPECTED_IDENTITIES = [
  'CASH_ACCOUNT:COMP-LAO-FOOD:YHZZ:银行转账',
  'DEPARTMENT:COMP-LAO-AGRI:15:直营店',
  'DEPARTMENT:COMP-LAO-XINGCHI:10:鸡舍',
];

function text(value) {
  return value == null ? '' : String(value).trim();
}

function identity(item) {
  return [item.mappingType, item.companyCode, item.chanjetCode, item.chanjetName].map(text).join(':');
}

export function buildApprovedExecution(audit, input) {
  const batch = text(input?.batch);
  const confirmation = text(input?.confirmation);
  const auditHash = text(audit?.auditHash);
  if (!auditHash) throw new Error('current precision audit hash is required');

  if (batch === 'B0_INTENTIONAL_NON_MAPPING') {
    if (confirmation !== 'CLOSE_INTENTIONAL_NON_MAPPING') {
      throw new Error('B0 confirmation must be CLOSE_INTENTIONAL_NON_MAPPING');
    }
    const targets = (audit.items || [])
      .filter((item) => item.disposition === 'NO_ERP_MASTER_REQUIRED')
      .sort((left, right) => text(left.mappingId).localeCompare(text(right.mappingId)));
    if (!targets.length) {
      return { batch, auditHash, alreadyComplete: true, expectedWriteCount: 0 };
    }
    const actual = targets.map(identity).sort();
    const expected = [...B0_EXPECTED_IDENTITIES].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`B0 exact identity set changed: ${actual.join('|')}`);
    }
    return {
      batch,
      auditHash,
      alreadyComplete: false,
      expectedWriteCount: targets.length,
      path: '/api/chanjet/integration/erp-master-gap-closure/intentional-non-mapping/close',
      body: {
        auditHash,
        approveProduction: true,
        confirmation,
      },
    };
  }

  if (batch === 'B1_PRODUCT_NAME_CANARY') {
    const mappingId = text(input?.mappingId);
    const expectedConfirmation = `UPDATE_CHANJET_PRODUCT_NAME_CANARY:${mappingId}`;
    if (!/^\d+$/.test(mappingId) || confirmation !== expectedConfirmation) {
      throw new Error(`B1 confirmation must be ${expectedConfirmation}`);
    }
    const targets = (audit.items || []).filter((item) => (
      text(item.mappingId) === mappingId
      && item.mappingType === 'PRODUCT'
      && item.disposition === 'CHANJET_CHANGE_PROPOSAL'
      && item.chanjetChangeProposal?.field === 'name'
    ));
    if (targets.length !== 1) throw new Error('B1 current audit must contain one exact name-only target');
    return {
      batch,
      auditHash,
      mappingId,
      alreadyComplete: false,
      expectedWriteCount: 1,
      path: '/api/chanjet/integration/product-name-canary/execute',
      body: {
        mappingId,
        auditHash,
        approveProduction: true,
        confirmation,
      },
    };
  }

  if (batch === 'B3_ORGANIZATION_POLICY') {
    const expectedConfirmation = 'CLOSE_ORGANIZATION_POLICY:6198';
    if (confirmation !== expectedConfirmation) {
      throw new Error(`B3 confirmation must be ${expectedConfirmation}`);
    }
    const targets = (audit.items || []).filter((item) => (
      text(item.mappingId) === '6198'
      && item.mappingType === 'DEPARTMENT'
      && text(item.bookId) === '3537748712226818'
      && text(item.companyCode) === 'COMP-LAO-XINGCHI'
      && text(item.chanjetCode) === '100'
      && text(item.chanjetName) === '育雏'
      && item.disposition === 'ERP_POLICY_REQUIRED'
    ));
    if (targets.length !== 1) throw new Error('B3 current audit must contain the exact organization-policy target');
    return {
      batch,
      auditHash,
      alreadyComplete: false,
      expectedWriteCount: 1,
      path: '/api/chanjet/integration/erp-master-gap-closure/organization-policy/close',
      body: {
        auditHash,
        approveProduction: true,
        confirmation,
      },
    };
  }

  throw new Error('batch must be B0_INTENTIONAL_NON_MAPPING, B1_PRODUCT_NAME_CANARY, or B3_ORGANIZATION_POLICY');
}

export function assertApprovedExecutionResult(execution, envelope) {
  const result = envelope?.result || envelope;
  if (execution.batch === 'B0_INTENTIONAL_NON_MAPPING') {
    if (text(result?.auditHash) !== execution.auditHash
      || !Array.isArray(result?.closed)
      || result.closed.length !== execution.expectedWriteCount
      || result.writeChanjet !== false
      || result.writeErpBusinessTables !== false
      || result.automaticRollbackOnFailure !== true) {
      throw new Error('B0 readback/rollback evidence is incomplete');
    }
    return result;
  }
  if (execution.batch === 'B3_ORGANIZATION_POLICY') {
    if (text(result?.auditHash) !== execution.auditHash
      || !Array.isArray(result?.closed)
      || result.closed.length !== 1
      || text(result.closed[0]?.mappingId) !== '6198'
      || text(result.closed[0]?.matchStatus) !== 'NOT_APPLICABLE'
      || text(result.closed[0]?.policy) !== 'KEEP_ACCOUNTING_GROUP_NOT_TRANSACTION_DEPARTMENT'
      || result.writeChanjet !== false
      || result.writeErpBusinessTables !== false
      || result.automaticRollbackOnFailure !== true) {
      throw new Error('B3 readback/rollback evidence is incomplete');
    }
    return result;
  }
  const evidence = result?.evidence || {};
  if (text(result?.auditHash) !== execution.auditHash
    || !['UPDATED_AND_VERIFIED', 'IDEMPOTENT_PROVIDER_ALREADY_CORRECT'].includes(text(result?.outcome))
    || result.automaticRollbackOnFailure !== true
    || evidence.providerReadbackVerified !== true
    || evidence.erpMirrorReadbackVerified !== true
    || text(evidence.mappingId) !== execution.mappingId) {
    throw new Error('B1 dual-readback/rollback evidence is incomplete');
  }
  return result;
}
