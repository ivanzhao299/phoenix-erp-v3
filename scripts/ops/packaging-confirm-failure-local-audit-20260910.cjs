/* Readonly diagnostic: imports current source, in-memory SELECT-only fixture.
 * No DB connection, application bootstrap, HTTP call, or persisted fake records.
 * Run from repository root: NODE_ENV=test node scripts/ops/packaging-confirm-failure-local-audit-20260910.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const ts = apiRequire('typescript');
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
const { PackagingInventoryIntegrationService } = require(path.join(root,
  'apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts'));

async function main() {
  const rec = {
    code: 'PKG-20260910-163616', shift_id: 56, site_id: 'LPH_MENGSAI',
    production_date: '2026-09-10', status: 'ACTIVE', is_test: false, shift_is_test: false,
    batches_json: [{ grade: 'GRADE_5', eggs: 30, specId: 'PKG_PACK_SPEC_3', spec: '精品礼盒(30枚/盒)' }],
  };
  let inventoryCalls = 0;
  const queries = [];
  const manager = { query: async (sql, args) => {
    assert.match(sql.trim(), /^SELECT\b/, 'Diagnostic fixture forbids all SQL mutations');
    queries.push({ sql, args });
    if (sql.includes('FROM pkg_packing_records')) return [rec];
    if (sql.includes('FROM sys_dict')) return [];
    if (sql.includes('FROM inv_batches')) return [];
    if (sql.includes('SELECT company_code FROM')) return [{ company_code: 'COMP-LAO-AGRI' }];
    if (sql.includes('FROM product_grades')) return [{ grade_code: 'GRADE_5', is_saleable: true }];
    if (sql.includes('FROM packaging_specs')) return [{ spec_code: 'PKG_PACK_SPEC_3' }];
    if (sql.includes('FROM product_skus')) return [];
    if (sql.includes('pg_advisory_xact_lock')) return [];
    throw Error(`Unexpected query: ${sql}`);
  } };
  const noConnection = { transaction: () => { throw Error('No database connection allowed'); } };
  const service = new PackagingInventoryIntegrationService(noConnection, { get: () => ({ username: 'local-audit' }) },
    { createProductionBatch: () => { inventoryCalls++; throw Error('Inventory writes forbidden in audit'); } },
    { resolveMode: async (scope, mgr) => {
      assert.deepEqual(scope, { siteCode: 'LPH_MENGSAI', companyCode: 'COMP-LAO-AGRI' });
      assert.equal(mgr, manager);
      return 'PACKAGING_INBOUND';
    } });
  let failure;
  try {
    // Warehouse is a known valid same-site candidate, NOT a recovered failed request field.
    await service.completeTerminalPacking(rec.code, {
      manager, warehouseCode: 'LPH_MS_EGG_FARM', locationCode: 'CS-KW-MS01',
    });
  } catch (error) { failure = error; }
  assert.equal(failure?.constructor.name, 'NotFoundException');
  assert.equal(failure?.message, 'SKU 主数据未唯一生效：PRD-EGG-GRADE_5/GRADE_5/PKG_PACK_SPEC_3');
  assert.equal(inventoryCalls, 0);
  const skuQuery = queries.find(x => x.sql.includes('FROM product_skus'));
  assert.deepEqual(skuQuery.args, ['PRD-EGG-GRADE_5', 'GRADE_5', 'PKG_PACK_SPEC_3']);
  assert.match(skuQuery.sql, /status = 'ACTIVE'/);
  console.log(JSON.stringify({ result: 'PASS', exception: failure.constructor.name, message: failure.message,
    skuParameters: skuQuery.args, inventoryCalls, selectCalls: queries.length,
    productionConnections: 0, productionWrites: 0, proves: 'current source rejects observed missing combination before inventory call',
    doesNotProve: 'PostgreSQL rollback, production POST success, failed request location or operator' }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
