import { BadRequestException } from '@nestjs/common';
import { BugIntakeService } from './bug-intake.service';
import { BugReportEntity } from './bug-report.entity';

describe('BugIntakeService evidence lifecycle', () => {
  function report() {
    return {
      id: '1',
      bugNo: 'BUG-TEST-0001',
      title: 'test issue',
      description: '',
      severity: 'MEDIUM',
      status: 'IN_PROGRESS',
      priority: 'P2',
      moduleCode: '',
      assigneeUsername: '',
      assigneeName: '',
      repairTaskNo: 'BUGTASK-TEST-0001',
      repairTaskStatus: 'AGENT_RUNNING',
      repairTaskPayload: {
        agentPlan: { selected_agents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'] },
        agentResults: [],
      },
      route: '/test',
      url: '',
      reporterUserId: '',
      reporterUsername: 'tester',
      reporterName: 'Tester',
      roles: [],
      companyCode: '',
      projectCode: '',
      consoleErrors: [],
      failedRequests: [],
      attachments: [],
      clientContext: {},
      resolutionNote: '',
      updatedBy: '',
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BugReportEntity;
  }

  function build() {
    const row = report();
    const repo = {
      findOne: jest.fn(async () => row),
      find: jest.fn(async () => [row]),
      exist: jest.fn(async () => false),
      save: jest.fn(async (value: BugReportEntity) => value),
    };
    const ds = { query: jest.fn(async () => []) };
    return { row, repo, ds, service: new BugIntakeService(repo as never, ds as never) };
  }

  const user = { userId: 1, username: 'admin', name: 'Admin' };
  const meta = { ip: '127.0.0.1', userAgent: 'jest' };

  it('starts triage, routing, and queue approval in one administrator action', async () => {
    const { row, service } = build();
    row.status = 'OPEN';
    row.title = '价格册页面保存时报 HTTP 500';
    row.description = '管理员无法保存价格册，需要修复接口并回归页面。';
    row.route = '/sales/pricing';
    row.repairTaskNo = '';
    row.repairTaskStatus = '';
    row.repairTaskPayload = {};

    await service.startRepairWorkflow(row.bugNo, {
      priority: 'P1',
      moduleCode: 'SALES_PRICING',
      acceptanceCriteria: '价格册可保存，权限校验正确，API 与 Web 验证通过。',
      approvalScope: '允许当前修复计划进入本地队列，发布仍受证据门禁约束。',
    }, user, meta);

    const payload = row.repairTaskPayload as {
      agentPlan: { selected_agents: string[] };
      agentExecutionApproval: { approved: boolean; approvedBy: string };
      agentResults: unknown[];
    };
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.repairTaskStatus).toBe('AGENT_APPROVED');
    expect(row.repairTaskNo).toMatch(/^BUGTASK-/);
    expect(payload.agentPlan.selected_agents).toEqual(expect.arrayContaining([
      'A3-Backend-Critical-Path',
      'A4-Frontend-UAT-Smoke',
      'A1-CI-Runtime-Gate',
    ]));
    expect(payload.agentExecutionApproval).toMatchObject({ approved: true, approvedBy: 'admin' });
    expect(payload.agentResults).toEqual([]);
  });

  it('does not approve a HOLD route or an empty Agent plan', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'ROUTED';
    row.repairTaskPayload = {
      agentPlan: { route_decision: 'HOLD', selected_agents: [] },
    };

    await expect(service.approveAgentExecution(row.bugNo, {}, user, meta))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(row.repairTaskStatus).toBe('ROUTED');
  });

  it('moves an all-terminal plan to HOLD when implementation evidence is missing', async () => {
    const { row, service } = build();
    await service.recordAgentResult(row.bugNo, {
      taskId: 'A3', agent: 'A3-Backend-Critical-Path', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { evidenceGate: { passed: false, role: 'implementation' } },
    }, user, meta);
    await service.recordAgentResult(row.bugNo, {
      taskId: 'A1', agent: 'A1-CI-Runtime-Gate', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { evidenceGate: { passed: true, role: 'validation' } },
    }, user, meta);

    expect(row.repairTaskStatus).toBe('HOLD');
    expect(row.resolutionNote).toContain('修复证据不完整');
  });

  it('requires implementation plus A1 evidence, then release lifecycle, before UAT', async () => {
    const { row, service } = build();
    await service.recordAgentResult(row.bugNo, {
      taskId: 'A3', agent: 'A3-Backend-Critical-Path', conclusion: 'PASS_WITH_CONDITIONS',
      commitHash: 'abc123', changedFiles: ['apps/api/src/x.ts'],
      validationResults: { evidenceGate: { passed: true, role: 'implementation' } },
    }, user, meta);
    await service.recordAgentResult(row.bugNo, {
      taskId: 'A1', agent: 'A1-CI-Runtime-Gate', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { evidenceGate: { passed: true, role: 'validation' } },
    }, user, meta);
    expect(row.repairTaskStatus).toBe('AGENT_EXECUTION_FINISHED');

    await service.recordAgentResult(row.bugNo, {
      taskId: 'RUNNER', agent: 'BugIntakeLocalRunner', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { releaseEvidence: 'PASS', push: 'PASS', ci: 'PASS', productionSmoke: 'PASS' },
    }, user, meta);
    expect(row.repairTaskStatus).toBe('FIX_READY_FOR_UAT');
    expect(row.status).toBe('IN_PROGRESS');
  });

  it('preserves results from different Agents that share one business task id', async () => {
    const { row, service } = build();
    const sharedTaskId = 'BUGTASK-TEST-0001';

    await service.recordAgentResult(row.bugNo, {
      taskId: sharedTaskId,
      agent: 'A3-Backend-Critical-Path',
      conclusion: 'PASS_WITH_CONDITIONS',
      commitHash: 'abc123',
      changedFiles: ['apps/api/src/x.ts'],
      validationResults: { evidenceGate: { passed: true, role: 'implementation' } },
    }, user, meta);
    await service.recordAgentResult(row.bugNo, {
      taskId: sharedTaskId,
      agent: 'A1-CI-Runtime-Gate',
      conclusion: 'PASS',
      validationResults: { evidenceGate: { passed: true, role: 'validation' } },
    }, user, meta);

    const payload = row.repairTaskPayload as Record<string, any>;
    expect(payload.agentResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: sharedTaskId, agent: 'A3-Backend-Critical-Path' }),
      expect.objectContaining({ taskId: sharedTaskId, agent: 'A1-CI-Runtime-Gate' }),
    ]));
    expect(row.repairTaskStatus).toBe('AGENT_EXECUTION_FINISHED');
  });

  it('accepts release evidence when persisted status lags behind complete Agent evidence', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'AGENT_RUNNING';
    row.repairTaskPayload = {
      agentPlan: { selected_agents: ['A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'] },
      agentResults: [
        {
          taskId: 'A4', agent: 'A4-Frontend-UAT-Smoke', conclusion: 'PASS_WITH_CONDITIONS',
          commitHash: 'abc123', changedFiles: ['apps/web/src/x.ts'],
          validationResults: { evidenceGate: { passed: true, role: 'implementation' } },
        },
        {
          taskId: 'A1', agent: 'A1-CI-Runtime-Gate', conclusion: 'PASS_WITH_CONDITIONS',
          validationResults: { evidenceGate: { passed: true, role: 'validation' } },
        },
      ],
    };

    await service.recordAgentResult(row.bugNo, {
      taskId: 'RUNNER-LATE-STATUS', agent: 'BugIntakeLocalRunner', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { releaseEvidence: 'PASS', push: 'PASS', ci: 'PASS', productionSmoke: 'PASS' },
    }, user, meta);

    expect(row.repairTaskStatus).toBe('FIX_READY_FOR_UAT');
    expect(row.resolutionNote).toContain('等待管理员执行业务验收');
  });

  it('accepts an idempotent Agent rerun that verifies an implementation already in the current baseline', async () => {
    const { row, service } = build();
    await service.recordAgentResult(row.bugNo, {
      taskId: 'A3-RERUN', agent: 'A3-Backend-Critical-Path', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: {
        evidenceGate: { passed: true, role: 'implementation_verified_existing' },
      },
    }, user, meta);
    await service.recordAgentResult(row.bugNo, {
      taskId: 'A1-RERUN', agent: 'A1-CI-Runtime-Gate', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { evidenceGate: { passed: true, role: 'validation' } },
    }, user, meta);

    expect(row.repairTaskStatus).toBe('AGENT_EXECUTION_FINISHED');
    expect(row.resolutionNote).toContain('Agent 执行证据已齐全');
  });

  it('returns a compact administrator repair result after release validation succeeds', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'FIX_READY_FOR_UAT';
    row.resolutionNote = '等待管理员按原问题路径复验。';
    row.repairTaskPayload = {
      agentPlan: { selected_agents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'] },
      agentResults: [
        {
          taskId: 'A3', agent: 'A3-Backend-Critical-Path', conclusion: 'PASS_WITH_CONDITIONS',
          commitHash: 'abc123', changedFiles: ['apps/api/src/x.ts'], recordedAt: '2026-07-13T08:00:00.000Z',
          validationResults: { evidenceGate: { passed: true, role: 'implementation' } },
        },
        {
          taskId: 'A1', agent: 'A1-CI-Runtime-Gate', conclusion: 'PASS_WITH_CONDITIONS',
          validationResults: { evidenceGate: { passed: true, role: 'validation' } },
        },
        {
          taskId: 'RUNNER', agent: 'BugIntakeLocalRunner', conclusion: 'PASS_WITH_CONDITIONS',
          commitHash: 'abc123', recordedAt: '2026-07-13T08:05:00.000Z',
          validationResults: { releaseEvidence: 'PASS', push: 'PASS', ci: 'PASS', productionSmoke: 'PASS' },
        },
      ],
    };

    const detail = await service.detail(row.bugNo) as any;

    expect(detail.repairResult).toMatchObject({
      visibility: 'READY_FOR_UAT',
      conclusion: 'GO_WITH_CONDITIONS',
      readyForUat: true,
      businessVerified: false,
      commitHash: 'abc123',
      completedAt: '2026-07-13T08:05:00.000Z',
    });
    expect(detail.repairResult.changedFiles).toEqual(['apps/api/src/x.ts']);
    expect(detail.repairResult.validations).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'implementation', status: 'PASS' }),
      expect.objectContaining({ key: 'ci', status: 'PASS' }),
      expect.objectContaining({ key: 'productionSmoke', status: 'PASS' }),
    ]));
  });

  it('deduplicates runner lifecycle receipts and accepts verified existing implementation evidence', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'AGENT_EXECUTION_FINISHED';
    row.repairTaskPayload = {
      agentPlan: { selected_agents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'] },
      agentResults: [
        {
          taskId: 'A3', agent: 'A3-Backend-Critical-Path', conclusion: 'PASS_WITH_CONDITIONS',
          validationResults: { evidenceGate: { passed: true, role: 'implementation_verified_existing' } },
        },
        {
          taskId: 'A1', agent: 'A1-CI-Runtime-Gate', conclusion: 'PASS_WITH_CONDITIONS',
          validationResults: { evidenceGate: { passed: true, role: 'validation' } },
        },
        {
          taskId: 'OLD-RUNNER', agent: 'BugIntakeLocalRunner', conclusion: 'HOLD',
          validationResults: { releaseEvidence: 'HOLD' },
        },
      ],
    };

    await service.recordAgentResult(row.bugNo, {
      taskId: 'NEW-RUNNER', agent: 'BugIntakeLocalRunner', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { releaseEvidence: 'PASS', push: 'PASS', ci: 'PASS', productionSmoke: 'PASS' },
    }, user, meta);

    const payload = row.repairTaskPayload as Record<string, any>;
    expect(payload.agentResults.filter((item: any) => item.agent === 'BugIntakeLocalRunner')).toHaveLength(1);
    expect(row.repairTaskStatus).toBe('FIX_READY_FOR_UAT');
    const detail = await service.detail(row.bugNo) as any;
    expect(detail.repairResult.validations).toContainEqual({ key: 'implementation', label: '代码修复', status: 'PASS' });
  });

  it('keeps FIX_READY_FOR_UAT when a later successful runner receipt repeats release verification', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'FIX_READY_FOR_UAT';
    row.resolutionNote = '实现证据、CI/CD 与生产路由 smoke 已通过，等待管理员业务验收。';
    row.repairTaskPayload = {
      agentPlan: { selected_agents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'] },
      agentResults: [
        {
          taskId: 'A3', agent: 'A3-Backend-Critical-Path', conclusion: 'PASS_WITH_CONDITIONS',
          commitHash: 'abc123', changedFiles: ['apps/api/src/x.ts'],
          validationResults: { evidenceGate: { passed: true, role: 'implementation' } },
        },
        {
          taskId: 'A1', agent: 'A1-CI-Runtime-Gate', conclusion: 'PASS_WITH_CONDITIONS',
          validationResults: { evidenceGate: { passed: true, role: 'validation' } },
        },
        {
          taskId: 'RUNNER-1', agent: 'BugIntakeLocalRunner', conclusion: 'PASS_WITH_CONDITIONS',
          validationResults: { releaseEvidence: 'PASS', push: 'PASS', ci: 'PASS', productionSmoke: 'PASS' },
        },
      ],
    };

    await service.recordAgentResult(row.bugNo, {
      taskId: 'RUNNER-2', agent: 'BugIntakeLocalRunner', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { releaseEvidence: 'PASS', push: 'PASS', ci: 'PASS', productionSmoke: 'PASS' },
    }, user, meta);

    const payload = row.repairTaskPayload as Record<string, any>;
    expect(row.repairTaskStatus).toBe('FIX_READY_FOR_UAT');
    expect(row.resolutionNote).toContain('等待管理员执行业务验收');
    expect(payload.agentResults.filter((item: any) => item.agent === 'BugIntakeLocalRunner')).toHaveLength(1);
  });

  it('does not revoke FIX_READY_FOR_UAT when an unrelated later release attempt fails', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'FIX_READY_FOR_UAT';
    row.status = 'IN_PROGRESS';
    row.resolutionNote = '等待管理员业务验收。';
    row.repairTaskPayload = {
      agentPlan: { selected_agents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'] },
      agentResults: [
        {
          taskId: 'A3', agent: 'A3-Backend-Critical-Path', conclusion: 'PASS_WITH_CONDITIONS',
          commitHash: 'abc123', changedFiles: ['apps/api/src/x.ts'],
          validationResults: { evidenceGate: { passed: true, role: 'implementation' } },
        },
        {
          taskId: 'A1', agent: 'A1-CI-Runtime-Gate', conclusion: 'PASS_WITH_CONDITIONS',
          validationResults: { evidenceGate: { passed: true, role: 'validation' } },
        },
      ],
    };

    await service.recordAgentResult(row.bugNo, {
      taskId: 'RUNNER-LATER-FAILURE', agent: 'BugIntakeLocalRunner', conclusion: 'HOLD',
      validationResults: { releaseEvidence: 'PASS', push: 'HOLD', ci: 'HOLD', productionSmoke: 'HOLD' },
    }, user, meta);

    expect(row.repairTaskStatus).toBe('FIX_READY_FOR_UAT');
    expect(row.resolutionNote).toContain('不会撤销已完成修复');
  });

  it('does not present a HOLD repair task as successfully completed', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'HOLD';
    row.resolutionNote = '实现证据不足，需要重新派发。';

    const detail = await service.detail(row.bugNo) as any;

    expect(detail.repairResult).toMatchObject({
      visibility: 'HOLD',
      conclusion: 'HOLD',
      readyForUat: false,
      businessVerified: false,
    });
    expect(detail.repairResult.adminSummary).toContain('实现证据不足');
    expect(detail.repairResult.validations.every((item: any) => item.status !== 'PASS')).toBe(true);
  });

  it('rejects runner lifecycle PASS when implementation evidence is not ready', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'AGENT_APPROVED';

    await service.recordAgentResult(row.bugNo, {
      taskId: 'RUNNER-BYPASS', agent: 'BugIntakeLocalRunner', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { releaseEvidence: 'PASS', push: 'PASS', ci: 'PASS', productionSmoke: 'PASS' },
    }, user, meta);

    expect(row.repairTaskStatus).toBe('HOLD');
    expect(row.resolutionNote).toContain('selected Agent result is missing');
  });

  it('accepts strict runner release evidence when a refined task generation differs from the original agent plan', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'AGENT_RUNNING';
    row.repairTaskPayload = {
      agentPlan: {
        selected_agents: ['A3-Backend-Critical-Path', 'A4-Frontend-UAT-Smoke', 'A1-CI-Runtime-Gate'],
      },
      redispatchCount: 2,
      agentResults: [
        {
          taskId: 'CURRENT-A3',
          agent: 'A3-Backend-Critical-Path',
          conclusion: 'PASS_WITH_CONDITIONS',
          redispatchCount: 2,
          validationResults: {
            evidenceGate: { passed: true, role: 'implementation_verified_existing' },
          },
        },
        {
          taskId: 'CURRENT-A1',
          agent: 'A1-CI-Runtime-Gate',
          conclusion: 'PASS_WITH_CONDITIONS',
          redispatchCount: 2,
          validationResults: {
            evidenceGate: { passed: true, role: 'validation' },
          },
        },
      ],
    };

    await service.recordAgentResult(row.bugNo, {
      taskId: 'RUNNER-REFINED-RELEASE',
      agent: 'BugIntakeLocalRunner',
      conclusion: 'PASS_WITH_CONDITIONS',
      commitHash: 'release123',
      changedFiles: ['apps/web/src/lib/workflow-todos.test.ts'],
      validationResults: {
        releaseEvidence: 'PASS',
        push: 'PASS',
        ci: 'PASS',
        productionSmoke: 'PASS',
        releaseEvidenceDetail: {
          passed: true,
          decision: 'RELEASE_EVIDENCE_READY',
          selectedAgents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'],
          missingAgents: [],
          unfinishedTasks: [],
          failedTasks: [],
          implementationTasks: ['CURRENT-A3'],
          validationTasks: ['CURRENT-A1'],
          changedFiles: ['apps/web/src/lib/workflow-todos.test.ts'],
          commitHashes: ['implementation123'],
        },
      },
    }, user, meta);

    expect(row.repairTaskStatus).toBe('FIX_READY_FOR_UAT');
    expect(row.resolutionNote).toContain('等待管理员执行业务验收');
  });

  it('isolates redispatch evidence so prior agent results cannot cause false completion', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'HOLD';
    row.repairTaskPayload = {
      agentPlan: { selected_agents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'], route_decision: 'PLAN_READY' },
      agentResults: [
        {
          taskId: 'OLD-A3', agent: 'A3-Backend-Critical-Path', conclusion: 'PASS_WITH_CONDITIONS',
          commitHash: 'abc123', changedFiles: ['apps/api/src/old.ts'],
          validationResults: { evidenceGate: { passed: true, role: 'implementation' } },
        },
        {
          taskId: 'OLD-A1', agent: 'A1-CI-Runtime-Gate', conclusion: 'PASS_WITH_CONDITIONS',
          validationResults: { evidenceGate: { passed: true, role: 'validation' } },
        },
      ],
    };

    await service.redispatchRepairTask(row.bugNo, {
      mode: 'REQUEUE',
      selectedAgents: ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate'],
    }, user, meta);
    const payload = row.repairTaskPayload as Record<string, any>;
    expect(payload.agentResults).toEqual([]);
    expect(payload.previousAgentResultsBeforeRedispatch).toHaveLength(2);
    expect(payload.activeRedispatchCount).toBe(1);

    await service.recordAgentResult(row.bugNo, {
      taskId: 'NEW-A1', agent: 'A1-CI-Runtime-Gate', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { evidenceGate: { passed: true, role: 'validation' } },
    }, user, meta);

    expect(row.repairTaskStatus).toBe('AGENT_RUNNING');
  });

  it('blocks direct close until business verification follows FIX_READY_FOR_UAT', async () => {
    const { row, service } = build();
    await expect(service.updateStatus(row.bugNo, { status: 'CLOSED', resolutionNote: 'done' }, user, meta))
      .rejects.toBeInstanceOf(BadRequestException);

    row.repairTaskStatus = 'FIX_READY_FOR_UAT';
    await service.updateStatus(row.bugNo, { status: 'RESOLVED', resolutionNote: '业务路径复测通过' }, user, meta);
    expect(row.repairTaskStatus).toBe('BUSINESS_VERIFIED');
    await expect(service.updateStatus(row.bugNo, { status: 'CLOSED' }, user, meta)).resolves.toBeDefined();
  });

  it('reconciles legacy false completion records to HOLD and reopens contradictory closures', async () => {
    const { row, service } = build();
    row.status = 'CLOSED';
    row.repairTaskStatus = 'AGENT_COMPLETED';
    row.resolutionNote = 'Agent 修复链路已完成，等待管理员/业务验收；验收通过后再关闭。';

    const result = await service.reconcileFalseCompletions(true, user, meta);

    expect(result).toMatchObject({ decision: 'FALSE_COMPLETIONS_RECONCILED', count: 1 });
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.repairTaskStatus).toBe('HOLD');
    expect(row.closedAt).toBeNull();
  });
});
