/**
 * packaging-api.ts — Terminal 作业台真实 API 客户端
 * 替换 packaging-mock.ts，通过 /api/packaging/terminal/* 调用后端
 */

export interface PrintLogRow {
  id: number;
  box_code: string;
  packaging_batch_id: string;
  print_type: 'NORMAL' | 'REPRINT';
  reprint_reason: string | null;
  printed_by: string;
  printed_at: string;
}

/** 读 token：优先 sessionStorage，fallback localStorage（与 api-client.ts 保持一致） */
function tok(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token')
      || localStorage.getItem('phoenix_token')
      || '';
}

/** 写 token：同步写两个存储，保证 sessionStorage + localStorage 一致 */
function saveTok(t: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('phoenix_token', t);
  localStorage.setItem('phoenix_token', t);
}

let _refreshing: Promise<boolean> | null = null;

/** 静默刷新 token（与 api-client.ts 的 ensureFreshToken 逻辑对齐） */
async function tryRefresh(): Promise<boolean> {
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    try {
      const t = tok();
      if (!t) return false;
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      });
      if (!r.ok) return false;
      const d = await r.json();
      const newToken = d?.access_token || d?.data?.access_token;
      if (newToken) { saveTok(newToken); return true; }
      return false;
    } catch { return false; }
    finally { setTimeout(() => { _refreshing = null; }, 2000); }
  })();
  return _refreshing;
}

function hdr(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tok()}`,
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  let res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: hdr(),
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 → 尝试静默刷新一次，成功则重试原请求（与 api-client.ts 行为一致）
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: hdr(),
        body: body ? JSON.stringify(body) : undefined,
      });
    }
    // 刷新后仍 401 → 真正过期，跳登录
    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        const returnParam = !window.location.pathname.includes('/login')
          ? `?return=${encodeURIComponent(window.location.pathname)}`
          : '';
        window.location.href = `/login${returnParam}`;
      }
      throw new Error('登录已过期，请重新登录');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ msg: res.statusText }));
    throw new Error(err.msg || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.code && data.code !== 200) throw new Error(data.msg || '操作失败');
  return data.data ?? data;
}

export const packagingApi = {
  // ── Terminal 上下文 ─────────────────────────────────────────────────────────
  getContext: () => request<any>('GET', '/api/packaging/terminal/context'),

  // ── 班次 ────────────────────────────────────────────────────────────────────
  getTodayShifts: () => request<any[]>('GET', '/api/packaging/terminal/shifts/today'),
  getSites: () => request<{ site_id: string; site_name: string }[]>('GET', '/api/packaging/terminal/sites'),
  openShift: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/shifts/open', body),
  closeShift: (id: string, body: Record<string, unknown>) => request<any>('POST', `/api/packaging/terminal/shifts/${id}/close`, body),

  // ── 来源批次 ────────────────────────────────────────────────────────────────
  getTodaySourceBatches: () => request<any[]>('GET', '/api/packaging/terminal/source-batches/today'),
  getPendingSourceBatches: () => request<any[]>('GET', '/api/packaging/terminal/source-batches/pending'),
  receiveBatch: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/source-batches/receive', body),
  correctBatch: (body: Record<string, unknown>) => request<void>('PATCH', '/api/packaging/terminal/source-batches/correct', body),

  // ── 首检 ─────────────────────────────────────────────────────────────────────
  submitQCInspection: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/qc/first-inspection', body),

  // ── 异常 ─────────────────────────────────────────────────────────────────────
  getTodayExceptions: () => request<any[]>('GET', '/api/packaging/terminal/exceptions/today'),
  reportException: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/exceptions', body),

  // ── 标签打印日志 ──────────────────────────────────────────────────────────────
  recordPrintLog: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/labels/print-log', body),
  getPrintLogs: (params: { startDate: string; endDate: string; type?: string }) => {
    const q = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate });
    if (params.type && params.type !== 'ALL') q.set('type', params.type);
    return request<{ data: PrintLogRow[] }>('GET', `/api/packaging/terminal/labels/print-logs?${q}`);
  },

  /** 获取包装单完整追溯信息（鸡舍来源、班次、等级、规格） */
  getPackingTrace: (packingCode: string) =>
    request<{
      packingCode: string;
      productionDate: string;
      shift: { id: number; shiftCode: string; shiftLabel: string; operatorName: string; supervisorName: string } | null;
      sources: { houseCode: string; houseName: string; totalQty: number }[];
    }>('GET', `/api/packaging/terminal/labels/trace?packingCode=${encodeURIComponent(packingCode)}`),

  // ── 交班日报 ──────────────────────────────────────────────────────────────────
  getShiftSummary: (date?: string, shiftId?: string) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (shiftId) params.set('shiftId', shiftId);
    const qs = params.toString();
    return request<any>('GET', `/api/packaging/terminal/reports/shift-summary${qs ? `?${qs}` : ''}`);
  },

  // ── 分级 ─────────────────────────────────────────────────────────────────────
  submitGrading: (body: Record<string, unknown>) =>
    request<{ code: string }>('POST', '/api/packaging/terminal/grading/submit', body),

  /** 按等级汇总当日所有分级批次产出及已包装量，返回各等级实时剩余（多终端并发安全） */
  getActiveGrading: (date?: string) =>
    request<{
      gradingCodes: string[];
      outputs:      Record<string, number>;
      packed:       Record<string, number>;
      remaining:    Record<string, number>;
    }>('GET', `/api/packaging/terminal/grading/active${date ? `?date=${date}` : ''}`),

  // ── 包装 ─────────────────────────────────────────────────────────────────────
  submitPacking: (body: Record<string, unknown>) =>
    request<{ code: string; totalBoxes: number; totalEggs: number }>('POST', '/api/packaging/terminal/packing/submit', body),

  // ── 入库交接 ──────────────────────────────────────────────────────────────────
  confirmHandover: (body: Record<string, unknown>) =>
    request<{ code: string }>('POST', '/api/packaging/terminal/warehouse/confirm', body),

  // ── 数据字典 ──────────────────────────────────────────────────────────────────
  /**
   * 批量获取系统字典条目，返回按 dictType 分组的 Record
   * 每条目包含 code/label + config_json 展开字段（color/icon/qty/terminalCode 等）
   */
  getDicts: (types: string[]) =>
    request<Record<string, DictItem[]>>('GET', `/api/packaging/terminal/dicts?types=${types.join(',')}`),

  // ── 班组长候选列表（ROLE_LINE_SUPERVISOR / ROLE_PKG_MGR / ROLE_ADMIN） ──────
  getSupervisors: () =>
    request<{ id: number; name: string }[]>('GET', '/api/packaging/terminal/supervisors'),
};

export interface DictItem {
  code: string;
  label: string;
  labelEn?: string;
  labelLo?: string;
  sortNo?: number;
  // PKG_EGG_GRADE terminal grades
  terminalCode?: string;
  color?: string;
  icon?: string;
  isTerminalGrade?: boolean;
  isDefect?: boolean;
  // PKG_PACK_SPEC
  qty?: number;
  unit?: string;
  perBox?: number;
  isCustom?: boolean;
  // PKG_EGG_GRADE weight grades
  weightRange?: string;
  saleable?: boolean;
  productCode?: string;
  // PKG_QC_RESULT
  desc?: string;
  routeTo?: string;
  // misc
  [key: string]: unknown;
}
