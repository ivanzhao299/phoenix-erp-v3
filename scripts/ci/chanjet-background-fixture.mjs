// Explicit isolated adapter only. Production CLI never imports this module.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { requireOwnedPostgresFixture } from './owned-postgres-fixture.mjs';
import { validateExecutionManifest } from '../ops/chanjet-execution-manifest.mjs';
import { validateReadonlyPolicy } from '../ops/chanjet-readonly-policy.mjs';
const proofs = new WeakSet();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Full-chain fixture PATH shims model production host commands, but ownership
// proof must inspect the REAL dedicated Docker instance, never its shim.
const inspectOwnedFixture = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PATH: String(process.env.PATH || '').split(':').filter(p => p && p !== process.env.R42D_SHIM_BIN).join(':') } });
const refuse = reason => { throw Error(`CHANJET_BACKGROUND_FIXTURE_HOLD=${reason}`); };
export function requireLoopbackHttp(value, { optional = false } = {}) {
  if (!value && optional) return;
  let u;
  try { u = new URL(value); } catch { refuse('LOOPBACK_HTTP_REQUIRED'); }
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
    || u.username || u.password || u.search || u.hash) refuse('LOOPBACK_HTTP_REQUIRED');
  return u;
}
/** Safe Docker identity inspection only: no discovery, DB connection or SQL. */
export function requireChanjetBackgroundFixture({ pgUrl, providerBase, alignmentBase, approval, manifest,
  container, owner }, inspect = inspectOwnedFixture) {
  if (!/^[a-f0-9]{64}$/.test(container || '')) refuse('IMMUTABLE_CONTAINER_ID_REQUIRED');
  const id = requireOwnedPostgresFixture({ url: pgUrl, container, owner }, inspect);
  if (id !== container) refuse('CONTAINER_ID_CHANGED');
  requireLoopbackHttp(providerBase);
  requireLoopbackHttp(alignmentBase, { optional: true });
  // Reuse exact shape/scope validation; durable admission and readonly policy
  // still enforce their original deadlines and authorizations during work.
  let executionApproval;
  if (approval) {
    // Runtime VERIFY policies may also carry empty verifiedRunId/evidence
    // placeholders. Validate the complete policy before projecting ONLY its
    // execution identity; unknown fields and widened scopes remain refused.
    validateReadonlyPolicy('READONLY_VERIFY', approval, approval.floorSha);
    const { verifiedRunId, verifiedEvidenceRunId, ...identity } = approval;
    executionApproval = identity;
  }
  const binding = validateExecutionManifest(manifest || {
    version: 1, executionId: `FIXTURE_${randomUUID().replaceAll('-', '')}`, ownerId: 'ROOT_OPERATOR',
    requestCap: 1, totalTimeoutMs: 1, httpTimeoutMs: 1, approval: executionApproval,
  });
  if (executionApproval && JSON.stringify(binding.manifest.approval) !== JSON.stringify(validateExecutionManifest({
    ...binding.manifest, approval: executionApproval,
  }).manifest.approval)) refuse('APPROVAL_SCOPE_CHANGED');
  const proof = Object.freeze({ pgUrl, containerId: id, owner, floorSha: binding.manifest.approval.floorSha, scopeDigest: binding.digest });
  proofs.add(proof);
  return proof;
}
/** Real task graphs, lifecycle and PostgreSQL advisory locks. Only the root
 * manifest filesystem is replaced by an explicitly isolated in-memory reader.
 * This is fixture evidence, never a production root/FD9 or OCI attestation. */
export async function createChanjetBackgroundFixture(proof, dataSource) {
  if (!proofs.has(proof)) refuse('OWNED_SCOPE_PROOF_REQUIRED');
  const u = new URL(proof.pgUrl), options = dataSource.options || {};
  const sameTarget = options.url ? options.url === proof.pgUrl : options.type === 'postgres'
    && options.host === u.hostname && Number(options.port || 5432) === Number(u.port || 5432)
    && options.database === u.pathname.slice(1) && options.username === decodeURIComponent(u.username);
  if (!sameTarget) refuse('OWNED_SCOPE_PROOF_REQUIRED');
  const liveId = requireOwnedPostgresFixture({ url: proof.pgUrl, container: proof.containerId, owner: proof.owner }, inspectOwnedFixture);
  if (liveId !== proof.containerId) refuse('CONTAINER_ID_CHANGED');
  const dist = path.join(root, 'apps/api/dist/modules/background-control');
  const load = name => import(pathToFileURL(path.join(dist, `${name}.js`)).href);
  const [{ BackgroundTaskService }, { BackgroundLockBackend }, { BackgroundManifestReader }] = await Promise.all([
    load('background-task.service'), load('background-lock.backend'), load('background-manifest.reader'),
  ]);
  const validator = new BackgroundManifestReader();
  let manifest;
  const reader = {
    read: () => validator.validate(manifest),
    authorize(identity, kind) {
      const current = this.read();
      if (current.phase !== 'OPEN' || !current.participants.some(p => p.bootId === identity.bootId && p.allowedKinds.includes(kind))) {
        refuse('FENCED_OR_UNAUTHORIZED');
      }
      return current;
    },
  };
  const tasks = new BackgroundTaskService(reader, new BackgroundLockBackend(dataSource));
  manifest = { protocolVersion: 1, phase: 'OPEN', owner: `owned-fixture:${proof.owner}`, generation: 1,
    targetSha: proof.floorSha, participants: [{ bootId: tasks.identity.bootId, containerId: proof.containerId,
      revision: proof.floorSha, allowedKinds: ['LOCAL', 'CHANJET_AUTH', 'CHANJET_SYNC'] }] };
  await tasks.onModuleInit();
  return tasks;
}
