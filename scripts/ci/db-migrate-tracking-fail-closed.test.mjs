import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync('scripts/db-migrate.sh', 'utf8');

test('production DBQ is fail-closed and deterministic', () => {
  assert.match(script, /docker compose exec -T db[\s\S]*psql -X -tAq -v ON_ERROR_STOP=1/);
  assert.match(script, /psql -X -tAq -v ON_ERROR_STOP=1/);
});

test('tracking table creation failure is not suppressed', () => {
  const createLine = script.split('\n').find((line) => line.includes('CREATE TABLE IF NOT EXISTS schema_migrations'));
  assert.ok(createLine);
  assert.match(createLine, />\/dev\/null$/);
  assert.doesNotMatch(createLine, /\|\| true/);
});

test('tracking inserts fail closed in baseline and migration paths', () => {
  const insertLines = script.split('\n').filter((line) => line.includes('DBQ "INSERT INTO schema_migrations(filename)'));
  assert.equal(insertLines.length, 2);
  for (const line of insertLines) {
    assert.match(line, />\/dev\/null$/);
    assert.doesNotMatch(line, /\|\| true/);
  }
  assert.match(script, /if \[ "\$track" = "1" \]; then/);
});

test('legacy execution and TypeORM production ownership are unchanged', () => {
  assert.match(script, /DBFILE\(\) \{[^}]*ON_ERROR_STOP=1/);
  assert.match(script, /prod 模式: TS 迁移完全由 deploy\.yml/);
});
