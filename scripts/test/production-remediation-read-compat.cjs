// Called by production-remediation-release-compat.py in its new loopback PG fixture.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');

async function check() {
  assert.equal(process.env.DB_HOST, '127.0.0.1');
  assert.ok(['release_upgrade', 'release_cold'].includes(process.env.DB_NAME));
  assert.match(process.env.FIXTURE_CONTAINER, /^[0-9a-f]{64}$/);
  const local = createRequire(path.join(process.argv[2], 'package.json'));
  const { AppDataSource: db } = local('./dist/database/data-source.js');
  const registry = local('./dist/common/guards/menu-registry.service.js');
  const { ProductionInboundDocumentsService } = local('./dist/modules/sales-v2/services/production-inbound-documents.service.js');
  db.setOptions({installExtensions:false});
  await db.initialize();
  try {
    const [identity] = await db.query(`SELECT current_user AS role, r.rolsuper AS privileged,
      pg_has_role(current_user, c.relowner, 'USAGE') AS owner
      FROM pg_roles r, pg_class c WHERE r.rolname=current_user AND c.oid='inv_batches'::regclass`);
    assert.deepEqual(identity, {role:'release_api', privileged:false, owner:false});
    await registry.hydrateMenuRegistry(db.manager);
    assert.equal(registry.getMenuRegistryStats().source, 'sys_menu');
    assert.ok(registry.isMenuRegistered('MENU_PROD_INBOUND'));
    const scope = { isGlobal: false, allowedCompanyCodes: ['FIXTURE-C'], allowedWarehouseCodes: ['FIXTURE-W'] };
    const service = new ProductionInboundDocumentsService(db, { get: key => key === 'dataScope' ? scope : undefined });
    assert.deepEqual(await service.list('FIXTURE-C', 'FIXTURE-H', '2026-11-01'), []);
    assert.deepEqual(await service.recover('FIXTURE-C', undefined, 'ASSURANCE-GRADE_4'), []);
    const triggers = await db.query(`SELECT tgname FROM pg_trigger WHERE
      (tgrelid,tgname) IN (('inv_batches'::regclass,'trg_official_inventory_batch'),
        ('inv_ledger'::regclass,'trg_official_inventory_ledger')) AND tgenabled IN ('O','A') ORDER BY tgname`);
    assert.equal(triggers.length, 2);
    const gradeTotals = await db.query(`SELECT grade_code_std AS grade, sum(qty)::int AS qty
      FROM inv_batches WHERE batch_no IN ('ASSURANCE-GRADE_4','ASSURANCE-GRADE_5')
      GROUP BY grade_code_std ORDER BY grade_code_std`);
    assert.deepEqual(gradeTotals, [{grade:'GRADE_4',qty:30},{grade:'GRADE_5',qty:30}]);
    const [stock] = await db.query(`SELECT
      (SELECT count(*)::int FROM production_cutover_scopes WHERE state<>'DRAFT') AS scopes,
      (SELECT count(*)::int FROM production_inbound_allocations) AS allocations,
      (SELECT count(*)::int FROM production_batch_qualifications) AS qualifications,
      (SELECT sum(qty_change)::int FROM inv_ledger WHERE batch_no IN ('ASSURANCE-GRADE_4','ASSURANCE-GRADE_5')) AS ledger`);
    assert.deepEqual(stock, {scopes:0, allocations:0, qualifications:0, ledger:60});
    // Hash every pre-existing row column to detect mutations hidden by equal totals.
    const [history] = await db.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(b) ORDER BY batch_no)::text FROM inv_batches b WHERE batch_no IN ('ASSURANCE-GRADE_4','ASSURANCE-GRADE_5')) AS batches,
      (SELECT jsonb_agg(to_jsonb(l) ORDER BY batch_no,id)::text FROM inv_ledger l WHERE batch_no IN ('ASSURANCE-GRADE_4','ASSURANCE-GRADE_5')) AS movements`);
    console.log(JSON.stringify({gradeTotals, stock, historySha256:createHash('sha256').update(JSON.stringify(history)).digest('hex')}));
  } finally {
    await db.destroy();
  }
}

check().catch(error => { console.error(error.message); process.exitCode = 1; });
