/**
 * packaging-api.ts — Terminal 作业台真实 API 客户端
 * 替换 packaging-mock.ts，通过 /api/packaging/terminal/* 调用后端
 */

function tok(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || '';
}

function hdr(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tok()}`,
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: hdr(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // 只有 JWT 真正过期才跳登录；权限不足（如管理员访问仅限操作员的 endpoint）
    // 应继续停留在当前页面，让调用方展示友好错误，不能误把权限 401 当成过期登出。
    if (typeof window !== 'undefined' && tok()) {
      try {
        const parts = tok().split('.');
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          window.location.href = '/login?reason=expired';
        }
      } catch {
        window.location.href = '/login?reason=expired';
      }
    }
    throw new Error('Token expired or unauthorized');
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
  openShift: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/shifts/open', body),
  closeShift: (id: string, body: Record<string, unknown>) => request<any>('POST', `/api/packaging/terminal/shifts/${id}/close`, body),

  // ── 来源批次 ────────────────────────────────────────────────────────────────
  getTodaySourceBatches: () => request<any[]>('GET', '/api/packaging/terminal/source-batches/today'),
  getPendingSourceBatches: () => request<any[]>('GET', '/api/packaging/terminal/source-batches/pending'),
  receiveBatch: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/source-batches/receive', body),

  // ── 首检 ─────────────────────────────────────────────────────────────────────
  submitQCInspection: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/qc/first-inspection', body),

  // ── 异常 ─────────────────────────────────────────────────────────────────────
  getTodayExceptions: () => request<any[]>('GET', '/api/packaging/terminal/exceptions/today'),
  reportException: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/exceptions', body),

  // ── 标签打印日志 ──────────────────────────────────────────────────────────────
  recordPrintLog: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/labels/print-log', body),

  // ── 交班日报 ──────────────────────────────────────────────────────────────────
  getShiftSummary: (date?: string) => request<any>('GET', `/api/packaging/terminal/reports/shift-summary${date ? `?date=${date}` : ''}`),

  // ── 分级 ─────────────────────────────────────────────────────────────────────
  submitGrading: (body: Record<string, unknown>) =>
    request<{ code: string }>('POST', '/api/packaging/terminal/grading/submit', body),

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
