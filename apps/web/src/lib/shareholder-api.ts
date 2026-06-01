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
