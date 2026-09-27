import fs from 'node:fs';

const PHASE1_COUNT = 4;
const SHA256 = /^sha256:[0-9a-f]{64}$/i;

export function loadPhase1Manifest(file) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(manifest) || manifest.length !== PHASE1_COUNT) {
    throw new Error('PHASE1_MANIFEST_INVALID: expected exactly four migrations');
  }
  const names = new Set();
  const timestamps = new Set();
  for (const entry of manifest) {
    if (!entry || typeof entry.name !== 'string' || !entry.name || !/^\d{13}$/.test(String(entry.timestamp))) {
      throw new Error(`PHASE1_MANIFEST_INVALID: ${JSON.stringify(entry)}`);
    }
    if (names.has(entry.name) || timestamps.has(String(entry.timestamp))) {
      throw new Error('PHASE1_MANIFEST_INVALID: duplicate identity');
    }
    names.add(entry.name);
    timestamps.add(String(entry.timestamp));
  }
  return manifest.map((entry) => ({ name: entry.name, timestamp: String(entry.timestamp) }));
}

export function validateCandidateInventory(manifest, inventory, { imageDigest, executionImageDigest } = {}) {
  const entries = Array.isArray(inventory) ? inventory : inventory?.canonicalTypeorm;
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('CANDIDATE_INVENTORY_INVALID');
  const byTimestamp = new Map(entries.map((entry) => [String(entry.timestamp), entry]));
  for (const expected of manifest) {
    const actual = byTimestamp.get(String(expected.timestamp));
    if (!actual || actual.effective_name !== expected.name || String(actual.timestamp) !== expected.timestamp) {
      throw new Error(`PHASE1_CANDIDATE_IDENTITY_MISMATCH: ${expected.name}`);
    }
  }
  if (imageDigest !== undefined || executionImageDigest !== undefined) {
    if (!SHA256.test(String(imageDigest)) || imageDigest !== executionImageDigest) throw new Error('CANDIDATE_IMAGE_DIGEST_MISMATCH');
  }
  return true;
}

function exactSet(actual, expected) {
  return actual.length === expected.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

export function evaluatePhase1PreExecution({ preflight, pending, manifest, candidateInventory, imageDigest, executionImageDigest }) {
  const errors = [];
  try { validateCandidateInventory(manifest, candidateInventory, { imageDigest, executionImageDigest }); } catch (error) { errors.push(error.message); }
  if (!preflight?.pass || (preflight.failures ?? []).length) errors.push('GENERIC_PREFLIGHT_FAILED');
  const expected = manifest.map((entry) => entry.name);
  if (!exactSet(pending ?? [], expected)) errors.push('PHASE1_PENDING_SET_MISMATCH');
  return { pass: errors.length === 0, failures: errors, phase1PendingExact: errors.includes('PHASE1_PENDING_SET_MISMATCH') ? false : true };
}

export function evaluatePhase1PostMigration({ postflight, applied, manifest, invariants = {}, candidateInventory, imageDigest, executionImageDigest }) {
  const errors = [];
  try { validateCandidateInventory(manifest, candidateInventory, { imageDigest, executionImageDigest }); } catch (error) { errors.push(error.message); }
  if (!postflight?.pass || (postflight.failures ?? []).length) errors.push('POSTFLIGHT_FAILED');
  if ((postflight?.counts?.canonical_typeorm_pending ?? postflight?.canonical_typeorm_pending ?? 0) !== 0) errors.push('CANONICAL_PENDING_REMAINS');
  const appliedSet = new Set(applied ?? []);
  for (const entry of manifest) if (!appliedSet.has(entry.name)) errors.push(`PHASE1_NOT_APPLIED:${entry.name}`);
  if (Object.values(invariants).some((value) => value !== true)) errors.push('INVARIANTS_FAILED');
  return { pass: errors.length === 0, failures: errors };
}

export function authorizeApiSwitch({ backupVerified, precheck, migrationExitCode, postcheck, phase1Applied, schemaInvariants, dataInvariants, candidateIdentity }) {
  return backupVerified === true && precheck === true && migrationExitCode === 0 && postcheck === true && phase1Applied === true && schemaInvariants === true && dataInvariants === true && candidateIdentity === true;
}

function runCli() {
  const args = process.argv.slice(2);
  const mode = args[args.indexOf('--mode') + 1];
  const inputFile = args[args.indexOf('--input') + 1];
  if (!['pre', 'post'].includes(mode) || !inputFile) throw new Error('usage: phase1-production-execution-gate.mjs --mode pre|post --input file');
  const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const manifest = loadPhase1Manifest(input.manifestFile);
  const result = mode === 'pre'
    ? evaluatePhase1PreExecution({ ...input, manifest })
    : evaluatePhase1PostMigration({ ...input, manifest });
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('phase1-production-execution-gate.mjs')) {
  try { runCli(); } catch (error) { console.error(`PHASE1_EXECUTION_BLOCKED=${error.message}`); process.exitCode = 1; }
}
