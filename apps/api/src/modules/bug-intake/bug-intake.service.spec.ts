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
      save: jest.fn(async (value: BugReportEntity) => value),
    };
    const ds = { query: jest.fn(async () => []) };
    return { row, repo, ds, service: new BugIntakeService(repo as never, ds as never) };
  }

  const user = { userId: 1, username: 'admin', name: 'Admin' };
  const meta = { ip: '127.0.0.1', userAgent: 'jest' };

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

  it('rejects runner lifecycle PASS when implementation evidence is not ready', async () => {
    const { row, service } = build();
    row.repairTaskStatus = 'AGENT_APPROVED';

    await service.recordAgentResult(row.bugNo, {
      taskId: 'RUNNER-BYPASS', agent: 'BugIntakeLocalRunner', conclusion: 'PASS_WITH_CONDITIONS',
      validationResults: { releaseEvidence: 'PASS', push: 'PASS', ci: 'PASS', productionSmoke: 'PASS' },
    }, user, meta);

    expect(row.repairTaskStatus).toBe('HOLD');
    expect(row.resolutionNote).toContain('implementation evidence gate is not ready');
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
