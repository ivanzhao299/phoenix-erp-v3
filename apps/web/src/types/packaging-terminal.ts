/**
 * 分级包装中心 Terminal 作业台 — 核心类型定义
 * 对应 B4 需求文档 §16-17
 */

// ─── 角色 ──────────────────────────────────────────────────────────
export type TerminalRole =
  | 'PKG_OPERATOR'      // 包装操作员
  | 'QC_INSPECTOR'      // 质检员
  | 'WH_CLERK'          // 仓管员
  | 'LINE_SUPERVISOR'   // 班组长（可开班/交班）
  | 'PKG_MANAGER';      // 包装主管（PC端为主）

/** 具有终端自动跳转权限的角色集合 */
export const TERMINAL_AUTO_ROLES: string[] = [
  'ROLE_PKG_OPERATOR',
  'ROLE_QC_INSPECTOR',
  'ROLE_WH_CLERK',
  'ROLE_LINE_SUPERVISOR',
];

// ─── 批次状态机 ───────────────────────────────────────────────────
export type BatchStatus =
  | 'PENDING_RECEIVE'
  | 'RECEIVED'
  | 'PENDING_QC'
  | 'QC_PASSED'
  | 'QC_CONDITIONAL_RELEASE'
  | 'QC_ON_HOLD'
  | 'GRADING_IN_PROGRESS'
  | 'GRADING_COMPLETED'
  | 'PACKING_IN_PROGRESS'
  | 'PACKING_COMPLETED'
  | 'PENDING_WAREHOUSE'
  | 'WAREHOUSED'
  | 'FROZEN'
  | 'REWORKING'
  | 'SCRAPPED'
  | 'CANCELLED';

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  PENDING_RECEIVE:          '待接收',
  RECEIVED:                 '已接收',
  PENDING_QC:               '待首检',
  QC_PASSED:                '首检通过',
  QC_CONDITIONAL_RELEASE:   '让步放行',
  QC_ON_HOLD:               '首检扣留',
  GRADING_IN_PROGRESS:      '分级中',
  GRADING_COMPLETED:        '分级完成',
  PACKING_IN_PROGRESS:      '包装中',
  PACKING_COMPLETED:        '包装完成',
  PENDING_WAREHOUSE:        '待入库',
  WAREHOUSED:               '已入库',
  FROZEN:                   '已冻结',
  REWORKING:                '返工中',
  SCRAPPED:                 '已报废',
  CANCELLED:                '已取消',
};

// ─── QC 结论 ──────────────────────────────────────────────────────
export type QCResult =
  | 'PENDING'
  | 'PASSED'
  | 'CONDITIONAL_RELEASE'
  | 'ON_HOLD'
  | 'RECHECK_REQUIRED'
  | 'REJECTED'
  | 'SCRAPPED';

// ─── 异常类型 / 状态 ─────────────────────────────────────────────
export type ExceptionType =
  | 'QUANTITY_VARIANCE'
  | 'BROKEN_RATE_HIGH'
  | 'DIRTY_RATE_HIGH'
  | 'LEAKING_EGG'
  | 'FLOOR_EGG'
  | 'MIXED_BATCH'
  | 'LABEL_MISMATCH'
  | 'PRINT_FAILURE'
  | 'SCANNER_FAILURE'
  | 'SCALE_FAILURE'
  | 'GRADER_FAILURE'
  | 'NETWORK_FAILURE'
  | 'QC_REJECTED'
  | 'WAREHOUSE_VARIANCE'
  | 'MANUAL_CORRECTION'
  | 'OTHER';

export type ExceptionStatus =
  | 'REPORTED'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'RECHECK_REQUIRED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED';

