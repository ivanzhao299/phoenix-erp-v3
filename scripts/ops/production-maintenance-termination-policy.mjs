/** Structural termination contract. No command, CLI, authority or automatic
 * escalation is installed here. Physical STOP is never a DRAIN receipt. */
import { canonicalDigest, same, validateMaintenanceContext } from './production-maintenance-receipts.mjs';

export const TERMINATION_POLICY_SCHEMA = 'phoenix.legacy-termination-policy/v1';
const fields = ['schema','protocol','owner','targetSha','window','executors','method','stopSignal','timeoutSeconds','timeoutEscalation','commandTimeoutMs','maxAttempts','recoveryOperator'];
const pinFields = ['id','imageId','revision','startedAt','restartCount'];
const nanoPattern = /^[1-9][0-9]{9,24}$/;
const isoNano = value => BigInt(Date.parse(value)) * 1000000n;
const hold = code => { throw Error('MAINTENANCE_TERMINATION_HOLD='+code); };
const exactKeys = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const pins = context => context.executors.map(p => Object.fromEntries(pinFields.map(k => [k,p[k]]))).sort((a,b) => a.id.localeCompare(b.id));

/** Context digest binds the complete policy, but does not itself grant rights.
 * The independent approval must also expose this policy's digest explicitly. */
export function validateLegacyTerminationPolicy(policy, context) {
  validateMaintenanceContext(context);
  if (!exactKeys(policy,fields) || policy.schema !== TERMINATION_POLICY_SCHEMA || policy.protocol !== 'STOP_AND_RECONCILE'
    || policy.owner !== context.owner || policy.targetSha !== context.targetSha || !same(policy.window,context.window)
    || !Array.isArray(policy.executors) || !same(policy.executors,pins(context))
    || policy.executors.some(p => !exactKeys(p,pinFields))
    || policy.method !== 'DOCKER_STOP' || policy.stopSignal !== 'SIGTERM' || policy.timeoutSeconds !== 30
    || policy.timeoutEscalation !== 'DOCKER_SIGKILL' || policy.commandTimeoutMs !== 35000 || policy.maxAttempts !== 1
    || typeof policy.recoveryOperator !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:@ -]{0,127}$/.test(policy.recoveryOperator)) hold('EXPLICIT_EXACT_POLICY_REQUIRED');
  return structuredClone(policy);
}
export function requireLegacyTerminationApproval(approval, context) {
  const policy = validateLegacyTerminationPolicy(context.terminationPolicy,context);
  const digest = canonicalDigest(policy);
  if (approval?.payload?.terminationPolicySha256 !== digest) hold('POLICY_NOT_EXPLICITLY_IN_APPROVAL');
  // This only checks the payload. A real independently verified authority is
  // still mandatory before any effect; a supplied digest is not approval.
  return { policy, policySha256:digest };
}

/** Allowlisted event projection only. Never retain exec command text, arbitrary
 * labels, environment values or Docker attributes other than signal/exitCode. */
export function redactLegacyTerminationEvent(event) {
  const action = event?.Action?.split(':')[0];
  const nano = event?.timeNano;
  if (event?.Type !== 'container' || !/^[a-f0-9]{64}$/.test(event.Actor?.ID || '')
    || !/^[a-z_]{1,40}$/.test(action || '') || typeof nano !== 'string' || !nanoPattern.test(nano)) hold('EVENT_SHAPE');
  const safe = {};
  for (const key of ['signal','exitCode']) {
    const value = event.Actor.Attributes?.[key];
    if (value !== undefined && value !== null) {
      if (typeof value !== 'string' || !/^[0-9]{1,3}$/.test(value) || Number(value)>255) hold('EVENT_ATTRIBUTE');
      safe[key] = value;
    }
  }
  return { Type:'container',Action:action,Actor:{ID:event.Actor.ID,Attributes:safe},timeNano:nano };
}

/** Correlation is not unique attribution to a CLI/issuer. Host/executor
 * exclusion and independent verification remain separate mandatory evidence. */
