import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { PackagingHistoryService } from '../bff/packaging-history.service';
import { TraceabilityService } from './traceability.service';
import { readPosAllocationTrace } from './pos-allocation-trace';

const connection = process.env.TRACEABILITY_SCOPE_PG_URL;
const pg = connection ? describe : describe.skip;

pg('traceability authorization against isolated PostgreSQL', () => {
  let db: DataSource;
  let trace: TraceabilityService;
  const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
  const companyA = `TRACE-${suffix}-A`;
  const companyB = `TRACE-${suffix}-B`;
  const warehouseA = `TRACE-${suffix}-W1`;
  const warehouseB = `TRACE-${suffix}-W2`;
  const warehouseC = `TRACE-${suffix}-W3`;
  const scope = {
    isGlobal: false,
    allowedCompanyCodes: [companyA],
    allowedWarehouseCodes: [warehouseA],
    allowedFarmCodes: [],
    allowedProjectCodes: [],
  };

  beforeAll(async () => {
    const url = connection ? new URL(connection) : null;
    if (process.env.NODE_ENV !== 'test' || !url || !['127.0.0.1', 'localhost'].includes(url.hostname)
      || url.port !== '55432' || url.pathname !== '/packaging_p4_trace') {
      throw new Error('DEDICATED_LOOPBACK_PACKAGING_P4_TRACE_DATABASE_REQUIRED');
    }
    db = new DataSource({ type: 'postgres', url: connection, database: 'packaging_p4_trace', entities: [], logging: false });
    await db.initialize();
    expect(Number((await db.query('SHOW server_version_num'))[0].server_version_num)).toBeGreaterThanOrEqual(180000);
    const history = new PackagingHistoryService(db.manager, {} as any);
    trace = new TraceabilityService(db, history);
    await db.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,type,domain)
      VALUES($1,'Trace scope W1',$4,'GENERAL','OPERATIONAL'),
            ($2,'Trace scope W2',$4,'GENERAL','OPERATIONAL'),
            ($3,'Trace scope other company',$5,'GENERAL','OPERATIONAL')`,
    [warehouseA, warehouseB, warehouseC, companyA, companyB]);
  });

  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

  it('shows a sales order header only when its complete allocation set is in the caller company and warehouse scope', async () => {
    const visibleOrder = `TRACE-${suffix}-VISIBLE`;
    const outsideOrder = `TRACE-${suffix}-OUTSIDE`;
    const mixedOrder = `TRACE-${suffix}-MIXED`;
    const invalidBatchOrder = `TRACE-${suffix}-INVALID-BATCH`;
    const unknownWarehouseOrder = `TRACE-${suffix}-UNKNOWN-WAREHOUSE`;
    const outOfRangeLedgerOrder = `TRACE-${suffix}-OUT-OF-RANGE-LEDGER`;
    const otherCompanyOrder = `TRACE-${suffix}-OTHER-COMPANY`;
    const customerCode = `TRACE-${suffix}-CUSTOMER`;
    const insertOrder = async (orderNo: string, company: string, warehouse: string | null) => {
      const [{ id }] = await db.query(`INSERT INTO sal_sales_orders(order_no,company_code,customer_code,status,fulfillment_warehouse_code,total_amount)
        VALUES($1,$2,$3,'ALLOCATED',$4,700) RETURNING id`, [orderNo, company, customerCode, warehouse]);
      const [{ id: item }] = await db.query(`INSERT INTO sal_order_items(sales_order_id,product_code,qty,unit_price,amount)
        VALUES($1,'TRACE-PRODUCT',1,700,700) RETURNING id`, [id]);
      return { id, item };
    };
    const insertBatch = async (batch: string, company: string, warehouse: string) => {
      await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
        VALUES($1,20,20,$2,$3,'枚','AVAILABLE')`, [batch, warehouse, company]);
    };
    const allocate = async (item: string, batch: string, batchCompany: string, batchWarehouse: string) => {
      const [{ id: ledgerId }] = await db.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,unit,ref_no,change_type,qty_change)
        VALUES($1,$2,$3,'枚',$4,'RESERVED',-1) RETURNING id`, [batch, batchCompany, batchWarehouse, `TRACE-RESERVED-${batch}`]);
      const [{ id }] = await db.query(`INSERT INTO sal_order_item_batch_allocations(sales_order_item_id,batch_no,reserved_qty,reservation_ledger_id,created_by)
        VALUES($1,$2,1,$3,'trace-fixture') RETURNING id`, [item, batch, ledgerId]);
      return id as string;
    };

    const visible = await insertOrder(visibleOrder, companyA, warehouseA);
    const outside = await insertOrder(outsideOrder, companyA, warehouseB);
    const mixed = await insertOrder(mixedOrder, companyA, warehouseA);
    const invalidBatch = await insertOrder(invalidBatchOrder, companyA, warehouseA);
    const unknownWarehouse = await insertOrder(unknownWarehouseOrder, companyA, warehouseA);
    const outOfRangeLedger = await insertOrder(outOfRangeLedgerOrder, companyA, warehouseA);
    const otherCompany = await insertOrder(otherCompanyOrder, companyB, warehouseC);
    await insertBatch(`TRACE-${suffix}-B1`, companyA, warehouseA);
    await insertBatch(`TRACE-${suffix}-B2`, companyA, warehouseB);
    await insertBatch(`TRACE-${suffix}-B3`, companyB, warehouseC);
    await insertBatch(`TRACE-${suffix}-B4`, companyA, warehouseA);
    const visibleAllocation = await allocate(visible.item, `TRACE-${suffix}-B1`, companyA, warehouseA);
    await allocate(outside.item, `TRACE-${suffix}-B2`, companyA, warehouseB);
    await allocate(mixed.item, `TRACE-${suffix}-B1`, companyA, warehouseA);
    await allocate(mixed.item, `TRACE-${suffix}-B2`, companyA, warehouseB);
    await allocate(invalidBatch.item, `TRACE-${suffix}-B3`, companyB, warehouseC);
    await allocate(otherCompany.item, `TRACE-${suffix}-B3`, companyB, warehouseC);
    const outOfRangeAllocation = await allocate(outOfRangeLedger.item, `TRACE-${suffix}-B4`, companyA, warehouseA);
    const [{ id: outboundLedger }] = await db.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,unit,ref_no,change_type,qty_change)
      VALUES($1,$2,$3,'枚',$4,'FIFO_OUT',-1) RETURNING id`,
    [`TRACE-${suffix}-B1`, companyA, warehouseA, visibleOrder]);
    await db.query('UPDATE sal_order_item_batch_allocations SET outbound_qty=1 WHERE id=$1', [visibleAllocation]);
    await db.query(`INSERT INTO sal_order_item_batch_allocation_actions
      (allocation_id,sales_order_id,action_type,action_key,qty,ledger_id,created_by)
      VALUES($1,$2,'OUTBOUND',$3,1,$4,'trace-fixture')`,
    [visibleAllocation, visible.id, `TRACE-OUTBOUND-${suffix}`, outboundLedger]);

    const [{ id: unknownWarehouseReservation }] = await db.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,unit,ref_no,change_type,qty_change)
      VALUES($1,$2,$3,'枚',$4,'RESERVED',-1) RETURNING id`,
    [`TRACE-${suffix}-B4`, companyA, warehouseA, `TRACE-RESERVED-UNKNOWN-${suffix}`]);
    await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES($1,20,20,NULL,$2,'枚','AVAILABLE')`, [`TRACE-${suffix}-B5`, companyA]);
    await db.query(`INSERT INTO sal_order_item_batch_allocations(sales_order_item_id,batch_no,reserved_qty,reservation_ledger_id,created_by)
      VALUES($1,$2,1,$3,'trace-fixture')`, [unknownWarehouse.item, `TRACE-${suffix}-B5`, unknownWarehouseReservation]);
    const [{ id: outOfRangeLedgerId }] = await db.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,unit,ref_no,change_type,qty_change)
      VALUES($1,$2,$3,'枚',$4,'FIFO_OUT',-1) RETURNING id`,
    [`TRACE-${suffix}-B4`, companyA, warehouseB, outOfRangeLedgerOrder]);
    await db.query('UPDATE sal_order_item_batch_allocations SET outbound_qty=1 WHERE id=$1', [outOfRangeAllocation]);
    await db.query(`INSERT INTO sal_order_item_batch_allocation_actions
      (allocation_id,sales_order_id,action_type,action_key,qty,ledger_id,created_by)
      VALUES($1,$2,'OUTBOUND',$3,1,$4,'trace-fixture')`,
    [outOfRangeAllocation, outOfRangeLedger.id, `TRACE-OUTBOUND-OUT-OF-RANGE-${suffix}`, outOfRangeLedgerId]);

    await expect(trace.traceBySalesOrder(visibleOrder, [companyA], scope as any)).resolves.toMatchObject({
      found: true, order: { order_no: visibleOrder, total_amount: '700.00' },
      items: [{ batch_no: `TRACE-${suffix}-B1`, allocated_qty: expect.any(String) }],
    });
    for (const hiddenOrder of [outsideOrder, mixedOrder, invalidBatchOrder, unknownWarehouseOrder, outOfRangeLedgerOrder, otherCompanyOrder]) {
      await expect(trace.traceBySalesOrder(hiddenOrder, [companyA], scope as any))
        .resolves.toEqual({ found: false, entry: 'sales-order', key: hiddenOrder });
    }
    await expect(trace.traceBySalesOrder(visibleOrder, [companyA], { ...scope, allowedWarehouseCodes: [] } as any))
      .resolves.toEqual({ found: false, entry: 'sales-order', key: visibleOrder });
    await expect(trace.traceByCustomer(customerCode, [companyA], scope as any))
      .resolves.toMatchObject({ found: true, orders: [{ order_no: visibleOrder }] });
    await expect(trace.traceByCustomer(customerCode, [companyA], { ...scope, allowedWarehouseCodes: [] } as any))
      .resolves.toEqual({ found: false, entry: 'customer', key: customerCode });

    const saleNo = `TRACE-${suffix}-POS`;
    const [{ id: saleId }] = await db.query(`INSERT INTO sal_store_sales(sale_no,store_code,store_name,company_code,customer_code,status)
      VALUES($1,'TRACE-STORE','Trace store',$2,$3,'COMPLETED') RETURNING id`, [saleNo, companyA, customerCode]);
    const [{ id: saleItemId }] = await db.query(`INSERT INTO sal_store_sale_items(sale_id,product_code,product_name,qty,unit_price,amount)
      VALUES($1,'TRACE-PRODUCT','Trace product',2,1,2) RETURNING id`, [saleId]);
    await db.query(`INSERT INTO store_sale_allocations(sale_id,sale_item_id,batch_no,warehouse_code,allocated_qty,returned_qty)
      VALUES($1,$2,$3,$4,1,0),($1,$2,$5,$6,1,0)`,
    [saleId, saleItemId, `TRACE-${suffix}-B1`, warehouseA, `TRACE-${suffix}-B2`, warehouseB]);
    const pos = await readPosAllocationTrace(db, 'customer', customerCode, scope as any);
    expect(pos.total).toBe(1);
    expect(pos.rows.map((row: any) => row.batch_no)).toEqual([`TRACE-${suffix}-B1`]);
    await expect(readPosAllocationTrace(db, 'customer', customerCode,
      { ...scope, allowedWarehouseCodes: [] } as any)).resolves.toMatchObject({ rows: [], total: 0 });
  });

  it('limits batch timeline and return evidence to the batch company and authorized warehouse', async () => {
    const batch = `TRACE-${suffix}-TIMELINE`;
    await db.query(`INSERT INTO inv_batches(batch_no,qty,qty_available,warehouse_code,company_code,unit,status)
      VALUES($1,20,20,$2,$3,'枚','AVAILABLE')`, [batch, warehouseA, companyA]);
    await db.query(`INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,unit,ref_no,note,change_type,qty_change)
      VALUES($1,$2,$3,'枚','TRACE-W1','visible evidence','INBOUND',20),
            ($1,$2,$4,'枚','TRACE-W2','hidden evidence','FIFO_OUT',-2),
            ($1,$5,$4,'枚','TRACE-OTHER-COMPANY','hidden company evidence','SALE_RETURN',2)`,
    [batch, companyA, warehouseA, warehouseB, companyB]);
    const result = await trace.traceByBatch(batch, [companyA], scope as any);
    expect(result).toMatchObject({ found: true, inventory: { ledger: [{ ref_no: 'TRACE-W1' }] }, returns: [] });
    expect(JSON.stringify(result)).not.toContain('TRACE-W2');
    expect(JSON.stringify(result)).not.toContain('TRACE-OTHER-COMPANY');
    await expect(trace.traceByBatch(batch, [companyA], { ...scope, allowedWarehouseCodes: [] } as any))
      .resolves.toEqual({ found: false, entry: 'batch', key: batch });
  });
});
