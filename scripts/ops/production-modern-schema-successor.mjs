/** The 2026-11-23 follow-up to the completed 20-unit release. The migration
 * blobs limit eligibility. The protected preview, explicit OIDC-bound run
 * selection, independent CI results and clock window are checked separately. */
import {canonicalDigest, same} from './production-maintenance-receipts.mjs';

export const successorRuntime = '6bb88544275dfef591cb96c0078f73e88496433b';
const runtimeInventory = 'c061666c12adc75ae20fbc68d76af9c69be81ce107fa9c728b7acf0e0824ce91';
const precedingLedger = '4bd27f1eb8eb96fa1dfd18e39ef2f81aaaa9628c396d3b2413451845336381e4';
const unitNames = [
  '1795400100000-ProductionDocumentContinuations',
  '1795400200000-ProductionFinanceReview',
  '1795400300000-CutoverStateReceipts',
];
// Reviewed integration 7463c116c; an edited migration needs a new source review.
const sourceBlobs=['4dbf4aa3d1ae76a3622db747e5d646bb2c959e86','d135f8b988d2db6163b9bb54f422cf7fb5924e19','31dbb08ac8979b5c9aadcd70e8f7d1f8b1b2879a'];
const paths = unitNames.map(name => 'apps/api/src/database/migrations/' + name + '.ts');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fields = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && same(Object.keys(v).sort(), keys.split(' ').sort());
const fail = code => { throw Error('MODERN_SCHEMA_SUCCESSOR_HOLD=' + code); };

export function successorPlan(value) {
  return value?.runtimeSha === successorRuntime && value.runtimeInventorySha256 === runtimeInventory &&
    value.sourceInventorySha256==='ba7ee5773047ea5676e7314b2726cae35f1398f139869cda1699aaa830c4b275' &&
    value.beforeLedgerSha256 === precedingLedger && same(value.changedMigrationPaths, paths) &&
    Array.isArray(value.pendingMigrations) && same(value.pendingMigrations.map(unit => unit?.path), paths);
}

// Compose Web readiness: 30s start period + 3 x (30s interval + 5s
// timeout), then room for the normal smoke and receipt checks.
export const successorWebReserveMs=180_000;
export const successorTransportCeilingMs = 360 * 60_000;
export const ordinarySuccessorWindowMs = 180 * 60_000;
// The incident extension starts at the original grant, including time already spent fenced.
const incidentStart = Date.parse('2026-11-23T09:07:52Z');
const originalIncidentDeadline = incidentStart + successorTransportCeilingMs;
export const successorIncidentDeadline = incidentStart + 720 * 60_000;
// The cumulative incident deadline and a single hosted job have different limits.

export function validSuccessorWindow(start, end) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return false;
  if(end-start<=ordinarySuccessorWindowMs)return true;
 if(start>=incidentStart&&end<=originalIncidentDeadline)return true;
 return start>=originalIncidentDeadline&&end<=successorIncidentDeadline&&end-start<=successorTransportCeilingMs;
}

export function checkSuccessorRunnerDeadline(window, jobStartedAt) {
  const start = Date.parse(window.start), end = Date.parse(window.end);
  if (!validSuccessorWindow(start, end)) fail('WINDOW_OUTSIDE_TRANSPORT_LIMIT');
  if (end - start <= ordinarySuccessorWindowMs) return;
  const jobStart = Date.parse(jobStartedAt);
  // Allow the SSH result and job teardown to finish after the business deadline.
  if (!Number.isFinite(jobStart) || end + 4 * 60_000 > jobStart + successorTransportCeilingMs) {
    fail('WINDOW_EXCEEDS_HOSTED_JOB');
  }
}

export function successorBinding(floorSha, plan) {
  if (!successorPlan(plan) || !/^[a-f0-9]{40}$/.test(floorSha) ||
      !/^[a-f0-9]{40}$/.test(plan.targetSha) || [floorSha, successorRuntime].includes(plan.targetSha) ||
      !/^sha256:[a-f0-9]{64}$/.test(plan.candidateImageId) ||
      ![plan.sourceInventorySha256,plan.candidateInventorySha256].every(hash)) fail('EXACT_CANDIDATE_REQUIRED');
  for (const [i, unit] of plan.pendingMigrations.entries()) {
    const [stamp, name] = unitNames[i].split('-');
    if (!fields(unit,'path sourceBlob effectiveName timestamp compiledSha256') || unit.timestamp !== Number(stamp) ||
        unit.effectiveName !== name + stamp || unit.sourceBlob!==sourceBlobs[i] || !hash(unit.compiledSha256)) fail('EXACT_UNIT_REQUIRED');
  }
  const {runtimeSha,targetSha,beforeLedgerSha256,candidateImageId,runtimeInventorySha256,sourceInventorySha256,
    candidateInventorySha256,pendingMigrations,changedMigrationPaths} = plan;
  return {floorSha,runtimeSha,targetSha,beforeLedgerSha256,candidateImageId,runtimeInventorySha256,sourceInventorySha256,
    candidateInventorySha256,pendingMigrations,changedMigrationPaths};
}

