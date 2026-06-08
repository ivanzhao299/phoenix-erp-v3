/**
 * mobile-api.ts — 手机端管理日报 API 客户端
 */

// ── 内存缓存（SWR 策略：TTL 内直接返回，过期��后台静默更新）────────────────────
interface MemCacheEntry { data: unknown; at: number }
const _memCache = new Map<string, MemCacheEntry>();

/**
 * 带 TTL 的内存缓存 GET
 * - TTL 内：直接返回缓存，零网络延迟
 * - 过期后：返回旧数据并在后台静默刷新（stale-while-revalidate）
 * - 无缓存：阻塞等待网络响应后写入缓存
 *
 * 适用于几乎不变的主数据（鸡舍列表、客户列表、药品目录等）
 */
async function getCached<T>(cacheKey: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
  const hit = _memCache.get(cacheKey);
  const now = Date.now();
  if (hit) {
    if (now - hit.at < ttlMs) return hit.data as T;        // 新鲜缓存��直接返回
    // 过期：立即返回旧数据，后台静默刷新（stale-while-revalidate）
    fetcher().then(fresh => _memCache.set(cacheKey, { data: fresh, at: Date.now() })).catch(() => {});
    return hit.data as T;
  }
  const data = await fetcher();
  _memCache.set(cacheKey, { data, at: now });
  return data;
}

/** 手动清除某个 key 的缓存（例如提交数据后强制刷新） */
export function invalidateCache(cacheKey: string) {
  _memCache.delete(cacheKey);
}

function tok(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || '';
}

async function get<T>(path: string): Promise<T> {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tok()}`,
    },
  });
  if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.code && body.code !== 200) throw new Error(body.msg || '请求失败');
  return body.data ?? body;
}

async function post<T = any>(path: string, data: unknown): Promise<T> {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tok()}`,
    },
    body: JSON.stringify(data),
  });
  if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface KpiData {
  stats: {
    eggs:  { value: string | number; unit: string; trend: string | null };
    sales: { value: string | number; unit: string; trend: string | null };
    stock: { value: string | number; unit: string; trend: string | null };
    alerts: { value: string | number; unit: string; trend: string | null };
  };
  meta: {
    today: string;
    layingTotal: number;
    todayEggs: number;
    todayLayRate: number | null;
  };
  alertList?: { level: string; msg: string }[];
}

export interface PackagingDailyReport {
  date: string;
  summary: {
    total_tasks:  number | string;
    total_packed: number | string;
  };
  by_grade: { grade: string; qty: number | string; tasks: number | string }[];
}

export interface QcInspection {
  inspect_no: string;
  checkType:  string;
  checkTime:  string;
  result:     'PASS' | 'FAIL' | string;
  fail_items_json?: unknown;
}

export interface FarmLog {
  id:              number;
  flock_no:        string;
  house_code?:     string;
  log_date:        string;
  shift?:          string;
  eggs_produced:   number | string;
  mortality_qty:   number | string;
  dirty_eggs?:     number | string;
  broken_eggs?:    number | string;
  feed_consumed?:  number | string;
  water_consumed?: number | string;
}

export interface FeedLedgerRow {
  id:              number | null;
  ledger_date:     string;
  material_name:   string;
  unit:            string;
  sort_order:      number;
  prev_stock:      number;
  inbound_qty:     number;
  outbound_detail: Record<string, number>;
  outbound_total:  number;
  current_stock:   number;
  daily_usage:     number;
  days_left:       number | null;
  alert:           'CRITICAL' | 'WARN' | null;
  note:            string;
}

export interface FlockRecord {
  flock_no:         string;
  house_code?:      string;
  farm_code?:       string;
  strain?:          string;
  placement_date?:  string;
  initial_qty:      number | string;
  current_qty:      number | string;
  current_lay_rate: number | string | null;
  status:           string;
}

export interface PackagingTrendItem {
  date: string;
  summary: { total_tasks: number; total_packed: number };
}

export interface DeviceAlert {
  id:              number;
  erp_house_code:  string;
  alert_type:      string;
  status:          'OPEN' | 'CONFIRMED' | 'CLOSED';
  message?:        string;
  value?:          number | string;
  threshold?:      number | string;
  created_at:      string;
}

export interface EggStockRow {
  grade:  string;
  name:   string;
  qty:    number;
  trays:  number;
}

export interface EggLedgerEntry {
  id:           number;
  log_date:     string;
  change_type:  string;
  grade:        string;
  qty_change:   number;
  house_code:   string | null;
  customer_no:  string | null;
  note:         string | null;
  operator:     string;
  created_at:   string;
}

export interface EggInboundItem {
  grade:      string;
  qty:        number;
  house_code: string;
}

export interface EggOutboundItem {
  grade:       string;
  qty:         number;
  customer_no: string;
}