export function validateLegacyTerminationEvents(events, { policy, context, executorId, interval, exitCode, oomKilled } = {}) {
  const validatedPolicy = validateLegacyTerminationPolicy(policy,context);
  if (!policy.executors.some(p => p.id === executorId) || !Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255
    || oomKilled !== false) hold('FINAL_EXECUTOR_OR_OOM_STATE');
  if (!exactKeys(interval,['startNano','endNano']) || ![interval.startNano,interval.endNano].every(n => typeof n === 'string' && nanoPattern.test(n))) hold('EXACT_INTERVAL_REQUIRED');
  const start = BigInt(interval.startNano), end = BigInt(interval.endNano);
  if (start >= end || start < isoNano(context.window.start) || end >= isoNano(context.window.end)
    || end-start > BigInt(validatedPolicy.commandTimeoutMs)*1000000n) hold('INTERVAL_OUTSIDE_POLICY');
  if (!Array.isArray(events) || !events.length || events.length >= 256) hold('BOUNDED_EVENT_COVERAGE_REQUIRED');
  const normalized = events.map(redactLegacyTerminationEvent);
  if (normalized.some(e => e.Actor.ID !== executorId)) hold('EVENT_EXECUTOR_CHANGED');
  let last = 0n, term, kill, die, stop;
  const seen = new Set();
  for (const event of normalized) {
    const at = BigInt(event.timeNano);
    if (at < start || at >= end) hold('EVENT_OUTSIDE_INTERVAL');
    if (at < last) hold('EVENT_CLOCK_ROLLBACK'); last = at;
    const digest = canonicalDigest(event); if (seen.has(digest)) hold('DUPLICATE_EVENT'); seen.add(digest);
    if (!['kill','die','stop','health_status','exec_create','exec_start','exec_die','exec_detach'].includes(event.Action)) hold('EXECUTOR_LIFECYCLE_CHANGED');
    if (event.Action==='kill') {
      if (event.Actor.Attributes.signal==='15' && !term && !kill && !die && !stop) term=event;
      else if (event.Actor.Attributes.signal==='9' && term && !kill && !die && !stop) {
        if (at-BigInt(term.timeNano) < BigInt(validatedPolicy.timeoutSeconds)*1000000000n) hold('KILL_BEFORE_APPROVED_TIMEOUT');
        kill=event;
      }
      else hold('UNAPPROVED_OR_REPEATED_SIGNAL');
    }
    if (event.Action==='die') {
      if (!term || die || at <= BigInt((kill || term).timeNano) || Number(event.Actor.Attributes.exitCode)!==exitCode) hold('EXIT_EVENT'); die=event;
    }
    // Docker's stop handler and exit monitor log independently. Do not invent
    // a die-before-stop guarantee contradicted by actual daemon observations.
    if (event.Action==='stop') { if (!term || stop || at <= BigInt((kill || term).timeNano)) hold('STOP_EVENT'); stop=event; }
  }
  if (!term || !die || !stop || (kill ? exitCode!==137 : ![0,143].includes(exitCode))) hold('SIGNAL_EXIT_CHAIN_INCOMPLETE');
  if ([die,stop].some(e=>BigInt(e.timeNano)<=BigInt((kill||term).timeNano))) hold('TERMINAL_BEFORE_FINAL_SIGNAL');
  if (die.timeNano===stop.timeNano) hold('AMBIGUOUS_TERMINAL_EVENT_TIME');
  return { mechanism:kill?'OBSERVED_TERM_AND_KILL_DURING_STOP':'OBSERVED_TERM_THEN_EXIT',
    policySha256:canonicalDigest(validatedPolicy),interval:structuredClone(interval),
    eventDigest:canonicalDigest(normalized),termEvent:canonicalDigest(term),killEvent:kill?canonicalDigest(kill):null,
    dieEvent:canonicalDigest(die),stopEvent:canonicalDigest(stop),exitCode,
    terminalLogOrder:BigInt(stop.timeNano)<BigInt(die.timeNano)?'STOP_BEFORE_DIE':'DIE_BEFORE_STOP',
    correlation:'INTERVAL_AND_CONTAINER_ONLY_NOT_EXCLUSIVE_ISSUER',legacyDrainResult:'UNSUPPORTED',
    coverage:'SUPPLIED_EVENT_SEQUENCE_ONLY_NOT_CONTINUOUS_OBSERVER_PROOF',
    gracefulCompletion:'NOT_PROVED',businessReconciliation:'NOT_PROVED',productionAuthority:false };
}
