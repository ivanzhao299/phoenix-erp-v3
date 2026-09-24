import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAppliedState } from './migration-applied-state-audit.mjs';

const canonicalTypeorm = [
  { effective_name: 'OldMigration1780000000000', timestamp: 1780000000000 },
  { effective_name: 'PhaseOneA1789600000000', timestamp: 1789600000000 },
  { effective_name: 'PhaseOneB1789600100000', timestamp: 1789600100000 },
  { effective_name: 'PhaseOneC1789600200000', timestamp: 1789600200000 },
  { effective_name: 'PhaseOneD1789600300000', timestamp: 1789600300000 },
];
const phase1 = canonicalTypeorm.slice(1).map((x) => x.effective_name);
const legacy = [{ filename: '20260101-old.sql' }];
const base = { canonicalTypeorm, canonicalLegacy: legacy, productionLegacy: legacy, phase1Expected: phase1 };

test('exact Phase 1 pending set', () => {
  const result = evaluateAppliedState({ ...base, productionTypeorm: [{ name: canonicalTypeorm[0].effective_name, timestamp: canonicalTypeorm[0].timestamp }, { name: '20260101-old', timestamp: 1 }] });
  assert.equal(result.verdict, 'PHASE1_PENDING_SET_EXACT');
  assert.equal(result.bridgeState, 'COMPLETE');
});

test('pre-existing pending blocks', () => {
  const result = evaluateAppliedState({ ...base, productionTypeorm: [] });
  assert.equal(result.verdict, 'PREEXISTING_PENDING_PRESENT');
  assert.equal(result.prePhase1Pending.length, 1);
});

test('unknown ledger row blocks', () => {
  const result = evaluateAppliedState({ ...base, productionTypeorm: [{ name: canonicalTypeorm[0].effective_name, timestamp: canonicalTypeorm[0].timestamp }, { name: 'Mystery1781111111111', timestamp: 1781111111111 }] });
  assert.equal(result.verdict, 'UNKNOWN_TYPEORM_LEDGER_ROWS');
});

test('partial bridge is separate from TypeORM pending', () => {
  const result = evaluateAppliedState({ ...base, canonicalLegacy: [{ filename: '20260101-old.sql' }, { filename: '20260102-new.sql' }], productionLegacy: legacy, productionTypeorm: [{ name: canonicalTypeorm[0].effective_name, timestamp: canonicalTypeorm[0].timestamp }, { name: '20260101-old', timestamp: 1 }] });
  assert.equal(result.bridgeState, 'PARTIAL');
  assert.equal(result.verdict, 'EVIDENCE_INCOMPLETE');
});

test('same name with wrong timestamp blocks', () => {
  const result = evaluateAppliedState({ ...base, productionTypeorm: [{ name: canonicalTypeorm[0].effective_name, timestamp: 42 }, { name: '20260101-old', timestamp: 1 }] });
  assert.equal(result.verdict, 'LEDGER_INCONSISTENT');
  assert.equal(result.timestampMismatch.length, 1);
});

test('duplicate name and timestamp block', () => {
  const result = evaluateAppliedState({ ...base, productionTypeorm: [{ name: canonicalTypeorm[0].effective_name, timestamp: canonicalTypeorm[0].timestamp }, { name: canonicalTypeorm[0].effective_name, timestamp: canonicalTypeorm[0].timestamp }] });
  assert.equal(result.verdict, 'LEDGER_INCONSISTENT');
  assert.ok(result.duplicateName.length);
  assert.ok(result.duplicateTimestamp.length);
});

test('unexpected Phase 1 already applied blocks', () => {
  const result = evaluateAppliedState({ ...base, productionTypeorm: canonicalTypeorm.map((x) => ({ name: x.effective_name, timestamp: x.timestamp })) });
  assert.equal(result.verdict, 'PHASE1_MIGRATION_ALREADY_APPLIED_UNEXPECTEDLY');
  assert.equal(result.phase1AlreadyApplied.length, 4);
});
