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

  it('approve commits instance + order + lifecycle + inventory callback atomically', async () => {
    const { order, instance } = await fixture();
    const batchNo = `B-PG-${randomUUID().slice(0, 8)}`;
    await runner.manager.query(`INSERT INTO inv_batches(batch_no,company_code,product_code,qty,qty_available,status) VALUES($1,'PG-IT','PG-SKU',10,10,'AVAILABLE')`, [batchNo]);
    registry.register('SALES_ORDER', {
      ...registry.get('SALES_ORDER')!,
      onApproved: async (bizId, mgr) => {
        await mgr.query(`UPDATE inv_batches SET qty_available=qty_available-1 WHERE batch_no=$1`, [batchNo]);
        await mgr.query(
          `INSERT INTO sal_order_lifecycle_events(event_id,sales_order_id,order_no,event_type,actor_type,source_module)
           VALUES($1,$2,$3,'APPROVED','WORKFLOW','WORKFLOW')`, [randomUUID(), bizId, order.order_no],
        );
      },
    });
    await expect(engine.approveStep(String(instance.id), 'pg integration')).resolves.toMatchObject({ finished: true, approved: true });
    const [state] = await runner.manager.query(
      `SELECT so.status order_status,i.status instance_status,s.status step_status,b.qty_available,
              (SELECT count(*) FROM sal_order_lifecycle_events e WHERE e.sales_order_id=so.id AND e.event_type='APPROVED') event_count
       FROM sal_sales_orders so JOIN wf_approval_instances i ON i.id=so.wf_instance_id
       JOIN wf_approval_instance_steps s ON s.instance_id=i.id JOIN inv_batches b ON b.batch_no=$2 WHERE so.id=$1`,
      [order.id, batchNo],
    );
    expect(state).toMatchObject({ order_status: 'APPROVED', instance_status: 'APPROVED', step_status: 'APPROVED', qty_available: '9.000', event_count: '1' });
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
