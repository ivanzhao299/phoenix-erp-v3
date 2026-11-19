/** Compare preserved audit facts across the approved cost-column DDL. Both
 * original reports and their HOLD conclusions remain byte-for-byte evidence. */
import {createHash} from 'node:crypto';
import {canonicalDigest, HASH, same} from './production-maintenance-receipts.mjs';
import {losslessJsonFacts} from './production-lossless-json.mjs';

const costMigration = 'apps/api/src/database/migrations/1794885912725-InvEggCostingColumns.ts';
const fail = code => { throw Error('MODERN_SCHEMA_POST_AUDIT_HOLD=' + code); };
const sha = raw => createHash('sha256').update(raw).digest('hex');
const object = value => value && Object.getPrototypeOf(value) === Object.prototype;

function unwrap(wrapper, context, ledger, before) {
  if (!object(wrapper) || typeof wrapper.originalAudit !== 'string' || !object(wrapper.evidence)) fail('RAW_AUDIT_WRAPPER_REQUIRED');
  const {evidenceSha256, ...evidence} = wrapper.evidence;
  const report = JSON.parse(wrapper.originalAudit);
  const reference = evidence.referenceCoverage;
  if (context.originalConclusion !== 'HOLD' || evidence.schema !== 'phoenix.legacy-egg-audit-evidence/v1' ||
      evidence.originalAuditSha256 !== sha(wrapper.originalAudit) || evidenceSha256 !== canonicalDigest(evidence) ||
      evidence.targetSha !== context.targetSha || evidence.floorSha !== context.floorSha || evidence.runningApiSha !== context.runtimeSha ||
      evidence.ledgerSha256 !== ledger || evidence.observedLedgerSha256 !== ledger ||
      evidence.originalConclusion !== 'HOLD' || report.conclusion !== 'HOLD' || evidence.disposition !== 'HOLD' ||
      evidence.capturedAt !== report.checked_at || evidence.verifiedTestScope !== false || evidence.releaseAuthorized !== false ||
      canonicalDigest(evidence.databaseIdentity) !== context.databaseIdentitySha256 ||
      !object(reference) || !Array.isArray(reference.inspected) || !reference.inspected.length ||
      !['missing', 'matches', 'uninspectedSources'].every(name => Array.isArray(reference[name]) && reference[name].length === 0)) {
    fail('BOUND_ORIGINAL_HOLD_AND_REFERENCE_EVIDENCE_REQUIRED');
  }
  if (before ? evidence.reason !== 'MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW' || evidence.manifestSha256 !== context.testManifestSha256 :
    evidence.reason !== 'MATCHING_FROZEN_TEST_MANIFEST_REQUIRED' || evidence.manifestSha256 !== null) fail('EXPECTED_COST_DDL_AUDIT_SHAPE_REQUIRED');
  return losslessJsonFacts(wrapper.originalAudit, {omitTopLevel: ['checked_at']});
}

function field(value, name) {
  if (value?.[0] !== 'object') fail('ORIGINAL_GROUP_OBJECT_REQUIRED');
  return value[1].find(entry => entry[0] === name)?.[1];
}
function list(value, name) {
  const found = field(value, name);
  if (found?.[0] !== 'array' || !found[1].length) fail('ORIGINAL_GROUP_ROWS_REQUIRED');
  return found[1];
}

function withoutCostDdl(facts, before) {
  for (const group of list(facts, 'overposted_grades')) {
    for (const [rows, column] of [['inbound_batches', 'unit_cost'], ['inbound_ledger', 'cost_change']]) {
      for (const row of list(group, rows)) {
        const value = field(row, column);
        if (before) {
          if (value !== undefined) fail('NEW_COST_COLUMN_PRESENT_BEFORE_SCHEMA');
          continue;
        }
        const expectedDefault = column === 'unit_cost' ?
          value?.[0] === 'number' && /^0(?:\.0{1,6})?$/.test(value[1]) :
          value?.[0] === 'null';
        if (!expectedDefault) fail('NEW_COST_COLUMN_VALUE_NOT_DDL_DEFAULT');
        row[1].splice(row[1].findIndex(([name]) => name === column), 1);
      }
    }
  }
  return facts;
}

export function verifyModernSchemaAuditAfterSchema({context, before, after, afterLedgerSha256}) {
  if (!HASH.test(afterLedgerSha256 ?? '') || afterLedgerSha256 === context.beforeLedgerSha256 ||
      !context.pendingMigrations.some(unit => unit.path === costMigration && unit.effectiveName === 'InvEggCostingColumns1794885912725')) {
    fail('REVIEWED_COST_SCHEMA_DELTA_REQUIRED');
  }
  const originalFacts = withoutCostDdl(unwrap(before, context, context.beforeLedgerSha256, true), true);
  const afterProjection = withoutCostDdl(unwrap(after, context, afterLedgerSha256, false), false);
  if (!same(originalFacts, afterProjection)) fail('ORIGINAL_AUDIT_CHANGED');
  return {originalConclusion: 'HOLD', auditedFactsSha256: canonicalDigest(originalFacts), originalAuditsPreserved: true};
}