export interface FarmCustomer {
  customer_code: string;
  customer_name: string;
}

export interface FarmSaleItem {
  grade:       string;
  grade_name:  string;
  qty:         number;
  trays:       number;
  unit_price:  number;
}

export interface FarmSaleRecord {
  order_no:      string;
  order_date:    string;
  customer_code: string;
  customer_name: string;
  total_amount:  number;
  status:        string;
  remark:        string | null;
  items:         Array<{
    grade:           string;
    product_name_zh: string;
    qty:             number;
    unit_price:      number;
    subtotal:        number;
  }>;
}

export interface MedStockRow {
  medication_code: string;
  medication_name: string;
  dosage:          string;
  qty:             number;
  unit:            string;
}

export interface MedLedgerEntry {
  id:              number;
  log_date:        string;
  change_type:     string;
  medication_code: string;
  medication_name: string;
  qty_change:      number;
  house_code:      string | null;
  note:            string | null;
  operator:        string;
  created_at:      string;
}

export interface HenReportRow {
  house_code:     string;
  flock_no:       string;
  current_qty:    number;
  initial_qty:    number;
  age_days:       number | null;
  eggs:           number;
  lay_rate:       string;
  mortality:      number;
  elimination:    number;
  total_loss:     number;
  culling_reason: string | null;
  mortality_reason: string | null;  // G27-D: 与 PC G19-A 同步
  feed:           number;
}

export interface DailyHenReport {
  code:    number;
  date:    string;
  rows:    HenReportRow[];
  totals: {
    current_qty: number;
    eggs:        number;
    lay_rate:    string;
    mortality:   number;
    elimination: number;
    total_loss:  number;
    feed:        number;
  };
}

export interface TrendRow {
  date:        string;
  eggs:        number;
  mortality:   number;
  elimination: number;
  feed:        number;
}

export interface FarmTrend {
  code:    number;
  days:    number;
  rows:    TrendRow[];
  summary: {
    current_days:    number;
    avg_eggs:        number;
    avg_mortality:   number;
    avg_elimination: number;
    avg_feed:        number;
    lay_rate:        string;
    prev_avg_eggs:   number;
    prev_lay_rate:   string;
    total_qty:       number;
  };
}

// ── API 方法 ──────────────────────────────────────────────────────────────────

