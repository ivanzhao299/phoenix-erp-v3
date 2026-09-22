import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const path = new URL('../../.github/workflows/production-ledger-repair-audit.yml', import.meta.url);
const workflow = readFileSync(path, 'utf8');

test('ledger repair audit workflow parses and is manual-only', () => {
  const parser = spawnSync('python3', ['-c', `
import pathlib, sys
import yaml
doc=yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
on=doc.get(True, doc.get('on', {}))
assert set(on) == {'workflow_dispatch'}, set(on)
assert doc['jobs']['audit']['environment'] == 'production-readonly'
assert doc['permissions']['contents'] == 'read'
assert 'workflow_dispatch' in doc['jobs']['audit']['if']
assert 'refs/heads/main' in doc['jobs']['audit']['if']
`, path.pathname], { encoding: 'utf8' });
  assert.equal(parser.status, 0, parser.stderr || parser.stdout);
});

test('production command block is read-only and metadata-focused', () => {
  const start = workflow.indexOf('Audit production ledger state over read-only SSH');
  assert.ok(start >= 0);
  const remote = workflow.slice(start);
  assert.match(remote, /AUDIT_STAGE=SSH_CONNECTED/);
  assert.match(remote, /SET TRANSACTION READ ONLY/);
  assert.match(remote, /to_regclass\('public\.schema_migrations'\)/);
  assert.match(remote, /REPAIR_DISPOSITION=INCOMPLETE_EVIDENCE/);
  for (const forbidden of [
    'git fetch', 'git pull', 'git push', 'git reset', 'git clean', 'git stash',
    'git switch', 'git checkout', 'git remote set-url', 'git remote add',
    'git remote remove', 'docker compose up', 'docker compose down',
    'docker compose restart', 'db-migrate.sh', 'ledger-preflight',
    'migration:run', 'migration:revert', 'CREATE TABLE', 'INSERT INTO',
    'UPDATE ', 'DELETE FROM', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE',
  ]) {
    assert.doesNotMatch(remote, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), forbidden);
  }
  assert.doesNotMatch(remote, /echo\s+["']\$ORIGIN_URL/);
  assert.doesNotMatch(remote, /ssh\s+-G\s+[^|\n]+\n/);
});

test('workflow keeps canonical evidence and conservative repair classifications', () => {
  assert.match(workflow, /MIG_MODE=ci MIG_DIR=apps\/api bash scripts\/db-migrate\.sh/);
  assert.match(workflow, /LEDGER_EVIDENCE_POLICY=INDETERMINATE_WHEN_TRACKING_METADATA_MISSING/);
  assert.match(workflow, /SAFE_ONE_TIME_LEDGER_BOOTSTRAP|SAFE_RECONSTRUCT_MISSING_SCHEMA_LEDGER|MIGRATIONS_ACTUALLY_PENDING|PRODUCTION_SCHEMA_DRIFT|INCOMPLETE_EVIDENCE/);
  assert.match(workflow, /TYPEORM_REPAIR_DISPOSITION=UNKNOWN/);
});