// The runner selects one of these exact instructions. The approval text also
// appears in the GitHub-native run title, which the host verifies independently.
export function parseSuccessorAction(text){
 if(text==='inspect1123')return {kind:'inspect'};
 const match=/^approve1123-([1-9][0-9]{0,19}-[1-9][0-9]{0,9})-([a-f0-9]{64})-([1-9][0-9]{0,19})-([1-9][0-9]{0,19})-([1-9][0-9]{9})-([1-9][0-9]{9})$/.exec(text??'');
 if(!match)return null;
 const [,inspectionOwner,inspectionSha256,ciRunId,acceptanceRunId,startSeconds,endSeconds]=match;
 const start=Number(startSeconds)*1000,end=Number(endSeconds)*1000;
 if(!validSuccessorWindow(start,end))fail('WINDOW_OUTSIDE_TRANSPORT_LIMIT');
 return {kind:'approve',inspectionOwner,inspectionSha256,ciRunId,acceptanceRunId,window:{start:new Date(start).toISOString(),end:new Date(end).toISOString()}};
}
export function validateSuccessorInspection(record,binding){
 const {inspectionSha256,...content}=record??{};
 if(!hash(inspectionSha256)||canonicalDigest(content)!==inspectionSha256||
    content.schema!=='phoenix.remediation-1123-inspection/v1'||!same(content.binding,binding)||
    content.historicalAudit!=='HOLD'||content.historicalQuantity!==60||content.businessActivation!==false||
    content.productionMutation!==false||!['ROLE_BOUNDARY_VERIFIED','PILOT_NOT_READY'].includes(content.apiAccess?.pilotStatus)||
    !hash(content.auditEvidenceSha256)||![content.runtimeImageId,content.webImageId].every(v=>/^sha256:[a-f0-9]{64}$/.test(v))||![content.predecessorSha256,content.testManifestSha256,content.rehearsalSha256,
    content.defaultOffEvidenceSha256,content.hostSurfaceSha256].every(hash)||
    !Number.isSafeInteger(content.rehearsalMs)||content.rehearsalMs<1||!Number.isSafeInteger(content.restoreMs)||
    content.restoreMs<1||content.restoreMs>content.rehearsalMs||!Number.isSafeInteger(content.originalReadyMs)||content.originalReadyMs<1||
    content.originalReadyMs>content.rehearsalMs)fail('READONLY_INSPECTION_REQUIRED');
 return record;
}
export function successorDecisions(store,selection,floorSha,plan){
 const approval=parseSuccessorAction(selection);
 if(approval?.kind!=='approve')fail('EXPLICIT_DELEGATED_DISPATCH_REQUIRED');
 const inspection=validateSuccessorInspection(store.read('schema-release-1123-inspect-'+approval.inspectionOwner+'.json'),successorBinding(floorSha,plan));
 if(inspection.owner!==approval.inspectionOwner||inspection.inspectionSha256!==approval.inspectionSha256)fail('INSPECTION_CHANGED');
 const reserveMs=Math.ceil((inspection.restoreMs+inspection.originalReadyMs)*1.25)+150000;
 if(Date.parse(approval.window.end)-Date.parse(approval.window.start)<inspection.rehearsalMs+reserveMs+successorWebReserveMs)fail('INSUFFICIENT_AUTHORIZED_WINDOW');
 return {selection,approval,apiAccessSha256:canonicalDigest(inspection.apiAccess),runtimeImageId:inspection.runtimeImageId,webImageId:inspection.webImageId,inspectionSha256:inspection.inspectionSha256,predecessorSha256:inspection.predecessorSha256,
  testManifestSha256:inspection.testManifestSha256,rehearsalMs:inspection.rehearsalMs,recoveryReserveMs:reserveMs};
}

export function validPublicInspection(value,{owner,targetSha}){
 if(!fields(value,'schema owner targetSha inspectionSha256 predecessorSha256 webImageId runtimeImageId binding restoreMs originalReadyMs rehearsalMs pilotStatus')||
    value.schema!=='phoenix.remediation-1123-public-inspection/v1'||value.owner!==owner||value.targetSha!==targetSha||
    !['ROLE_BOUNDARY_VERIFIED','PILOT_NOT_READY'].includes(value.pilotStatus)||
    ![value.webImageId,value.runtimeImageId].every(v=>/^sha256:[a-f0-9]{64}$/.test(v))||![value.inspectionSha256,value.predecessorSha256].every(hash)||
    ![value.restoreMs,value.originalReadyMs,value.rehearsalMs].every(v=>Number.isSafeInteger(v)&&v>0)||
    value.restoreMs+value.originalReadyMs>value.rehearsalMs+1||value.binding?.targetSha!==targetSha)return false;
 try{return same(successorBinding(value.binding.floorSha,value.binding),value.binding);}catch{return false;}
}