export const EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  QUANTITY_VARIANCE:  '数量差异',
  BROKEN_RATE_HIGH:   '破损率偏高',
  DIRTY_RATE_HIGH:    '脏污率偏高',
  LEAKING_EGG:        '渗漏蛋',
  FLOOR_EGG:          '地面蛋',
  MIXED_BATCH:        '混批',
  LABEL_MISMATCH:     '标签不匹配',
  PRINT_FAILURE:      '打印失败',
  SCANNER_FAILURE:    '扫码枪故障',
  SCALE_FAILURE:      '电子秤故障',
  GRADER_FAILURE:     '分级机故障',
  NETWORK_FAILURE:    '网络故障',
  QC_REJECTED:        'QC拒绝',
  WAREHOUSE_VARIANCE: '入库差异',
  MANUAL_CORRECTION:  '手工修正',
  OTHER:              '其他',
};

// ─── 设备状态 ─────────────────────────────────────────────────────
export type DeviceType = 'SCANNER' | 'PRINTER' | 'SCALE' | 'GRADER' | 'CAMERA' | 'LOCAL_AGENT';
export type DeviceStatusValue = 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN';

export interface DeviceStatus {
  deviceId: string;
  deviceType: DeviceType;
  label: string;
  status: DeviceStatusValue;
  lastHeartbeatAt?: string;
  message?: string;
}

// ─── 班次 ────────────────────────────────────────────────────────
export interface WorkShift {
  id: string;
  code: string;
  productionDate: string;
  siteId: string;
  siteName?: string;
  lineId: string;
  lineName?: string;
  teamId?: string;
  operatorIds: string[];
  operatorNames?: string[];
  supervisorId?: string;
  supervisorName?: string;
  terminalId: string;
  status: 'OPEN' | 'PAUSED' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
  hygieneCheckResult?: boolean;
  deviceCheckResult?: boolean;
}

// ─── 来源批次 ────────────────────────────────────────────────────
export interface SourceBatch {
  id: string;
  code: string;
  siteId: string;
  siteName?: string;
  houseId: string;
  houseName?: string;
  flockId: string;
  flockName?: string;
  layDate: string;
  collectionTime?: string;
  expectedQty?: number;
  receivedQty?: number;
  expectedWeight?: number;
  receivedWeight?: number;
  containerCount?: number;
  status: BatchStatus;
  qcResult?: QCResult;
  createdAt: string;
}

// ─── 分级批次 ────────────────────────────────────────────────────
export interface GradingOutput {
  grade: 'GRADE_1' | 'GRADE_2' | 'GRADE_3' | 'GRADE_4' | 'GRADE_5'
       | 'DIRTY' | 'BROKEN' | 'REJECTED' | 'RECHECK';
  qty: number;
  weight?: number;
}

export const GRADE_LABEL: Record<GradingOutput['grade'], string> = {
  GRADE_1:  '1号蛋',
  GRADE_2:  '2号蛋',
  GRADE_3:  '3号蛋',
  GRADE_4:  '4号蛋',
  GRADE_5:  '5号蛋',
  DIRTY:    '脏污蛋',
  BROKEN:   '破损蛋',
  REJECTED: '淘汰蛋',
  RECHECK:  '待复检',
};

export interface GradingBatch {
  id: string;
  code: string;
  sourceBatchId: string;
  lineId: string;
  shiftId: string;
  gradingRuleVersion: string;
  inputQty: number;
  inputWeight?: number;
  outputs: GradingOutput[];
  status: BatchStatus;
  startedBy?: string;
  startedAt?: string;
  finishedAt?: string;
  lossQty?: number;
}

// ─── 包装批次 ────────────────────────────────────────────────────
export interface PackagingBatch {
  id: string;
  code: string;
  gradingBatchId: string;
  productId: string;
  skuId: string;
  grade: string;
  packagingSpecId: string;
  materialBatchIds: string[];
  labelTemplateId: string;
  plannedBoxCount?: number;
  actualBoxCount: number;
  eggsPerBox: number;
  totalEggQty: number;
  totalWeight?: number;
  status: BatchStatus;
  packedBy: string;
  packedAt?: string;
}

