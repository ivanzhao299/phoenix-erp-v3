/** Owned temp-repository fixture only. Never uses production paths or authority. */
import fs from 'node:fs';
import path from 'node:path';
import { RegisteredMainFastForward } from '../ops/production-maintenance-gated-checkout.mjs';
import { LegacyMaintenanceDeploymentSession, RELEASE_SCOPE } from '../ops/production-maintenance-deployment-session.mjs';
import { harness } from './maintenance-transition-fixture.mjs';
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const h = harness();
const session = new LegacyMaintenanceDeploymentSession({ plan: { schema: 'phoenix.legacy-maintenance-release-plan/v1', context: h.context,
  scope: RELEASE_SCOPE, approvedPreviousFloorSha: h.context.previousFloorSha, approvedFloorSha: h.context.targetSha,
  approval: h.material.approval, recoveryPlan: h.material.recoveryPlan } }, { store: h.store });
let checks = 0, actualChild;
const record = value => fs.writeFileSync(path.join(input.evidence, 'result.json'), JSON.stringify({ fixtureOnly: true, productionReceipt: false, ...value }), { mode: 0o600 });
const advance = new RegisteredMainFastForward(input, {
  revalidate: async () => {
    checks++;
    if (checks === 4 && input.mode === 'exit-before-go') process.exit(0);
    if (checks === 4 && ['stop-git-exit-parent', 'stop-git-timeout'].includes(input.mode)) {
      const timer = setInterval(() => {
        try {
          if (fs.readlinkSync(`/proc/${actualChild.pid}/exe`) !== '/usr/bin/git') return;
          const stat = fs.readFileSync(`/proc/${actualChild.pid}/stat`, 'utf8');
          const startTicks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
          // Fault injection targets only our actually registered, live Git PID.
          process.kill(actualChild.pid, 'SIGSTOP');
          fs.writeFileSync(path.join(input.evidence, 'exec-proof.json'), JSON.stringify({ pid: actualChild.pid, executable: '/usr/bin/git', startTicks, fault: 'OWNED_SIGSTOP' }), { mode: 0o600 });
          clearInterval(timer); if (input.mode === 'stop-git-exit-parent') process.exit(0);
        } catch {}
      }, 1);
      actualChild.once('close', () => clearInterval(timer));
    }
    if (checks === 5 && input.mode === 'abort-before-go') throw new Error('FIXTURE_ADMISSION_REVOKED');
  },
  writeIntent: intent => fs.writeFileSync(path.join(input.evidence, 'intent.json'), JSON.stringify(intent), { mode: 0o600, flag: 'wx' }),
  registerOwnedChild: child => {
    actualChild = child;
    if (input.mode === 'registration-refused') session.fatal = new Error('FIXTURE_REGISTRATION_REFUSED');
    const result = session.registerOwnedChild(child);
    fs.writeFileSync(path.join(input.evidence, 'child.json'), JSON.stringify({ pid: child.pid, registered: result.registered }), { mode: 0o600 });
    return result;
  }
});
try {
  const result = await advance.run({ timeoutMs: input.mode === 'stop-git-timeout' ? 1000 : 30000 });
  let reused = false; try { await advance.run(); } catch (error) { reused = error.message.includes('ATTEMPT_REUSED'); }
  record({ status: 'PASS', result, reuseRefused: reused, checks, childrenRemaining: session.children.size });
} catch (error) {
  let reused = false; try { await advance.run(); } catch (again) { reused = again.message.includes('ATTEMPT_REUSED'); }
  record({ status: 'HOLD', code: error.message, reuseRefused: reused, checks, childrenRemaining: session.children.size,
    childClosed: actualChild ? actualChild.exitCode !== null || actualChild.signalCode !== null : null });
  if (input.mode === 'stop-git-timeout') process.exit(0);
}
