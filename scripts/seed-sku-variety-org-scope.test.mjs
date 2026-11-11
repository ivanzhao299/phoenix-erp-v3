import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertCompatible, buildCatalog, CONFIGURATION_NOTICE, databaseConfig, prepareCatalog } from './seed-sku-variety-org-scope.mjs';

// 纯内存 SQL 替身：验证执行计划和事务控制，不需要 pg 或真实数据库。
function fakeClient({ legacy = [], failOn, missingGrade = false, missingSpec = false } = {}) {
  const tables = new Map();
  const calls = [];
  let snapshot;
  return {
    tables, calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (failOn?.(sql)) throw new Error('relation does not exist');
      if (sql === 'BEGIN') snapshot = structuredClone(tables);
      if (sql === 'ROLLBACK') { tables.clear(); for (const [k, v] of snapshot) tables.set(k, v); }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('SELECT product_code FROM mst_products')) return { rows: legacy };
      if (sql.includes('SELECT grade_code FROM product_grades')) return { rows: values[0].filter(v => !missingGrade || v !== 'GRADE_5').map(grade_code => ({ grade_code })) };
      if (sql.includes('SELECT spec_code FROM packaging_specs')) return { rows: values[0].filter(v => !missingSpec || v !== 'GIFT24').map(spec_code => ({ spec_code })) };
      const select = sql.match(/^SELECT (.+) FROM (\w+) WHERE (\w+) = \$1 FOR UPDATE$/);
      if (select) return { rows: tables.has(`${select[2]}/${values[0]}`) ? [tables.get(`${select[2]}/${values[0]}`)] : [] };
      const insert = sql.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES/);
      if (insert) {
        const row = Object.fromEntries(insert[2].split(', ').map((key, i) => [key, values[i]]));
        tables.set(`${insert[1]}/${values[0]}`, row);
        return { rows: [], rowCount: 1 };
      }
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}
const silent = { log() {} };

test('import and catalog construction do not require pg or DB configuration', () => {
  const c = buildCatalog();
  assert.equal(c.products.length, 2);
  assert.equal(c.skus.length, 84);
  assert.equal(new Set(c.skus.map(s => s.sku_code)).size, 84);
  assert.deepEqual(c.products.map(p => p.product_code), ['PRD-EGG-RED', 'PRD-EGG-PINK']);
  for (const rows of Object.values(c)) for (const row of rows) assert.equal(row.status, 'DRAFT');
  for (const sku of c.skus) assert.ok(c.products.some(p => p.product_code === sku.product_code && p.variety_code === sku.variety_code));
  assert.equal(c.grades[0].grade_code, 'GRADE_0');
  assert.equal(c.grades[0].weight_range, null);
  assert.equal(c.grades[0].is_saleable, false);
  assert.equal(c.grades[0].is_storable, false);
});

test('database configuration has no implicit local/mac defaults', () => {
  assert.throws(() => databaseConfig({}), /DATABASE_URL.*DB_HOST/);
  assert.throws(() => databaseConfig({ DB_HOST: 'localhost', DB_PORT: '5432', DB_USER: 'u', DB_NAME: 'd' }), /DB_PASSWORD/);
  assert.deepEqual(databaseConfig({ DATABASE_URL: 'postgres://explicit' }), { connectionString: 'postgres://explicit' });
  const env = { DB_HOST: 'db', DB_PORT: '5432', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'd' };
  assert.deepEqual(databaseConfig(env), { host: 'db', port: 5432, user: 'u', password: 'p', database: 'd' });
  for (const port of ['0', '65536', 'NaN', '1.5']) assert.throws(() => databaseConfig({ ...env, DB_PORT: port }), /DB_PORT/);
});

test('CLI rejects missing explicit configuration before loading pg', () => {
  const env = { ...process.env };
  for (const key of ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) delete env[key];
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./seed-sku-variety-org-scope.mjs', import.meta.url)), '--dry-run'], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /必须显式设置 DATABASE_URL/);
});

