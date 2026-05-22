/**
 * mobile-api.ts — 手机端管理日报 API 客户端
 */

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
    total_plan:   number | string;
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
  summary: { total_tasks: number; total_packed: number; total_plan: number };
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

  /** 存栏批次（ROLE_ADMIN / ROLE_FARM_MGR 可访问；其他角色 403 降级） */
  getFlocks: () =>
    get<{ data: FlockRecord[]; total: number }>('/api/crud/brd_flocks?status=LAYING&limit=100'),

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

  /** 饲料台账 — 栋舍列表 */
  getFeedHouses: () =>
    get<string[]>('/api/farm/feed/houses'),

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

  /** 农场客户列表 */
  getFarmCustomers: () =>
    get<FarmCustomer[]>('/api/farm/sales/customers'),

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
};