export const mobileApi = {
  /** 综合 KPI（今日产蛋、存栏、销售、告警），只返回今日数据 */
  getKpi: () => get<KpiData>('/api/dashboard/kpi'),

  /** 包装日报（按日期，任何日期均有效） */
  getPackagingReport: (date: string) =>
    get<PackagingDailyReport>(`/api/packaging/daily-report?date=${date}`),

  /** 包装 N 日趋势（用于迷你柱状图，一次调用替代多次 daily-report） */
  getPackagingTrend: (endDate: string, days = 7) =>
    get<PackagingTrendItem[]>(`/api/packaging/daily-report-range?end_date=${endDate}&days=${days}`),

  /** 质检记录（按日期，支持跨权限查询） */
  getQcInspections: (date: string) =>
    get<QcInspection[]>(`/api/quality/inspections?start_date=${date}&end_date=${date}&limit=200`),

  /** 养殖日报（仅 ROLE_FARM_MGR/ROLE_ADMIN 可访问；其他角色返回 403 则降级） */
  getFarmLogs: (date: string) =>
    get<{ data: FarmLog[]; total: number }>(`/api/crud/brd_daily_logs?log_date=${date}&limit=200`),

  /** 未处理告警列表（IoT 设备告警，管理员/农场经理可访问） */
  getOpenAlerts: () =>
    get<DeviceAlert[]>('/api/farm-device/alerts?status=OPEN'),

  /** 存栏批次（5 分钟缓存，当日不会频繁变动） */
  getFlocks: () =>
    getCached('flocks', () => get<{ data: FlockRecord[]; total: number }>('/api/crud/brd_flocks?status=LAYING&limit=100'), 5 * 60_000),

  /** 饲料台账 — 查询某日 */
  getFeedLedger: (date: string) =>
    get<FeedLedgerRow[]>(`/api/farm/feed/ledger?date=${date}`),

  /** 饲料台账 — 保存 */
  saveFeedLedger: (date: string, items: Partial<FeedLedgerRow>[]) =>
    fetch((process.env.NEXT_PUBLIC_API_BASE || '') + '/api/farm/feed/ledger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : ''}`,
      },
      body: JSON.stringify({ date, items }),
    }).then(r => r.json()),

  /** 饲料台账 — 栋舍列表（5 分钟缓存，几乎不变） */
  getFeedHouses: () =>
    getCached('feedHouses', () => get<string[]>('/api/farm/feed/houses'), 5 * 60_000),

  /** 鸡蛋库存快照 */
  getEggStock: () =>
    get<EggStockRow[]>('/api/farm/egg/stock'),

  /** 鸡蛋出入库流水（按日期范围） */
  getEggLedger: (start: string, end: string) =>
    get<EggLedgerEntry[]>(`/api/farm/egg/ledger?start=${start}&end=${end}`),

  /** 鸡蛋入库（鸡舍 → 库） */
  eggInbound: (date: string, items: EggInboundItem[], operator?: string) =>
    post('/api/farm/egg/inbound', { date, items, operator }),

  /** 鸡蛋出库（库 → 客户） */
  eggOutbound: (date: string, items: EggOutboundItem[], operator?: string, refNo?: string) =>
    post('/api/farm/egg/outbound', { date, items, operator, ref_no: refNo }),

  /** 鸡蛋报损 */
  eggWriteOff: (date: string, items: Array<{ grade: string; qty: number; reason: string }>, operator?: string) =>
    post('/api/farm/egg/write-off', { date, items, operator }),

  /** 农场客户列表（5 分钟缓存，几乎不变） */
  getFarmCustomers: () =>
    getCached('farmCustomers', () => get<FarmCustomer[]>('/api/farm/sales/customers'), 5 * 60_000),

  /** 农场销售记录（按日期） */
  getFarmSales: (date: string) =>
    get<FarmSaleRecord[]>(`/api/farm/sales?date=${date}`),

  /** 创建农场直销单 */
  createFarmSale: (data: {
    sale_date:     string;
    customer_code: string;
    customer_name: string;
    items:         FarmSaleItem[];
    remark?:       string;
    operator:      string;
  }) => post<{ order_no: string; total_amount: number }>('/api/farm/sales', data),

  /** 撤销农场销售单 */
  cancelFarmSale: (orderNo: string, operator: string) =>
    post(`/api/farm/sales/${orderNo}/cancel`, { operator }),

  /** 药品库存（含目录）（60 秒缓存） */
  getMedStock: () =>
    getCached('medStock', () => get<MedStockRow[]>('/api/farm/medicine/stock'), 60_000),

  /** 药品流水 */
  getMedLedger: (start: string, end: string) =>
    get<MedLedgerEntry[]>(`/api/farm/medicine/ledger?start=${start}&end=${end}`),

  /** 药品入库 */
  medInbound: (date: string, items: Array<{ medication_code: string; qty: number; note?: string }>, operator?: string) =>
    post('/api/farm/medicine/inbound', { date, items, operator }),

  /** 药品出库（用药） */
  medOutbound: (date: string, items: Array<{ medication_code: string; qty: number; house_code?: string; note?: string }>, operator?: string) =>
    post('/api/farm/medicine/outbound', { date, items, operator }),

  /** 母鸡存栏日报（按日期） */
  getDailyHenReport: (date: string) =>
    get<DailyHenReport>(`/api/v3/farm/daily-hen-report?date=${date}`),

  /** 生产趋势（最近 N 天日均产蛋/死淘/饲料 + 上期对比） */
  getFarmTrend: (days: number) =>
    get<FarmTrend>(`/api/v3/farm/trend?days=${days}`),

  /** 提交/更新养殖日报（产蛋录入） */
  submitDailyLog: (payload: {
    house_code:    string;
    flock_no?:     string;
    log_date:      string;
    shift:         string;
    eggs_produced: number;
    bad_eggs?:     number;
    dirty_eggs?:   number;
    broken_eggs?:  number;
    temp?:         number | null;
    humidity?:     number | null;
    operator?:     string;
  }) => post<{ code: number; msg: string }>('/api/v3/farm/daily-logs', payload),
};

// ── Workflow / Approval / Notification API ────────────────────────────────────
// Token: sessionStorage.phoenix_token → localStorage.phoenix_token → auth_user.token

function _wfTok(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (
      sessionStorage.getItem('phoenix_token') ||
      localStorage.getItem('phoenix_token') ||
      JSON.parse(localStorage.getItem('auth_user') || '{}').token ||
      ''
    );
  } catch { return ''; }
}

async function wfGet<T>(path: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE || '';
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_wfTok()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function wfPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE || '';
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_wfTok()}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).message ?? msg; } catch { /* */ }
    throw new Error(msg);
  }
  return res.json();
}

export interface WorkflowTask {
  taskSource:    'APPROVAL_ENGINE' | 'WORKFLOW_ENGINE';
  taskId:        string;
  instanceId:    string;
  instanceNo:    string | null;
  bizType:       string | null;
  bizId:         string | null;
  bizNo:         string | null;
  subject:       string | null;
  amount:        number | null;
  currencyCode:  string | null;
  companyCode:   string | null;
  companyName:   string | null;
  projectCode:   string | null;
  projectName:   string | null;
  requiredRole:  string | null;
  stepNo:        number | null;
  totalSteps:    number | null;
  currentStepNo: number | null;
  startedBy:       string | null;
  status:          string;
  createdAt:       string;
  // Phase F: SLA
  dueAt:           string | null;
  isOverdue:       boolean;
  escalationLevel: number;
}

