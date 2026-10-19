/** Low-level owned IPC lifecycle fixture, synthetic controller health only.
 * Never a production issuer, recorder, ingress controller or release factory. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fixture } from './maintenance-transition-fixture.mjs';
import { bindingDigest } from '../ops/production-maintenance-receipts.mjs';
import { MaintenanceControlParticipants, CONTROL_PARTICIPANT_ROLES } from '../ops/production-maintenance-control-participants.mjs';

const program = `let initial;
process.on('message', r => {
 if(r.operation==='INIT'&&!initial){initial=r.value;process.send({id:r.id,value:{ready:true}});}
 else if(r.operation==='HEALTH'&&initial) process.send({id:r.id,value:{schema:'phoenix.maintenance-control-participant-health/v1',
 ...initial,childPid:process.pid,nonce:r.nonce,healthy:true,pending:0,protocolVersion:1}});
 else if(r.operation==='CLOSE') process.exit(0);
 else if(r.operation==='CLOSE_ERROR') process.exit(7);
});`;
const hash = createHash('sha256').update(program).digest('hex');
export async function openControlParticipantFixture({ context: suppliedContext, probe, start, close } = {}) {
  const context = suppliedContext || fixture({ clock: Date.now }).context, directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-control-graph-'));
  const file = path.join(directory, 'owned-controller.cjs'); fs.writeFileSync(file, program, { mode: 0o600 });
  const clients = [], closeOrder = [], probes = [];
  const definitions = CONTROL_PARTICIPANT_ROLES.map(role => ({ role, sourceSha256: hash,
    async start(options) {
      const child = fork(file, [], { execPath: process.execPath, env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      const joined = once(child, 'close'), pending = new Map(); child.stdout.resume(); child.stderr.resume();
      child.on('message', r => { const p = pending.get(r.id); if (p) { pending.delete(r.id); p(r.value); } });
      const client = { child, joined, role, rpc(operation, extra = {}) {
        return new Promise(resolve => { const id = randomUUID(); pending.set(id, resolve); child.send({ id, operation, ...extra }); });
      } };
      clients.push(client); options.registerOwnedChild(child);
      await client.rpc('INIT', { value: { role, owner: context.owner, contextDigest: bindingDigest(context), sourceSha256: hash } });
      return start ? start(client, options) : client;
    },
    async probe(client, request) { probes.push({ role, nonce: request.nonce });
      const response = await client.rpc('HEALTH', { nonce: request.nonce });
      return probe ? probe(response, client, request) : response;
    },
    async close(client, options) { closeOrder.push(role); const closeOriginal = async () => { if (client.child.connected) client.child.send({ operation: 'CLOSE' }); await client.joined; }; return close ? close(client, options, closeOriginal) : closeOriginal(); }
  }));
  const graph = new MaintenanceControlParticipants({ context, definitions });
  return { graph, clients, definitions, context, probes, closeOrder,
    async cleanup() { for (const c of [...clients].reverse()) { if (c.child.connected) c.child.send({ operation: 'CLOSE' }); await c.joined; }
      fs.unlinkSync(file); fs.rmdirSync(directory); } };
}
