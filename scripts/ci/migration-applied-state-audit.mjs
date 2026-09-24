#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function evaluateAppliedState({ canonicalTypeorm, canonicalLegacy, productionTypeorm, productionLegacy, phase1Expected = [] }) {
  const canonicalNames = canonicalTypeorm.map((x) => x.effective_name);
  const canonicalNameSet = new Set(canonicalNames);
  const legacyNames = canonicalLegacy.map((x) => x.filename);
  const legacySet = new Set(legacyNames);
  const bridgeNames = new Set(legacyNames.map((x) => x.replace(/\.sql$/, '')));
  const prodTypeormNames = productionTypeorm.map((x) => x.name);
  const prodTypeormNameSet = new Set(prodTypeormNames);
  const duplicateName = prodTypeormNames.filter((name, i) => prodTypeormNames.indexOf(name) !== i);
  const timestamps = productionTypeorm.map((x) => Number(x.timestamp));
  const duplicateTimestamp = timestamps.filter((ts, i) => timestamps.indexOf(ts) !== i);
  const timestampMismatch = productionTypeorm.filter((row) => canonicalNameSet.has(row.name) && Number(canonicalTypeorm.find((x) => x.effective_name === row.name).timestamp) !== Number(row.timestamp));
  const legacyApplied = new Set(productionLegacy.map((x) => x.filename));
  const legacyMissing = legacyNames.filter((name) => !legacyApplied.has(name));
  const legacyUnexpected = productionLegacy.filter((row) => !legacySet.has(row.filename));
  const bridgeRows = productionTypeorm.filter((row) => bridgeNames.has(row.name));
  const bridgeMissing = canonicalLegacy.filter((row) => !prodTypeormNameSet.has(row.filename.replace(/\.sql$/, '')));
  const bridgeTimestampMismatch = bridgeRows.filter((row) => {
    const legacy = productionLegacy.find((x) => `${x.filename}`.replace(/\.sql$/, '') === row.name);
    return legacy && legacy.applied_at != null && Number(row.timestamp) !== Number(legacy.applied_at);
  });
  const bridgeState = bridgeTimestampMismatch.length ? 'INCONSISTENT' : bridgeMissing.length ? (bridgeRows.length ? 'PARTIAL' : 'ABSENT') : 'COMPLETE';
  const canonicalApplied = canonicalTypeorm.filter((x) => prodTypeormNameSet.has(x.effective_name));
  const pending = canonicalTypeorm.filter((x) => !prodTypeormNameSet.has(x.effective_name)).map((x) => x.effective_name);
  const unexpectedApplied = productionTypeorm.filter((x) => !canonicalNameSet.has(x.name) && !bridgeNames.has(x.name));
  const unknownRows = unexpectedApplied.filter((x) => !bridgeNames.has(x.name));
  const phase1Set = new Set(phase1Expected);
  const prePhase1Pending = pending.filter((name) => !phase1Set.has(name));
  const phase1AlreadyApplied = phase1Expected.filter((name) => prodTypeormNameSet.has(name));
  const exact = legacyMissing.length === 0 && legacyUnexpected.length === 0 && timestampMismatch.length === 0 && duplicateName.length === 0 && duplicateTimestamp.length === 0 && unknownRows.length === 0 && prePhase1Pending.length === 0 && phase1AlreadyApplied.length === 0 && pending.length === phase1Expected.length && phase1Expected.every((name) => pending.includes(name));
  return { canonicalTypeormTotal: canonicalTypeorm.length, canonicalApplied: canonicalApplied.map((x) => x.effective_name), pending, unexpectedApplied, unknownRows, duplicateName, duplicateTimestamp, timestampMismatch, legacyCanonicalTotal: canonicalLegacy.length, legacyAppliedTotal: legacyApplied.size, legacyMissing, legacyUnexpected, bridgeTotal: canonicalLegacy.length, bridgePresent: bridgeRows.length, bridgeMissing, bridgeTimestampMismatch, bridgeState, phase1Expected: [...phase1Expected], prePhase1Pending, phase1AlreadyApplied, verdict: exact ? 'PHASE1_PENDING_SET_EXACT' : phase1AlreadyApplied.length ? 'PHASE1_MIGRATION_ALREADY_APPLIED_UNEXPECTEDLY' : unknownRows.length ? 'UNKNOWN_TYPEORM_LEDGER_ROWS' : timestampMismatch.length || duplicateName.length || duplicateTimestamp.length ? 'LEDGER_INCONSISTENT' : prePhase1Pending.length ? 'PREEXISTING_PENDING_PRESENT' : 'EVIDENCE_INCOMPLETE' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(fs.readFileSync(process.argv[2] ?? 0, 'utf8'));
  process.stdout.write(`${JSON.stringify(evaluateAppliedState(input), null, 2)}\n`);
}
