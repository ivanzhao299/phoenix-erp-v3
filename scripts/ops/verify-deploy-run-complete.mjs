// R4.2d deploy-completion gate for the independent approved first-sync
// operation: binds THE GIVEN run id/attempt of the production deploy
// workflow and requires its production deploy JOB to have succeeded.
// Production deploys are workflow_dispatch-only (deploy.yml's deploy job
// runs only when github.event_name == 'workflow_dispatch' with
// inputs.approve_production == true; a push to main builds and tests but
// never deploys) — so a push-event run is a REJECTION, never a pass.
//
// CLI: REPO / TARGET_SHA / DEPLOY_RUN_ID (<runId>-<attempt>) env; exit 0
// only when every binding holds.
import { execFileSync } from 'node:child_process';

const RUN_ID_RE = /^\d+$/;
const ATTEMPT_RE = /^\d+$/;
const SHA_RE = /^[a-f0-9]{40}$/;
const DEPLOY_WORKFLOW_NAME = 'CI/CD — Build & Deploy';
const DEPLOY_JOB_PREFIX = 'Deploy ·';

const ghApi = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env }));

export function verifyDeployRunComplete({ repo, runId, attempt, targetSha, run = ghApi }) {
  if (!RUN_ID_RE.test(String(runId || '')) || !ATTEMPT_RE.test(String(attempt || '')) || !SHA_RE.test(String(targetSha || ''))) {
    throw new Error('FIRST_SYNC_HOLD=DEPLOY_RUN_BINDING');
  }
  let runJson;
  try { runJson = run(`repos/${repo}/actions/runs/${runId}`); }
  catch { throw new Error('FIRST_SYNC_HOLD=DEPLOY_RUN_UNREADABLE'); }
  const checks = {
    workflow: runJson?.name === DEPLOY_WORKFLOW_NAME,
    event: runJson?.event === 'workflow_dispatch', // production deploys are dispatch-only
    sha: runJson?.head_sha === targetSha,
    attempt: String(runJson?.run_attempt) === String(attempt),
    completed: runJson?.status === 'completed' && runJson?.conclusion === 'success',
  };
  if (Object.values(checks).some((ok) => !ok)) {
    throw new Error(`FIRST_SYNC_HOLD=DEPLOY_RUN_NOT_COMPLETE;${JSON.stringify(checks)}`);
  }
  let jobs;
  try { jobs = run(`repos/${repo}/actions/runs/${runId}/jobs?per_page=100`)?.jobs ?? []; }
  catch { throw new Error('FIRST_SYNC_HOLD=DEPLOY_RUN_UNREADABLE'); }
  const deployJobs = jobs.filter((job) => String(job?.name || '').startsWith(DEPLOY_JOB_PREFIX));
  // the workflow run succeeding is not enough: the PRODUCTION deploy job
  // inside it (Deploy · <mode>) must itself have succeeded
  if (!deployJobs.length || !deployJobs.every((job) => job.conclusion === 'success')) {
    throw new Error('FIRST_SYNC_HOLD=DEPLOY_JOB_NOT_SUCCESS');
  }
  return { runId: Number(runId), attempt: String(attempt), targetSha, deployJobs: deployJobs.map((job) => job.name) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  try {
    const [runId, attempt] = String(process.env.DEPLOY_RUN_ID || '').split('-');
    const result = verifyDeployRunComplete({ repo: process.env.REPO, runId, attempt, targetSha: process.env.TARGET_SHA });
    console.log(`DEPLOY_COMPLETE=run:${result.runId};attempt:${result.attempt};sha:${result.targetSha};jobs:${result.deployJobs.join('|')}`);
  } catch (error) {
    console.error(String(error?.message || error).split(';')[0]);
    process.exitCode = 1;
  }
}
