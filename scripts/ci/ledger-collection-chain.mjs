#!/usr/bin/env node
// R4.2d production ledger collection — RUNNER-SIDE CHAIN (materialized,
// reviewable, and testable without any production network). The workflow is
// a thin wrapper around this script; every phase is verifiable in CI via an
// injected local transport:
//
//   deps        — node --check on the collector/adapter/preflight trio and
//                 the transitive dependency the inventory generator needs
//   bind        — git HEAD === the approved collection ref AND the checked
//                 out collector's sha256 === the approved digest
//   inventory   — offline inventories for main and the collection ref
//   collect     — deliver the pinned collector + run the HOST script through
//                 the transport (ssh in production, a local shell in tests);
//                 recover the result FROM THE TRANSPORT'S STDOUT
//   verify      — the recovered document's sha256 must equal the digest the
//                 host printed for the RAW file (byte-exact recovery), and
//                 the document must be a real collection document
//   evaluate    — the offline adapter evaluates BOTH inventories over the
//                 ONE recovered snapshot
//   archive     — ALWAYS: the evidence directory records every artifact,
//                 digests, and on failure a failure marker plus the captured
//                 transport stdout/stderr (exception archiving)
//
// Exit contract: 0 = PASS evaluation; 1 = BLOCK evaluation (real verdict);
// 2 = input refusal (deps/bind/inventory problems — never an evaluation);
// 3 = remote/collection failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const collectorRel = 'scripts/ops/ledger-readonly-collect.mjs';
const hostScriptRel = 'scripts/ops/ledger-collection-host.sh';
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function parseChainArgs(argv) {
  const args = { collectionRef: process.env.COLLECTION_REF, expectedCollectorSha256: process.env.EXPECTED_COLLECTOR_SHA256, evidenceDir: process.env.CHAIN_EVIDENCE_DIR, mode: 'ssh', mainRef: 'origin/main' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--collection-ref') args.collectionRef = argv[++i];
    else if (arg === '--expected-collector-sha256') args.expectedCollectorSha256 = argv[++i];
    else if (arg === '--evidence-dir') args.evidenceDir = argv[++i];
    else if (arg === '--transport') args.mode = argv[++i];
    else if (arg === '--main-ref') args.mainRef = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  for (const [key, value] of Object.entries({ collectionRef: args.collectionRef, expectedCollectorSha256: args.expectedCollectorSha256, evidenceDir: args.evidenceDir })) {
    if (!value) throw new Error(`MISSING_INPUT: --${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} is required`);
  }
  if (!['ssh', 'local'].includes(args.mode)) throw new Error(`INVALID_INPUT: unknown transport: ${args.mode}`);
  return args;
}

// the PRODUCTION transport: a real ssh invocation (key materialized by the
// workflow into a temp file; jump host via -J). The host script is piped on
// stdin with the env prefix exported inline.
export function sshRemoteShell(env = process.env) {
  const dest = env.SSH_DEST;
  const keyFile = env.SSH_KEY_FILE;
  if (!dest || !keyFile) throw new Error('MISSING_INPUT: SSH_DEST and SSH_KEY_FILE are required for the ssh transport');
  const port = env.SSH_PORT ? ['-p', env.SSH_PORT] : [];
  const jump = env.SSH_PROXY_DEST ? ['-J', env.SSH_PROXY_DEST] : [];
  return (hostScriptBody, exportedEnv) => {
    const envPrefix = Object.entries(exportedEnv).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
    const command = `${envPrefix} bash -s`;
    return spawnSync('ssh', ['-i', keyFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', ...jump, ...port, dest, command], { input: hostScriptBody, encoding: 'utf8', timeout: 10 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  };
}

// the TEST transport: run the host script locally (the fixture container
// plays the deploy host's database; DEPLOY_PATH points at a local directory)
export function localRemoteShell() {
  return (hostScriptBody, exportedEnv) => {
    const env = { ...process.env, ...exportedEnv };
    return spawnSync('bash', ['-s'], { input: hostScriptBody, encoding: 'utf8', env, timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
  };
}

export async function runCollectionChain(args, deps = {}) {
  const exec = deps.exec || ((file, argv, opts) => execFileSync(file, argv, { cwd: repoRoot, encoding: 'utf8', ...opts }));
  const remoteShell = deps.remoteShell || (args.mode === 'local' ? localRemoteShell() : sshRemoteShell());
  const evidenceDir = args.evidenceDir;
  fs.mkdirSync(evidenceDir, { recursive: true });
  const failure = (code, stage, detail) => {
    fs.writeFileSync(path.join(evidenceDir, 'FAILURE.txt'), `stage=${stage}\ncode=${code}\n${detail}\n`);
    return { code, stage, detail };
  };

  // ── deps: the toolchain is syntactically sound and its dependency present ──
  try {
    for (const rel of [collectorRel, 'scripts/ops/ledger-offline-evaluate.mjs', 'scripts/ledger-preflight.mjs']) {
      exec('node', ['--check', rel]);
    }
    exec('bash', ['-n', hostScriptRel]);
    exec('node', ['-e', 'require.resolve("typescript/lib/typescript.js", { paths: [process.cwd() + "/apps/api/node_modules"] })']);
  } catch (error) {
    return failure(2, 'deps', String(error?.message || error));
  }

  // ── bind: the checkout IS the approved ref and the collector IS the digest ──
  let collectorSha256;
  try {
    const head = exec('git', ['rev-parse', 'HEAD']).trim();
    if (head !== args.collectionRef) return failure(2, 'bind', `HEAD ${head} !== approved ref ${args.collectionRef}`);
    collectorSha256 = sha256(path.join(repoRoot, collectorRel));
    if (collectorSha256 !== args.expectedCollectorSha256) return failure(2, 'bind', `collector sha256 ${collectorSha256} !== approved ${args.expectedCollectorSha256}`);
    fs.writeFileSync(path.join(evidenceDir, 'bind.txt'), `ref=${head}\ncollector_sha256=${collectorSha256}\nhost_script_sha256=${sha256(path.join(repoRoot, hostScriptRel))}\n`);
  } catch (error) {
    return failure(2, 'bind', String(error?.message || error));
  }

  // ── inventory: offline, for BOTH refs ────────────────────────────────────
  const invMain = path.join(evidenceDir, 'inv-main.json');
  const invCollection = path.join(evidenceDir, 'inv-collection.json');
  try {
    exec('node', ['scripts/ci/ledger-source-inventory.mjs', args.mainRef, invMain]);
    exec('node', ['scripts/ci/ledger-source-inventory.mjs', args.collectionRef, invCollection]);
  } catch (error) {
    return failure(2, 'inventory', String(error?.message || error));
  }

  // ── collect: run the HOST script through the transport ───────────────────
  const hostScriptBody = fs.readFileSync(path.join(repoRoot, hostScriptRel), 'utf8');
  const deployPath = deps.deployPath || process.env.DEPLOY_PATH || repoRoot;
  const run = remoteShell(hostScriptBody, {
    COLLECTOR_B64: fs.readFileSync(path.join(repoRoot, collectorRel)).toString('base64'),
    COLLECTOR_SHA256: collectorSha256,
    DEPLOY_PATH: deployPath,
    EVIDENCE_DIR: path.join(evidenceDir, 'host'),
  });
  fs.writeFileSync(path.join(evidenceDir, 'transport-stdout.txt'), run.stdout ?? '');
  fs.writeFileSync(path.join(evidenceDir, 'transport-stderr.txt'), run.stderr ?? '');
  if (run.status !== 0) {
    return failure(3, 'collect', `host exit=${run.status}`);
  }

  // ── verify: stdout recovery + the RAW digest must match byte-exactly ────
  let documentB64;
  let hostDigest;
  try {
    const lines = String(run.stdout ?? '').split('\n');
    const resultLine = lines.reverse().find((l) => l.startsWith('COLLECTION_RESULT_B64='));
    const digestLine = lines.reverse().find((l) => l.startsWith('COLLECTION_SHA256='));
    if (!resultLine || !digestLine) return failure(3, 'verify', 'the host stdout lacks the result/digest lines');
    documentB64 = resultLine.slice('COLLECTION_RESULT_B64='.length).trim();
    hostDigest = digestLine.slice('COLLECTION_SHA256='.length).trim();
    const raw = Buffer.from(documentB64, 'base64');
    const recoveredDigest = crypto.createHash('sha256').update(raw).digest('hex');
    if (recoveredDigest !== hostDigest) return failure(3, 'verify', `recovered digest ${recoveredDigest} !== host digest ${hostDigest}`);
    const doc = JSON.parse(raw.toString('utf8'));
    if (doc.schema !== 'phoenix.ledger-readonly-collection/v1' || !Array.isArray(doc.schema_migrations) || !Array.isArray(doc.migrations) || !doc.snapshot) return failure(3, 'verify', 'recovered document is not a collection document');
    fs.writeFileSync(path.join(evidenceDir, 'collection.json'), JSON.stringify(doc, null, 2));
    fs.writeFileSync(path.join(evidenceDir, 'collection.sha256'), `${recoveredDigest}\n`);
  } catch (error) {
    return failure(3, 'verify', String(error?.message || error));
  }

  // ── evaluate: BOTH inventories over the ONE snapshot ─────────────────────
  const evaluations = [];
  try {
    for (const [name, inventory] of [['main', invMain], ['collection', invCollection]]) {
      const outFile = path.join(evidenceDir, `eval-${name}.json`);
      const runAdapter = spawnSync(process.execPath, ['scripts/ops/ledger-offline-evaluate.mjs', '--collection', path.join(evidenceDir, 'collection.json'), '--inventory', inventory, '--legacy-dir', 'apps/api/migrations', '--retired', 'scripts/ci/retired-typeorm-migrations.json', '--mode', 'pre-migration', '--out', outFile], { cwd: repoRoot, encoding: 'utf8' });
      fs.writeFileSync(path.join(evidenceDir, `eval-${name}.stdout.txt`), runAdapter.stdout ?? '');
      fs.writeFileSync(path.join(evidenceDir, `eval-${name}.stderr.txt`), runAdapter.stderr ?? '');
      if (runAdapter.status === 2) return failure(2, `evaluate-${name}`, String(runAdapter.stderr || 'adapter refusal'));
      if (runAdapter.status !== 0 && runAdapter.status !== 1) return failure(3, `evaluate-${name}`, `adapter exit=${runAdapter.status}`);
      evaluations.push({ name, verdict: JSON.parse(fs.readFileSync(outFile, 'utf8')).result.pass ? 'PASS' : 'BLOCK', exit: runAdapter.status });
    }
  } catch (error) {
    return failure(3, 'evaluate', String(error?.message || error));
  }

  // ── archive: record the summary (failures already recorded their marker) ─
  fs.writeFileSync(path.join(evidenceDir, 'SUMMARY.txt'), [
    `ref=${args.collectionRef}`,
    `collector_sha256=${collectorSha256}`,
    `collection_sha256=${hostDigest}`,
    ...evaluations.map((e) => `eval_${e.name}=${e.verdict}`),
    '',
  ].join('\n'));
  const blocked = evaluations.some((e) => e.verdict === 'BLOCK');
  return { code: blocked ? 1 : 0, stage: 'done', evaluations };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runCollectionChain(parseChainArgs(process.argv.slice(2)));
    console.log(`LEDGER_COLLECTION_CHAIN=code:${result.code};stage:${result.stage}${result.evaluations ? ';evals:' + result.evaluations.map((e) => `${e.name}=${e.verdict}`).join(',') : ''}`);
    process.exitCode = result.code;
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 2;
  }
}
