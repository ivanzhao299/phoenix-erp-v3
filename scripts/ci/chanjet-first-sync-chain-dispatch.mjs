// R4.2d full-chain node router (TEST INFRASTRUCTURE — production never
// installs it): the chain's `node` resolves through the test's PATH wrapper
// into this router. ONLY the two chain steps whose host-trusted-path context
// cannot exist in CI route to their controlled-context drivers:
//   chanjet-readonly-production-audit.mjs -> chain-audit-driver
//   chanjet-readonly-first-sync.mjs       -> chain-entry-driver
// Every other node invocation (the chain's handover write, tooling) passes
// through to the real node unchanged.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(process.env.R42D_SHIM_CONFIG, 'utf8'));
const realNode = process.env.R42D_REAL_NODE || process.execPath;
const script = argv[0] && !argv[0].startsWith('-') ? argv[0] : '';
const base = script.split('/').pop();

const route = (driver, extraEnv = {}) => process.exit(
  spawnSync(realNode, [driver, ...argv], { stdio: 'inherit', env: { ...process.env, ...extraEnv } }).status ?? 1,
);

// the chain stages the audit under its own name ($AUDIT_DIR/audit.mjs); the
// first-sync entry runs under its reviewed name
if (base === 'audit.mjs' || base === 'chanjet-readonly-production-audit.mjs') route(cfg.auditDriver, { R42D_AUDIT_SCRIPT: script });
if (base === 'chanjet-readonly-first-sync.mjs') route(cfg.entryDriver);
process.exit(spawnSync(realNode, argv, { stdio: 'inherit' }).status ?? 1);
