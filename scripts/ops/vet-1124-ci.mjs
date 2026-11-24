import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { canonicalDigest } from './production-maintenance-receipts.mjs';

import { readCommittedSchemaInventory, bindCompiledSchemaInventory, inspectModernSchemaImage } from './production-modern-schema-inventory.mjs';

const repo = 'ivanzhao299/phoenix-erp-v3';
const workflows = ['ci-build.yml', 'ci-security.yml', 'ci-web-tests.yml', 'production-remediation-acceptance.yml', 'deploy.yml'];
const hold = reason => { throw Error('VET_1124_CI_HOLD=' + reason); };

export function evidenceArgs(endpoint, hostedLogReader) {
  // gh 2.104 declines colored job logs even when stdout is a pipe. Capture
  // bytes only for the job-log endpoint; candidateCi strips controls before parsing.
  const groups = hostedLogReader && /^actions\/jobs\/[1-9]\d*\/logs$/.test(endpoint)
    ? ['--allow-escape-sequences'] : [];
  return ['api', ...groups, 'repos/' + repo + '/' + endpoint];
}

export function candidateCi(target, read) {
  if (!/^[0-9a-f]{40}$/.test(target)) hold('TARGET');
  const runs = {};
  for (const file of workflows) {
    const list = JSON.parse(read('actions/workflows/' + file + '/runs?head_sha=' + target + '&branch=main&event=push'));
    if (list.total_count !== 1 || list.workflow_runs?.length !== 1) hold(file);
    const [run] = list.workflow_runs;
    if (run.repository?.full_name !== repo || run.head_repository?.full_name !== repo || run.head_sha !== target
        || run.head_branch !== 'main' || run.event !== 'push' || run.path !== '.github/workflows/' + file
        || run.status !== 'completed' || run.conclusion !== 'success'
        || !Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) hold(file);
    runs[file] = { id: run.id, attempt: run.run_attempt };
  }

  const build = runs['deploy.yml'];
  const list = JSON.parse(read('actions/runs/' + build.id + '/attempts/' + build.attempt + '/jobs?per_page=100'));
  if (!Array.isArray(list.jobs) || list.jobs.length !== list.total_count || list.total_count > 100) hold('JOB_LIST');
  function job(name) {
    const matches = list.jobs.filter(j => j.name === name);
    if (matches.length !== 1) hold(name);
    const [j] = matches;
    if (j.run_id !== build.id || j.head_sha !== target || j.status !== 'completed' || j.conclusion !== 'success'
        || !Number.isSafeInteger(j.id) || j.id < 1) hold(name);
    return j;
  }

  job('Type-check & Regression');
  const images = {};
  for (const component of ['api', 'web']) {
    const j = job('Build & Push ' + component);
    for (const name of ['Build & push ' + component + ' image', 'Verify published API/Web OCI revision contract']) {
      const steps = j.steps?.filter(s => s.name === name);
      if (steps?.length !== 1 || steps[0].conclusion !== 'success') hold(name);
    }
    // deploy.yml verifies the build output by digest. Read only that env
    // line from the official job log. Never print job logs or follow a tag.
    const lines = stripVTControlCharacters(read('actions/jobs/' + j.id + '/logs')).split(/\r?\n/);
    const prefix = 'ghcr.io/' + repo + '/' + component + '@';
    const digests = lines.map(line => /^\S+\s+PUBLISHED_IMAGE:\s+(\S+)\s*$/.exec(line)?.[1])
      .filter(Boolean);
    if (digests.length !== 1 || !digests[0].startsWith(prefix)
        || !/^sha256:[0-9a-f]{64}$/.test(digests[0].slice(prefix.length))) hold('PUBLISHED_' + component);
    images[component] = digests[0];
  }
  return { target, runs, images };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'inventory') {
      const source = readCommittedSchemaInventory(process.cwd(), process.env.TARGET_SHA);
      const { records, proof } = inspectModernSchemaImage(process.env.VET_IMAGE_ID,
        process.env.GITHUB_RUN_ID + '-' + process.env.GITHUB_RUN_ATTEMPT);
      if (proof.revision !== process.env.TARGET_SHA) hold('OCI_REVISION');
      console.log('VET_COMPILED_INVENTORY_SHA256=' + canonicalDigest(bindCompiledSchemaInventory(source, records)));
    } else {
      const result = candidateCi(process.env.TARGET_SHA, endpoint => execFileSync('gh', evidenceArgs(endpoint, process.argv[2] === 'hosted-log-reader'),
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }));
      console.log(JSON.stringify(result));
      appendFileSync(process.env.GITHUB_ENV, 'VET_CI_SHA256=' + canonicalDigest(result) + '\nVET_API_IMAGE=' + result.images.api + '\n');
    }
  } catch (e) {
    console.error(e.message.startsWith('VET_1124_CI_HOLD=') ? e.message : 'VET_1124_CI_HOLD=GITHUB_EVIDENCE_UNAVAILABLE');
    process.exitCode = 1;
  }
}
