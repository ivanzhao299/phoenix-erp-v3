/** Read-only GitHub evidence adapter. Never submits a review, adds a label or
 * approves a deployment. Source-code Review and target production authority are
 * separate server facts. No environment-verification fallback is installed. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { bindingDigest, canonicalDigest, validateMaintenanceContext, HASH, SHA, iso } from './production-maintenance-receipts.mjs';

const REPOSITORY = 'ivanzhao299/phoenix-erp-v3';
const REVIEW_SCHEMA = 'phoenix.maintenance-source-review/v1';
const API = 'https://api.github.com';
const number = value => Number.isSafeInteger(value) && value > 0;
const login = value => typeof value === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value);
const fail = code => { throw new Error(`MAINTENANCE_GITHUB_HOLD=${code}`); };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const githubTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  && iso(value.includes('.') ? value : value.replace('Z', '.000Z'));
const fields = ['SCHEMA', 'REPOSITORY', 'PR_NUMBER', 'SOURCE_HEAD_SHA', 'SOURCE_REVIEW_RECEIPT_SHA256', 'OPERATIONS', 'SECURITY_TOUCH_DECISION', 'FROZEN_BOUNDARY_DECISION', 'APPROVAL_STATUS'];

export function parseMaintenanceReviewBody(body) {
  if (typeof body !== 'string' || Buffer.byteLength(body) > 65536) fail('REVIEW_BODY_REQUIRED');
  const normalized = body.replace(/\r\n/g, '\n');
  const blocks = [...normalized.matchAll(/^```phoenix-maintenance-source-review\n([\s\S]*?)\n```[ \t]*$/gm)];
  if (blocks.length !== 1 || (normalized.match(/```phoenix-maintenance-source-review/g) || []).length !== 1) fail('ONE_EXPLICIT_APPROVAL_BLOCK_REQUIRED');
  const result = {};
  for (const line of blocks[0][1].split('\n')) {
    const match = /^([A-Z0-9_]+)=([^\r\n]+)$/.exec(line);
    if (!match || !fields.includes(match[1]) || Object.hasOwn(result, match[1]) || match[2] !== match[2].trim()) fail('DUPLICATE_OR_INVALID_REVIEW_FIELD');
    result[match[1]] = match[2];
  }
  if (Object.keys(result).length !== fields.length || result.SCHEMA !== REVIEW_SCHEMA || result.APPROVAL_STATUS !== 'APPROVED'
    || result.SECURITY_TOUCH_DECISION !== 'APPROVED' || result.FROZEN_BOUNDARY_DECISION !== 'APPROVED'
    || !/^\d+$/.test(result.PR_NUMBER) || !result.OPERATIONS.split(',').every(v => /^[A-Z_]{2,50}$/.test(v))
    || new Set(result.OPERATIONS.split(',')).size !== result.OPERATIONS.split(',').length) fail('INCOMPLETE_REVIEW_BINDING');
  return result;
}

/** gh reads its existing credential store. No credential is put in argv, read
 * from disk here, printed, or retained in evidence. Error output is suppressed. */
