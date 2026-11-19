import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {extractModernSchemaDeploymentBody,readCommittedModernSchemaDeploymentBody} from './production-modern-schema-body-source.mjs';
const workflow=fs.readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
test('extracts one complete reviewed typed common body without the runner shell or caller definitions',()=>{
 const result=extractModernSchemaDeploymentBody(workflow);assert.match(result.body,/^perform_deployment\(\) \{/);assert.match(result.body,/production_state complete/);
 assert.equal(result.body.includes('production_state() {'),false);assert.equal(result.body.includes('MODERN_SCHEMA_GITHUB_READ_TOKEN'),false);assert.match(result.bodySha256,/^[a-f0-9]{64}$/);
});
test('ambiguous, truncated, xtrace, untyped and noncommit source cannot be executed',()=>{
 for(const source of [workflow+workflow,workflow.replace('            perform_deployment() {','            other() {'),workflow.replaceAll('MODERN_SCHEMA_BODY_SUPERVISED','UNTRUSTED_SELECTOR'),workflow.replace('            production_state complete','            set -x\n            production_state complete')])
  assert.throws(()=>extractModernSchemaDeploymentBody(source),/BODY_SOURCE_HOLD=/);
 assert.throws(()=>readCommittedModernSchemaDeploymentBody('/nonexistent','main'),/EXACT_COMMIT/);
});
