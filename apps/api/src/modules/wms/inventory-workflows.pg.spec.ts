import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { InventoryStocktakeSubmissions1795658500000 } from '../../database/migrations/1795658500000-InventoryStocktakeSubmissions';
import { InventorySourceModeService } from '../sales-v2/services/inventory-source-mode.service';
import { DeliveryOrdersService } from '../sales-v2/services/delivery-orders.service';
import { EggInventoryService } from '../sales-v2/services/egg-inventory.service';
import { SalesOrderLifecycleService } from '../sales-v2/services/sales-order-lifecycle.service';
import { SalesOrdersService } from '../sales-v2/services/sales-orders.service';
import { readPosAllocationTrace } from '../traceability/pos-allocation-trace';
import { readOutboundTrace } from '../traceability/inventory-lineage';
import { WmsService } from './wms.service';
import { WarehouseDailyCloseService } from './warehouse-daily-close.service';

const connection = process.env.INVENTORY_WORKFLOWS_PG_URL;
const pg = connection ? describe : describe.skip;

pg('inventory workflows against the complete migration chain', () => {
  let db: DataSource;
  const warehouse = 'INVENTORY-FIXTURE-A';
  const company = 'INVENTORY-FIXTURE-C';
  const scope = { isGlobal: false, allowedCompanyCodes: [company], allowedWarehouseCodes: [warehouse] };
  const cls = { get: () => scope } as any;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/inventory_validation') {
      throw new Error('A dedicated loopback inventory_validation database is required');
    }
    db = await new DataSource({ type: 'postgres', url: connection, synchronize: false, entities: [] }).initialize();
    await db.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,type,domain)
      VALUES ($1,'Inventory validation',$2,'GENERAL','OPERATIONAL')`, [warehouse, company]);
  });

  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

  it('widens legacy integer receipt columns while retaining all existing receipt data', async () => {
    const runner = db.createQueryRunner();
    await runner.startTransaction();
    try {
      const migration = new InventoryStocktakeSubmissions1795658500000();
      await migration.down(runner);
      await runner.query(`CREATE TABLE IF NOT EXISTS wms_inbound_items(
        qty integer,expected_qty integer,actual_qty integer,broken_qty integer)`);
      await runner.query('INSERT INTO wms_inbound_items(qty,expected_qty,actual_qty,broken_qty) VALUES(12,12,11,1)');
      await migration.up(runner);
      expect(await runner.query('SELECT qty::float,actual_qty::float,broken_qty::float FROM wms_inbound_items'))
        .toEqual([{ qty: 12, actual_qty: 11, broken_qty: 1 }]);
      await runner.query('UPDATE wms_inbound_items SET actual_qty=11.125,broken_qty=0.875');
      expect(await runner.query('SELECT actual_qty::float,broken_qty::float FROM wms_inbound_items'))
        .toEqual([{ actual_qty: 11.125, broken_qty: 0.875 }]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('rejects a stale source-mode assessment and replays the audited switch after transport failure', async () => {
    const source = new InventorySourceModeService(db, { get: (name: string) => name === 'dataScope'
      ? { ...scope, isGlobal: true } : { username: 'source-fixture' } } as any);
    const companyCode = 'INVENTORY-SOURCE-FIXTURE';
    const newMode = 'PACKAGING_INBOUND' as const;
    const preview = await source.assessSwitchRisk('COMPANY',companyCode,newMode);
    const stale = { scopeLevel: 'COMPANY' as const, scopeCode: companyCode, newMode, confirmRisk: true,
      requestKey: randomUUID(), riskDigest: '1'.repeat(64) };
    await expect(source.switchMode(stale)).rejects.toThrow('已变化');
    const payload = { ...stale, riskDigest: preview.riskDigest };
    const [first, replay] = await Promise.all([source.switchMode(payload),source.switchMode(payload)]);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ auditId: expect.any(String),newMode,scopeCode: companyCode });
    const [{ count }] = await db.query('SELECT count(*)::int FROM inv_source_mode_audit WHERE scope_code=$1',[companyCode]);
    expect(count).toBe(1);
  });

  it('rejects a duplicate or zeroed receipt line, then posts a two-line receipt once across both entry points', async () => {
    const service = new WmsService(db.manager, cls);
    const user = { userId: 100, username: 'fixture' };
    const task = 'INVENTORY-FIXTURE-RECEIVE';
    const material = 'INVENTORY-FIXTURE-MATERIAL';
    await db.query(`INSERT INTO mst_materials(material_code,material_name,material_type,unit,status)
      VALUES($1,'Fixture material','PACKAGING','kg','ACTIVE')`, [material]);
    await db.query(`INSERT INTO wms_inbound(task_no,warehouse_code,type,status)
      VALUES($1,$2,'RETURN','PENDING')`, [task, warehouse]);
    const lines = await db.query(`INSERT INTO wms_inbound_items(task_no,batch_no,item_type,material_code,unit,qty)
      VALUES($1,'INVENTORY-RECEIVE-A','MATERIAL',$2,'kg',10),($1,'INVENTORY-RECEIVE-B','MATERIAL',$2,'kg',10)
      RETURNING id`, [task, material]);
    const inputs = lines.map((line: { id: string }) => ({ id: String(line.id), actual_qty: 10, broken_qty: 0 }));
    await expect(service.confirmInbound({ task_no: task, items: [inputs[0], inputs[0]] }, user, undefined, true))
      .rejects.toThrow('不存在或重复');
    await expect(service.confirmInbound({ task_no: task, items: [inputs[0], { ...inputs[1], actual_qty: 0 }] }, user, undefined, true))
      .rejects.toThrow('合计必须等于');
    const payload = { task_no: task, items: inputs };
    const [single, batch] = await Promise.all([
      service.confirmInbound(payload, user, undefined, true),
      service.confirmBatchInbound({ documents: [payload] }, user),
    ]);
    expect(batch.data).toEqual([single]);
    expect(single.data?.items).toHaveLength(2);
    const [facts] = await db.query(`SELECT count(*)::int AS movements,sum(qty_change)::float AS received
      FROM inv_ledger WHERE ref_no=$1`, [task]);
    expect(facts).toEqual({ movements: 2, received: 20 });
  });

  it('verifies each order line, ships a split batch atomically and replays the original allocation receipts', async () => {
    const actor = { get: (key: string) => key === 'dataScope' ? scope : { userId: 100, username: 'fixture' } } as any;
    const service = new DeliveryOrdersService(db, actor, new EggInventoryService(db, actor), new SalesOrderLifecycleService(db));
    const orderNo = 'INVENTORY-FIXTURE-SALE';
    const deliveryNo = 'INVENTORY-FIXTURE-DELIVERY';
    const [{ id: order }] = await db.query(`INSERT INTO sal_sales_orders(order_no,company_code,status,fulfillment_warehouse_code)
      VALUES($1,$2,'ALLOCATED',$3) RETURNING id`, [orderNo, company, warehouse]);
    const [{ id: delivery }] = await db.query(`INSERT INTO sal_delivery_orders(delivery_no,company_code,status,fulfillment_warehouse_code)
      VALUES($1,$2,'LOADING',$3) RETURNING id`, [deliveryNo, company, warehouse]);
    await db.query(`INSERT INTO sal_delivery_order_items(delivery_order_id,sales_order_id,sales_order_no,planned_qty,status)
      VALUES($1,$2,$3,20,'LOADED')`, [delivery, order, orderNo]);
    const lines = await db.query(`INSERT INTO sal_order_items(sales_order_id,product_code,qty,unit_price,amount)
      VALUES($1,'FIXTURE-PRODUCT',10,1,10),($1,'FIXTURE-PRODUCT',10,1,10) RETURNING id`, [order]);
    for (const [index, qty] of [6, 4, 10].entries()) {
      const batch = 'INVENTORY-PICK-' + index;
      await db.query(`INSERT INTO inv_batches(batch_no,product_code,qty,qty_available,warehouse_code,company_code,unit,status)
        VALUES($1,'FIXTURE-PRODUCT',$2,0,$3,$4,'kg','AVAILABLE')`, [batch, qty, warehouse, company]);
      const [{ id: ledger }] = await db.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,ref_no,unit,change_type,qty_change)
        VALUES($1,$2,$3,$4,'kg','RESERVED',-$5::numeric) RETURNING id`, [batch, company, warehouse, orderNo, qty]);
      await db.query(`INSERT INTO sal_order_item_batch_allocations(sales_order_item_id,batch_no,reserved_qty,reservation_ledger_id,created_by)
        VALUES($1,$2,$3,$4,'fixture')`, [lines[index < 2 ? 0 : 1].id, batch, qty, ledger]);
    }
    const plan = await service.warehouseLoadingTasks(deliveryNo);
    expect(plan.items).toHaveLength(3);
    const id = String(delivery);
    await expect(service.finishWarehouseLoading(id, { items: [{ ...plan.items[0], qty: 20 }] }))
      .rejects.toThrow('与装车任务不一致');
    const proof = { items: plan.items };
    const receipts = await Promise.all([service.finishWarehouseLoading(id, proof), service.finishWarehouseLoading(id, proof)]);
    expect(receipts[0]).toEqual(receipts[1]);
    expect(receipts[0].items.map((row: { qty: string; unit: string }) => [+row.qty, row.unit]))
      .toEqual([[6,'kg'],[4,'kg'],[10,'kg']]);
    const [facts] = await db.query(`SELECT count(*)::int AS movements,sum(qty_change)::float AS shipped
      FROM inv_ledger WHERE ref_no=$1 AND change_type='FIFO_OUT'`, [deliveryNo]);
    expect(facts).toEqual({ movements: 3, shipped: -20 });
    const shipments = await readOutboundTrace(db, scope as any, { orderNo });
    expect(shipments.map((row: { allocated_qty: string }) => +row.allocated_qty)).toEqual([6,4,10]);
    const sales = new SalesOrdersService(
      db, actor, null!, null!, null!, null!, null!, new EggInventoryService(db, actor),
      new SalesOrderLifecycleService(db), null!,
    );
    await expect(sales.cancel(String(order), { remark: 'unexpected reversal' })).rejects.toThrow('已有出库过账');
    const [{ id: oldOrder }] = await db.query(`INSERT INTO sal_sales_orders(order_no,company_code,status,fulfillment_warehouse_code)
      VALUES('INVENTORY-FIXTURE-HISTORIC',$1,'LOADED',$2) RETURNING id`, [company, warehouse]);
    const [{ id: oldLine }] = await db.query(`INSERT INTO sal_order_items(sales_order_id,product_code,qty,unit_price,amount)
      VALUES($1,'FIXTURE-PRODUCT',1,1,1) RETURNING id`, [oldOrder]);
    const [{ id: oldLedger }] = await db.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,ref_no,unit,change_type,qty_change)
      VALUES('INVENTORY-PICK-0',$1,$2,'INVENTORY-FIXTURE-HISTORIC','kg','RESERVED',-1) RETURNING id`, [company, warehouse]);
    await db.query(`INSERT INTO sal_order_item_batch_allocations(sales_order_item_id,batch_no,reserved_qty,outbound_qty,reservation_ledger_id,created_by)
      VALUES($1,'INVENTORY-PICK-0',1,1,$2,'historical-fixture')`, [oldLine, oldLedger]);
    await expect(sales.cancel(String(oldOrder), { remark: 'historical backfill without actions' })).rejects.toThrow('已有出库过账');
  });

  it('returns only the POS quantity allocated to each visible batch, with stable receipt pagination', async () => {
    const otherWarehouse = 'INVENTORY-POS-OUTSIDE';
    const batchA = 'INVENTORY-POS-A';
    const batchB = 'INVENTORY-POS-B';
    const sale = 'INVENTORY-POS-01';
    await db.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,type,domain)
      VALUES ($1,'POS fixture outside',$2,'GENERAL','OPERATIONAL')`, [otherWarehouse, company]);
    await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES($1,3,3,$3,$5,'kg','AVAILABLE'),($2,7,7,$4,$5,'kg','AVAILABLE')`,
      [batchA, batchB, warehouse, otherWarehouse, company]);
    const [{ id: saleId }] = await db.query(`INSERT INTO sal_store_sales(sale_no,store_code,store_name,company_code,status)
      VALUES($1,'FIXTURE-POS','Fixture POS',$2,'COMPLETED') RETURNING id`, [sale, company]);
    const [{ id: line }] = await db.query(`INSERT INTO sal_store_sale_items(sale_id,product_code,product_name,qty,unit_price,amount)
      VALUES($1,'FIXTURE-PRODUCT','Fixture food',10,1,10) RETURNING id`, [saleId]);
    await db.query(`INSERT INTO store_sale_allocations(sale_id,sale_item_id,batch_no,warehouse_code,allocated_qty,returned_qty)
      VALUES($1,$2,$3,$5,3,0.125),($1,$2,$4,$6,7,0)`, [saleId, line, batchA, batchB, warehouse, otherWarehouse]);
    const scoped = await readPosAllocationTrace(db, 'sale', sale, scope as any);
    expect(scoped.total).toBe(1);
    expect(scoped.rows[0]).toMatchObject({ batch_no: batchA, qty: '3.000', returned_qty: '0.125', outstanding_qty: '2.875' });
    const groupScope = { ...scope, isGlobal: true } as any;
    const first = await readPosAllocationTrace(db, 'sale', sale, groupScope, { limit: '1' });
    const second = await readPosAllocationTrace(db, 'sale', sale, groupScope, { limit: '1', after: first.nextCursor! });
    expect(first.total).toBe(2);
    expect(second.rows[0]).toMatchObject({ batch_no: batchB, qty: '7.000' });
    expect(second.nextCursor).toBeNull();
  });

  it('applies one atomic transfer under retry and rejects reuse with a different quantity', async () => {
    const target = 'INVENTORY-TRANSFER-RECV';
    const batch = 'INVENTORY-TRANSFER-BATCH';
    const transfer = 'INVENTORY-ATOMIC-TRANSFER';
    await db.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,type,domain)
      VALUES ($1,'Transfer receiver',$2,'GENERAL','OPERATIONAL')`, [target, company]);
    await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES($1,1,1,$2,$3,'kg','AVAILABLE')`, [batch, warehouse, company]);
    const service = new WmsService(db.manager, { get: () => ({ ...scope, allowedWarehouseCodes: [warehouse, target] }) } as any);
    const user = { username: 'fixture' };
    const input = { transfer_no: transfer, from_warehouse: warehouse, to_warehouse: target, items: [{ batch_no: batch, qty: '0.125' }] };
    const [result, retry] = await Promise.all([service.confirmTransfer(input, user), service.confirmTransfer(input, user)]);
    expect(retry).toEqual(result);
    expect(result).toMatchObject({ transfer_no: transfer, qty: 0.125, unit: 'kg' });
    await expect(service.confirmTransfer({ ...input, items: [{ batch_no: batch, qty: '0.5' }] }, user))
      .rejects.toThrow('已用于不同');
    const rows = await db.query(`SELECT warehouse_code,qty_change::float AS qty,cost_change
      FROM inv_ledger WHERE ref_no=$1 ORDER BY id`, [transfer]);
    expect(rows).toEqual([
      { warehouse_code: warehouse, qty: -0.125, cost_change: null },
      { warehouse_code: target, qty: 0.125, cost_change: null },
    ]);
  });

  it('corrects physical, available, precision and ledger together, then replays the first receipt', async () => {
    const batchNo = 'INVENTORY-FIXTURE-KG';
    await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES($1,10,10,$2,$3,'kg','AVAILABLE')`, [batchNo, warehouse, company]);
    const [{ xmin }] = await db.query('SELECT xmin::text FROM inv_batches WHERE batch_no=$1', [batchNo]);
    const service = new WmsService(db.manager, cls);
    const input = { request_key: randomUUID(), lines: [{ batch_no: batchNo, batch_version: xmin, counted_qty: '8.125' }] };
    const original = await service.pdaStocktakeCount(input, { userId: 100, username: 'fixture' });
    expect(original.results[0]).toMatchObject({ act_qty: 8.125, diff_qty: -1.875 });
    await db.query('UPDATE inv_batches SET qty=7.125,qty_available=7.125 WHERE batch_no=$1', [batchNo]);
    await expect(service.pdaStocktakeCount(input, { userId: 100, username: 'fixture' })).resolves.toEqual(original);
    const [batch] = await db.query('SELECT qty::float,qty_available::float FROM inv_batches WHERE batch_no=$1', [batchNo]);
    expect(batch).toEqual({ qty: 7.125, qty_available: 7.125 });
    const [ledger] = await db.query("SELECT count(*)::int AS n, sum(qty_change)::float AS delta FROM inv_ledger WHERE ref_no=$1 AND change_type='STOCKTAKE_DOWN'",
      [original.results[0].stocktake_no]);
    expect(ledger).toEqual({ n: 1, delta: -1.875 });
  });

  it('finds a physical batch with zero availability in the authorized warehouse', async () => {
    const batch = 'INVENTORY-FIXTURE-HELD';
    await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES($1,12,0,$2,$3,'枚','FROZEN')`, [batch, warehouse, company]);
    const service = new WmsService(db.manager, cls);
    const result = await service.queryInventoryBatches({ batch_no: batch, warehouse_code: warehouse });
    expect(result.data.total).toBe(1);
    expect(result.data.rows[0]).toMatchObject({ batch_no: batch, qty: '12.000', qty_available: '0', held: 12 });
    await expect(service.queryInventoryBatches({ warehouse_code: 'INVENTORY-OTHER' })).rejects.toThrow('无权查询该仓库');
  });

  it('keeps a sealed snapshot across subsequent movements and counts reservations separately', async () => {
    const closeWarehouse = 'INVENTORY-FIXTURE-CLOSE';
    const batchNo = 'INVENTORY-FIXTURE-CLOSE-B';
    await db.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,type,domain)
      VALUES ($1,'Close validation',$2,'GENERAL','OPERATIONAL')`, [closeWarehouse, company]);
    const [day] = await db.query(`SELECT (((clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date)-1)::text AS business_day`);
    await db.query(`UPDATE wms_close_capture_epoch SET initialized_at=clock_timestamp()-interval '2 days'`);
    await db.transaction(async manager => {
      await manager.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
        VALUES($1,90,90,$2,$3,'枚','AVAILABLE')`, [batchNo, closeWarehouse, company]);
      await manager.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,unit,change_type,qty_change)
        VALUES($1,$2,$3,'枚','INBOUND',100),($1,$2,$3,'枚','RESERVED',-10),($1,$2,$3,'枚','FIFO_OUT',-10)`,
        [batchNo, company, closeWarehouse]);
      await manager.query("UPDATE wms_close_capture SET recorded_at=recorded_at-interval '1 day' WHERE batch_no=$1", [batchNo]);
    });
    await db.query(`INSERT INTO wms_daily_close_activation
      (company_code,warehouse_code,first_business_date,authorized_by,evidence_ref,enabled)
      VALUES($1,$2,$3,'fixture','fixture-rehearsal',true)`, [company, closeWarehouse, day.business_day]);
    const service = new WarehouseDailyCloseService(db, { get: () => ({ ...scope, allowedWarehouseCodes: [closeWarehouse] }) } as any);
    const preview = await service.summary(closeWarehouse, day.business_day);
    expect(preview.data.eligible).toBe(true);
    const unit = (preview.data.totals!.units as any[])[0];
    expect([+unit.inbound,+unit.outbound,+unit.reserved,+unit.closing]).toEqual([100,10,10,90]);
    const version = preview.data.version!;
    const [first, second] = await Promise.all([
      service.close(closeWarehouse, day.business_day, version, randomUUID(), 100),
      service.close(closeWarehouse, day.business_day, version, randomUUID(), 101),
    ]);
    expect(first.data.closed.id).toBe(second.data.closed.id);
    await db.query('UPDATE inv_batches SET qty=95,qty_available=95 WHERE batch_no=$1', [batchNo]);
    const reread = await service.summary(closeWarehouse, day.business_day);
    expect(reread.data.closed.snapshot).toEqual(first.data.closed.snapshot);
    await expect(new WarehouseDailyCloseService(db, cls).summary(closeWarehouse, day.business_day)).rejects.toThrow('无该仓权限');
  });
  it('claims a later-committing smaller event id in the first open warehouse day', async () => {
    const closeWarehouse = 'INVENTORY-FIXTURE-LATE';
    await db.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,type,domain)
      VALUES ($1,'Late-event validation',$2,'GENERAL','OPERATIONAL')`, [closeWarehouse, company]);
    const [{ first, second }] = await db.query(`
      SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date-2)::text AS first,
             ((clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date-1)::text AS second`);
    await db.query(`UPDATE wms_close_capture_epoch SET initialized_at=clock_timestamp()-interval '3 days'`);
    await db.query(`INSERT INTO wms_daily_close_activation
      (company_code,warehouse_code,first_business_date,authorized_by,evidence_ref,enabled)
      VALUES($1,$2,$3,'fixture','fixture-rehearsal',true)`, [company, closeWarehouse, first]);
    const write = async (m: DataSource['manager'], no: string, qty: number) => {
      await m.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
        VALUES($1,$2,$2,$3,$4,'枚','AVAILABLE')`, [no, qty, closeWarehouse, company]);
      await m.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,unit,change_type,qty_change)
        VALUES($1,$2,$3,'枚','INBOUND',$4)`, [no, company, closeWarehouse, qty]);
      await m.query("UPDATE wms_close_capture SET recorded_at=recorded_at-interval '2 days' WHERE batch_no=$1", [no]);
    };
    const delayed = db.createQueryRunner();
    await delayed.connect();
    await delayed.startTransaction();
    try {
      await write(delayed.manager, 'INVENTORY-FIXTURE-LOW', 2);
      await db.transaction(m => write(m, 'INVENTORY-FIXTURE-HIGH', 3));
      const service = new WarehouseDailyCloseService(db, { get: () => ({ ...scope, allowedWarehouseCodes: [closeWarehouse] }) } as any);
      const preview = await service.summary(closeWarehouse, first);
      await service.close(closeWarehouse, first, preview.data.version!, randomUUID(), 100);
      await delayed.commitTransaction();
      const later = await service.summary(closeWarehouse, second);
      expect(later.data.totals!.late_events).toBe(2);
      expect((later.data.totals!.units as any[]).map(row => [+row.opening,+row.inbound,+row.closing])).toEqual([[3,2,5]]);
      await service.close(closeWarehouse, second, later.data.version!, randomUUID(), 100);
      const [{ counts }] = await db.query(`SELECT count(*)::int AS counts FROM wms_close_event_claims c
        JOIN wms_close_capture e ON e.id=c.event_id WHERE e.warehouse_code=$1`,[closeWarehouse]);
      expect(counts).toBe(4);
    } finally {
      if (delayed.isTransactionActive) await delayed.rollbackTransaction();
      await delayed.release();
    }
  });

});