// ─── 箱码 / 托盘码 ────────────────────────────────────────────────
export interface BoxCode {
  code: string;
  packagingBatchId: string;
  productId: string;
  skuId: string;
  grade: string;
  eggQty: number;
  weight?: number;
  labelPrinted: boolean;
  labelVerified: boolean;
  status: 'CREATED' | 'PRINTED' | 'VERIFIED' | 'WAREHOUSED' | 'VOIDED';
}

export interface PalletCode {
  code: string;
  boxCodes: string[];
  warehouseId?: string;
  locationId?: string;
  status: 'CREATED' | 'WAREHOUSED' | 'VOIDED';
}

// ─── 首检记录 ────────────────────────────────────────────────────
export interface QCInspection {
  id: string;
  sourceBatchId: string;
  sampleQty: number;
  brokenQty: number;
  dirtyQty: number;
  leakingQty: number;
  abnormalShapeQty: number;
  floorEggQty: number;
  averageWeight?: number;
  shellCleanlinessResult?: boolean;
  odorResult?: boolean;
  containerCleanlinessResult?: boolean;
  result: QCResult;
  comment?: string;
  photoUrls?: string[];
  inspectorId: string;
  inspectorName?: string;
  inspectedAt: string;
}

// ─── 标签打印日志 ─────────────────────────────────────────────────
export interface LabelPrintLog {
  id: string;
  boxCode: string;
  packagingBatchId: string;
  labelTemplateId: string;
  printerId: string;
  printType: 'NORMAL' | 'REPRINT';
  status: 'PENDING' | 'PRINTED' | 'FAILED' | 'VOIDED';
  printedBy: string;
  printedAt: string;
  reprintReason?: string;
  oldLabelCode?: string;
  newLabelCode?: string;
}

// ─── 异常工单 ────────────────────────────────────────────────────
export interface ExceptionTicket {
  id: string;
  type: ExceptionType;
  status: ExceptionStatus;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  relatedBatchId?: string;
  relatedBoxCode?: string;
  quantity?: number;
  description?: string;
  photoUrls?: string[];
  reportedBy: string;
  reportedAt: string;
  assignedTo?: string;
  actionTaken?: string;
  closedBy?: string;
  closedAt?: string;
}

// ─── 审计日志 ────────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  operatorId: string;
  terminalId?: string;
  createdAt: string;
}

// ─── Terminal 上下文 ─────────────────────────────────────────────
export interface TerminalContext {
  terminalId: string;
  currentOperatorId: string;
  currentOperatorName: string;
  currentOperatorRole: string;
  currentShift?: WorkShift;
  currentSourceBatch?: SourceBatch;
  currentGradingBatch?: GradingBatch;
  openExceptionCount: number;
  devices: DeviceStatus[];
}

// ─── 步骤权限映射 ─────────────────────────────────────────────────
/** 每个步骤哪些角色可以操作（不在列表中的只能查看）*/
export const STEP_ALLOWED_ROLES: Record<string, string[]> = {
  'shift-open':          ['ROLE_LINE_SUPERVISOR'],
  'source-receive':      ['ROLE_PKG_OPERATOR', 'ROLE_LINE_SUPERVISOR'],
  'qc-inspection':       ['ROLE_QC_INSPECTOR', 'ROLE_LINE_SUPERVISOR'],
  'grading':             ['ROLE_PKG_OPERATOR', 'ROLE_LINE_SUPERVISOR'],
  'packing':             ['ROLE_PKG_OPERATOR', 'ROLE_LINE_SUPERVISOR'],
  'label-print':         ['ROLE_PKG_OPERATOR', 'ROLE_LINE_SUPERVISOR'],
  'warehouse-handover':  ['ROLE_WH_CLERK', 'ROLE_LINE_SUPERVISOR'],
  'exceptions':          ['ROLE_PKG_OPERATOR', 'ROLE_QC_INSPECTOR', 'ROLE_WH_CLERK', 'ROLE_LINE_SUPERVISOR'],
  'shift-close':         ['ROLE_LINE_SUPERVISOR'],
};
