#!/usr/bin/env node
// Trusted-root admission registration CLI (R4.2 transport/CLI wiring stage).
//
// This is the registration PRIMITIVE for a reviewed execution manifest. It is
// deliberately narrow: validate -> bind the reviewed floor -> register through
// the exact admission store the API consumes (INSERT-only, DB-enforced
// bindings). It performs NO approval generation, NO scope negotiation and NO
// provider contact. Production invocation happens only inside the separately
// approved exact-SHA root control workflow (FD9/production/mapping/tuple
// guards live there); ordinary API bearers and HTTP-submitted manifests have
// no path to this file. DB constraints bind the tuple under ordinary DML —
// a same-role table owner can bypass triggers, so this is NOT claimed to be
// physical privilege isolation.
//
// Usage:
//   node scripts/ops/chanjet-execution-admission-register.mjs \
//     --manifest <json-file> --expected-floor-sha <40-hex> \
//     [--pg-url postgresql://...] [--register]
//
// Exit codes: 0 registered/dry-run · 2 usage · 3 duplicate · 4 floor mismatch
//             5 invalid manifest · 6 registration rejected (e.g. expiry window)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const getArg = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : undefined;
};

const manifestFile = getArg('--manifest');
const expectedFloorSha = getArg('--expected-floor-sha') || '';
const pgUrl = getArg('--pg-url') || process.env.CHANJET_ADMISSION_FIXTURE_URL
  || (process.env.PGHOST ? `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'postgres'}` : '');
const register = args.includes('--register');
const fail = (code, message) => { console.error(`CHANJET_ADMISSION_REGISTER=${message}`); process.exit(code); };

if (!manifestFile || !/^[a-f0-9]{40}$/.test(expectedFloorSha)) fail(2, 'USAGE_MANIFEST_AND_FLOOR_SHA_REQUIRED');
if (register && !pgUrl) fail(2, 'PG_URL_REQUIRED');

let parsed;
try { parsed = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { fail(5, 'MANIFEST_UNREADABLE'); }
const { validateExecutionManifest } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'chanjet-execution-manifest.mjs'));
let binding;
try { binding = validateExecutionManifest(parsed); } catch { fail(5, 'MANIFEST_INVALID'); }
if (binding.manifest.approval.floorSha !== expectedFloorSha) fail(4, 'FLOOR_SHA_MISMATCH');

const summary = {
  executionId: binding.manifest.executionId,
  approvalId: binding.manifest.approval.approvalId,
  floorSha: binding.manifest.approval.floorSha,
  requestCap: binding.manifest.requestCap,
  totalTimeoutMs: binding.manifest.totalTimeoutMs,
  httpTimeoutMs: binding.manifest.httpTimeoutMs,
  digest: binding.digest,
  verificationExpiresAt: binding.manifest.approval.verification.expiresAt,
};

if (!register) {
  console.log(`CHANJET_ADMISSION_REGISTER=DRY_RUN;${JSON.stringify(summary)}`);
  process.exit(0);
}

const distStore = path.resolve(process.cwd(), 'apps/api/dist/modules/chanjet/chanjet-execution-admission.store.js');
if (!fs.existsSync(distStore)) fail(2, 'COMPILED_ADMISSION_STORE_MISSING');
const { ChanjetExecutionAdmissionStore } = await import(pathToFileURL(distStore).href);
const { DataSource } = await import(path.resolve(process.cwd(), 'apps/api/node_modules/typeorm/index.js'));

const dataSource = new DataSource({ type: 'postgres', url: pgUrl, logging: false });
try {
  await dataSource.initialize();
  const preflight = await dataSource.query(`SELECT to_regclass('public.chanjet_execution_admissions') AS t`);
  if (!preflight[0]?.t) fail(6, 'ADMISSION_TABLE_MISSING');
  // The store masks driver errors behind CHANJET_ADMISSION_HOLD, so the
  // duplicate case is detected explicitly before the INSERT.
  const existing = await dataSource.query('SELECT execution_id FROM chanjet_execution_admissions WHERE execution_id=$1', [binding.manifest.executionId]);
  if (existing.length) fail(3, 'REGISTRATION_DUPLICATE');
  const store = new ChanjetExecutionAdmissionStore(dataSource.manager);
  const row = await store.registerFromReviewedRootManifest(parsed);
  console.log(`CHANJET_ADMISSION_REGISTER=REGISTERED;${JSON.stringify({
    ...summary,
    phase: row.phase,
    requestCount: row.request_count,
    deadlineAt: row.deadline_at instanceof Date ? row.deadline_at.toISOString() : String(row.deadline_at),
  })}`);
} catch (error) {
  const text = String(error?.message || error);
  if (error?.code === '23505' || /duplicate key/i.test(text)) fail(3, 'REGISTRATION_DUPLICATE');
  if (/CHANJET_ADMISSION_REGISTRATION/.test(text)) fail(6, 'REGISTRATION_REJECTED');
  // Sanitized diagnostics only: error class/shape, never credentials or payload.
  console.error(`CHANJET_ADMISSION_REGISTER_DIAGNOSTIC=${text.replace(/[^\x20-\x7e]/g, ' ').slice(0, 200)}`);
  fail(6, 'REGISTRATION_FAILED');
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}