export interface WorkflowTaskPage {
  items:    WorkflowTask[];
  total:    number;
  page:     number;
  pageSize: number;
}

export interface FormSubmissionSnapshot {
  id:              number;
  submissionNo:    string;
  formCode:        string;
  formVersionId:   number;
  dataJson:        Record<string, unknown>;
  schemaJson:      Record<string, unknown>;
  uiSchemaJson:    Record<string, unknown>;
  status:          string;
  submittedByName: string | null;
  formName:        string | null;
  createdAt:       string;
}

export interface InstanceDetail {
  id:               string;
  instanceNo:       string;
  bizType:          string;
  bizId:            string;
  bizNo:            string | null;
  subject:          string | null;
  status:           string;
  steps:            InstanceStep[];
  startedBy?:       string | null;
  startedAt?:       string | null;
  formSubmissionId?: string | null;
  formCode?:         string | null;
  formSubmission?:   FormSubmissionSnapshot | null;   // Phase I
}

export interface InstanceStep {
  id:            string;
  stepNo:        number;
  approverRole:  string | null;
  approverUserId?: string | null;
  approverName?: string | null;
  approverType?: string;
  status:        string;
  comment:       string | null;
  actedAt:       string | null;
  createdAt:     string;
}

export interface MobileNotification {
  id:               string;
  notificationType: string;
  title:            string;
  body:             string;
  status:           string;
  refId:            string | null;
  refType:          string | null;
  createdAt:        string;
}

export const approvalApi = {
  /** 统一待办列表（ApprovalEngine + WorkflowEngine 合并） */
  getMyTasks: (params?: {
    page?: number; pageSize?: number;
    taskSource?: string; bizType?: string; keyword?: string;
  }): Promise<WorkflowTaskPage> => {
    const q = new URLSearchParams();
    if (params?.page)       q.set('page',       String(params.page));
    if (params?.pageSize)   q.set('pageSize',   String(params.pageSize));
    if (params?.taskSource) q.set('taskSource', params.taskSource);
    if (params?.bizType)    q.set('bizType',    params.bizType);
    if (params?.keyword)    q.set('keyword',    params.keyword);
    return wfGet<WorkflowTaskPage>(`/api/workflow/my-tasks?${q}`);
  },

  /** 审批历史（已办） */
  getHistory: (params?: { page?: number; pageSize?: number; bizType?: string }): Promise<WorkflowTaskPage> => {
    const q = new URLSearchParams();
    if (params?.page)     q.set('page',     String(params.page));
    if (params?.pageSize) q.set('pageSize', String(params.pageSize));
    if (params?.bizType)  q.set('bizType',  params.bizType);
    return wfGet<WorkflowTaskPage>(`/api/approval/history?${q}`);
  },

  /** 实例详情 */
  getInstance: (instanceId: string): Promise<InstanceDetail> =>
    wfGet<InstanceDetail>(`/api/approval/instances/${instanceId}`),

  /** 审批通过 */
  approveInstance: (instanceId: string, comment?: string): Promise<unknown> =>
    wfPost(`/api/approval/instances/${instanceId}/approve`, { comment: comment ?? '' }),

  /** 审批拒绝（comment 必填） */
  rejectInstance: (instanceId: string, comment: string): Promise<unknown> =>
    wfPost(`/api/approval/instances/${instanceId}/reject`, { comment }),

  /** 待办数量（用于首页角标） */
  getTaskCount: async (): Promise<number> => {
    try {
      const r = await wfGet<WorkflowTaskPage>('/api/workflow/my-tasks?page=1&pageSize=1');
      return r.total ?? 0;
    } catch { return 0; }
  },
};

export const notificationApi = {
  /** 通知列表 */
  list: (params?: { status?: string; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params?.status)   q.set('status',   params.status);
    if (params?.page)     q.set('page',     String(params.page));
    if (params?.pageSize) q.set('pageSize', String(params.pageSize));
    return wfGet<{ items: MobileNotification[]; total: number; page: number; pageSize: number }>(
      `/api/notifications?${q}`,
    );
  },

  /** 未读数量（用于首页角标） */
  unreadCount: async (): Promise<number> => {
    try {
      const r = await wfGet<{ count: number }>('/api/notifications/unread-count');
      return r.count ?? 0;
    } catch { return 0; }
  },

  /** 标记单条已读 */
  markRead: (id: string) => wfPost(`/api/notifications/${id}/read`),

  /** 全部已读 */
  readAll: () => wfPost('/api/notifications/read-all'),
};
