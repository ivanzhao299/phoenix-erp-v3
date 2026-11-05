import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const script = fs.readFileSync(path.join(import.meta.dirname, 'reconcile-production-runtime-pins.mjs'), 'utf8');

test('runtime pin repair reports a bounded stage for every hold', () => {
  assert.match(script, /RUNTIME_PIN_STAGE=/);
  assert.match(script, /_AT_\$\{stage\}/);
  for (const stage of ['VERIFY_CONTEXT', 'STATE_BINDING', 'CAPTURE_RUNTIME', 'ATOMIC_WRITE', 'POST_WRITE_GUARD']) {
    assert.match(script, new RegExp(`mark\\('${stage}'\\)`));
  }
});
