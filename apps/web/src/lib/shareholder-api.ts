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
  capitalFlowNo?: string | null; attachmentCount?: number; attachmentUrls?: string[] | null;
  wfInstanceId?: string | null;
  confirmedBy?: string | null; confirmedAt?: string | null; financeBridgeStatus?: string;
  reversalOfId?: string | null; createdAt?: string; updatedAt?: string;
}
export interface CapitalStats {
  monthAdded: { total: number; count: number };
  recent: ShrContribution[];
  shareholderRanking: { shareholderCode: string; total: number }[];
  projectRanking: { projectCode: string; total: number }[];
  monthlyTrend: { ym: string; total: number; count: number }[];
}
export interface FinanceBridge {
  mode: string; note: string;
  reconciliation: { shrTotal: number; finTotal: number; diff: number; finParsed: boolean; bridgeStatus: string };
  shrCapitalContributions: { count: number; rows: ShrContribution[] };
  finShareholderContributions: { count: number; rows: any[] };
  gaps: string[];
}
export interface ShareholderAccountingCompany {
  companyCode: string; companyName: string; bookId: string; bookName: string; period: string;
  erpPaidIn: number; chanjetPaidIn: number; difference: number;
  reconciliationStatus: 'OK' | 'MISMATCH'; eligibleContributionTotal: number;
  internalDifference: number; debtOrAdvanceTotal: number; manualReviewTotal: number;
  shareholderCount: number; approvedMappingCount: number; mappingCoverage: number;
  eligibleContributionCount: number; undatedEligibleContributionCount: number; matchedContributionCount: number;
}
export interface ShareholderAccountingOverview {
  decision: 'GO_WITH_CONDITIONS' | 'HOLD';
  authority: Record<string, string>;
  safeguards: { chanjetReadOnly: boolean; externalWriteEnabled: boolean; automaticPostingEnabled: boolean; debtIncludedInPaidInCapital: boolean };
  totals: { erpPaidIn: number; chanjetPaidIn: number; difference: number; debtOrAdvance: number };
  companies: ShareholderAccountingCompany[];
  shareholders: Array<{
    projectCode: string; projectName: string; companyCode: string;
    shareholderCode: string; shareholderName: string; erpPaidIn: number;
    subscribedCapital: number; mappingStatus: 'APPROVED' | 'CANDIDATE' | 'NEED_REVIEW' | 'UNMAPPED';
    approvedMappings: Array<{ subjectId: string; subjectCode: string; subjectName: string; currency: string }>;
    candidates: Array<{ subjectId: string; subjectCode: string; subjectName: string; amount: number; currency: string }>;
  }>;
  contributionClassification: Array<{
    id: string; contributionNo: string; companyCode: string; projectCode: string;
    shareholderCode: string; shareholderName: string; amount: number; currency: string;
    contributionDate?: string | null; sourceType: string;
    accountingClass: 'EQUITY' | 'DEBT_OR_ADVANCE' | 'MANUAL_REVIEW'; status: string; matched: boolean;
  }>;
  generatedAt: string;
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
  BANK_TRANSFER: '银行转账', DIVIDEND_OFFSET: '分红转投资',
  YANTAI_DIVIDEND_OFFSET: '烟台分红转投资', XINGCHI_DIVIDEND_OFFSET: '星驰分红转投资',
  SHAREHOLDER_ADVANCE: '股东垫资', GOODS_PAYMENT: '代付货款',
  PERSONAL_PAYMENT: '股东个人代付', EQUIPMENT_INVESTMENT: '设备投入', LAND_INVESTMENT: '土地投入',
  REVERSAL: '冲销', CASH: '现金', CAPITAL_SUMMARY_IMPORT: '历史实缴(汇总导入)', OTHER: '其他',
};
/** 新增资本流时的来源下拉选项（按业务排序；历史值仍可正常显示） */
export const SOURCE_TYPE_OPTIONS = [
  'BANK_TRANSFER', 'YANTAI_DIVIDEND_OFFSET', 'XINGCHI_DIVIDEND_OFFSET',
  'SHAREHOLDER_ADVANCE', 'GOODS_PAYMENT', 'EQUIPMENT_INVESTMENT', 'LAND_INVESTMENT', 'OTHER',
];
export const PAID_IN_SOURCE_LABEL: Record<string, string> = {
  LEDGER: '逐笔台账', CAPITAL_SUMMARY_IMPORT: '资本汇总表',
};
export const CONTRIB_STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿', SUBMITTED: '已提交', APPROVED: '审批通过',
  CONFIRMED: '已确认到账', CANCELLED: '已取消', REVERSED: '已冲销',
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
  // 资本流引擎（Phase 3）
  capitalStats: () => request<CapitalStats>('/shareholders/capital/stats'),
  listFlows: (q: { projectCode?: string; status?: string } = {}) => {
    const p = new URLSearchParams(); if (q.projectCode) p.set('projectCode', q.projectCode); if (q.status) p.set('status', q.status);
    return request<ShrContribution[]>(`/shareholders/capital${p.toString() ? `?${p}` : ''}`);
  },
  getFlow: (id: string) => request<ShrContribution>(`/shareholders/capital/${id}`),
  createFlow: (dto: any) => request<ShrContribution>('/shareholders/capital', { method: 'POST', body: JSON.stringify(dto) }),
  submitFlow: (id: string) => request<ShrContribution>(`/shareholders/capital/${id}/submit`, { method: 'POST' }),
  confirmFlow: (id: string) => request<ShrContribution>(`/shareholders/capital/${id}/confirm`, { method: 'POST' }),
  reverseFlow: (id: string, reason: string) => request<ShrContribution>(`/shareholders/capital/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }),
  updateFlowAttachments: (id: string, attachmentUrls: string[]) =>
    request<ShrContribution>(`/shareholders/capital/${id}/attachments`, { method: 'PATCH', body: JSON.stringify({ attachmentUrls }) }),
  financeBridge: (projectCode?: string) =>
    request<FinanceBridge>(`/shareholders/finance-bridge${projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : ''}`),
  accountingOverview: (period?: string) =>
    request<ShareholderAccountingOverview>(`/shareholders/accounting/overview${period ? `?period=${encodeURIComponent(period)}` : ''}`),
  accountingCloseReadiness: (period?: string) =>
    request<Record<string, unknown>>(`/shareholders/accounting/month-close-readiness${period ? `?period=${encodeURIComponent(period)}` : ''}`),
  voucherCandidates: (contributionId: string) =>
    request<Record<string, unknown>>(`/shareholders/accounting/contributions/${encodeURIComponent(contributionId)}/voucher-candidates`),
  voucherDraftPreview: (contributionId: string) =>
    request<Record<string, unknown>>(`/shareholders/accounting/contributions/${encodeURIComponent(contributionId)}/voucher-draft-preview`),
};
