import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Fixed reviewed import closure, shared by the runner manifest and host stager.
// This module has only built-in imports and can be staged/hash-checked alone.
export const AUDIT_BUNDLE_FILES = Object.freeze([
  'production-deployment-recovery.mjs', 'production-deployment-evidence.mjs', 'production-config-guard.mjs',
  'production-deployment-state.mjs', 'production-atomic-state.mjs', 'production-trusted-paths.mjs',
  'capture-production-runtime.mjs', 'update-managed-chanjet-env.mjs', 'chanjet-readonly-policy.mjs',
  'chanjet-readonly-production-audit.mjs', 'production-config-contract.json', 'chanjet-admission-schema-receipt.mjs',
  'production-maintenance-admission.mjs', 'production-maintenance-receipts.mjs', 'production-maintenance-transition.mjs',
  'production-maintenance-owner-unknown.mjs', 'production-maintenance-reconciliation.mjs',
  'production-maintenance-owner-authority.mjs', 'background-control-legacy-transition.mjs', 'background-control-manifest.mjs',
]);
const sha40 = /^[a-f0-9]{40}$/;
const sha64 = /^[a-f0-9]{64}$/;
const safeName = /^[a-z0-9][a-z0-9._-]*\.(?:mjs|json)$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function stageReadonlyAuditClosure(manifestFile, targetSha, repoRoot, stageDir) {
  if (!sha40.test(targetSha || '')) throw new Error('AUDIT_BUNDLE_TARGET');
  if (!fs.lstatSync(repoRoot).isDirectory() || !fs.lstatSync(stageDir).isDirectory()
    || !fs.lstatSync(manifestFile).isFile()) throw new Error('AUDIT_BUNDLE_PATH');
  const repo = fs.realpathSync(repoRoot), stage = fs.realpathSync(stageDir);
  if (stage === repo || stage.startsWith(repo + path.sep)) throw new Error('AUDIT_BUNDLE_CHECKOUT_WRITE');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const keys = Object.keys(manifest || {}).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['closureSha256', 'fileCount', 'files', 'schema', 'targetSha'])) throw new Error('AUDIT_BUNDLE_FIELDS');
  if (manifest.schema !== 'phoenix.readonly-audit-closure/1' || manifest.targetSha !== targetSha
    || manifest.fileCount !== AUDIT_BUNDLE_FILES.length || !sha64.test(manifest.closureSha256 || '')
    || !Array.isArray(manifest.files) || manifest.files.length !== manifest.fileCount) throw new Error('AUDIT_BUNDLE_MANIFEST');
  if (manifest.files.some(entry => !entry || Object.keys(entry).sort().join(',') !== 'path,sha256'
    || typeof entry.path !== 'string' || !safeName.test(entry.path) || path.basename(entry.path) !== entry.path
    || !sha64.test(entry.sha256 || ''))) throw new Error('AUDIT_BUNDLE_ENTRY');
  const names = manifest.files.map(entry => entry.path);
  if (new Set(names).size !== names.length || JSON.stringify(names.slice().sort()) !== JSON.stringify([...AUDIT_BUNDLE_FILES].sort())) throw new Error('AUDIT_BUNDLE_CLOSURE');
  if (hash(names.slice().sort().join('\n')) !== manifest.closureSha256) throw new Error('AUDIT_BUNDLE_CLOSURE');
  const git = args => execFileSync('git', ['-c', `safe.directory=${repo}`, '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], { cwd: repo, stdio: ['ignore','pipe','pipe'] });
  if (git(['cat-file','-t',targetSha]).toString().trim() !== 'commit') throw new Error('AUDIT_BUNDLE_TARGET');
  // Validate every source before writing any member. Git symlink/submodule modes
  // are not ordinary reviewed source, even if their bytes/hash are supplied.
  const members = manifest.files.map(entry => {
    const out = path.join(stage, entry.path);
    if (fs.existsSync(out)) throw new Error('AUDIT_BUNDLE_OUTPUT');
    const tree = git(['ls-tree','-z',targetSha,'--',`scripts/ops/${entry.path}`]).toString();
    if (!/^100(?:644|755) blob [a-f0-9]{40}\t/.test(tree)) throw new Error('AUDIT_BUNDLE_SOURCE_MODE');
    const bytes = git(['show',`${targetSha}:scripts/ops/${entry.path}`]);
    if (hash(bytes) !== entry.sha256) throw new Error('AUDIT_BUNDLE_HASH');
    return { out, bytes };
  });
  for (const { out, bytes } of members) {
    fs.writeFileSync(out, bytes, { flag: 'wx', mode: 0o600 });
    const stat = fs.lstatSync(out);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) throw new Error('AUDIT_BUNDLE_FILE');
  }
  return manifest.fileCount;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  stageReadonlyAuditClosure(...process.argv.slice(2));
}
