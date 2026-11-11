import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { SkuVarietyOrgScope1794400000000 } from '../../../database/migrations/1794400000000-SkuVarietyOrgScope';
import { EggSourceProfiles1794400001000 } from '../../../database/migrations/1794400001000-EggSourceProfiles';
import { validateCommercialStockContext, validateCompanyCommercialContext } from '../../product-master/services/commercial-context';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { savedQuantity } from '../../product-master/services/quantity-contract';
import { EggInventoryService } from './egg-inventory.service';
import { PriceRuntimeService } from './price-runtime.service';
import { StorePosService } from '../../store-pos/services/store-pos.service';

/**
 * Synthetic, opt-in PG18 proof; never reads/copies business rows from a template.
 * NODE_ENV=test COMMERCIAL_LINK_PG=1 PGHOST=127.0.0.1 PGPORT=54329 \
 * PGUSER=phoenix_v3 PGPASSWORD=... node node_modules/jest/bin/jest.js \
 *   --runInBand --runTestsByPath src/modules/sales-v2/services/commercial-link.pg.spec.ts
 * Requires the explicitly owned issue381-pg Docker container. Schema-only source:
 * packaging_history_test (full baseline + actual lifecycle/sourceMeta constraints).
 * Creates a unique empty DB, owner comment AND marker; restores DDL only, applies
 * the real SKU migration, then seeds ONLY synthetic rows. No schema sync/repairs,
 * bootstrap safeguard overrides, production URLs, HTTP/UI claims, or service mocks.
 * POS coverage is trusted private prepare/FIFO/cash/tender within a real transaction,
 * NOT the public payment endpoint, StoreScope resolver, workflows or notifications.
 */
const pgDescribe = process.env.COMMERCIAL_LINK_PG === '1' ? describe : describe.skip;
const actor: DataScopeContext = { userId: 'synthetic-commercial-pg', isGlobal: false, scopeLevel: 'COMPANY', allowedCompanyCodes: ['PG-C'], allowedWarehouseCodes: ['PG-W'], allowedProjectCodes: [], allowedFarmCodes: [], allowedSiteCodes: [] };
const origin = [{ profileCode: 'PG-ORIGINAL-PROFILE', houseCode: 'PG-ORIGINAL-HOUSE', productMode: 'VARIANT', varietyCode: 'PG-RED', effectiveDate: '2026-01-01' }];
const connection = () => ({ host: process.env.PGHOST, port: Number(process.env.PGPORT), username: process.env.PGUSER, password: process.env.PGPASSWORD });

