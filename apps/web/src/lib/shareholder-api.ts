import request from '@/lib/api-client';

// 股东权益中心 API 客户端（对接 NestJS @Controller('api/shareholders')，request 自动加 /api 前缀与认证）
export interface ShrProject {
  projectCode: string; projectName: string; companyCode?: string; siteCode?: string;
  projectType: string; capitalStatus: string; equityStatus: string; status: string; remark?: string;
  holders?: number; ratioSum?: number;
  paidInTotal?: number; lastContributionDate?: string | null; contributionCount?: number;
  totalPaidInCapital?: number | null; ledgerPaidIn?: number;
}
export interface ShrEquity {
  id: string; projectCode: string; shareholderCode: string; equityRatio: string;
  subscribedCapital?: string; paidInCapital?: string; unpaidCapital?: string;
  capitalStatus: string; equityStatus: string; isVotingShareholder: boolean; remark?: string;
  capitalRatio?: string | null; paidInSource?: string | null;
}
export interface ShrShareholder {
  shareholderCode: string; shareholderName: string; linkedUserId?: string;
  phone?: string; status: string; remark?: string;
}
export interface ShrContribution {
  id: string; contributionNo: string; projectCode: string; shareholderCode: string;
  amount: string; currency: string; contributionDate?: string; sourceType: string;
  status: string; remark?: string;
}
export interface ShrScope {
  id: string; userId: string; shareholderCode?: string; scopeType: string;
  scopeCode?: string; projectCode?: string; canApprove: boolean; status: string;
}

export interface ShrBeneficial {
  id: string; projectCode: string; nomineeShareholderCode: string;
  beneficialShareholderCode: string; amount?: string; ownershipRatio?: string; remark?: string;
}

// ── 中文标签字典（用户端全中文）──────────────────────────────────────
export const PROJECT_TYPE_LABEL: Record<string, string> = {
  LAYER_FARM: '蛋鸡养殖场', BROILER_FARM: '肉鸡养殖场', SLAUGHTER: '屠宰加工厂',
  FOOD_FACTORY: '食品厂', ORGANIC_FERTILIZER: '有机肥生产厂', HATCHERY: '孵化场',
  FEED_MILL: '饲料厂', OTHER: '其他',
};
export const CAPITAL_STATUS_LABEL: Record<string, string> = {
  PAID_IN_FULL: '已到位', PARTIALLY_PAID: '部分到位', PENDING_CONFIRMATION: '待确认',
};
export const EQUITY_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: '已确认股权', PROVISIONAL: '暂定股权',
};
export const SOURCE_TYPE_LABEL: Record<string, string> = {
  BANK_TRANSFER: '银行转账', DIVIDEND_OFFSET: '分红转投资', SHAREHOLDER_ADVANCE: '股东垫付',
  CASH: '现金', OTHER: '其他',
};
export const PAID_IN_SOURCE_LABEL: Record<string, string> = {
  LEDGER: '逐笔台账', CAPITAL_SUMMARY_IMPORT: '资本汇总表',
};
export const CONTRIB_STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿', CONFIRMED: '已确认', CANCELLED: '已取消',
};
export const SCOPE_TYPE_LABEL: Record<string, string> = {
  GROUP: '集团', BU: '事业群', COMPANY: '公司', SITE: '场区', PROJECT: '项目',
};
/** 常用组织编码 → 中文（查看范围用） */
export const ORG_CODE_LABEL: Record<string, string> = {
  'ORG-GROUP': '金凤凰控股集团', 'BU-AGRI': '凤凰农业事业群', 'BU-FOOD': '凤凰食品事业群',
  'COMP-LAO-AGRI': '老挝凤凰农业', 'COMP-LAO-XINGCHI': '星驰养鸡场', 'COMP-LAO-FOOD': '老挝凤凰食品',
  'SITE-MENGSAI-LAYER': '孟赛蛋鸡养殖场', 'SITE-DONGPENG-LAYER': '东鹏蛋鸡养殖场', 'SITE-VTE-SLAUGHTER': '万象屠宰加工厂',
};
export const lbl = (dict: Record<string, string>, k?: string | null) => (k ? (dict[k] ?? k) : '—');

export const shareholderApi = {
  listProjects: () => request<ShrProject[]>('/shareholders/projects'),
  listBeneficial: (projectCode?: string) =>
    request<ShrBeneficial[]>(`/shareholders/beneficial${projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ''}`),
  getProject: (code: string) => request<ShrProject & { equity: ShrEquity[] }>(`/shareholders/projects/${code}`),
  listShareholders: () => request<ShrShareholder[]>('/shareholders'),
  listEquity: (projectCode?: string) =>
    request<ShrEquity[]>(`/shareholders/equity${projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ''}`),
  listContributions: (projectCode?: string) =>
    request<ShrContribution[]>(`/shareholders/contributions${projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ''}`),
  listScopes: () => request<ShrScope[]>('/shareholders/scopes'),
  dashboard: () => request<{ scope: string; count?: number; projects: ShrProject[]; note?: string }>('/shareholders/dashboard'),
};
