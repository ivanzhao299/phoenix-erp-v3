import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { ApprovalEngineService } from './approval-engine.service';
import { WorkflowBizRegistryService } from './workflow-biz-registry.service';
import { WfApprovalRuleEntity } from './entities/wf-approval-rule.entity';
import { WfApprovalRuleStepEntity } from './entities/wf-approval-rule-step.entity';
import { WfApprovalInstanceEntity } from './entities/wf-approval-instance.entity';
import { WfApprovalInstanceStepEntity } from './entities/wf-approval-instance-step.entity';
import { WorkflowNotificationService } from '../workflow/workflow-notification.service';
import { AssignmentResolverService } from '../workflow/assignment-resolver.service';
import { EggInventoryService } from '../sales-v2/services/egg-inventory.service';
import { DeliveryOrdersService } from '../sales-v2/services/delivery-orders.service';
import { ReturnOrdersService } from '../sales-v2/services/return-orders.service';
import { FinanceCreditNoteAdapter } from '../sales-v2/adapters/finance-credit-note.adapter';
import { SalesOrderLifecycleService } from '../sales-v2/services/sales-order-lifecycle.service';

const describePg = process.env.RUN_PG_INTEGRATION === '1' ? describe : describe.skip;

describePg('SALES_ORDER ApprovalEngine + PostgreSQL integration', () => {
  let ds: DataSource;
  let engine: ApprovalEngineService;
  let registry: WorkflowBizRegistryService;
  let runner: QueryRunner;

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres', host: process.env.DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'phoenix_v3', password: process.env.DB_PASSWORD ?? 'phoenix_v3_pass',
      database: process.env.DB_NAME ?? 'phoenix_erp', synchronize: false,
      entities: [WfApprovalRuleEntity, WfApprovalRuleStepEntity, WfApprovalInstanceEntity, WfApprovalInstanceStepEntity],
    });
    await ds.initialize();
    registry = new WorkflowBizRegistryService();
    registry.onModuleInit();
    const cls = { get: jest.fn((key: string) => key === 'user' ? { userId: '1', username: 'pg-approver', roles: ['ROLE_SALES_MGR'] } : undefined), set: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApprovalEngineService,
        { provide: getRepositoryToken(WfApprovalRuleEntity), useValue: ds.getRepository(WfApprovalRuleEntity) },
        { provide: getRepositoryToken(WfApprovalRuleStepEntity), useValue: ds.getRepository(WfApprovalRuleStepEntity) },
        { provide: getRepositoryToken(WfApprovalInstanceEntity), useValue: ds.getRepository(WfApprovalInstanceEntity) },
        { provide: getRepositoryToken(WfApprovalInstanceStepEntity), useValue: ds.getRepository(WfApprovalInstanceStepEntity) },
        { provide: getDataSourceToken(), useValue: { transaction: (fn: any) => fn(runner.manager) } },
        { provide: ClsService, useValue: cls },
        { provide: WorkflowBizRegistryService, useValue: registry },
        { provide: WorkflowNotificationService, useValue: {
          onInstanceCompleted: jest.fn().mockResolvedValue(undefined),
          onInstanceRejected: jest.fn().mockResolvedValue(undefined),
          onTaskCreated: jest.fn().mockResolvedValue(undefined),
        } },
        { provide: AssignmentResolverService, useValue: {} },
      ],
    }).compile();
    engine = moduleRef.get(ApprovalEngineService);
  });

  beforeEach(async () => {
    runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
  });

  afterEach(async () => {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
  });

  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  async function fixture(status = 'PENDING_APPROVAL') {
    const suffix = randomUUID().slice(0, 8);
    const [order] = await runner.manager.query(
      `INSERT INTO sal_sales_orders(order_no,company_code,currency_code,status,total_amount)
       VALUES($1,'PG-IT','LAK',$2,100) RETURNING id,order_no`, [`SO-PG-${suffix}`, status],
    );
    const [instance] = await runner.manager.query(
      `INSERT INTO wf_approval_instances(instance_no,module_code,biz_type,biz_id,biz_no,total_steps,current_step_no,status,trigger_codes,context_snapshot)
       VALUES($1,'MENU_SALES2_ORDER','SALES_ORDER',$2,$3,1,1,'PENDING',ARRAY['BELOW_FLOOR_PRICE'],
              '{"customerCode":"PG-CUSTOMER","totalAmount":100}'::jsonb) RETURNING id`,
      [`WF-PG-${suffix}`, order.id, order.order_no],
    );
    await runner.manager.query(
      `INSERT INTO wf_approval_instance_steps(instance_id,step_no,approver_type,approver_role,status)
       VALUES($1,1,'ROLE','ROLE_SALES_MGR','PENDING')`, [instance.id],
    );
    await runner.manager.query(`UPDATE sal_sales_orders SET wf_instance_id=$1 WHERE id=$2`, [instance.id, order.id]);
    return { order, instance };
  }

  it('approve reserves 5 across two FIFO batches exactly, then finishLoading writes FIFO_OUT', async () => {
    const { order, instance } = await fixture();
    const suffix = randomUUID().slice(0, 8);
    const skuCode = `SKU-PG-${suffix}`;
    const firstBatch = `B-PG-1-${suffix}`;
    const secondBatch = `B-PG-2-${suffix}`;
    const deliveryNo = `DV-PG-${suffix}`;
    await runner.manager.query(
      `INSERT INTO sal_order_items(sales_order_id,product_code,sku_code,qty,unit_price,amount,resolved_unit_price,actual_unit_price)
       VALUES($1,'PG-PRODUCT',$2,5,20,100,20,20)`, [order.id, skuCode],
    );
    await runner.manager.query(
      `INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,qty,qty_available,status,expire_date,legacy_source)
       VALUES($1,'PG-IT','PG-WH','PG-PRODUCT',$3,2,2,'AVAILABLE',CURRENT_DATE + 1,NULL),
             ($2,'PG-IT','PG-WH','PG-PRODUCT',$3,6,6,'AVAILABLE',CURRENT_DATE + 2,NULL)`,
      [firstBatch, secondBatch, skuCode],
    );
    const scopedCls = {
      get: jest.fn((key: string) => key === 'user'
        ? { userId: '1', username: 'pg-approver' }
        : key === 'dataScope' ? { isGlobal: true, allowedCompanyCodes: [] } : undefined),
    };
    const txDataSource = {
      query: (...args: any[]) => runner.manager.query(args[0], args[1]),
      transaction: (fn: any) => fn(runner.manager),
    } as DataSource;
    const inventory = new EggInventoryService(txDataSource, scopedCls as any);
    registry.register('SALES_ORDER', {
      ...registry.get('SALES_ORDER')!,
      onApproved: async (bizId, mgr) => {
        await inventory.reserveInventory(String(bizId), order.order_no, 'PG-IT', mgr);
        await mgr.query(
          `INSERT INTO sal_order_lifecycle_events(event_id,sales_order_id,order_no,event_type,actor_type,source_module)
           VALUES($1,$2,$3,'APPROVED','WORKFLOW','WORKFLOW')`, [randomUUID(), bizId, order.order_no],
        );
      },
    });
    await expect(engine.approveStep(String(instance.id), 'pg integration')).resolves.toMatchObject({ finished: true, approved: true });
    const [state] = await runner.manager.query(
      `SELECT so.status order_status,i.status instance_status,s.status step_status,
              oi.allocated_qty,oi.allocated_batch_no,
              (SELECT jsonb_agg(jsonb_build_object('batch',a.batch_no,'qty',a.reserved_qty) ORDER BY a.batch_no)
                 FROM sal_order_item_batch_allocations a WHERE a.sales_order_item_id=oi.id) allocations,
              (SELECT SUM(qty_available) FROM inv_batches WHERE batch_no IN ($2,$3)) qty_available,
              (SELECT COALESCE(SUM(-qty_change),0) FROM inv_ledger WHERE ref_no=so.order_no AND change_type='RESERVED') reserved_qty,
              (SELECT count(*) FROM sal_order_lifecycle_events e WHERE e.sales_order_id=so.id AND e.event_type='APPROVED') event_count
       FROM sal_sales_orders so JOIN wf_approval_instances i ON i.id=so.wf_instance_id
       JOIN wf_approval_instance_steps s ON s.instance_id=i.id
       JOIN sal_order_items oi ON oi.sales_order_id=so.id WHERE so.id=$1`,
      [order.id, firstBatch, secondBatch],
    );
    expect(state).toMatchObject({
      order_status: 'APPROVED', instance_status: 'APPROVED', step_status: 'APPROVED',
      allocated_qty: '5.00', allocated_batch_no: `${firstBatch},${secondBatch}`,
      qty_available: '3.000', reserved_qty: '5.000', event_count: '1',
    });
    expect(state.allocations).toEqual([
      { batch: firstBatch, qty: 2 },
      { batch: secondBatch, qty: 3 },
    ]);

    const [delivery] = await runner.manager.query(
      `INSERT INTO sal_delivery_orders(delivery_no,company_code,status,total_orders,total_qty)
       VALUES($1,'PG-IT','LOADING',1,5) RETURNING id`, [deliveryNo],
    );
    await runner.manager.query(
      `INSERT INTO sal_delivery_order_items(delivery_order_id,sales_order_id,sales_order_no,planned_qty,status)
       VALUES($1,$2,$3,5,'LOADED')`, [delivery.id, order.id, order.order_no],
    );
    const deliveryService = new DeliveryOrdersService(
      txDataSource, scopedCls as any, inventory, { appendEvent: jest.fn().mockResolvedValue(undefined) } as any,
    );
    await deliveryService.finishLoading(String(delivery.id), {} as any);
    const [outbound] = await runner.manager.query(
      `SELECT (SELECT SUM(qty) FROM inv_batches WHERE batch_no IN ($1,$2)) qty,
              (SELECT COALESCE(SUM(-qty_change),0) FROM inv_ledger WHERE ref_no=$3 AND change_type='FIFO_OUT') fifo_out_qty`,
      [firstBatch, secondBatch, deliveryNo],
    );
    expect(outbound).toMatchObject({ qty: '3.000', fifo_out_qty: '5.000' });
    const allocationState = await runner.manager.query(
      `SELECT batch_no,reserved_qty,outbound_qty,released_qty
         FROM sal_order_item_batch_allocations WHERE sales_order_item_id IN
           (SELECT id FROM sal_order_items WHERE sales_order_id=$1) ORDER BY batch_no`, [order.id],
    );
    expect(allocationState).toEqual([
      expect.objectContaining({ batch_no: firstBatch, reserved_qty: '2.00', outbound_qty: '2.00', released_qty: '0.00' }),
      expect.objectContaining({ batch_no: secondBatch, reserved_qty: '3.00', outbound_qty: '3.00', released_qty: '0.00' }),
    ]);
  });

  it('releases a 4-over-3-batch reservation exactly and idempotently', async () => {
    const { order } = await fixture('APPROVED');
    const suffix = randomUUID().slice(0, 8);
    const skuCode = `SKU-PG-${suffix}`;
    const batches = [`B-PG-A-${suffix}`, `B-PG-B-${suffix}`, `B-PG-C-${suffix}`];
    const [item] = await runner.manager.query(
      `INSERT INTO sal_order_items(sales_order_id,product_code,sku_code,qty,unit_price,amount,resolved_unit_price,actual_unit_price)
       VALUES($1,'PG-PRODUCT',$2,4,25,100,25,25) RETURNING id`, [order.id, skuCode],
    );
    await runner.manager.query(
      `INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,qty,qty_available,status,expire_date,legacy_source)
       VALUES($1,'PG-IT','PG-WH','PG-PRODUCT',$4,1,1,'AVAILABLE',CURRENT_DATE+1,NULL),
             ($2,'PG-IT','PG-WH','PG-PRODUCT',$4,1,1,'AVAILABLE',CURRENT_DATE+2,NULL),
             ($3,'PG-IT','PG-WH','PG-PRODUCT',$4,5,5,'AVAILABLE',CURRENT_DATE+3,NULL)`,
      [...batches, skuCode],
    );
    const txDataSource = { query: (...args: any[]) => runner.manager.query(args[0], args[1]) } as DataSource;
    const inventory = new EggInventoryService(txDataSource, { get: jest.fn() } as any);
    await inventory.reserveInventory(String(order.id), order.order_no, 'PG-IT', runner.manager);
    await inventory.releaseInventory(String(order.id), order.order_no, 'PG-IT', runner.manager);
    await inventory.releaseInventory(String(order.id), order.order_no, 'PG-IT', runner.manager);
    const rows = await runner.manager.query(
      `SELECT batch_no,reserved_qty,outbound_qty,released_qty FROM sal_order_item_batch_allocations
        WHERE sales_order_item_id=$1 ORDER BY batch_no`, [item.id],
    );
    expect(rows).toEqual([
      expect.objectContaining({ batch_no: batches[0], reserved_qty: '1.00', released_qty: '1.00' }),
      expect.objectContaining({ batch_no: batches[1], reserved_qty: '1.00', released_qty: '1.00' }),
      expect.objectContaining({ batch_no: batches[2], reserved_qty: '2.00', released_qty: '2.00' }),
    ]);
    const [totals] = await runner.manager.query(
      `SELECT SUM(qty_available) available,
              (SELECT SUM(qty_change) FROM inv_ledger WHERE ref_no=$2 AND change_type='RELEASED') released,
              (SELECT COUNT(*) FROM sal_order_item_batch_allocation_actions WHERE sales_order_id=$3 AND action_type='RELEASED') actions
         FROM inv_batches WHERE batch_no=ANY($1::text[])`, [batches, order.order_no, order.id],
    );
    expect(totals).toMatchObject({ available: '7.000', released: '4.000', actions: '3' });
  });

  it('serializes concurrent finishLoading and emits one outbound fact', async () => {
    const suffix = randomUUID().slice(0, 8);
    const orderNo = `SO-PG-CON-${suffix}`;
    const deliveryNo = `DV-PG-CON-${suffix}`;
    const batchNo = `B-PG-CON-${suffix}`;
    await runner.commitTransaction();
    const [order] = await ds.query(
      `INSERT INTO sal_sales_orders(order_no,company_code,currency_code,status,total_amount)
       VALUES($1,'PG-IT','LAK','ALLOCATED',100) RETURNING id`, [orderNo],
    );
    const [item] = await ds.query(
      `INSERT INTO sal_order_items(sales_order_id,product_code,qty,unit_price,amount,resolved_unit_price,actual_unit_price,allocated_batch_no,allocated_qty)
       VALUES($1,'PG-PRODUCT',4,25,100,25,25,$2,4) RETURNING id`, [order.id, batchNo],
    );
    await ds.query(
      `INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,qty,qty_available,status,expire_date,legacy_source)
       VALUES($1,'PG-IT','PG-WH','PG-PRODUCT',10,6,'AVAILABLE',CURRENT_DATE+1,NULL)`, [batchNo],
    );
    const [reservationLedger] = await ds.query(
      `INSERT INTO inv_ledger(batch_no,change_type,qty_change,operator,store_code,ref_no,note,company_code)
       VALUES($1,'RESERVED',-4,'PG-TEST','PG-IT',$2,$3,'PG-IT') RETURNING id`,
      [batchNo, orderNo, `FIFO 预占 销售订单 ${orderNo} 明细 ${item.id}`],
    );
    const [allocation] = await ds.query(
      `INSERT INTO sal_order_item_batch_allocations(sales_order_item_id,batch_no,reserved_qty,reservation_ledger_id,created_by)
       VALUES($1,$2,4,$3,'PG-TEST') RETURNING id`, [item.id, batchNo, reservationLedger.id],
    );
    const [delivery] = await ds.query(
      `INSERT INTO sal_delivery_orders(delivery_no,company_code,status,total_orders,total_qty)
       VALUES($1,'PG-IT','LOADING',1,2) RETURNING id`, [deliveryNo],
    );
    await ds.query(
      `INSERT INTO sal_delivery_order_items(delivery_order_id,sales_order_id,sales_order_no,planned_qty,status)
       VALUES($1,$2,$3,2,'LOADED')`, [delivery.id, order.id, orderNo],
    );
    const scopedCls = { get: jest.fn((key: string) => key === 'user'
      ? { userId: '1', username: 'pg-approver' }
      : key === 'dataScope' ? { isGlobal: true, allowedCompanyCodes: [] } : undefined) };
    const inventory = new EggInventoryService(ds, scopedCls as any);
    const service = new DeliveryOrdersService(ds, scopedCls as any, inventory, { appendEvent: jest.fn() } as any);
    try {
      const results = await Promise.allSettled([
        service.finishLoading(String(delivery.id), {} as any),
        service.finishLoading(String(delivery.id), {} as any),
      ]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
      const [state] = await ds.query(
        `SELECT d.status,b.qty,a.outbound_qty,
                (SELECT COUNT(*) FROM inv_ledger WHERE ref_no=$4 AND change_type='FIFO_OUT') ledger_rows,
                (SELECT COUNT(*) FROM sal_order_item_batch_allocation_actions WHERE allocation_id=$3 AND action_type='OUTBOUND') action_rows
           FROM sal_delivery_orders d,inv_batches b,sal_order_item_batch_allocations a
          WHERE d.id=$1 AND b.batch_no=$2 AND a.id=$3`, [delivery.id, batchNo, allocation.id, deliveryNo],
      );
      expect(state).toMatchObject({ status: 'LOADED', qty: '8.000', outbound_qty: '2.00', ledger_rows: '1', action_rows: '1' });
    } finally {
      await ds.query(`DELETE FROM sal_order_item_batch_allocation_actions WHERE allocation_id=$1`, [allocation.id]);
      await ds.query(`DELETE FROM sal_delivery_order_items WHERE delivery_order_id=$1`, [delivery.id]);
      await ds.query(`DELETE FROM sal_delivery_orders WHERE id=$1`, [delivery.id]);
      await ds.query(`DELETE FROM sal_order_item_batch_allocations WHERE id=$1`, [allocation.id]);
      await ds.query(`DELETE FROM inv_ledger WHERE ref_no IN ($1,$2)`, [deliveryNo, orderNo]);
      await ds.query(`DELETE FROM sal_order_items WHERE id=$1`, [item.id]);
      await ds.query(`DELETE FROM sal_sales_orders WHERE id=$1`, [order.id]);
      await ds.query(`DELETE FROM inv_batches WHERE batch_no=$1`, [batchNo]);
    }
  });

  it('instance cancellation closes the order and pending steps; late approval is rejected', async () => {
    const { order, instance } = await fixture();
    await engine.cancelInstance(String(instance.id));
    const [state] = await runner.manager.query(
      `SELECT so.status order_status,i.status instance_status,s.status step_status
       FROM sal_sales_orders so JOIN wf_approval_instances i ON i.id=so.wf_instance_id
       JOIN wf_approval_instance_steps s ON s.instance_id=i.id WHERE so.id=$1`, [order.id],
    );
    expect(state).toMatchObject({ order_status: 'CANCELLED', instance_status: 'CANCELLED', step_status: 'CANCELLED' });
    await expect(engine.approveStep(String(instance.id))).rejects.toThrow('审批实例已结束');
  });

  it('restocks every inspected return item into the explicit quarantine target atomically and rejects retries', async () => {
    const suffix = randomUUID().slice(0, 8);
    const warehouse = `PG-RET-WH-${suffix}`;
    const zone = `PG-RET-Z-${suffix}`;
    const location = `PG-RET-L-${suffix}`;
    const returnNo = `RET-PG-${suffix}`;
    await runner.manager.query(
      `INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,status,domain) VALUES($1,$1,'PG-IT','ACTIVE','OPERATIONAL')`,
      [warehouse],
    );
    await runner.manager.query(
      `INSERT INTO wms_zones(zone_code,zone_name,warehouse_code,status) VALUES($1,'QUARANTINE',$2,'ACTIVE')`,
      [zone, warehouse],
    );
    await runner.manager.query(
      `INSERT INTO wms_locations(location_code,warehouse_code,zone_code,location_name,status) VALUES($1,$2,$3,'QUARANTINE','ACTIVE')`,
      [location, warehouse, zone],
    );
    const [ret] = await runner.manager.query(
      `INSERT INTO sal_return_orders(return_no,company_code,return_type,currency_code,subtotal,status,need_approval,created_by)
       VALUES($1,'PG-IT','CUSTOMER_RETURN','LAK',0,'RESTOCKING',false,'PG-TEST') RETURNING id`, [returnNo],
    );
    const [item] = await runner.manager.query(
      `INSERT INTO sal_return_items(return_order_id,product_code,returned_qty,accepted_qty,damaged_qty,unit_price,amount,inspection_result,restock_status)
       VALUES($1,'PG-RETURN-PRODUCT',3,2,1,0,0,'PARTIAL','PENDING') RETURNING id`, [ret.id],
    );
    const txDataSource = {
      query: (...args: any[]) => runner.manager.query(args[0], args[1]),
      transaction: (fn: any) => fn(runner.manager),
    } as DataSource;
    const scopedCls = { get: jest.fn((key: string) => key === 'user'
      ? { userId: '1', username: 'pg-approver' }
      : key === 'dataScope' ? { isGlobal: true, allowedWarehouseCodes: [], allowedCompanyCodes: [] } : undefined) };
    const inventory = new EggInventoryService(txDataSource, scopedCls as any);
    const service = new ReturnOrdersService(
      txDataSource, scopedCls as any, {} as any, new FinanceCreditNoteAdapter(txDataSource),
      inventory, new SalesOrderLifecycleService(txDataSource),
    );
    const target = { targetWarehouseCode: warehouse, targetZoneCode: zone, targetLocationCode: location };
    await service.completeRestock(String(ret.id), target);
    const [state] = await runner.manager.query(
      `SELECT r.status,r.target_warehouse_code,r.target_zone_code,r.target_location_code,i.restock_status,
              b.qty,b.warehouse_code,b.location_code,
              (SELECT COUNT(*) FROM inv_ledger WHERE ref_no=$2 AND change_type='SALE_RETURN') return_ledger,
              (SELECT COUNT(*) FROM inv_ledger WHERE ref_no=$2 AND change_type='DAMAGE_WRITEOFF') damage_ledger
       FROM sal_return_orders r JOIN sal_return_items i ON i.return_order_id=r.id
       JOIN inv_batches b ON b.batch_no=$3 WHERE r.id=$1`,
      [ret.id, returnNo, `RET-${returnNo}-${item.id}`],
    );
    expect(state).toMatchObject({
      status: 'COMPLETED', target_warehouse_code: warehouse, target_zone_code: zone,
      target_location_code: location, restock_status: 'RESTOCKED_WITH_WRITEOFF', qty: '2.000',
      warehouse_code: warehouse, location_code: location, return_ledger: '1', damage_ledger: '1',
    });
    await expect(service.completeRestock(String(ret.id), target)).rejects.toThrow('不可重复回库');
  });

  it('reject commits the SALES_ORDER CAS and append-only lifecycle event', async () => {
    const { order, instance } = await fixture();
    registry.register('SALES_ORDER', {
      ...registry.get('SALES_ORDER')!,
      onRejected: async (bizId, mgr) => {
        await mgr.query(
          `INSERT INTO sal_order_lifecycle_events(event_id,sales_order_id,order_no,event_type,actor_type,source_module)
           VALUES($1,$2,$3,'REJECTED','WORKFLOW','WORKFLOW')`, [randomUUID(), bizId, order.order_no],
        );
      },
    });
    await engine.rejectStep(String(instance.id), 'pg rejection');
    const [state] = await runner.manager.query(
      `SELECT so.status order_status,i.status instance_status,s.status step_status,
              (SELECT count(*) FROM sal_order_lifecycle_events e WHERE e.sales_order_id=so.id AND e.event_type='REJECTED') event_count
       FROM sal_sales_orders so JOIN wf_approval_instances i ON i.id=so.wf_instance_id
       JOIN wf_approval_instance_steps s ON s.instance_id=i.id WHERE so.id=$1`, [order.id],
    );
    expect(state).toMatchObject({ order_status: 'REJECTED', instance_status: 'REJECTED', step_status: 'REJECTED', event_count: '1' });
  });
});
