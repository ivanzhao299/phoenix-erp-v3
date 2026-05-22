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
  id:            number;
  flock_no:      string;
  log_date:      string;
  shift?:        string;
  eggs_produced: number | string;
  mortality_qty: number | string;
  dirty_eggs?:   number | string;
  broken_eggs?:  number | string;
}

// ── API 方法 ──────────────────────────────────────────────────────────────────

export const mobileApi = {
  /** 综合 KPI（今日产蛋、存栏、销售、告警），只返回今日数据 */
  getKpi: () => get<KpiData>('/api/dashboard/kpi'),

  /** 包装日报（按日期，任何日期均有效） */
  getPackagingReport: (date: string) =>
    get<PackagingDailyReport>(`/api/packaging/daily-report?date=${date}`),

  /** 质检记录（按日期，支持跨权限查询） */
  getQcInspections: (date: string) =>
    get<QcInspection[]>(`/api/quality/inspections?start_date=${date}&end_date=${date}&limit=200`),

  /** 养殖日报（仅 ROLE_FARM_MGR/ROLE_ADMIN 可访问；其他角色返回 403 则降级） */
  getFarmLogs: (date: string) =>
    get<{ data: FarmLog[]; total: number }>(`/api/crud/brd_daily_logs?log_date=${date}&limit=200`),
};
