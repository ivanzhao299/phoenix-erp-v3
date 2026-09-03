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

  afterEach(async () => { await runner.rollbackTransaction(); await runner.release(); });

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

  it('approve reserves two FIFO batches atomically, then finishLoading writes FIFO_OUT', async () => {
    const { order, instance } = await fixture();
    const suffix = randomUUID().slice(0, 8);
    const skuCode = `SKU-PG-${suffix}`;
    const firstBatch = `B-PG-1-${suffix}`;
    const secondBatch = `B-PG-2-${suffix}`;
    const deliveryNo = `DV-PG-${suffix}`;
    await runner.manager.query(
      `INSERT INTO sal_order_items(sales_order_id,product_code,sku_code,qty,unit_price,amount,resolved_unit_price,actual_unit_price)
       VALUES($1,'PG-PRODUCT',$2,4,25,100,25,25)`, [order.id, skuCode],
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
      allocated_qty: '4.00', allocated_batch_no: `${firstBatch},${secondBatch}`,
      qty_available: '4.000', reserved_qty: '4.000', event_count: '1',
    });

    const [delivery] = await runner.manager.query(
      `INSERT INTO sal_delivery_orders(delivery_no,company_code,status,total_orders,total_qty)
       VALUES($1,'PG-IT','LOADING',1,4) RETURNING id`, [deliveryNo],
    );
    await runner.manager.query(
      `INSERT INTO sal_delivery_order_items(delivery_order_id,sales_order_id,sales_order_no,planned_qty,status)
       VALUES($1,$2,$3,4,'LOADED')`, [delivery.id, order.id, order.order_no],
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
    expect(outbound).toMatchObject({ qty: '4.000', fifo_out_qty: '4.000' });
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
