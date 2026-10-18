/** Assessment only. This module does not stop a runtime, send a notification,
 * repair data, deploy, or manufacture an approval/legacy DRAIN receipt. */
import { createHash } from 'node:crypto';
import { fail, validateBinding } from './background-control-manifest.mjs';

export const LEGACY_TRANSITION_SCHEMA = 'phoenix.background-stop-and-reconcile/v1';
export const LEGACY_EVIDENCE_DOMAINS = ['NOTIFICATION_EXTERNAL_SEND', 'IOT_PARTIAL_COMMITS', 'CHANJET_AUTH_REQUESTS', 'DATABASE_TRANSACTIONS', 'PERSISTENT_TASKS'];
const SHA256 = /^[a-f0-9]{64}$/;
const ISO = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const UUID4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const receipt = value => Boolean(value && value.result === 'VERIFIED' && SHA256.test(value.evidenceSha256) && ISO(value.checkedAt));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** The verifier must independently validate reviewer authority and immutable
 * approval content. There is deliberately no production default accepting a
 * boolean, arbitrary reviewer name, or the existence of an approval file. */
export async function assessLegacyTransition(input, { verifyApproval = async () => false, verifyEvidence = async () => false, now = Date.now } = {}) {
  const reasons = [];
  try { validateBinding(input?.binding); } catch { reasons.push('EXACT_RUN_AND_DOUBLE_SHA_REQUIRED'); }
  if (input?.schema !== LEGACY_TRANSITION_SCHEMA || input?.protocol !== 'STOP_AND_RECONCILE') reasons.push('LEGACY_PROTOCOL_REQUIRED');
  const approval = input?.approval;
  if (!approval || approval.decision !== 'APPROVED' || !SHA256.test(approval.contentSha256) || !ISO(approval.approvedAt)
    || !ISO(approval.windowStart) || !ISO(approval.windowEnd) || Date.parse(approval.windowStart) > now() || Date.parse(approval.windowEnd) <= now()
    || JSON.stringify(approval.binding) !== JSON.stringify(input?.binding)
    || !Array.isArray(approval.allowedDomains) || LEGACY_EVIDENCE_DOMAINS.some(d => !approval.allowedDomains.includes(d))
    || await verifyApproval(approval) !== true) reasons.push('INDEPENDENT_MAINTENANCE_APPROVAL_REQUIRED');
  const allReceipts = [input?.ingress, input?.revivalPrevention, input?.inventoryCompleteness,
    ...(Array.isArray(input?.executors) ? input.executors.flatMap(p => [p?.stopEvidence, p?.databaseSessionEvidence]) : []),
    ...LEGACY_EVIDENCE_DOMAINS.map(domain => input?.reconciliation?.[domain]), input?.newRuntime?.startupFenceEvidence];
  for (const evidence of allReceipts) {
    if (!receipt(evidence) || Date.parse(evidence.checkedAt) < Date.parse(approval?.windowStart)
      || Date.parse(evidence.checkedAt) > now() || await verifyEvidence(evidence, input?.binding) !== true) reasons.push('IMMUTABLE_EVIDENCE_VERIFICATION_REQUIRED');
  }
  const executor = input?.executors;
  if (!Array.isArray(executor) || executor.length === 0 || executor.length > 128) reasons.push('COMPLETE_EXECUTOR_INVENTORY_REQUIRED');
  else {
    const ids = new Set();
    for (const p of executor) {
      if (!p || !SHA256.test(p.containerId) || ids.has(p.containerId) || p.revision !== input?.binding?.previousFloorSha || !ISO(p.startedAt)
        || !receipt(p.stopEvidence) || p.stopEvidence.containerId !== p.containerId || p.stopEvidence.startedAt !== p.startedAt
        || p.stopEvidence.running !== false || p.stopEvidence.revives !== false || !receipt(p.databaseSessionEvidence)
        || p.databaseSessionEvidence.remainingConnections !== 0 || p.databaseSessionEvidence.openTransactions !== 0) reasons.push('EXECUTOR_STOP_OR_SESSION_RECONCILIATION_REQUIRED');
      if (p) ids.add(p.containerId);
    }
  }
  const ingress = input?.ingress;
  if (!receipt(ingress) || ingress.state !== 'FROZEN' || !receipt(input?.revivalPrevention) || input.revivalPrevention.state !== 'ENFORCED'
    || !receipt(input?.inventoryCompleteness) || input.inventoryCompleteness.unaccountedExecutors !== 0) reasons.push('INGRESS_AND_REVIVAL_PROOF_REQUIRED');
  // A successful stop is not proof that send-before-ledger notifications were
  // absent or that a multi-commit IoT operation rolled back atomically.
  for (const domain of LEGACY_EVIDENCE_DOMAINS) {
    const evidence = input?.reconciliation?.[domain];
    if (!receipt(evidence) || evidence.domain !== domain || evidence.disposition !== 'RECONCILED'
      || evidence.unknownEffects !== 0 || evidence.pendingWrites !== 0 || evidence.requiresReplay === true
      || evidence.requiresBusinessMutation === true || evidence.approvedScopeSha256 !== approval?.contentSha256) reasons.push(`${domain}_UNRECONCILED`);
  }
  const newRuntime = input?.newRuntime;
  if (!newRuntime || !SHA256.test(newRuntime.containerId) || !UUID4.test(newRuntime.bootId) || newRuntime.revision !== input?.binding?.targetSha
    || !receipt(newRuntime.startupFenceEvidence) || newRuntime.startupFenceEvidence.admissionState !== 'DENIED'
    || newRuntime.startupFenceEvidence.owner !== input?.binding?.owner || newRuntime.startupFenceEvidence.inFlight !== 0) reasons.push('NEW_RUNTIME_STARTUP_FENCE_REQUIRED');
  const unique = [...new Set(reasons)];
  return { schema: LEGACY_TRANSITION_SCHEMA, protocol: 'STOP_AND_RECONCILE', binding: input?.binding || null,
    eligible: unique.length === 0, result: unique.length === 0 ? 'RECONCILED_BOOTSTRAP_ELIGIBLE' : 'HOLD',
    legacyDrainResult: 'UNSUPPORTED', reasons: unique, inputDigest: digest(input ?? null),
    assessedAt: new Date(now()).toISOString(), productionOperationExecuted: false };
}
export function requireLegacyEligibility(result, binding) {
  validateBinding(binding);
  if (!result || result.schema !== LEGACY_TRANSITION_SCHEMA || result.result !== 'RECONCILED_BOOTSTRAP_ELIGIBLE'
    || result.eligible !== true || result.legacyDrainResult !== 'UNSUPPORTED' || result.reasons?.length !== 0
    || JSON.stringify(result.binding) !== JSON.stringify(binding)) fail('LEGACY_STOP_AND_RECONCILE_REQUIRED');
  // This helper intentionally yields assessment only, never a modern DRAINED
  // result or permission to execute production maintenance.
  return result;
}
