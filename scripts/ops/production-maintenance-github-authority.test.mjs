import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMaintenanceGithubAuthority, parseMaintenanceReviewBody } from './production-maintenance-github-authority.mjs';
import { MAINTENANCE_CONTEXT_SCHEMA, canonicalDigest } from './production-maintenance-receipts.mjs';
const repo = 'ivanzhao299/phoenix-erp-v3'; const base = `/repos/${repo}`; const pull = `${base}/pulls/500`;
const old = 'a'.repeat(40), target = 'b'.repeat(40), head = 'c'.repeat(40), hash = 'd'.repeat(64);
const now = Date.parse('2026-10-18T01:10:00Z');
function fixture() {
  const pin = n => ({ id: n.repeat(64), imageId: `sha256:${n.repeat(64)}`, revision: old, startedAt: '2026-10-17T00:00:00.000Z', restartCount: 0, running: true, health: 'healthy' });
  const apiPin = pin('1');
  const context = { schema: MAINTENANCE_CONTEXT_SCHEMA, protocolVersion: 1, owner: '123-1', previousFloorSha: old, previousApiSha: old, previousWebSha: old, targetSha: target,
    window: { start: '2026-10-18T01:00:00.000Z', end: '2026-10-18T01:20:00.000Z' }, candidate: { revision: target, imageId: `sha256:${hash}` }, sourceHelperSha256: hash, schemaEvidenceSha256: hash,
    migrationPaths: [], preSnapshot: { api: apiPin, web: pin('2'), db: { ...pin('3'), mountsSha256: hash } }, executors: [apiPin] };
  const request = { repository: repo, prNumber: 500, sourceHeadSha: head, reviewId: 42, context, sourceReviewReceiptDigest: hash, receiptDigest: hash, operation: 'STOP_LEGACY', purpose: 'MAINTENANCE', environment: { runId: 123, attempt: 1, name: 'production' } };
  const binding = { SCHEMA: 'phoenix.maintenance-source-review/v1', REPOSITORY: repo, PR_NUMBER: '500', SOURCE_HEAD_SHA: head,
    SOURCE_REVIEW_RECEIPT_SHA256: hash, OPERATIONS: 'FENCE_INGRESS,STOP_LEGACY', SECURITY_TOUCH_DECISION: 'APPROVED', FROZEN_BOUNDARY_DECISION: 'APPROVED', APPROVAL_STATUS: 'APPROVED' };
  const body = 'Reviewed exact source code and security evidence.\n```phoenix-maintenance-source-review\n' + Object.entries(binding).map(([k, v]) => `${k}=${v}`).join('\n') + '\n```';
  const author = { id: 1, login: 'code-author', type: 'User' }; const reviewer = { id: 2, login: 'independent-reviewer', type: 'User' };
  const review = { id: 42, user: reviewer, commit_id: head, state: 'APPROVED', submitted_at: '2026-10-18T01:02:00Z', body, pull_request_url: `https://api.github.com/repos/${repo}/pulls/500` };
  request.pinnedReviewRecordSha256 = canonicalDigest(review);
  const pr = { number: 500, user: author, state: 'closed', merged: true, merged_at: '2026-10-18T01:03:00Z', merge_commit_sha: target,
    head: { sha: head, repo: { full_name: repo } }, base: { ref: 'main', repo: { full_name: repo } } };
  const permission = { permission: 'write', role_name: 'maintain', user: reviewer };
  const responses = { [pull]: pr, [`${pull}/reviews?per_page=100&page=1`]: [review], [`${pull}/reviews/42`]: review,
    [`${base}/collaborators/${reviewer.login}/permission`]: permission, [`${base}/git/ref/heads/main`]: { object: { sha: target } },
    [`${base}/compare/${head}...${target}`]: { base_commit: { sha: head }, merge_base_commit: { sha: head }, status: 'ahead' },
    [`${base}/actions/runs/123`]: { id: 123, run_attempt: 1, head_sha: target, head_branch: 'main', repository: { full_name: repo }, event: 'workflow_dispatch', path: '.github/workflows/deploy.yml' },
    [`${base}/actions/runs/123/approvals`]: [{ state: 'approved', user: { id: 3, login: 'environment-reviewer' }, environments: [{ id: 9, name: 'production' }] }],
    [`${base}/environments/production`]: { id: 9, name: 'production', protection_rules: [{ type: 'required_reviewers', prevent_self_review: true, reviewers: [{ type: 'User', reviewer: { id: 3 } }] }] } };
  const calls = [];
  const readApi = async endpoint => { calls.push(endpoint); if (!Object.hasOwn(responses, endpoint)) throw new Error('UNKNOWN_ENDPOINT'); return structuredClone(responses[endpoint]); };
  const verifyProtectedEnvironment = async ({ expected }) => ({ result: 'VERIFIED', runId: 123, attempt: 1, contextDigest: expected.contextDigest, receiptDigest: hash,
    targetSha: expected.targetSha, owner: expected.owner, environment: expected.environment, operation: expected.operation, purpose: expected.purpose,
    state: 'APPROVED', approvalRecordId: 71, reviewerId: 3, serverEvidenceSha256: hash });
  return { request, review, pr, permission, binding, responses, calls, api: readApi, verifyProtectedEnvironment };
}
const collect = (f, extra = {}) => collectMaintenanceGithubAuthority(f.request, { api: f.api, now: () => now, ...extra });
test('exact source Review and server merge are distinct; missing environment producer remains HOLD', async () => {
  const f = fixture(); const result = await collect(f);
  assert.equal(result.sourceReview.result, 'VERIFIED'); assert.equal(result.sourceReview.sourceReviewCommitId, head);
  assert.equal(result.targetBinding.mergeCommitSha, target); assert.equal(result.environment.reason, 'PROTECTED_ENVIRONMENT_ARTIFACT_BINDING_UNIMPLEMENTED');
  assert.equal(result.productionAuthorized, false); assert.equal(result.outcome, 'HOLD');
});
test('external proof callback cannot promote a fixture to production authority', async () => {
  const f = fixture(); let called = false; const result = await collect(f, { verifyProtectedEnvironment: async args => { called = true; return f.verifyProtectedEnvironment(args); } });
  assert.equal(result.outcome, 'HOLD'); assert.equal(result.productionAuthorized, false); assert.equal(called, false);
  assert.equal(result.environment.reason, 'PROTECTED_ENVIRONMENT_ARTIFACT_BINDING_UNIMPLEMENTED');
  assert.ok(result.sourceReview.rawRecordSha256); assert.equal(result.targetBinding.targetMainSha, target);
});
test('OPEN source PR may supply source proof but cannot authorize production target', async () => {
  const f = fixture(); f.pr.state = 'open'; f.pr.merged = false; f.pr.merge_commit_sha = null;
  const result = await collect(f, { verifyProtectedEnvironment: f.verifyProtectedEnvironment });
  assert.equal(result.sourceReview.result, 'VERIFIED'); assert.equal(result.targetBinding.reason, 'SOURCE_PR_NOT_MERGED'); assert.equal(result.productionAuthorized, false);
});
test('review body requires one canonical explicit block with no duplicate, omitted or ambiguous fields', () => {
  const f = fixture(); assert.equal(parseMaintenanceReviewBody(f.review.body).SOURCE_HEAD_SHA, head);
  for (const body of [f.review.body + '\n' + f.review.body, f.review.body.replace(`SOURCE_HEAD_SHA=${head}`, `SOURCE_HEAD_SHA=${head}\nSOURCE_HEAD_SHA=${head}`), f.review.body.replace(`SOURCE_HEAD_SHA=${head}\n`, '')]) {
    assert.throws(() => parseMaintenanceReviewBody(body));
  }
});
test('old source HEAD, self review by login or immutable id and non-APPROVE states deny', async () => {
  for (const mutate of [f => { f.pr.head.sha = old; }, f => { f.review.commit_id = old; }, f => { f.review.user.id = f.pr.user.id; },
    f => { f.review.user.login = f.pr.user.login; }, f => { f.review.state = 'COMMENTED'; }, f => { f.review.state = 'DISMISSED'; }]) {
    const f = fixture(); mutate(f); const result = await collect(f); assert.equal(result.productionAuthorized, false); assert.equal(result.outcome, 'HOLD');
  }
});
test('write permission does not satisfy maintain/admin; revoked or mismatched identity denies', async () => {
  for (const mutate of [f => { f.permission.role_name = 'write'; }, f => { f.permission.permission = 'read'; }, f => { f.permission.user = { ...f.permission.user, id: 99 }; }]) {
    const f = fixture(); mutate(f); assert.equal((await collect(f)).reason, 'MAINTAIN_OR_ADMIN_AUTHORITY_REQUIRED');
  }
});
test('later review supersedes selected approval and outstanding CHANGES_REQUESTED blocks', async () => {
  for (const state of ['COMMENTED', 'DISMISSED', 'CHANGES_REQUESTED']) {
    const f = fixture(); f.responses[`${pull}/reviews?per_page=100&page=1`].push({ ...f.review, id: 43, state });
    const result = await collect(f); assert.equal(result.outcome, 'HOLD');
  }
  const f = fixture(); f.responses[`${pull}/reviews?per_page=100&page=1`].push({ ...f.review, id: 43, user: { id: 9, login: 'other-reviewer' }, state: 'CHANGES_REQUESTED' });
  assert.equal((await collect(f)).reason, 'UNRESOLVED_CHANGES_REQUESTED');
});
test('changed context/receipt/operation/run binding or extra inline scope cannot use approval', async () => {
  for (const mutate of [f => { f.request.receiptDigest = 'e'.repeat(64); }, f => { f.request.operation = 'OPEN_CANDIDATE'; }, f => { f.request.context.owner = '124-1'; },
    f => { f.review.body = f.review.body.replace(`SOURCE_HEAD_SHA=${head}`, `SOURCE_HEAD_SHA=${head} # comment`); }, f => { f.responses[`${base}/actions/runs/123`].head_sha = old; }]) {
    const f = fixture(); mutate(f); const result = await collect(f, { verifyProtectedEnvironment: f.verifyProtectedEnvironment }); assert.equal(result.outcome, 'HOLD');
  }
});
test('unexpected main, server merge target or missing ancestry denies target authority', async () => {
  for (const mutate of [f => { f.responses[`${base}/git/ref/heads/main`].object.sha = old; }, f => { f.pr.merge_commit_sha = old; },
    f => { f.responses[`${base}/compare/${head}...${target}`].merge_base_commit.sha = old; }]) {
    const f = fixture(); mutate(f); assert.equal((await collect(f)).outcome, 'HOLD');
  }
});
test('network/permission/rate limit failure is sanitized HOLD and never exposes response secrets', async () => {
  const f = fixture(); const result = await collect(f, { api: async () => { throw new Error('secret token fake-token'); } });
  assert.equal(result.reason, 'API_UNAVAILABLE_OR_DENIED'); assert.ok(!JSON.stringify(result).includes('fake-token'));
});
test('mutable server Review edit and new review during capture cannot reuse stale record digest', async () => {
  for (const mode of ['EDIT', 'NEW_REVIEW']) {
    const f = fixture(); let count = 0;
    const api = async endpoint => {
      const result = await f.api(endpoint);
      if (mode === 'EDIT' && endpoint === `${pull}/reviews/42` && ++count === 2) result.body += '\nedited';
      if (mode === 'NEW_REVIEW' && endpoint.endsWith('reviews?per_page=100&page=1') && ++count === 2) result.push({ ...f.review, id: 43, state: 'CHANGES_REQUESTED' });
      return result;
    };
    assert.equal((await collect(f, { api })).reason, 'SERVER_STATE_CHANGED_DURING_CAPTURE');
  }
});
test('environment names/config and run head alone are never a deployment approval', async () => {
  const f = fixture(); const result = await collect(f, { verifyProtectedEnvironment: async () => ({ result: 'VERIFIED' }) });
  assert.equal(result.environment.reason, 'PROTECTED_ENVIRONMENT_ARTIFACT_BINDING_UNIMPLEMENTED'); assert.equal(result.productionAuthorized, false);
});
test('window expiry during API reads prevents a successful result', async () => {
  const f = fixture(); let time = now; const result = await collect(f, { now: () => time, api: async e => { const r = await f.api(e); time = Date.parse(f.request.context.window.end); return r; }, verifyProtectedEnvironment: f.verifyProtectedEnvironment });
  assert.equal(result.reason, 'MAINTENANCE_WINDOW_CLOSED');
});
test('edited server Review cannot replace the immutable pinned approval digest', async () => {
  const f = fixture(); f.review.body += '\nA later edit';
  assert.equal((await collect(f)).reason, 'PINNED_REVIEW_RECORD_CHANGED');
});
test('an unpinned current source Review is discovery evidence only, even if environment fixture verifies', async () => {
  const f = fixture(); delete f.request.pinnedReviewRecordSha256;
  const result = await collect(f, { verifyProtectedEnvironment: f.verifyProtectedEnvironment });
  assert.equal(result.sourceReview.result, 'VERIFIED'); assert.equal(result.reviewPin, 'HOLD_UNPINNED_SERVER_REVIEW'); assert.equal(result.productionAuthorized, false);
});
test('production environment without required reviewers cannot be approved by inputs or a permissive callback', async () => {
  const f = fixture(); f.responses[`${base}/environments/production`].protection_rules = [];
  const result = await collect(f, { verifyProtectedEnvironment: f.verifyProtectedEnvironment });
  assert.equal(result.environment.reason, 'ENVIRONMENT_REQUIRED_REVIEWERS_NOT_CONFIGURED'); assert.equal(result.productionAuthorized, false);
});
test('a source Review submitted after merge cannot prove review-before-merge', async () => {
  const f = fixture(); f.review.submitted_at = '2026-10-18T01:05:00Z';
  assert.equal((await collect(f)).reason, 'SOURCE_REVIEW_AFTER_MERGE');
});
test('server approval-history fields do not prove an unimplemented frozen artifact binding', async () => {
  const f = fixture(); f.responses[`${base}/actions/runs/123/approvals`][0].contextDigest = 'forged-extra-field';
  const result = await collect(f, { verifyProtectedEnvironment: async () => ({ result: 'VERIFIED', productionAuthorized: true }) });
  assert.equal(result.environment.result, 'HOLD'); assert.equal(result.productionAuthorized, false); assert.ok(result.environment.approvalHistorySha256);
});
