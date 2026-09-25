import fs from 'node:fs';
import { loadPhase1Manifest } from './phase1-production-execution-gate.mjs';

export function shouldBlockGenericDeploy(preflight, manifest) {
  const pending = preflight?.diagnostics?.canonical_typeorm_pending ?? [];
  return Boolean(preflight?.pass) && pending.length === manifest.length && manifest.every((entry) => pending.includes(entry.name));
}

if (process.argv[1]?.endsWith('phase1-generic-deploy-guard.mjs')) {
  try {
    const preflight = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const manifest = loadPhase1Manifest(process.argv[3]);
    if (shouldBlockGenericDeploy(preflight, manifest)) {
      console.error('PHASE1_EXECUTION_BLOCKED=USE_PHASE1_CONTROLLED_EXECUTION_WORKFLOW');
      process.exitCode = 42;
    }
  } catch (error) {
    console.error(`PHASE1_EXECUTION_BLOCKED=${error.message}`);
    process.exitCode = 1;
  }
}
