import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflowPath = new URL('../../.github/workflows/production-schema-object-diff-audit.yml', import.meta.url);
const workflowText = fs.readFileSync(workflowPath, 'utf8');

function parseWorkflow() {
  const parser = spawnSync('python3', ['-c', `
import json, pathlib, sys, yaml
doc=yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
on=doc.get(True, doc.get('on', {}))
step=next(s for s in doc['jobs']['audit']['steps'] if s.get('name') == 'Audit production schema over read-only SSH')
print(json.dumps({'triggers': list(on), 'environment': doc['jobs']['audit']['environment'],
                  'permissions': doc['permissions'], 'guard': doc['jobs']['audit']['if'],
                  'workflow': doc, 'production_script': step['with']['script']}))
`, workflowPath.pathname], { encoding: 'utf8' });
  assert.equal(parser.status, 0, parser.stderr || parser.stdout);
  return JSON.parse(parser.stdout);
}

const parsed = parseWorkflow();
const workflow = parsed.workflow;
const trigger = parsed.triggers;
const job = workflow.jobs.audit;
const productionScript = parsed.production_script;

test('object diff audit is manual-only and production-readonly', () => {
  assert.deepEqual(trigger, ['workflow_dispatch']);
  assert.match(parsed.guard, /github\.event_name == 'workflow_dispatch'/);
  assert.match(parsed.guard, /github\.ref == 'refs\/heads\/main'/);
  assert.equal(parsed.environment, 'production-readonly');
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(job.services.postgres16.image, 'postgres:16.14-alpine');
  assert.equal(job.services.postgres18.image, 'postgres:18-alpine');
});

test('production comparator is PG16 and PG18 is diagnostic-only', () => {
  assert.match(workflowText, /CANONICAL_MANIFEST_B64: \$\{\{ steps\.pg16\.outputs\.CANONICAL_MANIFEST_B64 \}\}/);
  assert.match(workflowText, /steps\.pg16\.outcome == 'success' && steps\.pg18\.outcome == 'success'/);
  assert.match(productionScript, /schema-object-diff\.mjs/);
  assert.doesNotMatch(productionScript, /PG18|CANONICAL_PG18|postgres:18/);
});

test('production SSH script has exact Bash syntax and no write operations', () => {
  const path = '/tmp/production-schema-object-diff-audit.test.sh';
  fs.writeFileSync(path, productionScript);
  const syntax = spawnSync('bash', ['-n', path], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  for (const forbidden of ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'INSERT', 'UPDATE', 'DELETE', 'db-migrate.sh', 'migration:run', 'bridge --apply', 'docker compose up', 'docker compose down', 'docker compose restart', 'git pull', 'git fetch', 'git reset', 'git clean', 'git switch']) {
    assert.doesNotMatch(productionScript, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(productionScript, /SHOW transaction_read_only/);
  assert.match(productionScript, /test "\$DB_READ_ONLY" = on/);
  assert.match(productionScript, /psql[^\n]*-0[^\n]*-c/);
  assert.match(productionScript, /dbq_ro_manifest/);
  assert.doesNotMatch(productionScript, /MANIFEST=\$\(/);
  assert.doesNotMatch(productionScript, /TSV=\$\(/);
});

test('canonical manifest uses NUL record framing', () => {
  assert.match(workflowText, /psql -X -v ON_ERROR_STOP=1 -At -0 -c/);
  assert.match(workflowText, /canonical-pg16\.manifest/);
  assert.match(workflowText, /SCHEMA_OBJECT_DIFF_HELPER_B64/);
});
