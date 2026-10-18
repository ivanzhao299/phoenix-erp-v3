import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateProductionSshEntries,APPROVED_PRODUCTION_SSH} from './check-production-ssh-entry.mjs';
const workflow=fs.readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
test('all three production SSH/SCP entries bind approved direct address, port and public key fingerprint',()=>{assert.equal(validateProductionSshEntries(workflow).length,3);});
for(const [kind,mutate] of [
 ['different host',s=>s.replace("host: '47.236.122.224'","host: '192.0.2.1'")],
 ['unresolved host secret',s=>s.replace("host: '47.236.122.224'",'host: ${{ secrets.DEPLOY_HOST }}')],
 ['different port',s=>s.replace('port: 22','port: 2222')],
 ['missing fingerprint',s=>s.replace("          fingerprint: '"+APPROVED_PRODUCTION_SSH.fingerprint+"'\n",'')],
 ['wrong fingerprint',s=>s.replace(APPROVED_PRODUCTION_SSH.fingerprint,'SHA256:UNAPPROVED')],
 ['proxy',s=>s.replace('          port: 22','          proxy_host: ${{ secrets.DEPLOY_PROXY_HOST }}\n          port: 22')],
 ['duplicate host',s=>s.replace("          host: '47.236.122.224'","          host: '47.236.122.224'\n          host: '192.0.2.1'")],
 ['extra entry',s=>s+"\n      - uses: appleboy/ssh-action@v1\n        with:\n          host: '47.236.122.224'\n          port: 22\n          fingerprint: '"+APPROVED_PRODUCTION_SSH.fingerprint+"'\n"]
])test('rejects '+kind,()=>assert.throws(()=>validateProductionSshEntries(mutate(workflow)),/PRODUCTION_SSH_ENTRY_HOLD=/));
test('approval metadata is fixed public material and is not loaded from runtime credentials',()=>{assert.deepEqual(Object.keys(APPROVED_PRODUCTION_SSH),['host','port','fingerprint']);assert.ok(Object.isFrozen(APPROVED_PRODUCTION_SSH));});

test('accepts a dash uses step with equivalently aligned with keys',()=>{const changed=workflow.replace('      - name: scp runtime-design-system.css → /opt/phoenix/static-overrides/\n        uses: appleboy/scp-action@v1','      - uses: appleboy/scp-action@v1');assert.notEqual(changed,workflow);assert.equal(validateProductionSshEntries(changed).length,3);});
test('rejects changing an action ref independently of transport fields',()=>{assert.throws(()=>validateProductionSshEntries(workflow.replace('appleboy/ssh-action@v1','appleboy/ssh-action@unreviewed')),/ACTION_REF_NOT_APPROVED/);});
test('unrecognized quoted extra action cannot escape the inventory through a parsing mismatch',()=>{assert.throws(()=>validateProductionSshEntries(workflow+"\n      - uses: 'appleboy/ssh-action@v1'\n"),/PRODUCTION_SSH_ENTRY_HOLD=/);});
test('rejects undefined aliases and incomplete anchor nodes',()=>{assert.throws(()=>validateProductionSshEntries(workflow+"\n      - *ssh_step\n"),/PRODUCTION_SSH_ENTRY_HOLD=/);assert.throws(()=>validateProductionSshEntries(workflow+"\n      - &ssh_step\n"),/PRODUCTION_SSH_ENTRY_HOLD=/);});

test('actual YAML job alias with dotted name cannot hide a fourth SSH connection',()=>{const changed=workflow.replace('  deploy:\n','  deploy: &release.job\n')+'\n  deploy-copy: *release.job\n';assert.notEqual(changed,workflow);assert.throws(()=>validateProductionSshEntries(changed),/ENTRY_INVENTORY_CHANGED/);});
test('valid shared fingerprint scalar is checked after YAML alias resolution',()=>{let changed=workflow;const line="fingerprint: '"+APPROVED_PRODUCTION_SSH.fingerprint+"'";changed=changed.replace(line,"fingerprint: &approved_key '"+APPROVED_PRODUCTION_SSH.fingerprint+"'");changed=changed.replace(line,'fingerprint: *approved_key');assert.equal(validateProductionSshEntries(changed).length,3);});
test('YAML merge keys, cycles, multiple documents and custom tags fail closed without exposing parser values',()=>{for(const changed of [workflow.replace("          host: '47.236.122.224'","          <<: { host: evil }\n          host: '47.236.122.224'"),workflow+'\n---\nsecret: SENTINEL\n',workflow+'\nunsafe: !!js/function SENTINEL\n','jobs: &root { cyclic: { steps: [*root] } }'])assert.throws(()=>validateProductionSshEntries(changed),error=>/^PRODUCTION_SSH_ENTRY_HOLD=[A-Z_]+$/.test(error.message)&&!error.message.includes('SENTINEL'));});
