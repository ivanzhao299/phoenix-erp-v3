import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const path = new URL('../../.github/workflows/production-ledger-repair-audit.yml', import.meta.url);
const workflow = readFileSync(path, 'utf8');

function parseWorkflow() {
  const parser = spawnSync('python3', ['-c', `
import json, pathlib, sys
import yaml
doc=yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
on=doc.get(True, doc.get('on', {}))
step=next(s for s in doc['jobs']['audit']['steps'] if s.get('name') == 'Audit production ledger state over read-only SSH')
print(json.dumps({'triggers': list(on), 'environment': doc['jobs']['audit']['environment'],
                  'permissions': doc['permissions'], 'guard': doc['jobs']['audit']['if'],
                  'script': step['with']['script'], 'env': step['env'], 'envs': step['with']['envs'],
                  'runs': [s['run'] for s in doc['jobs']['audit']['steps'] if 'run' in s]}))
`, path.pathname], { encoding: 'utf8' });
  assert.equal(parser.status, 0, parser.stderr || parser.stdout);
  return JSON.parse(parser.stdout);
}

test('ledger repair audit workflow parses and is manual-only', () => {
  const parsed = parseWorkflow();
  assert.deepEqual(parsed.triggers, ['workflow_dispatch']);
  assert.equal(parsed.environment, 'production-readonly');
  assert.deepEqual(parsed.permissions, { contents: 'read' });
  assert.match(parsed.guard, /github\.event_name == 'workflow_dispatch'/);
  assert.match(parsed.guard, /github\.ref == 'refs\/heads\/main'/);
});

test('actual YAML SSH script and runner run blocks are valid Bash', () => {
  const parsed = parseWorkflow();
  for (const [name, script] of [['SSH script', parsed.script], ...parsed.runs.map((run, index) => [`run block ${index + 1}`, run])]) {
    const check = spawnSync('bash', ['-n'], { input: script, encoding: 'utf8' });
    assert.equal(check.status, 0, `${name}: ${check.stderr || check.stdout}`);
  }
});

test('production command block is read-only and metadata-focused', () => {
  const remote = parseWorkflow().script;
  assert.match(remote, /AUDIT_STAGE=SSH_CONNECTED/);
  assert.match(remote, /PGOPTIONS='-c default_transaction_read_only=on'/);
  assert.match(remote, /SHOW transaction_read_only/);
  assert.match(remote, /DB_SESSION_NOT_READ_ONLY/);
  assert.ok(remote.indexOf('DB_SESSION_NOT_READ_ONLY') < remote.indexOf("to_regclass('public.schema_migrations')"));
  assert.doesNotMatch(remote, /dbq_ro\s+\\"/);
  assert.doesNotMatch(remote, /BEGIN; SET TRANSACTION READ ONLY; SHOW transaction_read_only; COMMIT;/);
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

test('sys_user is probed in two stages and backup uses historical deployment SHA', () => {
  const parsed = parseWorkflow();
  const remote = parsed.script;
  assert.ok(remote.indexOf("to_regclass('public.sys_user')") < remote.indexOf('if [ "$SYS_USER_TABLE" = MISSING ]'));
  assert.ok(remote.indexOf('if [ "$SYS_USER_TABLE" = MISSING ]') < remote.indexOf('EXISTS (SELECT 1 FROM public.sys_user)'));
  assert.doesNotMatch(remote, /WHEN to_regclass\('public\.sys_user'\)[\s\S]*?EXISTS \(SELECT 1 FROM public\.sys_user\)/);
  assert.equal(parsed.env.BACKUP_RUN_ID, '35679353194');
  assert.equal(parsed.env.BACKUP_TARGET_SHA, 'fb70fbad9a163d9e3cbb02a76506766babe89db2');
  assert.equal(parsed.env.AUDIT_SHA, '${{ github.sha }}');
  assert.match(parsed.envs, /BACKUP_TARGET_SHA/);
  assert.match(remote, /phoenix_erp_pre_\$\{BACKUP_TARGET_SHA:0:12\}\.dump/);
  assert.doesNotMatch(remote, /phoenix_erp_pre_\$\{(?:EXPECTED_SHA|AUDIT_SHA|GITHUB_SHA):0:12\}/);
});

test('workflow keeps canonical evidence and conservative repair classifications', () => {
  assert.match(workflow, /MIG_MODE=ci MIG_DIR=apps\/api bash scripts\/db-migrate\.sh/);
  assert.match(workflow, /LEDGER_EVIDENCE_POLICY=INDETERMINATE_WHEN_TRACKING_METADATA_MISSING/);
  assert.match(workflow, /SAFE_ONE_TIME_LEDGER_BOOTSTRAP|SAFE_RECONSTRUCT_MISSING_SCHEMA_LEDGER|MIGRATIONS_ACTUALLY_PENDING|PRODUCTION_SCHEMA_DRIFT|INCOMPLETE_EVIDENCE/);
  assert.match(workflow, /TYPEORM_REPAIR_DISPOSITION=UNKNOWN/);
});
