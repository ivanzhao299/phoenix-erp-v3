/** Read-only GitHub evidence adapter. Never submits a review, adds a label or
 * approves a deployment. Source-code Review and target production authority are
 * separate server facts. No environment-verification fallback is installed. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {inspectTrustedDirectory,assertSameDirectory,readPinnedFile} from './production-trusted-paths.mjs';
import { readRegisteredOwnerMaintenanceGrant, validateRegisteredOwnerMaintenanceGrant } from './production-maintenance-owner-authority.mjs';
import { createHash } from 'node:crypto';
import { bindingDigest, canonicalDigest, validateMaintenanceContext, HASH, SHA, iso, same, MaintenanceReceiptStore } from './production-maintenance-receipts.mjs';

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
  if (request?.authorityMode === 'OWNER_DELEGATED') return collectOwnerAuthority(request, dependencies);
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

/** The owner path consumes an actual protected grant and fresh server facts.
 * A COMMENT, environment name, input boolean or supplied proof never registers
 * that grant. No environment reviewer is required by this authorization mode.
 * This authorizes only the exact typed operation; it is not deployment success. */
async function collectOwnerAuthority(request, dependencies) {
  const api = dependencies.api || githubReadOnlyApi, now = dependencies.now || Date.now;
  let common = { schema: 'phoenix.maintenance-github-evidence/v1', authorityMode: 'OWNER_DELEGATED', outcome: 'HOLD', productionAuthorized: false };
  try {
    request = structuredClone(request);
    validateRequest(request);
    const expected = {context:request.context,bindingDigest:bindingDigest(request.context),targetSha:request.context.targetSha,purpose:request.purpose,operation:request.operation};
    common = {...common,repository:REPOSITORY,prNumber:request.prNumber,contextDigest:expected.bindingDigest,receiptDigest:request.receiptDigest,operation:request.operation,purpose:request.purpose};
    const grant = await readRegisteredOwnerMaintenanceGrant(request.ownerApproval, expected, dependencies.ownerAuthorityDependencies);
    if (!grant) fail('PROTECTED_OWNER_GRANT_REQUIRED');
    if(request.receiptDigest !== grant.evidence.releaseArtifactDigest) fail('OWNER_RELEASE_ARTIFACT_CHANGED');
    const source = request.ownerSource;
    if (!source || source.repository !== REPOSITORY || source.prNumber !== request.prNumber || source.reviewId !== request.reviewId
      || source.sourceHeadSha !== request.sourceHeadSha || source.sourceHeadSha !== grant.source.headSha || source.sourceTreeSha !== grant.source.treeSha
      || source.expectedMainSha !== request.context.targetSha || source.delegateUserId !== grant.delegate.githubUserId || source.delegateLogin !== grant.delegate.githubLogin
      || source.ownerDelegationDigest !== grant.authorizationDigest || source.sourceReviewReceiptDigest !== request.sourceReviewReceiptDigest
      || source.pinnedReviewRecordSha256 !== grant.source.reviewRecordDigest || source.prNumber !== grant.source.prNumber || source.reviewId !== grant.source.reviewId
      || request.pinnedReviewRecordSha256 !== grant.source.reviewRecordDigest) fail('OWNER_SOURCE_GRANT_BINDING');
    const {collectOwnerDelegatedSourceProvenance,ownerSourceBindingDigest} = await import('./production-maintenance-owner-source-provenance.mjs');
    const provenance = await collectOwnerDelegatedSourceProvenance(source,{api,now});
    if(provenance.outcome !== 'SERVER_SOURCE_FACTS_VERIFIED' || provenance.rawReviewRecordSha256 !== grant.source.reviewRecordDigest) fail('OWNER_SOURCE_COMMENT_CHANGED');
    if(ownerSourceBindingDigest(provenance) !== grant.source.sourceProvenanceDigest) fail('OWNER_SOURCE_PROVENANCE_CHANGED');
    const root = `/repos/${REPOSITORY}`, pull = `${root}/pulls/${request.prNumber}`;
    const readRun = async () => {
      const run = await api(`${root}/actions/runs/${grant.dispatch.runId}`);
      if (run.id !== grant.dispatch.runId || run.run_attempt !== grant.dispatch.attempt || run.actor?.id !== grant.dispatch.actorId
        || run.actor?.login !== grant.delegate.githubLogin || run.triggering_actor?.id !== grant.dispatch.actorId
        || run.head_sha !== request.context.targetSha || run.repository?.full_name !== REPOSITORY || run.event !== 'workflow_dispatch'
        || run.head_branch !== 'main' || run.path !== '.github/workflows/deploy.yml' || run.status !== 'in_progress') fail('OWNER_DISPATCH_CHANGED');
      return run;
    };
    const pr = await api(pull), run = await readRun();
    if(pr?.merged !== true || pr.state !== 'closed' || pr.head?.sha !== grant.source.headSha || pr.merge_commit_sha !== request.context.targetSha) fail('OWNER_TARGET_NOT_EXACT_MERGE');
    const compare = await api(`${root}/compare/${grant.source.headSha}...${request.context.targetSha}`);
    if(compare.base_commit?.sha !== grant.source.headSha || compare.merge_base_commit?.sha !== grant.source.headSha || !['ahead','identical'].includes(compare.status)) fail('OWNER_SOURCE_NOT_IN_TARGET');
    const final = await collectOwnerDelegatedSourceProvenance(source,{api,now});
    if(final.outcome !== 'SERVER_SOURCE_FACTS_VERIFIED' || final.serverSnapshotSha256 !== provenance.serverSnapshotSha256
      || canonicalDigest(await api(pull)) !== canonicalDigest(pr) || canonicalDigest(await readRun()) !== canonicalDigest(run)
      || !(await readRegisteredOwnerMaintenanceGrant(request.ownerApproval,expected,dependencies.ownerAuthorityDependencies))) fail('OWNER_AUTHORITY_CHANGED_DURING_CAPTURE');
    return {...common,outcome:'AUTHORIZED',productionAuthorized:true,authorityKind:'OWNER_DELEGATED',decision:'AUTHORIZED',
      sourceReview:provenance,targetBinding:{result:'VERIFIED',targetMainSha:request.context.targetSha,mergeCommitSha:pr.merge_commit_sha},
      environment:{result:'NOT_REQUIRED_BY_OWNER_AUTHORIZATION',requiredReviewersUsed:false},
      ownerGrantSha256:request.ownerApproval.ownerGrantSha256,dispatchRecordSha256:canonicalDigest(run),checkedThrough:new Date(now()).toISOString()};
  } catch (error) {
    return {...common,reason:/^MAINTENANCE_GITHUB_HOLD=([A-Z_]+)$/.exec(error?.message || '')?.[1] || 'OWNER_AUTHORITY_UNVERIFIED'};
  }
}