export function githubReadOnlyApi(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith(`/repos/${REPOSITORY}/`) || /[\r\n#]/.test(endpoint)) fail('API_SCOPE');
  try {
    const bytes = execFileSync('gh', ['api', '--hostname', 'github.com', '--method', 'GET', endpoint,
      '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28'],
    { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(bytes);
  } catch { fail('API_UNAVAILABLE_OR_DENIED'); }
}
function validateRequest(request) {
  validateMaintenanceContext(request?.context);
  if (request.repository !== REPOSITORY || !number(request.prNumber) || !number(request.reviewId) || !SHA.test(request.sourceHeadSha)
    || !HASH.test(request.sourceReviewReceiptDigest) || !HASH.test(request.receiptDigest) || !/^[A-Z_]{2,50}$/.test(request.operation || '') || !/^[A-Z_]{2,50}$/.test(request.purpose || '')) fail('EXACT_REVIEW_REQUEST_REQUIRED');
  if (request.pinnedReviewRecordSha256 !== undefined && !HASH.test(request.pinnedReviewRecordSha256)) fail('PINNED_REVIEW_RECORD_REQUIRED');
  return request;
}
async function reviewPages(api, base) {
  const reviews = [];
  for (let page = 1; page <= 20; page++) {
    const values = await api(`${base}/reviews?per_page=100&page=${page}`);
    if (!Array.isArray(values) || values.length > 100) fail('REVIEW_RESPONSE');
    reviews.push(...values); if (values.length < 100) return reviews;
  }
  fail('REVIEW_PAGINATION_UNBOUNDED');
}
function assertPr(pr, request) {
  if (!pr || pr.number !== request.prNumber || pr.head?.sha !== request.sourceHeadSha || pr.base?.ref !== 'main'
    || pr.base?.repo?.full_name !== REPOSITORY || pr.head?.repo?.full_name !== REPOSITORY
    || !number(pr.user?.id) || !login(pr.user?.login) || pr.user.type !== 'User'
    || !['open', 'closed'].includes(pr.state) || (pr.state === 'closed' && pr.merged !== true)) fail('PR_HEAD_STATE_OR_REPOSITORY_CHANGED');
}
function assertReview(review, request, pr, now) {
  if (!review || review.id !== request.reviewId || review.state !== 'APPROVED' || review.commit_id !== request.sourceHeadSha
    || !number(review.user?.id) || !login(review.user?.login) || review.user.type !== 'User'
    || review.user.id === pr.user.id || review.user.login.toLowerCase() === pr.user.login.toLowerCase()
    || !githubTime(review.submitted_at) || Date.parse(review.submitted_at) > now || review.pull_request_url !== `${API}/repos/${REPOSITORY}/pulls/${request.prNumber}`) fail('INDEPENDENT_EXACT_HEAD_APPROVAL_REQUIRED');
  if (pr.merged === true && (!githubTime(pr.merged_at) || Date.parse(review.submitted_at) > Date.parse(pr.merged_at))) fail('SOURCE_REVIEW_AFTER_MERGE');
  const parsed = parseMaintenanceReviewBody(review.body);
  // This is the code/security Review, whose immutable inputs exist before merge
  // or dispatch. It grants no maintenance permission for a future runtime PRE.
  const expected = { REPOSITORY, PR_NUMBER: String(request.prNumber), SOURCE_HEAD_SHA: request.sourceHeadSha,
    SOURCE_REVIEW_RECEIPT_SHA256: request.sourceReviewReceiptDigest };
  for (const [key, value] of Object.entries(expected)) if (parsed[key] !== value) fail('REVIEW_SCOPE_OR_DIGEST_CHANGED');
  if (!parsed.OPERATIONS.split(',').includes(request.operation)) fail('OPERATION_NOT_APPROVED');
  return parsed;
}

/** Fixed server-only diagnostic producer. GitHub's documented review-history
 * response identifies users/environments/state, but does not supply an immutable
 * approval ID/time or prove a particular frozen artifact digest was approved.
 * Until that linkage is implemented and reviewed, this function NEVER authorizes
 * production. It deliberately accepts no external verifier/proof callback. */
async function readProtectedEnvironmentEvidence(run, environmentConfig, expected, api) {
  const requiredReview = environmentConfig?.protection_rules?.find(rule => rule.type === 'required_reviewers');
  const common = { result: 'HOLD', runRecordSha256: canonicalDigest(run), environmentConfigSha256: canonicalDigest(environmentConfig) };
  if (!requiredReview || !Array.isArray(requiredReview.reviewers) || requiredReview.reviewers.length === 0) return { ...common, reason: 'ENVIRONMENT_REQUIRED_REVIEWERS_NOT_CONFIGURED' };
  if (requiredReview.prevent_self_review !== true) return { ...common, reason: 'ENVIRONMENT_SELF_REVIEW_NOT_PREVENTED' };
  const history = await api(`/repos/${REPOSITORY}/actions/runs/${run.id}/approvals`);
  if (!Array.isArray(history) || history.length > 1000) fail('ENVIRONMENT_REVIEW_HISTORY_RESPONSE');
  const observed = history.filter(item => Array.isArray(item.environments) && item.environments.some(e => e.id === environmentConfig.id && e.name === 'production'));
  return { ...common, reason: 'PROTECTED_ENVIRONMENT_ARTIFACT_BINDING_UNIMPLEMENTED', approvalHistorySha256: canonicalDigest(history),
    observedReviewStates: observed.map(item => ({ state: typeof item.state === 'string' ? item.state : 'UNKNOWN', reviewerId: number(item.user?.id) ? item.user.id : null })),
    expectedContextDigest: expected.contextDigest, expectedReceiptDigest: expected.receiptDigest, runAttempt: run.run_attempt };
}

/** Returns source/target evidence even when the environment authority producer is
 * absent. In that case outcome remains HOLD and productionAuthorized is false. */
export async function collectMaintenanceGithubAuthority(request, dependencies = {}) {
  validateRequest(request); const api = dependencies.api || githubReadOnlyApi; const now = dependencies.now || Date.now;
  const checkedAt = new Date(now()).toISOString(); const base = `/repos/${REPOSITORY}/pulls/${request.prNumber}`;
  const contextDigest = bindingDigest(request.context);
  try {
    const pr = await api(base); assertPr(pr, request);
    const reviews = await reviewPages(api, base);
    if (new Set(reviews.map(r => r.id)).size !== reviews.length || reviews.some(r => !number(r.id) || !number(r.user?.id))) fail('REVIEW_RESPONSE');
    // COMMENTED after APPROVED does not manufacture an approval. Conservatively
    // require the exact selected review to remain that reviewer's latest record.
    const latest = new Map();
    for (const r of [...reviews].sort((a, b) => a.id - b.id)) latest.set(r.user.id, r);
    if ([...latest.values()].some(r => r.state === 'CHANGES_REQUESTED')) fail('UNRESOLVED_CHANGES_REQUESTED');
    const listed = reviews.find(r => r.id === request.reviewId);
    if (!listed || latest.get(listed.user.id)?.id !== request.reviewId) fail('APPROVAL_SUPERSEDED_OR_REVOKED');
    const review = await api(`${base}/reviews/${request.reviewId}`);
    if (canonicalDigest(review) !== canonicalDigest(listed)) fail('REVIEW_CHANGED_DURING_CAPTURE');
    const parsed = assertReview(review, request, pr, now());
    if (request.pinnedReviewRecordSha256 && canonicalDigest(review) !== request.pinnedReviewRecordSha256) fail('PINNED_REVIEW_RECORD_CHANGED');
    const permission = await api(`/repos/${REPOSITORY}/collaborators/${encodeURIComponent(review.user.login)}/permission`);
    // GitHub's permission is a legacy base role: maintain maps to write. The
    // exact role_name is required; plain write and unknown custom roles deny.
    const authorityRole = permission?.role_name;
    if (!['admin', 'maintain'].includes(authorityRole) || permission.permission !== (authorityRole === 'maintain' ? 'write' : 'admin') || permission.user?.id !== review.user.id
      || permission.user?.login?.toLowerCase() !== review.user.login.toLowerCase()) fail('MAINTAIN_OR_ADMIN_AUTHORITY_REQUIRED');
    const sourceReview = { result: 'VERIFIED', reviewId: review.id, reviewerId: review.user.id, reviewer: review.user.login, authorId: pr.user.id, author: pr.user.login,
      permission: authorityRole.toUpperCase(), sourceReviewCommitId: review.commit_id, submittedAt: review.submitted_at,
      bodySha256: sha256(review.body), parsedBinding: parsed, rawRecordSha256: canonicalDigest(review), permissionRecordSha256: canonicalDigest(permission) };
    const main = await api(`/repos/${REPOSITORY}/git/ref/heads/main`);
    if (main?.object?.sha !== request.context.targetSha) fail('CURRENT_MAIN_CHANGED');
    let targetBinding = { result: 'HOLD', reason: 'SOURCE_PR_NOT_MERGED', sourceReviewCommitId: request.sourceHeadSha, targetMainSha: request.context.targetSha };
    if (pr.merged === true) {
      if (pr.state !== 'closed' || pr.merge_commit_sha !== request.context.targetSha || !githubTime(pr.merged_at)) fail('TARGET_NOT_EXACT_SERVER_MERGE');
      const compare = await api(`/repos/${REPOSITORY}/compare/${request.sourceHeadSha}...${request.context.targetSha}`);
      if (compare.base_commit?.sha !== request.sourceHeadSha || compare.merge_base_commit?.sha !== request.sourceHeadSha || !['ahead', 'identical'].includes(compare.status)) fail('SOURCE_NOT_CONTAINED_IN_TARGET');
      targetBinding = { result: 'VERIFIED', sourceReviewCommitId: request.sourceHeadSha, targetMainSha: request.context.targetSha, mergeCommitSha: pr.merge_commit_sha,
        mergedAt: pr.merged_at, rawPrSha256: canonicalDigest(pr), ancestryRecordSha256: canonicalDigest(compare), currentMainRecordSha256: canonicalDigest(main) };
    }
    let environment = { result: 'HOLD', reason: 'PROTECTED_ENVIRONMENT_PRODUCER_UNIMPLEMENTED' };
    if (request.environment) {
      const e = request.environment;
      if (!number(e.runId) || !number(e.attempt) || e.name !== 'production') {
        environment = { result: 'HOLD', reason: 'PROTECTED_ENVIRONMENT_PRODUCER_UNIMPLEMENTED' };
      } else {
        const run = await api(`/repos/${REPOSITORY}/actions/runs/${e.runId}`);
        if (run.id !== e.runId || run.run_attempt !== e.attempt || run.head_sha !== request.context.targetSha || run.repository?.full_name !== REPOSITORY
          || run.event !== 'workflow_dispatch' || run.head_branch !== 'main' || run.path !== '.github/workflows/deploy.yml' || `${e.runId}-${e.attempt}` !== request.context.owner) fail('ENVIRONMENT_RUN_BINDING');
        const envConfig = await api(`/repos/${REPOSITORY}/environments/${encodeURIComponent(e.name)}`);
        if (envConfig?.name !== 'production' || !number(envConfig.id)) fail('EXACT_PRODUCTION_ENVIRONMENT_REQUIRED');
        environment = await readProtectedEnvironmentEvidence(run, envConfig, { contextDigest, receiptDigest: request.receiptDigest }, api);
      }
    }
    // Re-fetch after the environment verifier too: approval can be revoked or
    // edited while that independent, potentially slow verification is running.
    const finalReview = await api(`${base}/reviews/${request.reviewId}`); const finalPr = await api(base);
    const finalReviews = await reviewPages(api, base);
    const finalPermission = await api(`/repos/${REPOSITORY}/collaborators/${encodeURIComponent(review.user.login)}/permission`);
    const finalMain = await api(`/repos/${REPOSITORY}/git/ref/heads/main`);
    if (canonicalDigest(finalReview) !== canonicalDigest(review) || canonicalDigest(finalPr) !== canonicalDigest(pr) || canonicalDigest(finalReviews) !== canonicalDigest(reviews)
      || canonicalDigest(finalPermission) !== canonicalDigest(permission) || canonicalDigest(finalMain) !== canonicalDigest(main)) fail('SERVER_STATE_CHANGED_DURING_CAPTURE');
    if (now() >= Date.parse(request.context.window.end) || now() < Date.parse(request.context.window.start)) fail('MAINTENANCE_WINDOW_CLOSED');
    // No production authority producer is implemented. This cannot be promoted
    // by dependency injection, an arbitrary proof object, a run input or a test.
    return { schema: 'phoenix.maintenance-github-evidence/v1', outcome: 'HOLD', productionAuthorized: false,
      repository: REPOSITORY, prNumber: request.prNumber, contextDigest, receiptDigest: request.receiptDigest, operation: request.operation, purpose: request.purpose,
      sourceReview, targetBinding, environment, reviewPin: request.pinnedReviewRecordSha256 ? 'VERIFIED' : 'HOLD_UNPINNED_SERVER_REVIEW', checkedAt, checkedThrough: new Date(now()).toISOString() };
  } catch (error) {
    return { schema: 'phoenix.maintenance-github-evidence/v1', outcome: 'HOLD', productionAuthorized: false, repository: REPOSITORY,
      prNumber: request.prNumber, contextDigest, reason: /^MAINTENANCE_GITHUB_HOLD=([A-Z_]+)$/.exec(error?.message || '')?.[1] || 'API_UNAVAILABLE_OR_DENIED', checkedAt };
  }
}