test('CLI refuses any apply/manifest flag instead of granting access', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./seed-sku-variety-org-scope.mjs', import.meta.url)), '--apply'], { env: {}, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不支持 manifest apply/);
});

test('catalog-only writes DRAFT data without mapping, scope, flock, DDL or history rewrites', async () => {
  const client = fakeClient();
  const logs = [];
  assert.equal(await prepareCatalog(client, { log: m => logs.push(m) }), 89);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
  assert.ok(logs.includes(CONFIGURATION_NOTICE));
  assert.match(logs[0], /companyCode\/varietyCode\/breedCode\/sku/);
  for (const { sql } of client.calls) {
    assert.doesNotMatch(sql, /^\s*(?:ALTER|UPDATE|DELETE|TRUNCATE)\b|md_variety_breeds|md_sku_org_scope|brd_flocks/);
  }
  for (const row of client.tables.values()) assert.equal(row.status, 'DRAFT');
  assert.equal(await prepareCatalog(client, silent), 0, 'same catalog is idempotent');
});

test('dry-run executes inserts but ends in rollback only', async () => {
  const client = fakeClient();
  assert.equal(await prepareCatalog(client, { ...silent, dryRun: true }), 89);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert.ok(client.calls.some(c => c.sql.startsWith('INSERT')));
  assert.ok(!client.calls.some(c => c.sql === 'COMMIT'));
  assert.equal(client.tables.size, 0);
});

test('missing table abort is not swallowed and no transaction work follows except rollback', async () => {
  const client = fakeClient({ failOn: sql => sql.includes('SELECT spec_code') });
  await assert.rejects(prepareCatalog(client, silent), /relation does not exist/);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert.ok(client.calls.at(-2).sql.includes('SELECT spec_code'));
  assert.equal(client.tables.size, 0);
});

test('missing grade/spec dependencies fail closed', async () => {
  for (const option of [{ missingGrade: true }, { missingSpec: true }]) {
    const client = fakeClient(option);
    await assert.rejects(prepareCatalog(client, silent), /目录依赖缺失/);
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(client.tables.size, 0);
  }
});

test('legacy grade-in-product is reported as conflict, never migrated', async () => {
  const client = fakeClient({ legacy: [{ product_code: 'PRD-EGG-RED-1' }] });
  await assert.rejects(prepareCatalog(client, silent), /目录冲突.*PRD-EGG-RED-1/);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert.ok(!client.calls.some(c => c.sql.startsWith('INSERT')));
});

test('referenced legacy SKU identity cannot be silently reassigned', async () => {
  const client = fakeClient();
  const old = { ...buildCatalog().skus[0], product_code: 'PRD-EGG-RED-0', status: 'ACTIVE' };
  client.tables.set(`product_skus/${old.sku_code}`, old);
  await assert.rejects(prepareCatalog(client, silent), /目录冲突.*product_code.*status/);
  assert.deepEqual([...client.tables.values()], [old], 'new catalog writes rolled back; historical SKU unchanged');
});

test('existing active catalog or unconfirmed GRADE_0 weight is a conflict, not an update', () => {
  const desired = buildCatalog().grades[0];
  assert.throws(() => assertCompatible({ ...desired, weight_range: 'unapproved' }, desired, 'GRADE_0'), /目录冲突.*weight_range/);
  assert.throws(() => assertCompatible({ ...desired, status: 'ACTIVE' }, desired, 'GRADE_0'), /目录冲突.*status/);
  assert.doesNotThrow(() => assertCompatible({ ...desired, id: 123 }, desired, 'GRADE_0'));
});

test('failure after inserts rolls back instead of committing partially prepared catalog', async () => {
  const client = fakeClient({ failOn: sql => sql.startsWith('INSERT INTO product_skus') });
  await assert.rejects(prepareCatalog(client, silent), /relation does not exist/);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(client.tables.size, 0);
  assert.ok(!client.calls.some(c => c.sql === 'COMMIT'));
});
