#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);

function getArg(name, fallback = '') {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
}

const dryRun = args.includes('--dry-run');
const apiBase = getArg('--api-base', process.env.PHOENIX_API_BASE || 'http://localhost:3100/api').replace(/\/$/, '');
const token = getArg('--token', process.env.PHOENIX_ACCESS_TOKEN || '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');

function markdown(state) {
  const rows = state.implementationOrder.map((item) =>
    `|${item.phase}|${item.title}|${item.status}|${item.score}|${item.nextAction}|`,
  );
  return [
    '# Chanjet P0-P5 Runtime Current State',
    '',
    `Generated: ${state.generatedAt}`,
    '',
    `Decision: ${state.decision}`,
    '',
    `Evidence: ${state.authoritativeEvidence}`,
    '',
    '|Phase|Title|Status|Score|Next action|',
    '|---|---|---|---:|---|',
    ...rows,
    '',
    '## Blockers',
    '',
    ...(state.blockers.length ? state.blockers.map((item) => `- ${item}`) : ['- None']),
    '',
    '## Conditions',
    '',
    ...(state.conditions.length ? state.conditions.map((item) => `- ${item}`) : ['- None']),
    '',
    '## Guardrails',
    '',
    '- Chanjet write/delete/modify: disabled.',
    '- Voucher push: disabled.',
    '- ERP business overwrite: disabled.',
    '- This audit performs no migration, DB write, push, or deploy.',
    '',
    `Stale evidence policy: ${state.staleEvidencePolicy}`,
    '',
  ].join('\n');
}

async function main() {
  if (dryRun) {
    process.stdout.write(JSON.stringify({
      mode: 'dry-run',
      endpoint: `${apiBase}/chanjet/integration/current-state`,
      authenticated: Boolean(token),
      outputJson: join(outputDir, 'chanjet-current-state-latest.json'),
      outputMd: join(outputDir, 'chanjet-current-state-latest.md'),
      externalWrite: false,
      databaseWrite: false,
      deploy: false,
      push: false,
    }, null, 2) + '\n');
    return;
  }
  if (!token) {
    throw new Error('PHOENIX_ACCESS_TOKEN or --token is required for authenticated current-state audit');
  }
  const response = await fetch(`${apiBase}/chanjet/integration/current-state`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true || !payload.currentState) {
    throw new Error(payload.error || payload.message || `Current-state audit failed with HTTP ${response.status}`);
  }
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'chanjet-current-state-latest.json'), `${JSON.stringify(payload.currentState, null, 2)}\n`);
  writeFileSync(join(outputDir, 'chanjet-current-state-latest.md'), markdown(payload.currentState));
  process.stdout.write(`${payload.currentState.decision}: ${payload.currentState.summary.nextGate}\n`);
  if (payload.currentState.decision === 'HOLD') process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`chanjet-current-state-audit: ${error.message}\n`);
  process.exitCode = 1;
});