/** Registration is a separate, create-only bootstrap, before the session. The
 * operator must first record the real user-channel instruction and confirmed
 * window at the fixed protected path. This code cannot authenticate a chat's
 * human author; that is the trusted bootstrap operator's responsibility. It
 * never derives that authority from COMMENT, approve_production, a digest or
 * GitHub account permissions. Server reads independently bind the recorded
 * instruction to the source, current dispatch and the actual artifact bytes.
 *
 * Dependencies are for isolated fixtures. The production defaults retain the
 * root/trusted-path/FD9 guard and real authenticated read-only GitHub transport.
 * No JSON input can select a verifier, command, executable or file path. */
export async function registerOwnerMaintenanceGrant(input,dependencies={}){
 const fail=code=>Error('OWNER_MAINTENANCE_AUTHORITY_HOLD='+code);
 const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&same(Object.keys(value).sort(),[...keys].sort());
 const SCOPE={mode:'api',buildApi:true,buildWeb:false,runMigration:false,chanjetPolicy:'HOLD',readonlySync:false,inboundSync:false,rotateCredentials:false,automaticRollback:false};
 if(!exact(input,['grant','approval','ownerSource']))throw fail('EXACT_REGISTRATION_REQUEST');
 const request=structuredClone(input),{grant,approval,ownerSource}=request,context=grant.context;
 const expected={context,bindingDigest:bindingDigest(context),targetSha:context.targetSha,purpose:'MAINTENANCE'};
 const directory=dependencies.directory||CONTRACT.stateDirectory,guard=dependencies.guard||(()=>verifyContext(CONTRACT.repository,directory));
 const inspect=dependencies.inspectDirectory||(value=>inspectTrustedDirectory(value,CONTRACT)),uid=dependencies.expectedUid??0,now=dependencies.now||Date.now;
 const store=dependencies.store||new MaintenanceReceiptStore(context),io=dependencies.fs||fs;
 const {collectOwnerDelegatedSourceProvenance,ownerSourceBindingDigest}=await import('./production-maintenance-owner-source-provenance.mjs');
 // Two full source/server captures are intentionally retained. Thirty-four
 // bounded authenticated GETs must not share an unrealistic 30-second budget.
 // Wall and monotonic limits cannot extend the approved maintenance window.
 const api=dependencies.api||githubReadOnlyApi,mono=dependencies.monotonic||(()=>performance.now()),started=now(),monoStarted=mono();let last=started,lastMono=monoStarted;
 const check=()=>{
  guard();const at=now();
  const mt=mono();
  if(!Number.isSafeInteger(at)||at<last||at-started>=120000||![mt,monoStarted].every(Number.isFinite)||mt<lastMono||mt-monoStarted>=120000)throw fail('REGISTRATION_READ_DEADLINE');last=at;lastMono=mt;
  validateRegisteredOwnerMaintenanceGrant(grant,approval,expected,at);
  absent(path.join(directory,`maintenance-owner-revoked-${context.owner}.json`));
 };
 const fixed=(kind,extension='json')=>path.join(directory,`maintenance-${kind}-${context.owner}.${extension}`);
 const absent=file=>{try{io.lstatSync(file);throw fail('REGISTRATION_OR_REVOCATION_ALREADY_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}};
 const noPrevious=()=>{for(const kind of ['owner-grant','owner-registration','owner-revoked'])absent(fixed(kind));};
 const read=file=>readPinnedFile(file,{contract:CONTRACT,uid},{fs:io,inspectDirectory:inspect});
 const instructionFile=fixed('owner-instruction'),artifactFile=fixed('release-artifact','zip');
 const instruction=()=>{
  let value;try{value=JSON.parse(read(instructionFile));}catch{throw fail('PROTECTED_USER_INSTRUCTION_REQUIRED');}
  const fields=['schema','origin','authorizationRef','authorizationDigest','maintenanceWindowConfirmationDigest','previousFloorSha','targetSha','window','delegate','scope'];
  if(!exact(value,fields)||value.schema!=='phoenix.owner-maintenance-instruction/v1'||value.origin!=='TRUSTED_INTERACTIVE_USER'
   ||value.authorizationRef!==grant.authorizationRef||value.authorizationDigest!==grant.authorizationDigest
   ||value.maintenanceWindowConfirmationDigest!==grant.maintenanceWindowConfirmationDigest
   ||value.previousFloorSha!==context.previousFloorSha||value.targetSha!==context.targetSha
   ||!iso(value.window?.start)||!iso(value.window?.end)||Date.parse(value.window.start)>=Date.parse(value.window.end)
   ||Date.parse(context.window.start)<Date.parse(value.window.start)||Date.parse(context.window.end)>Date.parse(value.window.end)
   ||!same(value.delegate,grant.delegate)||!same(value.scope,SCOPE))throw fail('USER_INSTRUCTION_SCOPE_OR_WINDOW');
  return value;
 };
 const artifactDigest=()=>{
  // The release artifact is a bounded instruction/evidence bundle, never a
  // container image or credential archive. Do not print any archive contents.
  const stat=io.lstatSync(artifactFile);if(stat.size<1||stat.size>1024*1024)throw fail('RELEASE_ARTIFACT_SIZE');
  const value=createHash('sha256').update(read(artifactFile)).digest('hex');
  if(value!==grant.evidence.releaseArtifactDigest)throw fail('LOCAL_RELEASE_ARTIFACT_CHANGED');return value;
 };
 check();const beforeDirectory=inspect(directory);noPrevious();const beforeInstruction=instruction(),localDigest=artifactDigest();
 if(!exact(ownerSource,['repository','prNumber','sourceHeadSha','sourceTreeSha','expectedMainSha','reviewId','delegateUserId','delegateLogin','ownerDelegationDigest','sourceReviewReceiptDigest','pinnedReviewRecordSha256'])
  ||ownerSource.repository!==grant.repository||ownerSource.prNumber!==grant.source.prNumber||ownerSource.reviewId!==grant.source.reviewId
  ||ownerSource.sourceHeadSha!==grant.source.headSha||ownerSource.sourceTreeSha!==grant.source.treeSha||ownerSource.expectedMainSha!==context.targetSha
  ||ownerSource.delegateUserId!==grant.delegate.githubUserId||ownerSource.delegateLogin!==grant.delegate.githubLogin
  ||ownerSource.ownerDelegationDigest!==grant.authorizationDigest||ownerSource.pinnedReviewRecordSha256!==grant.source.reviewRecordDigest)throw fail('REGISTRATION_SOURCE_BINDING');
 const readServer=async endpoint=>{check();let value;try{value=await api(endpoint);}catch{throw fail('SERVER_UNAVAILABLE');}check();return value;};
 const source=await collectOwnerDelegatedSourceProvenance(ownerSource,{api:readServer,now});check();
 if(source.outcome!=='SERVER_SOURCE_FACTS_VERIFIED'||ownerSourceBindingDigest(source)!==grant.source.sourceProvenanceDigest)throw fail('SERVER_SOURCE_CHANGED');
 const base='/repos/'+grant.repository,runPath=base+'/actions/runs/'+grant.dispatch.runId,artifactPath=base+'/actions/artifacts/'+grant.evidence.releaseArtifactId;
 const runBinding=value=>{
  if(value?.id!==grant.dispatch.runId||value.run_attempt!==grant.dispatch.attempt||value.repository?.full_name!==grant.repository
   ||value.actor?.id!==grant.delegate.githubUserId||value.actor?.login!==grant.delegate.githubLogin
   ||value.triggering_actor?.id!==grant.delegate.githubUserId||value.triggering_actor?.login!==grant.delegate.githubLogin
   ||value.event!=='workflow_dispatch'||value.head_branch!=='main'||value.head_sha!==context.targetSha
   ||value.path!=='.github/workflows/deploy.yml'||value.status!=='in_progress')throw fail('SERVER_DISPATCH_CHANGED');
  return {id:value.id,attempt:value.run_attempt,actor:value.actor.id,triggeringActor:value.triggering_actor.id,event:value.event,sha:value.head_sha,path:value.path};
 };
 const artifactBinding=value=>{
  if(value?.id!==grant.evidence.releaseArtifactId||value.expired!==false||value.digest!=='sha256:'+localDigest
   ||value.workflow_run?.id!==grant.dispatch.runId||value.workflow_run?.head_sha!==context.targetSha
   ||!Number.isSafeInteger(value.size_in_bytes)||value.size_in_bytes<1||value.size_in_bytes>1024*1024)throw fail('SERVER_RELEASE_ARTIFACT_CHANGED');
  return {id:value.id,digest:value.digest,runId:value.workflow_run.id,headSha:value.workflow_run.head_sha,size:value.size_in_bytes};
 };
 const readFacts=async()=>{
  const run=runBinding(await readServer(runPath)),artifact=artifactBinding(await readServer(artifactPath));
  const pr=await readServer(base+'/pulls/'+grant.source.prNumber),main=await readServer(base+'/git/ref/heads/main');
  const compare=await readServer(base+'/compare/'+grant.source.headSha+'...'+context.targetSha);
  if(pr.state!=='closed'||pr.merged!==true||pr.head?.sha!==grant.source.headSha||pr.merge_commit_sha!==context.targetSha
   ||main.object?.sha!==context.targetSha||compare.base_commit?.sha!==grant.source.headSha||compare.merge_base_commit?.sha!==grant.source.headSha||!['ahead','identical'].includes(compare.status))throw fail('SERVER_MERGE_OR_MAIN_CHANGED');
  return {run,artifact,prDigest:canonicalDigest(pr),mainDigest:canonicalDigest(main),compareDigest:canonicalDigest(compare)};
 };
 const facts=await readFacts();
 // A second complete source capture detects edits/revocations during the run
 // and artifact reads. Capture timestamps are not part of the stable binding.
 const finalSource=await collectOwnerDelegatedSourceProvenance(ownerSource,{api:readServer,now});check();
 if(finalSource.outcome!=='SERVER_SOURCE_FACTS_VERIFIED'||ownerSourceBindingDigest(finalSource)!==grant.source.sourceProvenanceDigest
  ||!same(facts,await readFacts())||!same(beforeInstruction,instruction())||artifactDigest()!==localDigest)throw fail('REGISTRATION_CHANGED_DURING_CAPTURE');
 check();noPrevious();assertSameDirectory(beforeDirectory,inspect(directory));
 // Immutable receipt first, authority last. A partial registration retains its
 // receipt and must be inspected; it cannot be silently retried or overwritten.
 const receipt={schema:'phoenix.owner-maintenance-registration/v1',owner:context.owner,contextDigest:expected.bindingDigest,
  grantDigest:canonicalDigest(grant),instructionDigest:canonicalDigest(beforeInstruction),sourceBindingDigest:grant.source.sourceProvenanceDigest,
  serverFactsDigest:canonicalDigest(facts),releaseArtifactDigest:localDigest,registeredAt:new Date(now()).toISOString(),authorityModel:'OWNER_DELEGATED',requiredReviewersUsed:false};
 store.immutable(fixed('owner-registration'),receipt);check();
 if(!same(beforeInstruction,instruction())||artifactDigest()!==localDigest)throw fail('REGISTRATION_INPUT_CHANGED_BEFORE_WRITE');
 absent(fixed('owner-revoked'));store.immutable(fixed('owner-grant'),grant);
 if(!same(store.read(fixed('owner-grant')),grant))throw fail('REGISTRATION_WRITE_UNVERIFIED');
 return receipt;
}
