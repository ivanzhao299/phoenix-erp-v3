import { WorkflowService } from './workflow.service';

describe('WorkflowService listMyTasks', () => {
  const buildService = (rows: any[], dataScope?: any) => {
    const em = {
      query: jest.fn().mockResolvedValue(rows),
    };
    const conditionEngine = {};
    const cls = {
      get: jest.fn((key: string) => key === 'dataScope' ? dataScope : undefined),
    };
    return {
      em,
      svc: new WorkflowService(em as never, conditionEngine as never, cls as never),
    };
  };

  it('keeps total aligned with the filtered unified todo rows', async () => {
    const { svc } = buildService([
      {
        task_source: 'APPROVAL_ENGINE',
        task_id: '11',
        instance_id: '101',
        instance_no: 'AE-101',
        biz_type: 'PR',
        biz_id: '1001',
        biz_no: 'PR2-20260707-00002',
        subject: '采购测试2',
        amount: '80',
        currency_code: 'CNY',
        company_name: '老挝凤凰农业发展有限公司',
        required_role: null,
        step_no: 1,
        total_steps: 1,
        current_step_no: 1,
        status: 'PENDING',
        created_at: '2026-07-07T08:45:00.000Z',
      },
      {
        task_source: 'WORKFLOW_ENGINE',
        task_id: '12',
        instance_id: '102',
        instance_no: 'WF-102',
        biz_type: 'PO',
        biz_id: '1002',
        subject: '采购订单',
        status: 'TODO',
        created_at: '2026-07-07T08:40:00.000Z',
      },
    ]);

    const result = await svc.listMyTasks(
      { userId: 1, roles: ['ROLE_MASTER_DATA_APPROVER'] },
      { page: 1, pageSize: 1 },
    );

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      taskSource: 'APPROVAL_ENGINE',
      bizNo: 'PR2-20260707-00002',
      amount: 80,
    });
  });

  it('applies biz type filtering before computing total', async () => {
    const { svc } = buildService([
      { task_source: 'APPROVAL_ENGINE', task_id: '11', instance_id: '101', biz_type: 'PR', biz_id: '1001', status: 'PENDING' },
      { task_source: 'WORKFLOW_ENGINE', task_id: '12', instance_id: '102', biz_type: 'PO', biz_id: '1002', status: 'TODO' },
    ]);

    const result = await svc.listMyTasks(
      { userId: 1, roles: ['ROLE_MASTER_DATA_APPROVER'] },
      { page: 1, pageSize: 20, bizType: 'PR' },
    );

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].bizType).toBe('PR');
  });

  it('counts the captured BUG-20260707-0010 approval todo as one visible task', async () => {
    const { svc } = buildService([
      {
        task_source: 'APPROVAL_ENGINE',
        task_id: '11',
        instance_id: '101',
        instance_no: 'AE-101',
        biz_type: 'PR',
        biz_id: '1001',
        biz_no: 'PR2-20260707-00002',
        subject: '采购测试2',
        amount: '80',
        currency_code: 'CNY',
        company_name: '老挝凤凰农业发展有限公司',
        project_code: 'PRJ_MENGSAI_LAYER',
        required_role: null,
        step_no: 1,
        total_steps: 1,
        current_step_no: 1,
        status: 'PENDING',
        created_at: '2026-07-07T08:45:00.000Z',
      },
    ]);

    const result = await svc.listMyTasks(
      { userId: 1, roles: ['ROLE_ADMIN', 'ROLE_MASTER_DATA_APPROVER'] },
      { page: 1, pageSize: 20, taskSource: 'APPROVAL_ENGINE' },
    );

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      taskSource: 'APPROVAL_ENGINE',
      bizType: 'PR',
      bizNo: 'PR2-20260707-00002',
      subject: '采购测试2',
      currentStepNo: 1,
      totalSteps: 1,
    });
  });

  it('keeps BUG-20260709-0004 approval todo total non-zero when the row is visible', async () => {
    const { svc } = buildService([
      {
        task_source: 'APPROVAL_ENGINE',
        task_id: '1783585535582',
        instance_id: '101',
        instance_no: 'AE-101',
        biz_type: 'PR',
        biz_id: '1001',
        biz_no: 'PR2-20260707-00002',
        subject: '采购测试2',
        amount: '80',
        currency_code: 'CNY',
        company_code: 'PHOENIX_LAOS',
        company_name: '老挝凤凰农业发展有限公司',
        project_code: 'PRJ_MENGSAI_LAYER',
        required_role: null,
        step_no: 1,
        total_steps: 1,
        current_step_no: 1,
        status: 'PENDING',
        created_at: '2026-07-07T08:45:00.000Z',
      },
    ]);

    const result = await svc.listMyTasks(
      { userId: 1, roles: ['ROLE_ADMIN', 'ROLE_MASTER_DATA_APPROVER'] },
      { page: 1, pageSize: 20, taskSource: 'APPROVAL_ENGINE' },
    );

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(result.items.length);
    expect(result.items[0]).toMatchObject({
      taskSource: 'APPROVAL_ENGINE',
      bizNo: 'PR2-20260707-00002',
      subject: '采购测试2',
      amount: 80,
    });
  });

  it('preserves approval todo DataScope parameters', async () => {
    const { em, svc } = buildService([], {
      isGlobal: false,
      allowedCompanyCodes: ['COMPANY_LAOS'],
    });

    await svc.listMyTasks(
      { userId: 1, roles: ['ROLE_MASTER_DATA_APPROVER'] },
      { page: 1, pageSize: 20, taskSource: 'APPROVAL_ENGINE' },
    );

    expect(em.query).toHaveBeenCalledTimes(1);
    expect(em.query.mock.calls[0][1]).toEqual([
      1,
      ['ROLE_MASTER_DATA_APPROVER'],
      ['COMPANY_LAOS'],
    ]);
    expect(em.query.mock.calls[0][0]).toContain('i.company_code = ANY($3::varchar[])');
  });
});
