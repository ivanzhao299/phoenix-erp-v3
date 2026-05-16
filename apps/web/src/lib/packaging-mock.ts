/**
 * packaging-mock.ts — Terminal 作业台 Mock 数据服务
 * Phase 1/2 阶段用于替代真实 API，通过 USE_MOCK 环境变量控制
 */
import type {
  WorkShift, SourceBatch, GradingBatch, ExceptionTicket, QCInspection
} from '@/types/packaging-terminal';

// NODE_ENV is statically inlined by Turbopack/webpack and never needs a runtime process polyfill
export const USE_MOCK = process.env.NODE_ENV === 'development';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

// ─── Mock 班次 ────────────────────────────────────────────────────
export const MOCK_SHIFT: WorkShift = {
  id: 'shift-20260516-001',
  code: 'SH-20260516-A',
  productionDate: '2026-05-16',
  siteId: 'site-01',
  siteName: '凤凰一场',
  lineId: 'line-01',
  lineName: '1号包装线',
  operatorIds: ['op-001', 'op-002'],
  operatorNames: ['张三', '李四'],
  supervisorId: 'sup-001',
  supervisorName: '王班长',
  terminalId: 'T-001',
  status: 'OPEN',
  openedAt: '2026-05-16T07:00:00Z',
};

// ─── Mock 来源批次 ────────────────────────────────────────────────
export const MOCK_SOURCE_BATCHES: SourceBatch[] = [
  {
    id: 'sb-001',
    code: 'SB-20260516-001',
    siteId: 'site-01', siteName: '凤凰一场',
    houseId: 'house-03', houseName: '3号鸡舍',
    flockId: 'flock-05', flockName: '鸡群05批',
    layDate: '2026-05-16',
    collectionTime: '06:30',
    expectedQty: 8640,
    receivedQty: 8600,
    expectedWeight: 518.4,
    receivedWeight: 516.0,
    containerCount: 24,
    status: 'QC_PASSED',
    qcResult: 'PASSED',
    createdAt: '2026-05-16T06:30:00Z',
  },
  {
    id: 'sb-002',
    code: 'SB-20260516-002',
    siteId: 'site-01', siteName: '凤凰一场',
    houseId: 'house-01', houseName: '1号鸡舍',
    flockId: 'flock-03', flockName: '鸡群03批',
    layDate: '2026-05-16',
    collectionTime: '07:00',
    expectedQty: 10080,
    status: 'PENDING_RECEIVE',
    createdAt: '2026-05-16T07:00:00Z',
  },
];

// ─── Mock 分级批次 ────────────────────────────────────────────────
export const MOCK_GRADING_BATCH: GradingBatch = {
  id: 'gb-001',
  code: 'GB-20260516-001',
  sourceBatchId: 'sb-001',
  lineId: 'line-01',
  shiftId: 'shift-20260516-001',
  gradingRuleVersion: 'v2.1',
  inputQty: 8600,
  inputWeight: 516.0,
  outputs: [
    { grade: 'GRADE_1',  qty: 2800, weight: 196.0 },
    { grade: 'GRADE_2', qty: 3200, weight: 192.0 },
    { grade: 'GRADE_3',  qty: 1600, weight: 88.0 },
    { grade: 'GRADE_4',  qty: 600,  weight: 30.0 },
    { grade: 'DIRTY',    qty: 200,  weight: 10.0 },
    { grade: 'BROKEN',   qty: 200,  weight: 0 },
  ],
  status: 'GRADING_COMPLETED',
  startedAt: '2026-05-16T07:30:00Z',
  finishedAt: '2026-05-16T09:45:00Z',
  lossQty: 0,
};

// ─── Mock 异常列表 ────────────────────────────────────────────────
export const MOCK_EXCEPTIONS: ExceptionTicket[] = [
  {
    id: 'ex-001',
    type: 'BROKEN_RATE_HIGH',
    status: 'REPORTED',
    severity: 'MEDIUM',
    relatedBatchId: 'sb-001',
    quantity: 200,
    description: '破损率 2.3%，超过阈值 2%',
    reportedBy: '张三',
    reportedAt: '2026-05-16T08:00:00Z',
  },
];

// ─── Mock 首检记录 ────────────────────────────────────────────────
export const MOCK_QC_INSPECTION: QCInspection = {
  id: 'qc-001',
  sourceBatchId: 'sb-001',
  sampleQty: 100,
  brokenQty: 2,
  dirtyQty: 3,
  leakingQty: 0,
  abnormalShapeQty: 1,
  floorEggQty: 0,
  averageWeight: 60.2,
  shellCleanlinessResult: true,
  odorResult: true,
  containerCleanlinessResult: true,
  result: 'PASSED',
  comment: '质量良好，允许分级包装',
  inspectorId: 'qc-001',
  inspectorName: '质检员小王',
  inspectedAt: '2026-05-16T07:20:00Z',
};

// ─── Mock API 函数 ────────────────────────────────────────────────
export const mockApi = {
  async getTerminalContext() {
    await delay();
    return {
      terminalId: 'T-001',
      currentShift: MOCK_SHIFT,
      currentSourceBatch: MOCK_SOURCE_BATCHES[0],
      currentGradingBatch: MOCK_GRADING_BATCH,
      openExceptionCount: MOCK_EXCEPTIONS.filter(e => e.status === 'REPORTED').length,
      devices: [
        { deviceId: 'scanner-01', deviceType: 'SCANNER' as const, label: '扫码枪', status: 'ONLINE' as const },
        { deviceId: 'printer-01', deviceType: 'PRINTER' as const, label: '打印机', status: 'ONLINE' as const },
        { deviceId: 'scale-01',   deviceType: 'SCALE' as const,   label: '电子秤', status: 'OFFLINE' as const },
        { deviceId: 'grader-01',  deviceType: 'GRADER' as const,  label: '分级机', status: 'ONLINE' as const },
        { deviceId: 'agent-01',   deviceType: 'LOCAL_AGENT' as const, label: '本地采集', status: 'ONLINE' as const },
      ],
    };
  },

  async getTodayBatches() {
    await delay();
    return MOCK_SOURCE_BATCHES;
  },

  async openShift(data: Partial<WorkShift>) {
    await delay(800);
    return { ...MOCK_SHIFT, ...data, status: 'OPEN' as const };
  },

  async receiveBatch(batchCode: string, data: Record<string, unknown>) {
    await delay(600);
    const batch = MOCK_SOURCE_BATCHES.find(b => b.code === batchCode);
    if (!batch) throw new Error('批次不存在：' + batchCode);
    return { ...batch, ...data, status: 'RECEIVED' as const };
  },

  async submitQCInspection(data: Partial<QCInspection>) {
    await delay(800);
    return { ...MOCK_QC_INSPECTION, ...data };
  },

  async reportException(data: Partial<ExceptionTicket>) {
    await delay(500);
    return {
      ...data,
      id: `ex-${Date.now()}`,
      status: 'REPORTED' as const,
      reportedAt: new Date().toISOString(),
    };
  },
};