pgDescribe('commercial sales/POS linkage — owned PostgreSQL (synthetic only)', () => {
  let admin: DataSource, ds: DataSource, runner: QueryRunner, m: EntityManager;
  let inventory: EggInventoryService, prices: PriceRuntimeService, pos: any;
  let orderId: string, deliveryId: string, accountId: number, sale: any;
  const database = `sku_commercial_link_test_${Date.now()}_${process.pid}`;
  const owner = `commercial-link.pg.spec:${randomUUID()}`;
  let created = false, ownerTableCreated = false;
  const cls = { get: (key: string) => key === 'dataScope' ? actor : { username: 'synthetic-pg', id: '1' } } as unknown as ClsService;

  beforeAll(async () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.versions.node.split('.')[0]).toBe('20');
    expect(process.env.PGHOST).toBe('127.0.0.1');
    expect(process.env.PGPORT).toBe('54329');
    expect(process.env.PGUSER).toBe('phoenix_v3');
    expect(process.env.PGPASSWORD).toBeTruthy();
    expect(database).toMatch(/^sku_commercial_link_test_\d+_\d+$/);
    // Do not accept arbitrary PGDATABASE/DATABASE_URL/template names or containers.
    const ports = execFileSync('docker', ['port', 'issue381-pg', '5432/tcp'], { encoding: 'utf8' }).trim();
    expect(ports).toBe('127.0.0.1:54329');
    admin = new DataSource({ type: 'postgres', ...connection(), database: 'postgres', entities: [], synchronize: false, migrationsRun: false, installExtensions: false });
    await admin.initialize();
    const [version] = await admin.query('SHOW server_version_num');
    expect(Number(version.server_version_num)).toBeGreaterThanOrEqual(180000);
    expect(Number(version.server_version_num)).toBeLessThan(190000);
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    await admin.query(`COMMENT ON DATABASE "${database}" IS '${owner}'`);
    ds = new DataSource({ type: 'postgres', ...connection(), database, entities: [], synchronize: false, migrationsRun: false, installExtensions: false });
    await ds.initialize();
    const dump = execFileSync('docker', ['exec', 'issue381-pg', 'pg_dump', '-U', 'phoenix_v3', '--dbname=packaging_history_test', '--schema-only', '--schema=public', '--no-owner', '--no-privileges'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    // PG18 pg_dump's psql-only restrict commands are not SQL.
    await ds.query('CREATE TABLE public.commercial_link_test_owner (owner text PRIMARY KEY)');
    await ds.query('INSERT INTO public.commercial_link_test_owner VALUES ($1)', [owner]); ownerTableCreated = true;
    await ds.query(dump.replace(/^\\(?:un)?restrict .*$/gm, '').replace(/^CREATE SCHEMA public;$/m, 'CREATE SCHEMA IF NOT EXISTS public;') + '\nSET search_path TO public;');
    const migrationRunner = ds.createQueryRunner();
    await migrationRunner.connect();
    try {
      expect(await ds.query('SELECT current_database() AS database')).toEqual([{ database }]);
      expect(await ds.query('SELECT owner FROM commercial_link_test_owner')).toEqual([{ owner }]);
      // Template's historical helper table may not have migration 95 CHECKs.
      // Only our empty owned clone is changed; the template is read-only.
      expect(await ds.query('SELECT 1 FROM md_egg_source_profiles LIMIT 1')).toHaveLength(0);
      await migrationRunner.query('DROP TABLE md_egg_source_profiles');
      await new SkuVarietyOrgScope1794400000000().up(migrationRunner);
      await new EggSourceProfiles1794400001000().up(migrationRunner);
      expect(await ds.query(`SELECT conname FROM pg_constraint WHERE conrelid='md_egg_source_profiles'::regclass
        AND conname IN ('ck_egg_source_mode','ck_egg_source_dates','ck_egg_source_status','ck_egg_source_codes')`)).toHaveLength(4);
    } finally { await migrationRunner.release(); }
    // Explicitly verify real lifecycle/FK/CHECK/sourceMeta shape survived DDL restore.
    const checks = await ds.query(`SELECT conname FROM pg_constraint WHERE conname IN
      ('ck_sal_item_batch_allocation_qty','uq_sal_batch_alloc_action_key','store_sale_allocations_batch_no_fkey')`);
    expect(checks).toHaveLength(3);
    expect(await ds.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public'
      AND table_name='inv_batches' AND column_name IN ('source_profile_snapshot','variety_code','base_quantity_version')`)).toHaveLength(3);
    console.info(`commercial-link PostgreSQL=${version.server_version_num}; database=${database}; owner=${owner}; public schema-only template; real SKU + EggSourceProfiles migration95 applied`);
  }, 120000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      try { if (ownerTableCreated) expect(await ds.query('SELECT owner FROM public.commercial_link_test_owner')).toEqual([{ owner }]); }
      finally { await ds.destroy(); }
    }
    if (created && admin?.isInitialized) {
      expect(database).toMatch(/^sku_commercial_link_test_\d+_\d+$/);
      const [marker] = await admin.query('SELECT shobj_description(oid,\'pg_database\') AS owner FROM pg_database WHERE datname=$1', [database]);
      expect(marker.owner).toBe(owner);
      await admin.query(`DROP DATABASE "${database}"`);
      console.info(`commercial-link removed owned database=${database}`);
    }
    if (admin?.isInitialized) await admin.destroy();
  }, 30000);

  beforeEach(async () => {
    runner = ds.createQueryRunner(); await runner.connect(); await runner.startTransaction(); m = runner.manager;
    await m.query(`INSERT INTO sys_organizations(org_code,org_name,org_type,company_code) VALUES
      ('PG-C','Synthetic Commercial Company','COMPANY','PG-C'),('PG-OTHER','Synthetic Other Company','COMPANY','PG-OTHER')`);
    await m.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code) VALUES ('PG-W','Synthetic Warehouse','PG-C'),('PG-OTHER-W','Synthetic Other Warehouse','PG-OTHER')`);
    await m.query(`INSERT INTO wms_locations(location_code,warehouse_code,location_name) VALUES ('PG-LOC','PG-W','Synthetic Location')`);
    await m.query(`INSERT INTO md_product_varieties(variety_code,variety_name,shell_color) VALUES ('PG-RED','Synthetic Red','RED'),('PG-PINK','Synthetic Pink','PINK')`);
    await m.query(`INSERT INTO md_egg_source_profiles(profile_code,company_code,farm_code,site_code,house_code,product_mode,variety_code,effective_date)
      VALUES ('PG-ORIGINAL-PROFILE','PG-C','PG-FARM','PG-SITE','PG-ORIGINAL-HOUSE','VARIANT','PG-RED','2026-01-01')`);
    await m.query(`INSERT INTO mst_products(product_code,product_name,unit,unit_zh,variety_code) VALUES ('PG-P','Synthetic Red Eggs','枚','枚','PG-RED'),('PG-STD-P','Synthetic Standard Eggs','枚','枚',NULL)`);
    await m.query(`INSERT INTO product_grades(grade_code,grade_name) VALUES ('PG-G','Synthetic Grade'),('PG-STD0','Synthetic Standard Zero')`);
    await m.query(`INSERT INTO packaging_specs(spec_code,spec_name,qty_per_unit,base_unit,display_unit) VALUES ('PG-T30','Synthetic Tray30',30,'枚','托'),('PG-L','Synthetic Loose',1,'枚','枚')`);
    await m.query(`INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,org_context_required) VALUES
      ('PG-TRAY','PG-P','PG-G','PG-T30','PG-RED',true),('PG-LOOSE','PG-P','PG-G','PG-L','PG-RED',true),
      ('PG-STD-TRAY','PG-STD-P','PG-STD0','PG-T30',NULL,true),('PG-STD-LOOSE','PG-STD-P','PG-STD0','PG-L',NULL,true)`);
    await m.query(`INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code,sale_enabled,stock_enabled) VALUES
      ('PG-TRAY','COMPANY','PG-C',true,true),('PG-LOOSE','COMPANY','PG-C',false,true),
      ('PG-STD-TRAY','COMPANY','PG-C',true,true),('PG-STD-LOOSE','COMPANY','PG-C',false,true)`);
    await m.query(`INSERT INTO inv_batches(batch_no,product_code,qty,qty_available,warehouse_code,location_code,company_code,sku_code,grade_code_std,spec_code,unit,base_quantity_version,variety_code,source_profile_code,source_profile_snapshot)
      VALUES ('PG-B','PG-P',120,120,'PG-W','PG-LOC','PG-C','PG-LOOSE','PG-G','PG-L','枚',1,'PG-RED','PG-ORIGINAL-PROFILE',$1),
      ('PG-STD-B','PG-STD-P',120,120,'PG-W','PG-LOC','PG-C','PG-STD-LOOSE','PG-STD0','PG-L','枚',1,NULL,NULL,NULL)`, [JSON.stringify(origin)]);
    const [book] = await m.query(`INSERT INTO sal_price_books(price_book_no,price_book_name,company_code,status,publish_version) VALUES ('PG-PB','Synthetic Prices','PG-C','ACTIVE',1) RETURNING id`);
    for (const sku of ['PG-TRAY', 'PG-STD-TRAY']) {
      const standard = sku === 'PG-STD-TRAY';
      await m.query(`INSERT INTO sal_price_items(price_book_id,product_code,grade_code,packaging_spec,sku_code,grade_code_std,spec_code,unit_price,currency_code,quantity_snapshot)
        VALUES ($1,$2,$3,'PG-T30',$4,$3,'PG-T30',9000,'LAK',$5)`, [book.id, standard ? 'PG-STD-P' : 'PG-P', standard ? 'PG-STD0' : 'PG-G', sku, JSON.stringify({ version: 1, basis: 'PACKAGE', productCode: standard ? 'PG-STD-P' : 'PG-P', gradeCode: standard ? 'PG-STD0' : 'PG-G', skuCode: sku, specCode: 'PG-T30', baseUnit: '枚', tradeUnit: '托', factor: 30, packageFactor: 30, baseQty: 30 })]);
    }
    const [order] = await m.query(`INSERT INTO sal_sales_orders(order_no,company_code,status,fulfillment_warehouse_code) VALUES ('PG-SO','PG-C','APPROVED','PG-W') RETURNING id`); orderId = order.id;
    const [delivery] = await m.query(`INSERT INTO sal_delivery_orders(delivery_no,company_code,fulfillment_warehouse_code) VALUES ('PG-DO','PG-C','PG-W') RETURNING id`); deliveryId = delivery.id;
    const [store] = await m.query(`INSERT INTO store_master(store_code,store_name,company_code) VALUES ('PG-STORE','Synthetic Store','PG-C') RETURNING id`);
    await m.query(`INSERT INTO store_warehouse_bindings(store_id,warehouse_code,purpose) VALUES ($1,'PG-W','SALES')`, [store.id]);
    const [account] = await m.query(`INSERT INTO fin_cash_accounts(account_code,account_name,company_code,currency_code,account_type) VALUES ('PG-CASH','Synthetic Cash','PG-C','LAK','CASH') RETURNING id`); accountId = Number(account.id);
    inventory = new EggInventoryService(ds, cls); prices = new PriceRuntimeService(ds, cls);
    pos = Object.create(StorePosService.prototype); Object.assign(pos, { ds, cls, priceRuntime: prices });
  });
  afterEach(async () => { if (runner) { if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); } });

  const context = (manager = m) => validateCommercialStockContext(manager, { companyCode: 'PG-C', warehouseCodes: ['PG-W'], actor });
  const quote = (manager = m, skuCode = 'PG-TRAY', patch = {}) => prices.resolvePrice({ companyCode: 'PG-C', productCode: 'PG-P', skuCode, qty: 2, quantityBasis: 'PACKAGE', currencyCode: 'LAK', ...patch }, manager);
  const salesPrice = (q: any) => ({ version: 1, companyCode: 'PG-C', skuCode: q.skuCode, currencyCode: q.currencyCode, priceBookId: q.priceBookId, priceItemId: q.priceItemId, publishVersion: q.publishVersion, resolvedUnitPrice: q.unitPrice, actualUnitPrice: q.unitPrice, priceQuantitySnapshot: q.priceQuantitySnapshot });
  async function orderLine(q: any) {
    await m.query(`INSERT INTO sal_order_items(sales_order_id,product_code,grade_code,packaging_spec,sku_code,qty,unit_price,amount,quantity_snapshot,price_snapshot)
      VALUES ($1,$2,$3,'PG-T30',$4,2,9000,18000,$5,$6)`, [orderId, q.quantitySnapshot.productCode, q.quantitySnapshot.gradeCode, q.skuCode, JSON.stringify(q.quantitySnapshot), JSON.stringify(salesPrice(q))]);
  }
  async function state() {
    return { stock: await m.query('SELECT batch_no,qty::text,qty_available::text,variety_code,source_profile_code,source_profile_snapshot FROM inv_batches ORDER BY batch_no'),
      allocations: await m.query('SELECT * FROM sal_order_item_batch_allocations ORDER BY id'), actions: await m.query('SELECT * FROM sal_order_item_batch_allocation_actions ORDER BY id'),
      ledger: await m.query('SELECT * FROM inv_ledger ORDER BY id'), pos: await m.query('SELECT * FROM store_sale_allocations ORDER BY id'),
      money: await m.query('SELECT * FROM fin_cash_transactions ORDER BY id'), balance: await m.query('SELECT current_balance::text FROM fin_cash_accounts ORDER BY id'), tenders: await m.query('SELECT * FROM sal_store_sale_tenders ORDER BY id'),
      items: await m.query('SELECT * FROM sal_order_items ORDER BY id'), sales: await m.query('SELECT * FROM sal_store_sales ORDER BY id'), posItems: await m.query('SELECT * FROM sal_store_sale_items ORDER BY id') };
  }
  async function rejectsWithoutMutation(run: () => Promise<unknown>, pattern?: RegExp) {
    const before = await state();
    await runner.startTransaction(); // actual PG SAVEPOINT; exception must roll back SQL writes too
    let error: any;
    try { await run(); } catch (e) { error = e; } finally { await runner.rollbackTransaction(); }
    expect(error).toBeDefined();
    if (pattern) expect(String(error.message)).toMatch(pattern);
    expect(await state()).toEqual(before);
    return error;
  }
  async function posSale() {
    const q = await quote();
    const [s] = await m.query(`INSERT INTO sal_store_sales(sale_no,store_code,store_name,company_code,currency_code,total_amount,subtotal) VALUES ('PG-POS','PG-STORE','Synthetic Store','PG-C','LAK',18000,18000) RETURNING *`);
    const items = await m.query(`INSERT INTO sal_store_sale_items(sale_id,product_code,product_name,grade_code,packaging_spec,sku_code,qty,unit_price,amount,quantity_snapshot,price_snapshot,price_book_id,price_item_id,price_publish_version)
      VALUES ($1,'PG-P','Synthetic Red Eggs','PG-G','PG-T30','PG-TRAY',2,9000,18000,$2,$3,$4,$5,1) RETURNING *`, [s.id, JSON.stringify(q.quantitySnapshot), JSON.stringify(q), q.priceBookId, q.priceItemId]);
    sale = { ...s, items, warehouseCodes: ['PG-W'] };
    await pos.prepareCommercialPayment(m, sale, { companyCode: 'PG-C', storeCode: 'PG-STORE', warehouseCodes: ['PG-W'] });
    return sale;
  }

  it('locks company, warehouse, SKU parents and exact published company price until transaction ends', async () => {
    // Commit synthetic setup only for the second connection to see these rows.
    await runner.commitTransaction(); await runner.startTransaction();
    const other = ds.createQueryRunner(); await other.connect();
    try {
      const ctx = await context(); const q = await quote();
      expect(ctx.warehouseCodes).toEqual(['PG-W']); expect(q.unitPrice).toBe(9000);
      for (const sql of ["UPDATE sys_organizations SET status='INACTIVE' WHERE org_code='PG-C'", "UPDATE wms_warehouses SET status='INACTIVE' WHERE warehouse_code='PG-W'", "UPDATE product_skus SET status='INACTIVE' WHERE sku_code='PG-TRAY'", "UPDATE mst_products SET unit='kg' WHERE product_code='PG-P'", "UPDATE packaging_specs SET qty_per_unit=40 WHERE spec_code='PG-T30'", "UPDATE sal_price_books SET publish_version=2 WHERE price_book_no='PG-PB'", "UPDATE sal_price_items SET unit_price=1 WHERE sku_code='PG-TRAY'"]) {
        await other.startTransaction(); await other.query("SET LOCAL lock_timeout='100ms'");
        await expect(other.query(sql)).rejects.toMatchObject({ driverError: { code: '55P03' } });
        await other.rollbackTransaction();
      }
    } finally {
      if (other.isTransactionActive) await other.rollbackTransaction(); await other.release();
      await runner.rollbackTransaction();
      expect(await ds.query('SELECT current_database() AS database')).toEqual([{ database }]);
      expect(await ds.query('SELECT owner FROM commercial_link_test_owner')).toEqual([{ owner }]);
      await ds.query(`TRUNCATE sys_organizations,wms_warehouses,wms_locations,md_product_varieties,mst_products,
        product_grades,packaging_specs,product_skus,md_sku_org_scope,inv_batches,sal_price_books,sal_price_items,
        sal_sales_orders,sal_delivery_orders,store_master,store_warehouse_bindings,fin_cash_accounts,md_egg_source_profiles CASCADE`);
    }
  });

  it('quotes 2 PACKAGE=60枚/18000 LAK, reserves then confirms exactly 60 physical LOOSE preserving original source', async () => {
    const ctx = await context(), q = await quote();
    expect(q.quantitySnapshot).toMatchObject({ baseQty: 60, factor: 30, tradeUnit: '托', baseUnit: '枚' });
    expect(q.unitPrice * 2).toBe(18000); expect(q.publishVersion).toBe(1);
    await orderLine(q);
    expect(await inventory.reserveInventory(orderId,'PG-SO','PG-C',m,'PG-W',ctx)).toBe(true);
    expect(await inventory.reserveInventory(orderId,'PG-SO','PG-C',m,'PG-W',ctx)).toBe(false);
    expect((await m.query("SELECT qty::float8,qty_available::float8 FROM inv_batches WHERE batch_no='PG-B'"))[0]).toEqual({ qty: 120, qty_available: 60 });
    expect(await inventory.confirmOutbound(orderId,'PG-SO','PG-C','PG-DO',deliveryId,60,m,ctx)).toBe(60);
    const [b] = await m.query("SELECT * FROM inv_batches WHERE batch_no='PG-B'");
    expect(Number(b.qty)).toBe(60); expect(Number(b.qty_available)).toBe(60);
    expect(b.sku_code).toBe('PG-LOOSE'); expect(b.variety_code).toBe('PG-RED'); expect(b.source_profile_snapshot).toEqual(origin); expect(b.source_profile_code).toBe('PG-ORIGINAL-PROFILE');
    expect(await m.query('SELECT change_type,qty_change::float8,sku_code FROM inv_ledger ORDER BY id')).toEqual([{ change_type: 'RESERVED', qty_change: -60, sku_code: 'PG-LOOSE' }, { change_type: 'FIFO_OUT', qty_change: -60, sku_code: 'PG-LOOSE' }]);
    expect(await m.query("SELECT 1 FROM sal_price_items WHERE sku_code='PG-LOOSE'")).toHaveLength(0);
    expect(await m.query('SELECT 1 FROM sal_order_item_batch_allocation_actions')).toHaveLength(1);
  });

  it.each(['opposite-company','cross-pink','unpriced','missing-unit','sale-scope-false','actor-warehouse-denied','physical-stock-denied'])('rejects %s with actual transaction rollback and no stock/money mutations', async kind => {
    await rejectsWithoutMutation(async () => {
      if (kind === 'actor-warehouse-denied') return validateCommercialStockContext(m, { companyCode: 'PG-C', warehouseCodes: ['PG-W'], actor: { ...actor, allowedWarehouseCodes: [] } });
      if (kind === 'opposite-company') return quote(m, 'PG-TRAY', { companyCode: 'PG-OTHER' });
      if (kind === 'unpriced') await m.query("UPDATE sal_price_items SET status='INACTIVE'");
      if (kind === 'sale-scope-false') await m.query("UPDATE md_sku_org_scope SET sale_enabled=false WHERE sku_code='PG-TRAY'");
      const ctx = await context();
      const q = await quote(m, 'PG-TRAY', kind === 'missing-unit' ? { quantityBasis: undefined } : {});
      if (kind === 'cross-pink') await m.query("UPDATE inv_batches SET variety_code='PG-PINK' WHERE batch_no='PG-B'");
      if (kind === 'physical-stock-denied') await m.query("UPDATE md_sku_org_scope SET stock_enabled=false WHERE sku_code='PG-LOOSE'");
      return inventory.allocateByFIFO({ companyCode: 'PG-C', productCode: 'PG-P', skuCode: 'PG-TRAY', qty: 60, refNo: 'PG-SO', note: 'Synthetic only', fulfillmentWarehouseCode: 'PG-W', quantitySnapshot: q.quantitySnapshot, priceSnapshot: salesPrice(q) }, m, ctx);
    });
  });

  it('authorized opposite company cannot borrow this company published price, and unpublished/currency-mismatched prices fail closed', async () => {
    await rejectsWithoutMutation(async () => {
      await m.query("INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code) VALUES ('PG-TRAY','COMPANY','PG-OTHER')");
      const ctx = await validateCompanyCommercialContext(m, { companyCode: 'PG-OTHER', actor: { ...actor, allowedCompanyCodes: ['PG-OTHER'] } });
      return prices.resolvePrice({ companyCode: 'PG-OTHER', productCode: 'PG-P', skuCode: 'PG-TRAY', qty: 2, quantityBasis: 'PACKAGE', currencyCode: 'LAK' }, m, ctx);
    }, /无精确/);
    await rejectsWithoutMutation(async () => { await m.query('UPDATE sal_price_books SET publish_version=0'); return quote(); }, /无精确/);
    await rejectsWithoutMutation(() => quote(m, 'PG-TRAY', { currencyCode: 'CNY' }), /无精确/);
  });

  it('forged/wrong-manager contexts and SKU-less legacy calls cannot consume managed stock', async () => {
    const q = await quote(), ctx = await context();
    const params = { companyCode: 'PG-C', productCode: 'PG-P', skuCode: 'PG-TRAY', qty: 60, refNo: 'PG-SO', note: 'Synthetic', fulfillmentWarehouseCode: 'PG-W', quantitySnapshot: q.quantitySnapshot, priceSnapshot: salesPrice(q) };
    await rejectsWithoutMutation(() => inventory.allocateByFIFO(params, m, { ...ctx }), /伪造/);
    const other = ds.createQueryRunner(); await other.connect(); await other.startTransaction();
    try { await expect(inventory.allocateByFIFO(params, other.manager, ctx)).rejects.toThrow(/事务|伪造/); }
    finally { await other.rollbackTransaction(); await other.release(); }
    await rejectsWithoutMutation(() => inventory.allocateByFIFO({ productCode: 'PG-P', companyCode: 'PG-C', qty: 60, refNo: 'PG-SO', note: 'Synthetic', fulfillmentWarehouseCode: 'PG-W' }, m), /不足/);
  });

  it('legacy entry without trusted context cannot allocate managed TRAY or consume saved managed LOOSE allocations', async () => {
    const q = await quote(); await orderLine(q);
    await rejectsWithoutMutation(() => inventory.reserveInventory(orderId,'PG-SO','PG-C',m,'PG-W'), /公司上下文/);
    const ctx = await context(); await inventory.reserveInventory(orderId,'PG-SO','PG-C',m,'PG-W',ctx);
    await rejectsWithoutMutation(() => inventory.confirmOutbound(orderId,'PG-SO','PG-C','PG-DO',deliveryId,60,m), /旧销售出库/);
  });

  it('new STD0 (NULL variety, org_context_required=true) consumes stock-only STD LOOSE only with COMPANY authorization', async () => {
    const q = await quote(m, 'PG-STD-TRAY'), ctx = await context(); await orderLine(q);
    await rejectsWithoutMutation(() => inventory.reserveInventory(orderId,'PG-SO','PG-C',m,'PG-W'), /公司上下文/);
    await inventory.reserveInventory(orderId,'PG-SO','PG-C',m,'PG-W',ctx);
    expect(await inventory.confirmOutbound(orderId,'PG-SO','PG-C','PG-DO',deliveryId,60,m,ctx)).toBe(60);
    expect(Number((await m.query("SELECT qty FROM inv_batches WHERE batch_no='PG-STD-B'"))[0].qty)).toBe(60);
    await rejectsWithoutMutation(async () => { await m.query("UPDATE md_sku_org_scope SET sale_enabled=false WHERE sku_code='PG-STD-TRAY'"); return quote(m, 'PG-STD-TRAY'); });
  });

  it('saved Sales quantity and price snapshots survive today price/factor changes without historical reclassification', async () => {
    const ctx = await context(), q = await quote(); await orderLine(q);
    await inventory.reserveInventory(orderId,'PG-SO','PG-C',m,'PG-W',ctx);
    await m.query("UPDATE packaging_specs SET qty_per_unit=40 WHERE spec_code='PG-T30'");
    await m.query("UPDATE sal_price_items SET unit_price=99000");
    await m.query("UPDATE sal_price_books SET publish_version=2");
    const [line] = await m.query('SELECT * FROM sal_order_items WHERE sales_order_id=$1', [orderId]);
    expect(savedQuantity(line)).toBe(60); expect(line.price_snapshot.actualUnitPrice).toBe(9000); expect(line.price_snapshot.publishVersion).toBe(1);
    expect(await inventory.confirmOutbound(orderId,'PG-SO','PG-C','PG-DO',deliveryId,60,m,ctx)).toBe(60);
    expect(Number((await m.query("SELECT qty FROM inv_batches WHERE batch_no='PG-B'"))[0].qty)).toBe(60);
  });

  it('POS actual prepare/FIFO/cash/tender uses commercial TRAY price and physical LOOSE, all in one SQL transaction', async () => {
    await posSale();
    expect(await pos.fifoDeductItems(sale,m)).toEqual([{ itemId: sale.items[0].id, batchNo: 'PG-B', warehouseCode: 'PG-W', qty: 60 }]);
    await pos.writeCashTransaction(m, { accountId, companyCode: 'PG-C', currencyCode: 'LAK', amount: 18000, sourceType: 'STORE_SALE', sourceId: sale.id, sourceNo: sale.sale_no, remark: 'Synthetic only' });
    await pos.writeTender(m, { saleId: Number(sale.id), type: 'CASH', currency: 'LAK', amount: 18000, cashAccountId: accountId });
    const after = await state(); expect(Number(after.balance[0].current_balance)).toBe(18000);
    expect(after.money).toHaveLength(1); expect(after.tenders).toHaveLength(1); expect(after.pos).toHaveLength(1);
    expect(Number(after.stock.find((b: any) => b.batch_no === 'PG-B').qty)).toBe(60);
    expect(after.stock.find((b: any) => b.batch_no === 'PG-B').source_profile_snapshot).toEqual(origin);
    expect(await m.query("SELECT 1 FROM sal_price_items WHERE sku_code='PG-LOOSE'")).toHaveLength(0);
  });

  it.each(['cross-pink','physical-pack-mismatch','physical-stock-denied','sale-scope-false'])('POS rejects %s physical commercial linkage before consumption', async kind => {
    await posSale();
    await rejectsWithoutMutation(async () => {
      if (kind === 'cross-pink') await m.query("UPDATE inv_batches SET variety_code='PG-PINK' WHERE batch_no='PG-B'");
      if (kind === 'physical-pack-mismatch') await m.query("UPDATE inv_batches SET spec_code='PG-T30' WHERE batch_no='PG-B'");
      if (kind === 'physical-stock-denied') await m.query("UPDATE md_sku_org_scope SET stock_enabled=false WHERE sku_code='PG-LOOSE'");
      if (kind === 'sale-scope-false') await m.query("UPDATE md_sku_org_scope SET sale_enabled=false WHERE sku_code='PG-TRAY'");
      await pos.prepareCommercialPayment(m, sale, { companyCode: 'PG-C', storeCode: 'PG-STORE', warehouseCodes: ['PG-W'] });
      return pos.fifoDeductItems(sale,m);
    });
  });

  it.each(['cash-currency','late-constraint'])('POS %s failure rolls back actual stock, allocations, ledger, money and tender SQL', async kind => {
    await posSale();
    await rejectsWithoutMutation(async () => {
      await pos.fifoDeductItems(sale,m);
      await pos.writeCashTransaction(m, { accountId, companyCode: 'PG-C', currencyCode: kind === 'cash-currency' ? 'CNY' : 'LAK', amount: 18000, sourceType: 'STORE_SALE', sourceId: sale.id, sourceNo: sale.sale_no, remark: 'Synthetic only' });
      await pos.writeTender(m, { saleId: Number(sale.id), type: 'CASH', currency: 'LAK', amount: 18000, cashAccountId: accountId });
      // Actual FK violation AFTER stock, cash balance, cash transaction and tender.
      await m.query("INSERT INTO store_sale_allocations(sale_id,sale_item_id,batch_no,warehouse_code,allocated_qty) VALUES ($1,$2,'NO-SUCH-BATCH','PG-W',1)", [sale.id, sale.items[0].id]);
    }, kind === 'cash-currency' ? /币种/ : /foreign key/);
  });
});
