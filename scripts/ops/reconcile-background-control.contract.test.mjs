import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const script = fs.readFileSync(path.join(import.meta.dirname, 'reconcile-background-control.mjs'), 'utf8');
const workflow = fs.readFileSync(path.join(import.meta.dirname, '..', '..', '.github', 'workflows', 'production-background-reconciliation.yml'), 'utf8');

test('background control reconcile reports a bounded stage for every hold', () => {
  assert.match(script, /BACKGROUND_RECONCILIATION_STAGE=/);
  assert.match(script, /_AT_\$\{stage\}/);
  for (const stage of ['VERIFY_CONTEXT', 'CHECKOUT', 'REMOTE_MAIN', 'STATE_BINDING', 'DEPLOYMENT_STATE', 'HOLD_SHAPE', 'RUNTIME_BINDING', 'CLEAR_HOLD', 'COMPLETE']) {
    assert.match(script, new RegExp(`mark\\('${stage}'\\)`));
  }
});

test('background control reconcile only ever clears an inspected, stranded hold', () => {
  // Deletion is restricted to the two stranded phases; an OPEN record is never touched.
  assert.match(script, /\['FENCED', 'CODE_HOLD'\]\.includes\(record\.phase\)/);
  // A crash before the public deny published is provable only when no manifest exists.
  assert.match(script, /record\.phase === 'PUBLISHING_FENCE' && !manifest/);
  // A live floor equal to the held target must go through deployment recovery, not deletion.
  assert.match(script, /TARGET_ACTIVE_USE_DEPLOYMENT_RECOVERY/);
  // In-flight deployment state is a hard hold.
  assert.match(script, /transaction\.json/);
  // Runtime must still match the pinned floor before any deletion.
  assert.match(script, /expectedApi = fullRecord \? active\.active\.api\.revision : floor\.floorSha/);
  // Inspect never reaches mutation: it exits before the phase checks.
  assert.match(script, /if \(mode === 'inspect'\) \{[\s\S]*?process\.exit\(0\);/);
});

test('background control reconciliation workflow is dispatch-gated and stages reviewed helpers', () => {
  assert.match(workflow, /RECONCILE_PRODUCTION_BACKGROUND_CONTROL/);
  assert.match(workflow, /expected_main_sha/);
  assert.match(workflow, /cd \/data\/phoenix-erp/);
  assert.match(workflow, /PRODUCTION_CONTROL_BOOTSTRAP_B64/);
  assert.match(workflow, /git_safe show "\$TARGET_SHA:scripts\/ops\/\$helper"/);
  // Read-only phases never fast-forward the production checkout; reconcile may.
  assert.match(workflow, /case "\$PHASE" in inspect\|revive-participant\)/);
  assert.match(workflow, /git_safe merge --ff-only "\$TARGET_SHA"/);
  assert.match(script, /if \(mode === 'reconcile' && targetSha !== git\(\['rev-parse', 'HEAD'\]\)\) hold\('CHECKOUT'\)/);
});

test('participant revival is the only reset for an invisible generation watermark', () => {
  // The stranded session leaves an in-memory manifest watermark that no file
  // can express; only a stateless API restart accepts a fresh generation.
  assert.match(script, /revive-participant/);
  assert.match(script, /docker', \['restart', 'phoenix-v3-api'\]/);
  assert.match(script, /REVIVE_WITH_RECORD_CLEAR_FIRST/);
  assert.match(script, /REVIVE_UNHEALTHY/);
  // Revival refuses while any control record still exists.
  assert.match(script, /mark\('HOLD_SHAPE'\);[\s\S]*?if \(mode === 'revive-participant'\) \{[\s\S]*?background-control\.json/);
  // Revival never touches the production checkout.
  assert.match(script, /mode === 'reconcile' && targetSha !== git/);
});

test('clearing a hold persists the generation high-water mark', () => {
  // The next fence must continue above every generation a live participant
  // may still watermark, otherwise it is rejected as MANIFEST_GENERATION_REPLAY.
  assert.match(script, /background-generation\.json/);
  assert.match(script, /phoenix\.background-generation\/1/);
  assert.match(script, /Math\.max\(record\.generation, manifest\?\.generation \?\? 0\)/);
  assert.match(script, /atomicState\(generationFile/);
});
