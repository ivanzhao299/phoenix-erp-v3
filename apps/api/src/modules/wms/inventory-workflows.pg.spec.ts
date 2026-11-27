import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { InventoryStocktakeSubmissions1795658500000 } from '../../database/migrations/1795658500000-InventoryStocktakeSubmissions';
import { InventorySourceModeService } from '../sales-v2/services/inventory-source-mode.service';
import { DeliveryOrdersService } from '../sales-v2/services/delivery-orders.service';
import { EggInventoryService } from '../sales-v2/services/egg-inventory.service';
import { SalesOrderLifecycleService } from '../sales-v2/services/sales-order-lifecycle.service';
import { StoreReplenishmentService } from '../store-pos/services/store-replenishment.service';
import { ReturnOrdersService } from '../sales-v2/services/return-orders.service';
import { ReceiptsService } from '../sales-v2/services/receipts.service';
import { SalesOrdersService } from '../sales-v2/services/sales-orders.service';
import { QualityService } from '../quality/quality.service';
import { readPosAllocationTrace } from '../traceability/pos-allocation-trace';
import { readInventoryLineage, readOutboundTrace } from '../traceability/inventory-lineage';
import { GenericCrudController } from '../generic-crud/generic-crud.controller';
import { GenericCrudService } from '../generic-crud/generic-crud.service';
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

  it('filters transfers by either authorized warehouse before paging and keeps localized names', async () => {
    const wms = new WmsService(db.manager, cls);
    const outside = 'INVENTORY-FLOOR-OUTSIDE';
    const beyond = 'INVENTORY-FLOOR-BEYOND';
    const next = 'INVENTORY-FLOOR-NEXT';
    const prefix = 'INVENTORY-FLOOR-XFER';
    await db.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,warehouse_name_en,company_code,type,domain)
      VALUES ($1,'Outside','Outside EN',$4,'GENERAL','OPERATIONAL'),($2,'Next','Next EN',$4,'GENERAL','OPERATIONAL'),
             ($3,'Beyond','Beyond EN',$4,'GENERAL','OPERATIONAL')`, [outside, next, beyond, company]);
    await db.query(`INSERT INTO wms_transfer(transfer_no,from_warehouse,to_warehouse,qty,status,created_at)
      VALUES ($1,$5,$6,1,'PENDING','2026-11-25'),($2,$6,$5,1,'PENDING','2026-11-25'),
             ($3,$5,$7,1,'IN_TRANSIT','2026-11-25'),($4,$6,$8,1,'PENDING','2026-11-25')`,
    [`${prefix}-1`, `${prefix}-2`, `${prefix}-3`, `${prefix}-4`, warehouse, outside, next, beyond]);
    const filter = { transfer_no__like: `${prefix}-%`, status: ['PENDING', 'IN_TRANSIT'] };
    const visible = [warehouse, next];
    await expect(wms.findAllTransferScoped({ ...filter, limit: 2 }, visible)).resolves.toMatchObject({ total: 3, data: [
      { transfer_no: `${prefix}-3`, to_warehouse_name_en: 'Next EN' }, { transfer_no: `${prefix}-2` },
    ] });
    await expect(wms.findAllTransferScoped({ ...filter, limit: 2, offset: 2 }, visible))
      .resolves.toMatchObject({ total: 3, data: [{ transfer_no: `${prefix}-1` }] });
    await expect(wms.findAllTransferScoped({ ...filter, status: [] }, visible)).resolves.toEqual({ data: [], total: 0 });
    await expect(wms.findAllTransferScoped(filter, [])).resolves.toEqual({ data: [], total: 0 });
    await expect(wms.findAllTransferScoped(filter, null)).resolves.toMatchObject({ total: 4 });
  });

  it('locks generic warehouse draft mutations and refuses changes that race with completion', async () => {
    const controller = new GenericCrudController(new GenericCrudService(db.manager),
      { resolve: async () => scope } as any, new WmsService(db.manager, cls), cls, db.manager);
    const req = { user: { userId: 100, username: 'fixture', permissions: ['*'] } };
    const cases = [
      { table: 'wms_inbound', key: 'task_no', number: 'INVENTORY-FLOOR-RACE-IN', terminal: 'COMPLETED' },
      { table: 'wms_stocktake', key: 'stocktake_no', number: 'INVENTORY-FLOOR-RACE-ST', terminal: 'APPROVED' },
    ];
    for (const entry of cases) {
      const [{ id }] = await db.query(`INSERT INTO ${entry.table}(${entry.key},warehouse_code,status,item)
        VALUES ($1,$2,'PENDING','draft') RETURNING id`, [entry.number, warehouse]);
      await expect(controller.updateWithColumn(entry.table, entry.key, entry.number, { operator: 'fixture' }, req))
        .resolves.toMatchObject({ code: 200 });
      const closer = db.createQueryRunner();
      let outcome: Promise<unknown> | undefined;
      try {
        await closer.startTransaction();
        const [{ pid }] = await closer.query('SELECT pg_backend_pid() AS pid');
        await closer.query(`UPDATE ${entry.table} SET status=$2 WHERE id=$1`, [id, entry.terminal]);
        const edit = entry.table === 'wms_inbound'
          ? controller.updateWithColumn(entry.table, 'id', String(id), { item: 'racing edit' }, req)
          : controller.removeWithColumn(entry.table, entry.key, entry.number, req);
        outcome = edit.catch(error => error);
        let waiting = false;
        for (let attempt = 0; attempt < 150 && !waiting; attempt++) {
          const [{ blocked }] = await db.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
            WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked`, [pid]);
          waiting = blocked;
          if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
        await closer.commitTransaction();
        await expect(outcome).resolves.toMatchObject({ status: 409 });
        const [stored] = await db.query(`SELECT item,status FROM ${entry.table} WHERE id=$1`, [id]);
        expect(stored).toEqual({ item: 'draft', status: entry.terminal });
      } finally {
        if (closer.isTransactionActive) await closer.rollbackTransaction();
        await outcome;
        await closer.release();
      }
    }
  });

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

  it('removes inbound draft lines and rejects a stale confirmation after the task number is reused', async () => {
    const wms = new WmsService(db.manager, cls);
    const controller = new GenericCrudController(new GenericCrudService(db.manager),
      { resolve: async () => scope } as any, wms, cls, db.manager);
    const req = { user: { userId: 100, username: 'fixture', permissions: ['*'] } };
    const task = 'INVENTORY-FLOOR-DRAFT-REMOVE';
    const createHead = async () => {
      const [row] = await db.query(`INSERT INTO wms_inbound(task_no,warehouse_code,type,status)
        VALUES($1,$2,'RETURN','PENDING') RETURNING id`, [task, warehouse]);
      return String(row.id);
    };
    const originalId = await createHead();
    await db.query(`INSERT INTO wms_inbound_items(task_no,product_code,qty) VALUES($1,'ORIGINAL',5)`, [task]);
    await expect(controller.updateWithColumn('wms_inbound', 'id', originalId, { warehouse_code: null }, req))
      .rejects.toMatchObject({ status: 400 });
    await expect(controller.removeWithColumn('wms_inbound', 'task_no', task, req)).resolves.toMatchObject({ code: 200 });
    const newId = await createHead();
    expect(newId).not.toBe(originalId);
    await expect(db.query('SELECT id FROM wms_inbound_items WHERE task_no=$1', [task])).resolves.toEqual([]);
    await db.query(`INSERT INTO wms_inbound_items(task_no,product_code,qty) VALUES($1,'REPLACEMENT',5)`, [task]);
    const payload = { task_no: task, items: [{ product_code: 'REPLACEMENT', qty: 5 }] };
    await expect(wms.confirmInbound(payload, req.user, undefined, true, false, originalId))
      .rejects.toMatchObject({ status: 409 });
    await expect(db.query('SELECT status FROM wms_inbound WHERE id=$1', [newId]))
      .resolves.toEqual([{ status: 'PENDING' }]);
    await expect(db.query('SELECT id FROM inv_ledger WHERE ref_no=$1', [task])).resolves.toEqual([]);
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
    const equivalent = [...inputs].reverse().map(line => ({ id: line.id, qty: '10.000' }));
    await expect(service.confirmInbound({ task_no: task, items: equivalent }, user, undefined, true)).resolves.toEqual(single);
    await expect(service.confirmInbound({ task_no: task, items: [] }, user, undefined, true, true)).resolves.toEqual(single);
    await expect(service.confirmInbound({ task_no: task, items: [...inputs.slice(0,1), { ...inputs[1], actual_qty: 9, broken_qty: 1 }] },
      user, undefined, true)).rejects.toMatchObject({ status: 409 });
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
    const [{ id: deliveryItem }] = await db.query(`INSERT INTO sal_delivery_order_items(delivery_order_id,sales_order_id,sales_order_no,planned_qty,status)
      VALUES($1,$2,$3,20,'LOADED') RETURNING id`, [delivery, order, orderNo]);
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
    const id = String(delivery);
    const onReceipt = jest.fn();
    const receiver = new ReceiptsService(db, actor, { receiveWithAr: onReceipt } as any, new SalesOrderLifecycleService(db));
    const sign = { deliveryItemId: String(deliveryItem), receivedQty: 20 };
    await expect(receiver.createSigned(id, sign)).rejects.toMatchObject({ status: 409 });

    await db.query('UPDATE sal_order_item_batch_allocations SET reserved_qty=20 WHERE sales_order_item_id=$1 AND batch_no=$2', [lines[0].id,'INVENTORY-PICK-0']);
    await db.query('UPDATE sal_order_item_batch_allocations SET released_qty=10 WHERE sales_order_item_id=$1', [lines[1].id]);
    await expect(service.finishLoading(id, {})).rejects.toMatchObject({ status: 409 });
    await db.query('UPDATE sal_order_item_batch_allocations SET reserved_qty=6 WHERE sales_order_item_id=$1 AND batch_no=$2', [lines[0].id,'INVENTORY-PICK-0']);
    await db.query('UPDATE sal_order_item_batch_allocations SET released_qty=0 WHERE sales_order_item_id=$1', [lines[1].id]);
    const deniedActor = { get: (key: string) => key === 'dataScope'
      ? { ...scope, allowedWarehouseCodes: ['ELSEWHERE'] } : { userId: 100 } } as any;
    await expect(new DeliveryOrdersService(db, deniedActor, new EggInventoryService(db, deniedActor),
      new SalesOrderLifecycleService(db)).finishLoading(id, {})).rejects.toMatchObject({ status: 403 });

    const plan = await service.warehouseLoadingTasks(deliveryNo);
    expect(plan.items).toHaveLength(3);
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
    await expect(receiver.createSigned(id, sign)).rejects.toMatchObject({ status: 409 });
    await service.depart(id, {});
    await expect(receiver.createSigned(id, sign)).rejects.toMatchObject({ status: 409 });
    await service.arrive(id, {});
    const otherCompany = { get: (key: string) => key === 'dataScope'
      ? { ...scope, allowedCompanyCodes: ['OTHER-COMPANY'] } : { userId: 101 } } as any;
    await expect(new ReceiptsService(db, otherCompany, null!, new SalesOrderLifecycleService(db)).createSigned(id, sign))
      .rejects.toMatchObject({ status: 403 });
    await expect(receiver.createSigned(id, { ...sign, receivedQty: 21 })).rejects.toMatchObject({ status: 400 });
    const signed = await receiver.createSigned(id, sign);
    await expect(receiver.createSigned(id, sign)).resolves.toEqual({ ...signed, replayed: true });
    expect(onReceipt).toHaveBeenCalledTimes(1);
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

  it('confirms the exact partial loading receipt and links a single-line rejected delivery return once', async () => {
    const actor = { get: (key: string) => key === 'dataScope' ? scope : { userId: 100, username: 'fixture' } } as any;
    const lifecycle = new SalesOrderLifecycleService(db);
    const inventory = new EggInventoryService(db, actor);
    const service = new DeliveryOrdersService(db, actor, inventory, lifecycle);
    const receiver = new ReceiptsService(db, actor, null!, lifecycle);
    const returns = new ReturnOrdersService(db, actor, null!, null!, inventory, lifecycle);
    const orderNo = 'INVENTORY-SALE-PARTIAL';
    const deliveryNo = 'INVENTORY-DELIVERY-PARTIAL';
    const batchNo = 'INVENTORY-BATCH-PARTIAL';
    const [{ id: order }] = await db.query(`INSERT INTO sal_sales_orders(order_no,company_code,status,fulfillment_warehouse_code)
      VALUES($1,$2,'ALLOCATED',$3) RETURNING id`, [orderNo, company, warehouse]);
    const [{ id: delivery }] = await db.query(`INSERT INTO sal_delivery_orders(delivery_no,company_code,status,fulfillment_warehouse_code)
      VALUES($1,$2,'LOADING',$3) RETURNING id`, [deliveryNo, company, warehouse]);
    const [{ id: deliveryItem }] = await db.query(`INSERT INTO sal_delivery_order_items(delivery_order_id,sales_order_id,sales_order_no,planned_qty,status)
      VALUES($1,$2,$3,4,'LOADED') RETURNING id`, [delivery, order, orderNo]);
    const [{ id: line }] = await db.query(`INSERT INTO sal_order_items(sales_order_id,product_code,qty,unit_price,amount)
      VALUES($1,'FIXTURE-PRODUCT',10,1,10) RETURNING id`, [order]);
    await db.query(`INSERT INTO inv_batches(batch_no,product_code,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES($1,'FIXTURE-PRODUCT',10,0,$2,$3,'kg','AVAILABLE')`, [batchNo, warehouse, company]);
    const [{ id: ledger }] = await db.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,ref_no,unit,change_type,qty_change)
      VALUES($1,$2,$3,$4,'kg','RESERVED',-10) RETURNING id`, [batchNo, company, warehouse, orderNo]);
    await db.query(`INSERT INTO sal_order_item_batch_allocations(sales_order_item_id,batch_no,reserved_qty,reservation_ledger_id,created_by)
      VALUES($1,$2,10,$3,'fixture')`, [line, batchNo, ledger]);
    const plan = await service.warehouseLoadingTasks(deliveryNo);
    expect(plan.items).toMatchObject([{ batch_no: batchNo, qty: '4' }]);
    const id = String(delivery);
    const shipped = await service.finishWarehouseLoading(id, { items: plan.items });
    expect(+shipped.items[0].qty).toBe(4);
    await service.depart(id, {});
    await service.arrive(id, {});
    const exception = await receiver.createException(id, {
      deliveryItemId: String(deliveryItem), receivedQty: 2, exceptionQty: 2, exceptionType: 'DAMAGED',
    });
    const retries = await Promise.all([receiver.resolveExceptionReturn(String(exception.id), returns),
      receiver.resolveExceptionReturn(String(exception.id), returns)]);
    expect(retries.map(result => result.returnOrder.id)).toEqual([retries[0].returnOrder.id, retries[0].returnOrder.id]);
    expect(retries[0].resolutionStatus).toBe('RETURN_CREATED');
    const [ret] = await db.query(`SELECT sales_order_item_id::text,returned_qty::float FROM sal_return_items WHERE return_order_id=$1`, [retries[0].returnOrder.id]);
    expect(ret).toEqual({ sales_order_item_id: String(line), returned_qty: 2 });
  });

  it('signs historical arrivals only after matching independently recorded loading evidence', async () => {
    const actor = { get: (key: string) => key === 'dataScope' ? scope : { userId: 100, username: 'fixture' } } as any;
    const receiver = new ReceiptsService(db, actor, { receiveWithAr: jest.fn() } as any, new SalesOrderLifecycleService(db));
    const orderNo = 'INVENTORY-HISTORIC-SIGN';
    const deliveryNo = 'INVENTORY-HISTORIC-ARRIVAL';
    const batchNo = 'INVENTORY-HISTORIC-BATCH';
    const [{ id: order }] = await db.query(`INSERT INTO sal_sales_orders(order_no,company_code,status)
      VALUES($1,$2,'DELIVERED') RETURNING id`, [orderNo, company]);
    const [{ id: delivery }] = await db.query(`INSERT INTO sal_delivery_orders(delivery_no,company_code,status)
      VALUES($1,$2,'ARRIVED') RETURNING id`, [deliveryNo, company]);
    const [{ id: item }] = await db.query(`INSERT INTO sal_delivery_order_items(delivery_order_id,sales_order_id,sales_order_no,planned_qty,status)
      VALUES($1,$2,$3,3,'DELIVERED') RETURNING id`, [delivery, order, orderNo]);
    const dto = { deliveryItemId: String(item), receivedQty: 3 };
    await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES($1,1,1,$2,$3,'kg','AVAILABLE')`, [batchNo, warehouse, company]);
    await db.query(`INSERT INTO inv_ledger(batch_no,company_code,ref_no,change_type,qty_change,note)
      VALUES($1,$2,$3,'FIFO_OUT',-3,$4)`, [batchNo, company, deliveryNo, '装车出库 delivery='+deliveryNo+' order='+orderNo+' batch='+batchNo]);
    await expect(receiver.createSigned(String(delivery), dto)).rejects.toMatchObject({ status: 409 });
    await db.query(`INSERT INTO sal_order_lifecycle_events(event_id,sales_order_id,order_no,event_type,actor_type,source_module,source_ref_type,source_ref_id,source_ref_no)
      VALUES($1,$2,$3,'OUTBOUND_CONFIRMED','USER','WMS','DELIVERY',$4,$5)`, [randomUUID(), order, orderNo, String(delivery), deliveryNo]);
    await expect(receiver.createSigned(String(delivery), dto)).resolves.toMatchObject({ received_qty: '3.00' });
  });

  it('rolls back WMS dispatch if the linked store request cannot advance', async () => {
    const wms = new WmsService(db.manager, cls);
    const storeActor = { get: (key: string) => key === 'dataScope' ? scope : { roles: ['ROLE_WMS_MGR'] } } as any;
    const service = new StoreReplenishmentService(db, storeActor, { listMembershipStores: async () => [] } as any, wms);
    const user = { userId: 100, username: 'fixture' };
    const transferNo = 'INVENTORY-STORE-XFER';
    const batchNo = 'INVENTORY-STORE-BATCH';
    const storeCode = 'INVENTORY-STORE-FIX';
    const destination = 'INVENTORY-STORE-DEST';
    await db.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,type,domain)
      VALUES($1,'Store replenishment destination',$2,'GENERAL','OPERATIONAL')`, [destination, company]);
    const [store] = await db.query(`INSERT INTO store_master(store_code,store_name,company_code)
      VALUES($1,'Replenishment test store',$2) RETURNING id`, [storeCode, company]);
    await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES($1,9,9,$2,$3,'kg','AVAILABLE')`, [batchNo, warehouse, company]);
    await db.query(`INSERT INTO wms_transfer(transfer_no,from_warehouse,to_warehouse,qty,status)
      VALUES($1,$2,$3,2,'PENDING')`, [transferNo, warehouse, destination]);
    await db.query(`INSERT INTO wms_transfer_items(transfer_no,source_batch_no,expected_qty) VALUES($1,$2,2)`, [transferNo, batchNo]);
    const [request] = await db.query(`INSERT INTO store_replenishment_requests
      (request_no,store_id,company_code,source_warehouse_code,target_warehouse_code,requested_by,transfer_no,status)
      VALUES('INVENTORY-STORE-REQUEST',$1,$2,$3,$4,'fixture',$5,'APPROVED') RETURNING id`, [store.id, company, warehouse, destination, transferNo]);
    await expect(wms.dispatchTransfer(transferNo, user)).rejects.toThrow('请从门店补货流程');
    const actualDispatch = wms.dispatchTransfer.bind(wms);
    const failure = jest.spyOn(wms, 'dispatchTransfer').mockImplementationOnce(async (...args) => {
      const result = await actualDispatch(...args);
      expect(result.status).toBe('IN_TRANSIT');
      await args[2]!.query("SELECT CAST('fixture rejection' AS int)");
      return result;
    });
    try {
      await expect(service.dispatch(Number(request.id), user)).rejects.toThrow('fixture rejection');
    } finally { failure.mockRestore(); }
    const [still] = await db.query(`SELECT t.status,r.status AS request_status,b.qty::float
      FROM wms_transfer t JOIN store_replenishment_requests r USING(transfer_no) JOIN inv_batches b ON b.batch_no=$2 WHERE t.transfer_no=$1`, [transferNo,batchNo]);
    expect(still).toEqual({ status: 'PENDING', request_status: 'APPROVED', qty: 9 });
    await expect(service.dispatch(Number(request.id), user)).resolves.toMatchObject({ status: 'IN_TRANSIT' });
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
    const quality = new QualityService(db.manager);
    await expect(quality.traceForward(batchA, scope as any)).resolves.toMatchObject({
      sales: [{ batch_no: batchA, qty: '3.000' }],
    });
    await expect(quality.traceBackward({ sale_no: sale }, scope as any)).resolves.toMatchObject({
      traces: [{ batch_no: batchA, recall_assessment: { can_recall: null } }],
    });
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
    const both = { ...scope, allowedWarehouseCodes: [warehouse, target] } as any;
    const [edge] = await readInventoryLineage(db, batch, both);
    expect(edge).toMatchObject({ parent_batch_no: batch, kind: 'TRANSFER', document_no: transfer, downstream: true });
    await expect(readInventoryLineage(db, [edge.child_batch_no], both)).resolves.toEqual([
      expect.objectContaining({ parent_batch_no: batch, child_batch_no: edge.child_batch_no, upstream: true }),
    ]);
    await expect(readInventoryLineage(db, batch, scope as any)).resolves.toEqual([]);
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

  it('normalizes historical done stocktakes, scopes reads and refuses a duplicate against any batch', async () => {
    const wms = new WmsService(db.manager, cls);
    const controller = new GenericCrudController(new GenericCrudService(db.manager),
      { resolve: async () => scope } as any, wms, cls, db.manager);
    const user = { userId: 100, username: 'fixture', storeCode: 'STORE-DOES-NOT-SCOPE-STOCKTAKE', permissions: ['*'] };
    const batchNo = 'INVENTORY-APPROVAL-PHYSICAL';
    const [batch] = await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES($1,9,9,$2,$3,'kg','AVAILABLE') RETURNING xmin::text`, [batchNo, warehouse, company]);
    const number = 'INVENTORY-ST-LOWER';
    await db.query(`INSERT INTO wms_stocktake(stocktake_no,warehouse_code,batch_no,status,book_qty,actual_qty,observed_batch_version)
      VALUES($1,$2,$3,'done',9,8.5,$4),($5,$2,$3,'done',9,8.5,$4)`,
    [number, warehouse, batchNo, batch.xmin, 'INVENTORY-ST-LEGACY-POSTED']);
    const result = await controller.findAll('wms_stocktake', { stocktake_no: number }, { user });
    expect(result.data).toEqual([expect.objectContaining({ stocktake_no: number })]);
    await wms.approveStocktake({ stocktake_no: number }, user);
    await expect(db.query('SELECT status FROM wms_stocktake WHERE stocktake_no=$1', [number])).resolves.toEqual([{ status: 'APPROVED' }]);
    const [{ n }] = await db.query("SELECT count(*)::int AS n FROM inv_ledger WHERE ref_no=$1 AND change_type='STOCKTAKE_DOWN'", [number]);
    expect(n).toBe(1);
    const already = 'INVENTORY-ST-LEGACY-POSTED';
    await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES('A-HISTORIC-BATCH',8,8,$1,$2,'kg','AVAILABLE')`, [warehouse, company]);
    await db.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,ref_no,unit,change_type,qty_change)
      VALUES($1,$2,$3,$4,'kg','STOCKTAKE_DOWN',-0.5)`, ['A-HISTORIC-BATCH', company, warehouse, already]);
    await expect(wms.approveStocktake({ stocktake_no: already }, user)).rejects.toMatchObject({ status: 409 });
    await expect(db.query('SELECT qty::float FROM inv_batches WHERE batch_no=$1', [batchNo])).resolves.toEqual([{ qty: 8.5 }]);
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
  it('blocks a new daily close when opening quantities disagree with the previous sealed day', async () => {
    const closeWarehouse = 'INVENTORY-FIXTURE-CARRY';
    await db.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,type,domain)
      VALUES ($1,'Carry validation',$2,'GENERAL','OPERATIONAL')`, [closeWarehouse, company]);
    const [{ prior, next }] = await db.query(`
      SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date-2)::text AS prior,
             ((clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date-1)::text AS next`);
    await db.query(`INSERT INTO wms_daily_close_activation(company_code,warehouse_code,first_business_date,authorized_by,evidence_ref,enabled)
      VALUES($1,$2,$3,'fixture','fixture-rehearsal',true)`, [company, closeWarehouse, prior]);
    await db.query(`INSERT INTO wms_daily_closes(company_code,warehouse_code,business_date,request_key,version,closed_by,snapshot)
      VALUES($1,$2,$3,$4,$5,'fixture','{"units":[{"unit":"kg","closing":"10.500"}]}'::jsonb)`,
    [company, closeWarehouse, prior, randomUUID(), '1'.repeat(64)]);
    const service = new WarehouseDailyCloseService(db, { get: () => ({ ...scope, allowedWarehouseCodes: [closeWarehouse] }) } as any);
    const preview = await service.summary(closeWarehouse, next);
    expect(preview.data).toMatchObject({ eligible: false, totals: { continuity_gaps: 1, unresolved: 1 } });
    await expect(service.close(closeWarehouse, next, preview.data.version!, randomUUID(), 100)).rejects.toMatchObject({ status: 409 });
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
