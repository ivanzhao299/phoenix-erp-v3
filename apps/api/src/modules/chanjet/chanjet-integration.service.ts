import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetAccountBookEntity } from './chanjet-account-book.entity';
import { ChanjetApiFieldCatalogEntity } from './chanjet-api-field-catalog.entity';
import { ChanjetBookCompanyMapEntity } from './chanjet-book-company-map.entity';
import { ChanjetMasterMappingEntity, ChanjetMappingType } from './chanjet-master-mapping.entity';
import { ChanjetSyncJobEntity } from './chanjet-sync-job.entity';
import { ChanjetVoucherDraftEntity } from './chanjet-voucher-draft.entity';
import { ChanjetReconciliationResultEntity } from './chanjet-reconciliation-result.entity';
import { ChanjetReadSnapshotEntity } from './chanjet-read-snapshot.entity';
import { ChanjetEntitySnapshotEntity } from './chanjet-entity-snapshot.entity';
import { ChanjetErpFieldMappingEntity } from './chanjet-erp-field-mapping.entity';
import * as crypto from 'crypto';

type HttpMethod = 'GET' | 'POST';
type SampleType = ChanjetApiFieldCatalogEntity['sampleType'];

interface ProbeEndpoint {
  key: string;
  label: string;
  apiDomain: string;
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  requiresBook?: boolean;
  mappingType?: ChanjetMappingType;
  entityType?: string;
  periodQuery?: boolean;
  mirrorDefault?: boolean;
}

interface NormalizedBook {
  bookId: string;
  bookName: string;
  rawData: Record<string, unknown>;
}

interface VoucherDraftInput {
  sourceBizType: string;
  sourceBizId: string;
  companyCode?: string;
  bookId?: string;
  period?: string;
  title?: string;
  voucherLines: Array<Record<string, unknown>>;
  rawData?: Record<string, unknown>;
}

interface FinanceAdapterBucketDefinition {
  key: string;
  title: string;
  priority: 'P0' | 'P1';
  endpointKeys: string[];
  entityTypes: string[];
  erpTarget: string;
  adapterScope: string;
}

interface MasterDataAlignmentDomainDefinition {
  key: string;
  title: string;
  mappingTypes: ChanjetMappingType[];
  endpointKeys: string[];
  entityTypes: string[];
  erpTargets: string[];
  priority: 'P0' | 'P1';
  authorityRule: string;
}

export type FinanceReconciliationStatus = 'OK' | 'WARN' | 'MISMATCH' | 'HOLD' | 'NEED_MAPPING' | 'NEED_MANUAL_REVIEW';
export type FinanceSemanticLockStatus = 'LOCKED' | 'PARTIAL' | 'PENDING' | 'HOLD';

export interface FinanceSemanticLock {
  key: string;
  label: string;
  status: FinanceSemanticLockStatus;
  authorityEligible: boolean;
  chanjetEntityTypes: string[];
  lockedFields: string[];
  pendingFields: string[];
  dateRule: string;
  amountRule: string;
  statusRule: string;
  erpComparisonRule: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  nextAction: string;
}

export type FinanceSemanticExtractorStatus = 'READY' | 'PARTIAL' | 'WAITING_SAMPLE' | 'NEED_EXTRACTION' | 'HOLD';

export interface FinanceSemanticFieldCandidate {
  semanticField: string;
  candidatePaths: Array<{
    path: string;
    sampleType: SampleType;
    sampleValue: string | null;
    observedCount: number;
  }>;
  required: boolean;
  status: 'FOUND' | 'MISSING';
}

export interface FinanceSemanticExtractor {
  key: string;
  label: string;
  status: FinanceSemanticExtractorStatus;
  authorityEligible: boolean;
  sourceEntityTypes: string[];
  sampleRows: number;
  latestPulledAt: string | null;
  fieldCandidates: FinanceSemanticFieldCandidate[];
  extractedFields: number;
  requiredFields: number;
  missingRequiredFields: string[];
  reason: string;
  nextAction: string;
}

export type FinanceReadModelStatus = 'AUTHORITY_READY' | 'READONLY_READY' | 'BLOCKED_MAPPING' | 'WAITING_SAMPLE' | 'NEED_MANUAL_REVIEW' | 'HOLD';
export type ReceiptPaymentLockStatus = 'LOCKED' | 'PARTIAL' | 'WAITING_SAMPLE' | 'HOLD';

export interface FinanceReadModelMetric {
  key: string;
  label: string;
  priority: 'P0' | 'P1';
  status: FinanceReadModelStatus;
  authorityEligible: boolean;
  displayValue: number | null;
  erpAuxiliaryValue: number | null;
  diff: number | null;
  valueSource: string;
  sourceEntityTypes: string[];
  sampleRows: number;
  latestPulledAt: string | null;
  requiredFields: string[];
  missingRequiredFields: string[];
  selectedValueFields: Array<{
    semanticField: string;
    candidatePath: string;
    sampleValue: string | null;
  }>;
  reason: string;
  nextAction: string;
}

export interface FinanceCardSemanticExpansionItem {
  cardKey: string;
  label: string;
  readModelKey: string;
  currentStatus: FinanceReadModelStatus | 'WAITING_SAMPLE';
  sampleRows: number;
  latestPulledAt: string | null;
  currentAuthorityEnabled: boolean;
  candidateForReadonlyDetail: boolean;
  candidateForAuthorityPromotion: boolean;
  requiresFinanceConfirmation: boolean;
  requiredFields: string[];
  lockedFields: string[];
  missingFields: string[];
  blockers: string[];
  sourceEntityTypes: string[];
  recommendedAction: string;
}

export type FinanceCardSemanticReviewStatus =
  | 'APPROVED_FOR_AUTHORITY'
  | 'READY_FOR_FINANCE_CONFIRMATION'
  | 'BLOCKED'
  | 'HOLD';

export type FinanceCardSystemConfirmationStatus =
  | 'SYSTEM_CONFIRMED_AUTHORITY'
  | 'SYSTEM_CONFIRMED_READONLY'
  | 'SYSTEM_BLOCKED_FROM_AUTHORITY'
  | 'HOLD';

export interface FinanceCardSemanticReviewItem {
  reviewId: string;
  cardKey: string;
  label: string;
  readModelKey: string;
  reviewStatus: FinanceCardSemanticReviewStatus;
  currentStatus: string;
  sampleRows: number;
  latestPulledAt: string | null;
  currentAuthorityEnabled: boolean;
  candidateForReadonlyDetail: boolean;
  candidateForAuthorityPromotion: boolean;
  requiresFinanceConfirmation: boolean;
  financeConfirmationQuestions: string[];
  lockedFields: string[];
  missingFields: string[];
  blockers: string[];
  evidence: string[];
  approvalInstruction: string;
  recommendedAction: string;
}

export interface FinanceCardSystemConfirmationItem {
  confirmationId: string;
  cardKey: string;
  label: string;
  readModelKey: string;
  confirmationStatus: FinanceCardSystemConfirmationStatus;
  approvedPrimarySource: 'CHANJET' | 'ERP' | 'CHANJET_READONLY';
  erpSemanticDefinition: string;
  chanjetSemanticDefinition: string;
  fieldMappingDecision: string;
  calculationRule: string;
  displayRule: string;
  manualFinanceConfirmationRequired: false;
  authorityAllowed: boolean;
  readonlyAllowed: boolean;
  blockers: string[];
  evidence: string[];
  nextAction: string;
}

export interface ReceiptPaymentDateStatusLock {
  key: 'TODAY_RECEIPT' | 'TODAY_PAYMENT';
  label: string;
  entityType: 'AR_RECEIPT' | 'AP_PAYMENT';
  status: ReceiptPaymentLockStatus;
  sampleRows: number;
  latestPulledAt: string | null;
  requiredDimensions: string[];
  lockedDimensions: string[];
  missingDimensions: string[];
  fieldCandidates: FinanceSemanticFieldCandidate[];
  dateRule: string;
  statusRule: string;
  directionRule: string;
  amountRule: string;
  readyForFinanceReview: boolean;
  readyForCardAuthority: boolean;
  reason: string;
  nextAction: string;
}

export interface FinanceReconciliationItem {
  key: string;
  label: string;
  priority: 'P0' | 'P1';
  chanjetEndpointKeys: string[];
  chanjetEntityTypes: string[];
  erpSources: string[];
  chanjetValue: number | null;
  erpValue: number | null;
  diff: number | null;
  diffRate: number | null;
  status: FinanceReconciliationStatus;
  evidence: {
    chanjetRows: number;
    latestPulledAt: string | null;
    erpRows: number;
  };
  reason: string;
  recommendedAction: string;
  semanticLock: FinanceSemanticLock;
}

const FINANCE_SEMANTIC_LOCKS: FinanceSemanticLock[] = [
  {
    key: 'AR_OPEN',
    label: '应收待收',
    status: 'PARTIAL',
    authorityEligible: true,
    chanjetEntityTypes: ['AR_STATISTICS'],
    lockedFields: ['book_id', 'entity_type', 'external_id', 'external_name', 'amount', 'period', 'raw_data'],
    pendingFields: ['counterparty_role', 'subject_direction', 'aging_bucket', 'invoice_level_fields'],
    dateRule: '按好业财应收统计当前期间/拉取批次展示，不拆成发票到期日。',
    amountRule: 'amount 为好业财客户/往来单位级期末余额汇总；负数保留，不写 fin_ar_invoices。',
    statusRule: '统计类镜像无业务审批状态，仅作为财务汇总权威候选。',
    erpComparisonRule: 'ERP fin_ar_invoices 只作辅助差异，不被好业财汇总覆盖。',
    risk: 'HIGH',
    reason: '好业财应收统计是汇总口径，不提供 ERP 发票级字段。',
    nextAction: '继续主数据往来单位审核映射；卡片可标注好业财权威候选，但必须显示与 ERP 明细差异。',
  },
  {
    key: 'AP_OPEN',
    label: '应付待付',
    status: 'PARTIAL',
    authorityEligible: true,
    chanjetEntityTypes: ['AP_STATISTICS'],
    lockedFields: ['book_id', 'entity_type', 'external_id', 'external_name', 'amount', 'period', 'raw_data'],
    pendingFields: ['counterparty_role', 'subject_direction', 'invoice_level_fields'],
    dateRule: '按好业财应付统计当前期间/拉取批次展示，不拆成单据到期日。',
    amountRule: 'amount 为好业财供应商/往来单位级期末余额汇总；负数保留。',
    statusRule: '统计类镜像无业务审批状态，仅作为财务汇总权威候选。',
    erpComparisonRule: 'ERP fin_ap_invoices 只作辅助差异，不静默覆盖。',
    risk: 'HIGH',
    reason: '好业财应付统计是汇总口径，与 ERP 应付单据明细不是同一粒度。',
    nextAction: '锁定供应商/往来单位映射后进入差异拆解。',
  },
  {
    key: 'CASH_BALANCE',
    label: '现金 / 银行余额',
    status: 'PENDING',
    authorityEligible: false,
    chanjetEntityTypes: ['CASH_ACCOUNT', 'GL_BALANCE'],
    lockedFields: ['book_id', 'entity_type', 'external_id', 'external_code', 'external_name', 'raw_data'],
    pendingFields: ['current_balance', 'available_balance', 'currency_balance', 'account_status'],
    dateRule: '资金账户余额必须明确余额时点；当前只证明资金账号列表存在。',
    amountRule: '不得把 entity amountSum=0 视作真实账户余额。',
    statusRule: '账户启停与币种状态需从 raw_data 明确抽取。',
    erpComparisonRule: 'ERP fin_cash_accounts.current_balance 继续作为辅助值；好业财余额字段锁定前不覆盖卡片。',
    risk: 'CRITICAL',
    reason: '资金账号镜像已覆盖，但余额字段未锁定；0 可能是未抽取，不是真实余额。',
    nextAction: '从 raw snapshot 抽样确认余额字段路径，再建立 CASH_ACCOUNT_BALANCE read model。',
  },
  {
    key: 'TODAY_RECEIPT',
    label: '今日收款',
    status: 'PENDING',
    authorityEligible: false,
    chanjetEntityTypes: ['AR_RECEIPT'],
    lockedFields: ['book_id', 'entity_type', 'external_id', 'amount', 'raw_data'],
    pendingFields: ['business_date', 'posted_date', 'approved_status', 'void_status', 'direction'],
    dateRule: '必须确认业务日、入账日、制单日、审核日哪一个用于“今日”。',
    amountRule: '当前 amountSum 是列表累计，不等于今日实收。',
    statusRule: '必须过滤已作废/未审核/草稿等状态后才能影响卡片。',
    erpComparisonRule: 'ERP 今日收款继续使用本地现金流水辅助值。',
    risk: 'CRITICAL',
    reason: '日期和审核状态口径未锁定。',
    nextAction: '抽样收款单 raw_data，锁定日期字段和有效状态枚举。',
  },
  {
    key: 'TODAY_PAYMENT',
    label: '今日付款',
    status: 'PENDING',
    authorityEligible: false,
    chanjetEntityTypes: ['AP_PAYMENT'],
    lockedFields: ['book_id', 'entity_type', 'external_id', 'amount', 'raw_data'],
    pendingFields: ['business_date', 'posted_date', 'approved_status', 'void_status', 'direction'],
    dateRule: '必须确认业务日、入账日、制单日、审核日哪一个用于“今日”。',
    amountRule: '当前 amountSum 是列表累计，不等于今日实付。',
    statusRule: '必须过滤已作废/未审核/草稿等状态后才能影响卡片。',
    erpComparisonRule: 'ERP 今日付款继续使用本地现金流水辅助值。',
    risk: 'CRITICAL',
    reason: '日期和审核状态口径未锁定。',
    nextAction: '抽样付款单 raw_data，锁定日期字段和有效状态枚举。',
  },
  {
    key: 'SUBJECT_BALANCE',
    label: '科目余额',
    status: 'PENDING',
    authorityEligible: false,
    chanjetEntityTypes: ['GL_BALANCE'],
    lockedFields: ['book_id', 'entity_type', 'raw_data'],
    pendingFields: ['subject_code', 'subject_name', 'opening_balance', 'debit_amount', 'credit_amount', 'closing_balance', 'direction'],
    dateRule: '按账套与会计期间展示，期间字段需从 raw_data 明确确认。',
    amountRule: '必须拆出期初、本期借方、本期贷方、期末余额；不得使用 amountSum=0。',
    statusRule: '科目余额表无审批状态，但需要科目启用/末级状态说明。',
    erpComparisonRule: 'ERP 无同粒度总账表时仅展示好业财只读报表，不做伪差异。',
    risk: 'HIGH',
    reason: '科目余额表已同步，但金额字段尚未结构化。',
    nextAction: '建立 GL_BALANCE semantic extractor，把 P0 字段映射为只读模型。',
  },
  {
    key: 'BALANCE_SHEET',
    label: '资产负债表关键项',
    status: 'PENDING',
    authorityEligible: false,
    chanjetEntityTypes: ['BALANCE_SHEET'],
    lockedFields: ['book_id', 'entity_type', 'raw_data'],
    pendingFields: ['line_no', 'item_name', 'begin_amount', 'ending_amount'],
    dateRule: '按报表期间和账套展示，期间需显式保留。',
    amountRule: '必须拆出报表项目、年初/期末金额；不得使用 amountSum=0。',
    statusRule: '报表类无审批状态，需保留拉取批次和账套。',
    erpComparisonRule: 'ERP 经营数据只做辅助解释，不与报表行强行一一对应。',
    risk: 'HIGH',
    reason: '报表行项目字段尚未锁定。',
    nextAction: '建立 BALANCE_SHEET semantic extractor 和关键项展示映射。',
  },
  {
    key: 'INCOME_STATEMENT',
    label: '利润表关键项',
    status: 'PENDING',
    authorityEligible: false,
    chanjetEntityTypes: ['INCOME_STATEMENT'],
    lockedFields: ['book_id', 'entity_type', 'raw_data'],
    pendingFields: ['line_no', 'item_name', 'current_period_amount', 'year_to_date_amount'],
    dateRule: '按报表期间和账套展示，期间需显式保留。',
    amountRule: '必须拆出本期金额和累计金额；不得使用 amountSum=0。',
    statusRule: '报表类无审批状态，需保留拉取批次和账套。',
    erpComparisonRule: 'ERP 销售/采购/费用经营数据只做辅助解释。',
    risk: 'HIGH',
    reason: '利润表行项目字段尚未锁定。',
    nextAction: '建立 INCOME_STATEMENT semantic extractor 和关键项展示映射。',
  },
  {
    key: 'CASH_FLOW',
    label: '现金流量表关键项',
    status: 'PENDING',
    authorityEligible: false,
    chanjetEntityTypes: ['CASH_FLOW'],
    lockedFields: ['book_id', 'entity_type', 'raw_data'],
    pendingFields: ['line_no', 'item_name', 'current_period_amount', 'year_to_date_amount', 'cash_flow_category'],
    dateRule: '按报表期间和账套展示，期间需显式保留。',
    amountRule: '必须拆出现金流项目金额；不得使用 amountSum=0。',
    statusRule: '报表类无审批状态。',
    erpComparisonRule: 'ERP 现金流水仅作辅助解释。',
    risk: 'MEDIUM',
    reason: '现金流量表字段尚未锁定。',
    nextAction: '排在资产负债表/利润表之后建立 semantic extractor。',
  },
  {
    key: 'VOUCHER_LIST',
    label: '凭证列表 / 明细',
    status: 'PARTIAL',
    authorityEligible: false,
    chanjetEntityTypes: ['VOUCHER'],
    lockedFields: ['voucher_header_candidate', 'voucher_line_candidate', 'raw_data'],
    pendingFields: ['voucher_status', 'posting_date', 'assistant_accounting', 'subject_mapping_review'],
    dateRule: '凭证日期/期间需以好业财凭证字段为准，不能用拉取时间代替。',
    amountRule: '借贷金额必须按行保留 Decimal 字符串，不用 JS 浮点做账。',
    statusRule: '写回仍关闭；只读重现可用，推送必须进入 P4 单独 Gate。',
    erpComparisonRule: 'ERP 凭证草稿仅作为候选，不自动推送。',
    risk: 'CRITICAL',
    reason: '凭证只读重现已有候选字段，但写回链路必须继续关闭。',
    nextAction: '建立凭证只读详情页与人工审核队列；P4 前不得开放写好业财。',
  },
];

const FINANCE_ADAPTER_BUCKETS: FinanceAdapterBucketDefinition[] = [
  {
    key: 'CHANJET_VOUCHER_HEADER',
    title: '凭证头',
    priority: 'P0',
    endpointKeys: ['VOUCHER_SEARCH'],
    entityTypes: ['VOUCHER'],
    erpTarget: 'chanjet_voucher_drafts.header_snapshot',
    adapterScope: '凭证号、期间、制单人、审核状态、摘要等只读重现。',
  },
  {
    key: 'CHANJET_VOUCHER_LINE',
    title: '凭证明细',
    priority: 'P0',
    endpointKeys: ['VOUCHER_SEARCH'],
    entityTypes: ['VOUCHER'],
    erpTarget: 'chanjet_voucher_drafts.voucher_lines',
    adapterScope: '科目、借方、贷方、辅助核算、摘要等只读重现。',
  },
  {
    key: 'CHANJET_COUNTERPARTY',
    title: '往来单位',
    priority: 'P0',
    endpointKeys: ['CUSTOMER_SUPPLIER'],
    entityTypes: ['CUSTOMER_SUPPLIER'],
    erpTarget: 'chanjet_master_mappings.CUSTOMER/SUPPLIER',
    adapterScope: '客户/供应商往来单位候选映射，必须人工审核后才能作为后续入账依据。',
  },
  {
    key: 'CHANJET_AP_AR_AGGREGATE',
    title: '应收/应付汇总',
    priority: 'P0',
    endpointKeys: ['PAYABLE_STATISTICS', 'RECEIVABLE_STATISTICS'],
    entityTypes: ['AP_STATISTICS', 'AR_STATISTICS'],
    erpTarget: 'chanjet_entity_snapshots + fin_ar_ledger review input',
    adapterScope: '好业财客户/供应商级汇总，只能进入汇总/对账，不得写入 fin_ar_invoices。',
  },
  {
    key: 'CHANJET_PAYMENT_DOCUMENT',
    title: '收付款单',
    priority: 'P0',
    endpointKeys: ['PAYMENT_AP', 'PAYMENT_AR'],
    entityTypes: ['AP_PAYMENT', 'AR_RECEIPT'],
    erpTarget: 'finance-v2 payment readonly adapter',
    adapterScope: '收付款单只读重现和 ERP 单据匹配候选。',
  },
  {
    key: 'CHANJET_CASH_ACCOUNT',
    title: '现金/银行账户',
    priority: 'P0',
    endpointKeys: ['FIN_ACCOUNT'],
    entityTypes: ['CASH_ACCOUNT'],
    erpTarget: 'finance-v2 cash readonly authority candidate',
    adapterScope: '资金账户、币种、账号、启停状态只读重现；财务卡片现金/银行余额必须显式标注来源。',
  },
  {
    key: 'CHANJET_GL_BALANCE',
    title: '科目余额表',
    priority: 'P0',
    endpointKeys: ['GL_BALANCE'],
    entityTypes: ['GL_BALANCE'],
    erpTarget: 'finance-v2 subject balance readonly adapter',
    adapterScope: '科目期初、本期借贷、期末余额等字段进入对账和财务卡片口径判断。',
  },
  {
    key: 'CHANJET_FINANCIAL_STATEMENTS',
    title: '财务报表',
    priority: 'P0',
    endpointKeys: ['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW'],
    entityTypes: ['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW'],
    erpTarget: 'finance-v2 statement readonly adapter',
    adapterScope: '资产负债表、利润表、现金流量表关键项只读重现；不反写 ERP 业务明细。',
  },
  {
    key: 'CHANJET_PURCHASE_LINKAGE',
    title: '采购链路',
    priority: 'P1',
    endpointKeys: ['PURCHASE_ORDER'],
    entityTypes: ['PURCHASE_ORDER'],
    erpTarget: 'procurement-v2 readonly reconciliation input',
    adapterScope: '采购订单只读重现和 ERP 采购单据差异分析。',
  },
];

const MASTER_DATA_ALIGNMENT_DOMAINS: MasterDataAlignmentDomainDefinition[] = [
  {
    key: 'COMPANY_BOOK',
    title: '公司 / 账套',
    mappingTypes: ['COMPANY'],
    endpointKeys: ['ACCOUNT_BOOKS'],
    entityTypes: ['ACCOUNT_BOOK'],
    erpTargets: ['sys_organizations.company_code', 'chanjet_book_company_map.bookid'],
    priority: 'P0',
    authorityRule: '账套归属必须人工审核后绑定 ERP 公司；不得用名称相似自动覆盖公司档案。',
  },
  {
    key: 'DEPARTMENT_ORG',
    title: '部门 / 组织',
    mappingTypes: ['DEPARTMENT'],
    endpointKeys: ['DEPARTMENT'],
    entityTypes: ['DEPARTMENT'],
    erpTargets: ['sys_organizations.organization_code', 'sys_user_orgs'],
    priority: 'P1',
    authorityRule: '部门映射影响 DataScope，只能进入候选映射和人工复核。',
  },
  {
    key: 'COUNTERPARTY',
    title: '客户 / 供应商 / 往来单位',
    mappingTypes: ['CUSTOMER', 'SUPPLIER'],
    endpointKeys: ['CUSTOMER_SUPPLIER'],
    entityTypes: ['CUSTOMER_SUPPLIER'],
    erpTargets: ['sal_customers.customer_code', 'prc2_suppliers.supplier_code'],
    priority: 'P0',
    authorityRule: '往来单位必须区分客户/供应商/双重身份；不得把好业财汇总行写入发票级表。',
  },
  {
    key: 'SUBJECT',
    title: '会计科目',
    mappingTypes: ['SUBJECT'],
    endpointKeys: ['SUBJECT', 'GL_BALANCE'],
    entityTypes: ['SUBJECT', 'GL_BALANCE'],
    erpTargets: ['chanjet_master_mapping.SUBJECT', 'finance-v2 reporting adapter'],
    priority: 'P0',
    authorityRule: '会计科目以好业财为财务口径权威，ERP 只保存映射和只读引用。',
  },
  {
    key: 'PROJECT',
    title: '项目',
    mappingTypes: ['PROJECT'],
    endpointKeys: ['PROJECT'],
    entityTypes: ['PROJECT'],
    erpTargets: ['prc2_projects.project_code', 'sys_user_projects'],
    priority: 'P0',
    authorityRule: '项目映射影响采购/付款/费用归属，需与 ERP 项目主数据对齐后才能用于写回前校验。',
  },
  {
    key: 'CASH_ACCOUNT',
    title: '资金账户',
    mappingTypes: ['CASH_ACCOUNT'],
    endpointKeys: ['FIN_ACCOUNT'],
    entityTypes: ['CASH_ACCOUNT'],
    erpTargets: ['fin_cash_accounts.account_code'],
    priority: 'P0',
    authorityRule: '现金/银行余额展示以好业财只读镜像优先，ERP 现金账户作为辅助差异明细。',
  },
  {
    key: 'CURRENCY',
    title: '币种',
    mappingTypes: ['CURRENCY'],
    endpointKeys: ['FIN_ACCOUNT', 'PAYMENT_AP', 'PAYMENT_AR'],
    entityTypes: ['CASH_ACCOUNT', 'AP_PAYMENT', 'AR_RECEIPT'],
    erpTargets: ['sys_dict.SYS_CURRENCY'],
    priority: 'P1',
    authorityRule: '币种必须归一到 SYS_CURRENCY；金额展示不得混淆本币/原币。',
  },
];

const PROBE_ENDPOINTS: ProbeEndpoint[] = [
  {
    key: 'ACCOUNT_BOOKS',
    label: '账套列表',
    apiDomain: 'account-book',
    method: 'GET',
    path: '/accounting/openapi/cc/book/findByEnterpriseId',
    query: { queryType: 'BINDING_TO_THIRD_PLATFORM' },
    entityType: 'ACCOUNT_BOOK',
    mirrorDefault: true,
  },
  {
    key: 'DEPARTMENT',
    label: '部门列表',
    apiDomain: 'master-data',
    method: 'GET',
    path: '/accounting/openapi/cc/department/list/{bookid}',
    requiresBook: true,
    mappingType: 'DEPARTMENT',
    entityType: 'DEPARTMENT',
    mirrorDefault: true,
  },
  {
    key: 'CUSTOMER_SUPPLIER',
    label: '往来单位',
    apiDomain: 'master-data',
    method: 'POST',
    path: '/accounting/openapi/cc/party/custvendor/query/{bookid}',
    body: {},
    requiresBook: true,
    mappingType: 'CUSTOMER',
    entityType: 'CUSTOMER_SUPPLIER',
    mirrorDefault: true,
  },
  {
    key: 'SUBJECT',
    label: '科目列表',
    apiDomain: 'accounting',
    method: 'GET',
    path: '/accounting/openapi/cc/subject/list/{bookid}',
    requiresBook: true,
    mappingType: 'SUBJECT',
    entityType: 'SUBJECT',
    mirrorDefault: true,
  },
  {
    key: 'PROJECT',
    label: '项目列表',
    apiDomain: 'master-data',
    method: 'POST',
    path: '/accounting/openapi/cc/project/list/{bookid}',
    body: {},
    requiresBook: true,
    mappingType: 'PROJECT',
    entityType: 'PROJECT',
    mirrorDefault: true,
  },
  {
    key: 'FIN_ACCOUNT',
    label: '资金账号',
    apiDomain: 'master-data',
    method: 'POST',
    path: '/accounting/openapi/cc/finaccount/list/{bookid}',
    body: {},
    requiresBook: true,
    mappingType: 'CASH_ACCOUNT',
    entityType: 'CASH_ACCOUNT',
    mirrorDefault: true,
  },
  {
    key: 'PAYABLE_STATISTICS',
    label: '应付统计',
    apiDomain: 'ap',
    method: 'GET',
    path: '/accounting/gl/statistics/pay/{bookid}',
    query: { period: new Date().toISOString().slice(0, 7).replace('-', '') },
    requiresBook: true,
    entityType: 'AP_STATISTICS',
    periodQuery: true,
    mirrorDefault: true,
  },
  {
    key: 'RECEIVABLE_STATISTICS',
    label: '应收统计',
    apiDomain: 'ar',
    method: 'GET',
    path: '/accounting/gl/statistics/receive/{bookid}',
    query: { period: new Date().toISOString().slice(0, 7).replace('-', '') },
    requiresBook: true,
    entityType: 'AR_STATISTICS',
    periodQuery: true,
    mirrorDefault: true,
  },
  {
    key: 'PAYMENT_AP',
    label: '付款单列表',
    apiDomain: 'payment',
    method: 'POST',
    path: '/accounting/openapi/cc/payment/ap/list/{bookid}',
    body: {},
    requiresBook: true,
    entityType: 'AP_PAYMENT',
    mirrorDefault: true,
  },
  {
    key: 'PAYMENT_AR',
    label: '收款单列表',
    apiDomain: 'payment',
    method: 'POST',
    path: '/accounting/openapi/cc/payment/ar/list/{bookid}',
    body: {},
    requiresBook: true,
    entityType: 'AR_RECEIPT',
    mirrorDefault: true,
  },
  {
    key: 'PURCHASE_ORDER',
    label: '采购订单列表',
    apiDomain: 'procurement',
    method: 'POST',
    path: '/accounting/openapi/cc/purchaseorder/list/{bookid}',
    body: {},
    requiresBook: true,
    entityType: 'PURCHASE_ORDER',
    mirrorDefault: true,
  },
  {
    key: 'SALES_ORDER',
    label: '销售订单列表',
    apiDomain: 'sales',
    method: 'POST',
    path: '/accounting/internal/cc/salesorder/list',
    body: {},
    entityType: 'SALES_ORDER',
  },
  {
    key: 'PURCHASE_APPLY',
    label: '采购申请单列表',
    apiDomain: 'procurement',
    method: 'POST',
    path: '/accounting/openapi/cc/inv/purchaseapply/list/{bookid}',
    body: {},
    requiresBook: true,
    entityType: 'PURCHASE_APPLY',
  },
  {
    key: 'STOCK_IN',
    label: '入库单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/purchasestockin/list',
    body: {},
    entityType: 'STOCK_IN',
  },
  {
    key: 'SALES_STOCK_OUT',
    label: '销售出库单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/salesstockout/list/{bookid}',
    body: {},
    requiresBook: true,
    entityType: 'SALES_STOCK_OUT',
  },
  {
    key: 'VOUCHER_SEARCH',
    label: '凭证列表',
    apiDomain: 'voucher',
    method: 'GET',
    path: '/accounting/gl/AcctgTrans/acctgTransFuzzySearch/{bookid}',
    query: {},
    requiresBook: true,
    entityType: 'VOUCHER',
    mirrorDefault: true,
  },
  {
    key: 'GL_BALANCE',
    label: '科目余额表',
    apiDomain: 'gl',
    method: 'POST',
    path: '/accounting/gl/balance/rpt/{bookid}',
    body: {},
    requiresBook: true,
    entityType: 'GL_BALANCE',
    mirrorDefault: true,
  },
  {
    key: 'BALANCE_SHEET',
    label: '资产负债表',
    apiDomain: 'report',
    method: 'GET',
    path: '/accounting/fin/getOldBalanceSheet/{bookid}',
    query: {},
    requiresBook: true,
    entityType: 'BALANCE_SHEET',
    mirrorDefault: true,
  },
  {
    key: 'INCOME_STATEMENT',
    label: '利润表',
    apiDomain: 'report',
    method: 'GET',
    path: '/accounting/fin/getOldIncomeStatement/{bookid}',
    query: {},
    requiresBook: true,
    entityType: 'INCOME_STATEMENT',
    mirrorDefault: true,
  },
  {
    key: 'CASH_FLOW',
    label: '现金流量表',
    apiDomain: 'report',
    method: 'GET',
    path: '/accounting/asr/CashFlow/{bookid}',
    query: {},
    requiresBook: true,
    entityType: 'CASH_FLOW',
    mirrorDefault: true,
  },
];

@Injectable()
export class ChanjetIntegrationService {
  private readonly log = new Logger('ChanjetIntegration');

  constructor(
    private readonly auth: ChanjetAuthService,
    @InjectDataSource()
    private readonly ds: DataSource,
    @InjectRepository(ChanjetAccountBookEntity)
    private readonly accountBookRepo: Repository<ChanjetAccountBookEntity>,
    @InjectRepository(ChanjetApiFieldCatalogEntity)
    private readonly fieldCatalogRepo: Repository<ChanjetApiFieldCatalogEntity>,
    @InjectRepository(ChanjetMasterMappingEntity)
    private readonly mappingRepo: Repository<ChanjetMasterMappingEntity>,
    @InjectRepository(ChanjetSyncJobEntity)
    private readonly jobRepo: Repository<ChanjetSyncJobEntity>,
    @InjectRepository(ChanjetBookCompanyMapEntity)
    private readonly bookCompanyMapRepo: Repository<ChanjetBookCompanyMapEntity>,
    @InjectRepository(ChanjetVoucherDraftEntity)
    private readonly voucherDraftRepo: Repository<ChanjetVoucherDraftEntity>,
    @InjectRepository(ChanjetReconciliationResultEntity)
    private readonly reconciliationRepo: Repository<ChanjetReconciliationResultEntity>,
    @InjectRepository(ChanjetReadSnapshotEntity)
    private readonly readSnapshotRepo: Repository<ChanjetReadSnapshotEntity>,
    @InjectRepository(ChanjetEntitySnapshotEntity)
    private readonly entitySnapshotRepo: Repository<ChanjetEntitySnapshotEntity>,
    @InjectRepository(ChanjetErpFieldMappingEntity)
    private readonly fieldMappingRepo: Repository<ChanjetErpFieldMappingEntity>,
  ) {}

  listProbeEndpoints() {
    return PROBE_ENDPOINTS.map(({ key, label, apiDomain, method, path, requiresBook, entityType, mirrorDefault }) => ({
      key,
      label,
      apiDomain,
      method,
      path,
      requiresBook: !!requiresBook,
      entityType: entityType || '',
      mirrorDefault: !!mirrorDefault,
    }));
  }

  async listAccountBooks(): Promise<ChanjetAccountBookEntity[]> {
    return this.accountBookRepo.find({ order: { enabled: 'DESC', bookName: 'ASC' } });
  }

  async overview() {
    const [
      accountBooks,
      enabledBooks,
      fields,
      mappings,
      pendingMappings,
      approvedMappings,
      jobs,
      failedJobs,
      voucherDrafts,
      pushReadyDrafts,
      openReconciliationIssues,
      readSnapshots,
      entitySnapshots,
      fieldMappings,
      unmappedFields,
    ] = await Promise.all([
      this.accountBookRepo.count(),
      this.accountBookRepo.count({ where: { enabled: true } }),
      this.fieldCatalogRepo.count(),
      this.mappingRepo.count(),
      this.mappingRepo.count({ where: { reviewStatus: 'PENDING' } }),
      this.mappingRepo.count({ where: { reviewStatus: 'APPROVED' } }),
      this.jobRepo.count(),
      this.jobRepo.count({ where: { status: 'FAIL' } }),
      this.voucherDraftRepo.count(),
      this.voucherDraftRepo.count({ where: { status: 'PUSH_READY' } }),
      this.reconciliationRepo.count({ where: { resolved: false } }),
      this.readSnapshotRepo.count(),
      this.entitySnapshotRepo.count(),
      this.fieldMappingRepo.count(),
      this.fieldMappingRepo.count({ where: { matchStatus: 'MISSING_IN_ERP' } }),
    ]);

    return {
      accountBooks,
      enabledBooks,
      fields,
      mappings,
      pendingMappings,
      approvedMappings,
      jobs,
      failedJobs,
      voucherDrafts,
      pushReadyDrafts,
      openReconciliationIssues,
      readSnapshots,
      entitySnapshots,
      fieldMappings,
      unmappedFields,
      pushEnabled: false,
      boundary: 'ERP writes middle-layer only; Chanjet push remains disabled until a separate gate approves it.',
    };
  }

  async listFieldCatalog(limit = 500): Promise<ChanjetApiFieldCatalogEntity[]> {
    return this.fieldCatalogRepo.find({
      order: { apiDomain: 'ASC', apiPath: 'ASC', fieldPath: 'ASC' },
      take: Math.min(Math.max(Number(limit) || 500, 1), 2000),
    });
  }

  async listSyncJobs(limit = 100): Promise<ChanjetSyncJobEntity[]> {
    return this.jobRepo.find({
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(Number(limit) || 100, 1), 500),
    });
  }

  async listReadSnapshots(limit = 100, endpointKey?: string): Promise<ChanjetReadSnapshotEntity[]> {
    return this.readSnapshotRepo.find({
      where: endpointKey ? { endpointKey } : {},
      order: { pulledAt: 'DESC' },
      take: Math.min(Math.max(Number(limit) || 100, 1), 500),
    });
  }

  async listEntitySnapshots(limit = 200, entityType?: string): Promise<ChanjetEntitySnapshotEntity[]> {
    return this.entitySnapshotRepo.find({
      where: entityType ? { entityType } : {},
      order: { entityType: 'ASC', updatedAt: 'DESC' },
      take: Math.min(Math.max(Number(limit) || 200, 1), 1000),
    });
  }

  async listFieldMappings(limit = 500, matchStatus?: string): Promise<ChanjetErpFieldMappingEntity[]> {
    return this.fieldMappingRepo.find({
      where: matchStatus ? { matchStatus: matchStatus as ChanjetErpFieldMappingEntity['matchStatus'] } : {},
      order: { riskLevel: 'DESC', erpDomain: 'ASC', chanjetEndpoint: 'ASC', chanjetFieldPath: 'ASC' },
      take: Math.min(Math.max(Number(limit) || 500, 1), 2000),
    });
  }

  async masterDataAlignmentOverview() {
    const [entityRows, mappingRows, fieldRows, books] = await Promise.all([
      this.entitySnapshotRepo
        .createQueryBuilder('s')
        .select('s.entityType', 'entityType')
        .addSelect('s.endpointKey', 'endpointKey')
        .addSelect('COUNT(*)', 'entityCount')
        .addSelect('MAX(s.updatedAt)', 'latestUpdatedAt')
        .groupBy('s.entityType')
        .addGroupBy('s.endpointKey')
        .getRawMany(),
      this.mappingRepo
        .createQueryBuilder('m')
        .select('m.mappingType', 'mappingType')
        .addSelect('m.matchStatus', 'matchStatus')
        .addSelect('m.reviewStatus', 'reviewStatus')
        .addSelect('COUNT(*)', 'mappingCount')
        .addSelect('AVG(CAST(m.confidence AS numeric))', 'avgConfidence')
        .groupBy('m.mappingType')
        .addGroupBy('m.matchStatus')
        .addGroupBy('m.reviewStatus')
        .getRawMany(),
      this.fieldMappingRepo
        .createQueryBuilder('f')
        .select('f.erpDomain', 'erpDomain')
        .addSelect('f.matchStatus', 'matchStatus')
        .addSelect('f.riskLevel', 'riskLevel')
        .addSelect('COUNT(*)', 'fieldCount')
        .groupBy('f.erpDomain')
        .addGroupBy('f.matchStatus')
        .addGroupBy('f.riskLevel')
        .getRawMany(),
      this.listAccountBooks(),
    ]);

    const entityByType = new Map<string, { count: number; latest: string | null }>();
    const entityByEndpoint = new Map<string, { count: number; latest: string | null }>();
    for (const row of entityRows as any[]) {
      const type = String(row.entityType || '');
      const endpoint = String(row.endpointKey || '');
      const count = Number(row.entityCount || 0);
      const latest = row.latestUpdatedAt ? String(row.latestUpdatedAt) : null;
      if (type) {
        const current = entityByType.get(type) || { count: 0, latest: null };
        entityByType.set(type, { count: current.count + count, latest: this.maxIso(current.latest, latest) });
      }
      if (endpoint) {
        const current = entityByEndpoint.get(endpoint) || { count: 0, latest: null };
        entityByEndpoint.set(endpoint, { count: current.count + count, latest: this.maxIso(current.latest, latest) });
      }
    }

    const mappingByType = new Map<string, {
      total: number;
      approved: number;
      pending: number;
      rejected: number;
      matched: number;
      manual: number;
      conflicts: number;
      confidenceSum: number;
      confidenceRows: number;
    }>();
    for (const row of mappingRows as any[]) {
      const type = String(row.mappingType || '');
      if (!type) continue;
      const count = Number(row.mappingCount || 0);
      const item = mappingByType.get(type) || {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        matched: 0,
        manual: 0,
        conflicts: 0,
        confidenceSum: 0,
        confidenceRows: 0,
      };
      item.total += count;
      if (row.reviewStatus === 'APPROVED') item.approved += count;
      if (row.reviewStatus === 'PENDING') item.pending += count;
      if (row.reviewStatus === 'REJECTED') item.rejected += count;
      if (row.matchStatus === 'MATCHED') item.matched += count;
      if (row.matchStatus === 'MANUAL') item.manual += count;
      if (row.matchStatus === 'CONFLICT') item.conflicts += count;
      if (row.avgConfidence !== null && row.avgConfidence !== undefined) {
        item.confidenceSum += Number(row.avgConfidence || 0) * count;
        item.confidenceRows += count;
      }
      mappingByType.set(type, item);
    }

    const fieldByDomain = new Map<string, {
      total: number;
      matched: number;
      transformRequired: number;
      missingInErp: number;
      highOpen: number;
    }>();
    for (const row of fieldRows as any[]) {
      const domain = String(row.erpDomain || 'unclassified');
      const count = Number(row.fieldCount || 0);
      const item = fieldByDomain.get(domain) || {
        total: 0,
        matched: 0,
        transformRequired: 0,
        missingInErp: 0,
        highOpen: 0,
      };
      item.total += count;
      if (row.matchStatus === 'MATCHED') item.matched += count;
      if (row.matchStatus === 'TRANSFORM_REQUIRED') item.transformRequired += count;
      if (row.matchStatus === 'MISSING_IN_ERP') item.missingInErp += count;
      if (['HIGH', 'CRITICAL'].includes(String(row.riskLevel)) && row.matchStatus !== 'MATCHED') item.highOpen += count;
      fieldByDomain.set(domain, item);
    }

    const domains = MASTER_DATA_ALIGNMENT_DOMAINS.map((domain) => {
      const mappingStats = domain.mappingTypes.reduce((acc, type) => {
        const item = mappingByType.get(type) || {
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          matched: 0,
          manual: 0,
          conflicts: 0,
          confidenceSum: 0,
          confidenceRows: 0,
        };
        acc.total += item.total;
        acc.approved += item.approved;
        acc.pending += item.pending;
        acc.rejected += item.rejected;
        acc.matched += item.matched;
        acc.manual += item.manual;
        acc.conflicts += item.conflicts;
        acc.confidenceSum += item.confidenceSum;
        acc.confidenceRows += item.confidenceRows;
        return acc;
      }, {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        matched: 0,
        manual: 0,
        conflicts: 0,
        confidenceSum: 0,
        confidenceRows: 0,
      });
      const entityCount = domain.entityTypes.reduce((sum, type) => sum + (entityByType.get(type)?.count || 0), 0);
      const endpointEntityCount = domain.endpointKeys.reduce((sum, key) => sum + (entityByEndpoint.get(key)?.count || 0), 0);
      const latestSeenAt = [...domain.entityTypes.map((type) => entityByType.get(type)?.latest || null)]
        .reduce<string | null>((latest, value) => this.maxIso(latest, value), null);
      const domainKeys = this.masterDataFieldDomains(domain.key);
      const fieldStats = domainKeys.reduce((acc, key) => {
        const item = fieldByDomain.get(key);
        if (!item) return acc;
        acc.total += item.total;
        acc.matched += item.matched;
        acc.transformRequired += item.transformRequired;
        acc.missingInErp += item.missingInErp;
        acc.highOpen += item.highOpen;
        return acc;
      }, { total: 0, matched: 0, transformRequired: 0, missingInErp: 0, highOpen: 0 });
      const approvedRate = mappingStats.total ? mappingStats.approved / mappingStats.total : 0;
      const mirrorReady = entityCount > 0 || endpointEntityCount > 0;
      const reviewReady = mappingStats.total > 0 && approvedRate >= 0.9 && mappingStats.conflicts === 0;
      const status = !mirrorReady
        ? 'WAITING_MIRROR_SYNC'
        : mappingStats.total === 0
          ? 'NEED_MAPPING_CANDIDATES'
          : mappingStats.conflicts > 0
            ? 'HOLD_CONFLICT'
            : reviewReady
              ? 'READY'
              : 'NEED_REVIEW';
      return {
        key: domain.key,
        title: domain.title,
        priority: domain.priority,
        mappingTypes: domain.mappingTypes,
        endpointKeys: domain.endpointKeys,
        entityTypes: domain.entityTypes,
        erpTargets: domain.erpTargets,
        authorityRule: domain.authorityRule,
        mirror: {
          ready: mirrorReady,
          entityCount,
          endpointEntityCount,
          latestSeenAt,
        },
        mapping: {
          ...mappingStats,
          averageConfidence: mappingStats.confidenceRows
            ? Math.round((mappingStats.confidenceSum / mappingStats.confidenceRows) * 100) / 100
            : 0,
          approvedRate,
        },
        fieldGaps: fieldStats,
        status,
        recommendedAction: this.masterDataAlignmentNextAction(status, domain.key),
      };
    });

    const p0Domains = domains.filter((domain) => domain.priority === 'P0');
    const readyDomains = domains.filter((domain) => domain.status === 'READY');
    const waitingDomains = domains.filter((domain) => domain.status === 'WAITING_MIRROR_SYNC');
    const holdDomains = domains.filter((domain) => domain.status === 'HOLD_CONFLICT');
    const needReviewDomains = domains.filter((domain) => ['NEED_REVIEW', 'NEED_MAPPING_CANDIDATES'].includes(domain.status));
    const mirrorCoverageRate = domains.length
      ? domains.filter((domain) => domain.mirror.ready).length / domains.length
      : 0;
    const approvedCoverageRate = domains.length
      ? readyDomains.length / domains.length
      : 0;

    return {
      generatedAt: new Date().toISOString(),
      decision: holdDomains.length ? 'HOLD' : 'GO_WITH_CONDITIONS',
      accountBooks: books.map((book) => ({
        bookId: book.bookId,
        bookName: book.bookName,
        companyCode: book.companyCode,
        companyName: book.companyName,
        enabled: book.enabled,
      })),
      summary: {
        totalDomains: domains.length,
        p0Domains: p0Domains.length,
        readyDomains: readyDomains.length,
        needReviewDomains: needReviewDomains.length,
        waitingDomains: waitingDomains.length,
        holdDomains: holdDomains.length,
        mirrorCoverageRate,
        approvedCoverageRate,
        nextGate: 'CHANJET_P2_MASTER_DATA_MAPPING_REVIEW',
      },
      domains,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        note: '本接口只读 ERP 好业财中间层，不调用好业财写接口，不自动批准映射。',
      },
    };
  }

  async financeReconciliationOverview(): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    summary: {
      totalItems: number;
      ok: number;
      warn: number;
      mismatch: number;
      needMapping: number;
      needManualReview: number;
      hold: number;
      p0Open: number;
      semanticLocked: number;
      semanticPartial: number;
      semanticPending: number;
      authorityEligible: number;
      nextGate: string;
    };
    items: FinanceReconciliationItem[];
    guardrails: Record<string, boolean | string>;
  }> {
    const [
      erpAr,
      erpAp,
      erpCash,
      erpTodayIn,
      erpTodayOut,
      chanjetAr,
      chanjetAp,
      chanjetCash,
      chanjetArReceipt,
      chanjetApPayment,
      chanjetGlBalance,
      chanjetBalanceSheet,
      chanjetIncomeStatement,
      chanjetCashFlow,
      chanjetVoucher,
    ] = await Promise.all([
      this.erpFinanceAggregate(
        `SELECT COALESCE(SUM(balance_amount_base),0) AS value, COUNT(*) AS rows
           FROM fin_ar_invoices
          WHERE status NOT IN ('COLLECTED','CANCELLED')`,
      ),
      this.erpFinanceAggregate(
        `SELECT COALESCE(SUM(balance_amount_base),0) AS value, COUNT(*) AS rows
           FROM fin_ap_invoices
          WHERE status NOT IN ('PAID','CANCELLED')`,
      ),
      this.erpFinanceAggregate(
        `SELECT COALESCE(SUM(current_balance),0) AS value, COUNT(*) AS rows
           FROM fin_cash_accounts
          WHERE status = 'ACTIVE'`,
      ),
      this.erpFinanceAggregate(
        `SELECT COALESCE(SUM(amount),0) AS value, COUNT(*) AS rows
           FROM fin_cash_transactions
          WHERE direction = 'IN' AND DATE(created_at) = CURRENT_DATE`,
      ),
      this.erpFinanceAggregate(
        `SELECT COALESCE(SUM(amount),0) AS value, COUNT(*) AS rows
           FROM fin_cash_transactions
          WHERE direction = 'OUT' AND DATE(created_at) = CURRENT_DATE`,
      ),
      this.chanjetEntityAggregate(['AR_STATISTICS']),
      this.chanjetEntityAggregate(['AP_STATISTICS']),
      this.chanjetEntityAggregate(['CASH_ACCOUNT']),
      this.chanjetEntityAggregate(['AR_RECEIPT']),
      this.chanjetEntityAggregate(['AP_PAYMENT']),
      this.chanjetEntityAggregate(['GL_BALANCE']),
      this.chanjetEntityAggregate(['BALANCE_SHEET']),
      this.chanjetEntityAggregate(['INCOME_STATEMENT']),
      this.chanjetEntityAggregate(['CASH_FLOW']),
      this.chanjetEntityAggregate(['VOUCHER']),
    ]);

    const items: FinanceReconciliationItem[] = [
      this.buildFinanceReconciliationItem({
        key: 'AR_OPEN',
        label: '应收待收',
        priority: 'P0',
        chanjetEndpointKeys: ['RECEIVABLE_STATISTICS'],
        chanjetEntityTypes: ['AR_STATISTICS'],
        erpSources: ['fin_ar_invoices.balance_amount_base'],
        chanjet: chanjetAr,
        erp: erpAr,
        reason: '好业财应收统计是客户/往来单位级汇总，ERP 应收发票是业务单据明细；差异必须展示，不得写入 fin_ar_invoices。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'AP_OPEN',
        label: '应付待付',
        priority: 'P0',
        chanjetEndpointKeys: ['PAYABLE_STATISTICS'],
        chanjetEntityTypes: ['AP_STATISTICS'],
        erpSources: ['fin_ap_invoices.balance_amount_base'],
        chanjet: chanjetAp,
        erp: erpAp,
        reason: '好业财应付统计是供应商/往来单位级汇总，ERP 应付发票是业务单据明细；差异进入对账中心。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'CASH_BALANCE',
        label: '现金 / 银行余额',
        priority: 'P0',
        chanjetEndpointKeys: ['FIN_ACCOUNT', 'GL_BALANCE'],
        chanjetEntityTypes: ['CASH_ACCOUNT'],
        erpSources: ['fin_cash_accounts.current_balance'],
        chanjet: chanjetCash,
        erp: erpCash,
        reason: '资金账户余额以好业财为财务权威候选，ERP 现金账户余额作为经营辅助明细。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'TODAY_RECEIPT',
        label: '今日收款',
        priority: 'P0',
        chanjetEndpointKeys: ['PAYMENT_AR'],
        chanjetEntityTypes: ['AR_RECEIPT'],
        erpSources: ['fin_cash_transactions.direction=IN, created_at=current_date'],
        chanjet: chanjetArReceipt,
        erp: erpTodayIn,
        forceStatus: 'NEED_MANUAL_REVIEW',
        reason: '好业财收款单镜像目前是列表/期间口径，不等同 ERP 今日现金流水；业务日、入账日、审核状态未锁定前不得直接覆盖今日收款卡片。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'TODAY_PAYMENT',
        label: '今日付款',
        priority: 'P0',
        chanjetEndpointKeys: ['PAYMENT_AP'],
        chanjetEntityTypes: ['AP_PAYMENT'],
        erpSources: ['fin_cash_transactions.direction=OUT, created_at=current_date'],
        chanjet: chanjetApPayment,
        erp: erpTodayOut,
        forceStatus: 'NEED_MANUAL_REVIEW',
        reason: '好业财付款单镜像目前是列表/期间口径，不等同 ERP 今日现金流水；业务日、入账日、审核状态未锁定前不得直接覆盖今日付款卡片。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'SUBJECT_BALANCE',
        label: '科目余额',
        priority: 'P0',
        chanjetEndpointKeys: ['GL_BALANCE'],
        chanjetEntityTypes: ['GL_BALANCE'],
        erpSources: ['chanjet_entity_snapshots.GL_BALANCE only'],
        chanjet: chanjetGlBalance,
        erp: null,
        forceStatus: 'NEED_MAPPING',
        reason: '科目余额表已同步，但借贷方向、期初/本期/期末字段尚未结构化为 ERP 可比口径。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'BALANCE_SHEET',
        label: '资产负债表关键项',
        priority: 'P0',
        chanjetEndpointKeys: ['BALANCE_SHEET'],
        chanjetEntityTypes: ['BALANCE_SHEET'],
        erpSources: ['chanjet_entity_snapshots.BALANCE_SHEET only'],
        chanjet: chanjetBalanceSheet,
        erp: null,
        forceStatus: 'NEED_MAPPING',
        reason: '资产负债表已同步，但项目行、行次、期末/年初金额尚需字段语义映射。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'INCOME_STATEMENT',
        label: '利润表关键项',
        priority: 'P0',
        chanjetEndpointKeys: ['INCOME_STATEMENT'],
        chanjetEntityTypes: ['INCOME_STATEMENT'],
        erpSources: ['chanjet_entity_snapshots.INCOME_STATEMENT only'],
        chanjet: chanjetIncomeStatement,
        erp: null,
        forceStatus: 'NEED_MAPPING',
        reason: '利润表已同步，但收入、成本、费用、利润行项目尚需字段语义映射。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'CASH_FLOW',
        label: '现金流量表关键项',
        priority: 'P1',
        chanjetEndpointKeys: ['CASH_FLOW'],
        chanjetEntityTypes: ['CASH_FLOW'],
        erpSources: ['chanjet_entity_snapshots.CASH_FLOW only'],
        chanjet: chanjetCashFlow,
        erp: null,
        forceStatus: 'NEED_MAPPING',
        reason: '现金流量表已同步，但经营/投资/筹资现金流行项目尚需字段语义映射。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'VOUCHER_LIST',
        label: '凭证列表 / 明细',
        priority: 'P1',
        chanjetEndpointKeys: ['VOUCHER_SEARCH'],
        chanjetEntityTypes: ['VOUCHER'],
        erpSources: ['chanjet_voucher_drafts only'],
        chanjet: chanjetVoucher,
        erp: null,
        forceStatus: 'NEED_MANUAL_REVIEW',
        reason: '凭证列表可只读重现，但 ERP→好业财写入仍被关闭；必须先做凭证草稿、人工审核、防重复推送和回执保存。',
      }),
    ];

    const statusCounts = items.reduce<Record<FinanceReconciliationStatus, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<FinanceReconciliationStatus, number>);
    const hold = statusCounts.HOLD || 0;
    const p0Open = items.filter((item) => item.priority === 'P0' && !['OK', 'WARN'].includes(item.status)).length;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : p0Open > 0 ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalItems: items.length,
        ok: statusCounts.OK || 0,
        warn: statusCounts.WARN || 0,
        mismatch: statusCounts.MISMATCH || 0,
        needMapping: statusCounts.NEED_MAPPING || 0,
        needManualReview: statusCounts.NEED_MANUAL_REVIEW || 0,
        hold,
        p0Open,
        semanticLocked: items.filter((item) => item.semanticLock.status === 'LOCKED').length,
        semanticPartial: items.filter((item) => item.semanticLock.status === 'PARTIAL').length,
        semanticPending: items.filter((item) => item.semanticLock.status === 'PENDING').length,
        authorityEligible: items.filter((item) => item.semanticLock.authorityEligible).length,
        nextGate: 'CHANJET_P3_FIELD_SEMANTIC_LOCK',
      },
      items,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        rule: '本接口只做只读对账。好业财有数据时作为财务权威候选；字段语义未锁定或差异未解释时必须显示 NEED_MAPPING / NEED_MANUAL_REVIEW。',
      },
    };
  }

  async financeSemanticLocksOverview() {
    const [coverage, reconciliation] = await Promise.all([
      this.financeReadonlyCoverage(),
      this.financeReconciliationOverview(),
    ]);
    const itemByKey = new Map(reconciliation.items.map((item) => [item.key, item]));
    const locks = FINANCE_SEMANTIC_LOCKS.map((lock) => {
      const item = itemByKey.get(lock.key);
      return {
        ...lock,
        reconciliationStatus: item?.status || 'NEED_MAPPING',
        chanjetRows: item?.evidence.chanjetRows || 0,
        erpRows: item?.evidence.erpRows || 0,
        latestPulledAt: item?.evidence.latestPulledAt || null,
        chanjetValue: item?.chanjetValue ?? null,
        erpValue: item?.erpValue ?? null,
        diff: item?.diff ?? null,
      };
    });
    const p0Locks = locks.filter((lock) => lock.key !== 'CASH_FLOW' && lock.key !== 'VOUCHER_LIST');
    const pendingP0 = p0Locks.filter((lock) => !['LOCKED', 'PARTIAL'].includes(lock.status)).length;
    const criticalPending = locks.filter((lock) => ['CRITICAL', 'HIGH'].includes(lock.risk) && lock.status === 'PENDING').length;
    return {
      generatedAt: new Date().toISOString(),
      decision: pendingP0 > 0 ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalLocks: locks.length,
        locked: locks.filter((lock) => lock.status === 'LOCKED').length,
        partial: locks.filter((lock) => lock.status === 'PARTIAL').length,
        pending: locks.filter((lock) => lock.status === 'PENDING').length,
        hold: locks.filter((lock) => lock.status === 'HOLD').length,
        p0Total: p0Locks.length,
        p0Pending: pendingP0,
        criticalPending,
        authorityEligible: locks.filter((lock) => lock.authorityEligible).length,
        endpointCoverageRate: coverage.summary.endpointCoverageRate,
        cardCoverageRate: coverage.summary.cardCoverageRate,
        fieldCoverageRate: coverage.summary.fieldCoverageRate,
        nextGate: 'CHANJET_P3_FIELD_SEMANTIC_EXTRACTORS',
      },
      locks,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        rule: '语义锁只决定 ERP 展示和差异解释，不写好业财、不覆盖 ERP 业务事实表。',
      },
    };
  }

  async financeSemanticExtractorsOverview(): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    summary: {
      totalExtractors: number;
      ready: number;
      partial: number;
      waitingSample: number;
      needExtraction: number;
      hold: number;
      authorityEligible: number;
      p0MissingRequiredFields: number;
      nextGate: string;
    };
    extractors: FinanceSemanticExtractor[];
    guardrails: Record<string, boolean | string>;
  }> {
    const locks = FINANCE_SEMANTIC_LOCKS;
    const extractors = await Promise.all(locks.map((lock) => this.buildFinanceSemanticExtractor(lock)));
    const statusCounts = extractors.reduce<Record<FinanceSemanticExtractorStatus, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<FinanceSemanticExtractorStatus, number>);
    const p0Extractors = extractors.filter((item) => !['CASH_FLOW', 'VOUCHER_LIST'].includes(item.key));
    const p0MissingRequiredFields = p0Extractors.reduce((sum, item) => sum + item.missingRequiredFields.length, 0);
    const hold = statusCounts.HOLD || 0;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : p0MissingRequiredFields > 0 ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalExtractors: extractors.length,
        ready: statusCounts.READY || 0,
        partial: statusCounts.PARTIAL || 0,
        waitingSample: statusCounts.WAITING_SAMPLE || 0,
        needExtraction: statusCounts.NEED_EXTRACTION || 0,
        hold,
        authorityEligible: extractors.filter((item) => item.authorityEligible).length,
        p0MissingRequiredFields,
        nextGate: 'CHANJET_P3_FINANCE_READ_MODEL',
      },
      extractors,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        rule: '语义提取器只扫描 ERP 中间层 raw_data/raw_payload，输出字段候选和缺口；不会调用好业财写接口，也不会把候选值覆盖到 ERP 业务事实表。',
      },
    };
  }

  async financeReadModelOverview(): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    summary: {
      totalMetrics: number;
      authorityReady: number;
      readonlyReady: number;
      blockedMapping: number;
      waitingSample: number;
      needManualReview: number;
      hold: number;
      p0Blocked: number;
      nextGate: string;
    };
    metrics: FinanceReadModelMetric[];
    guardrails: Record<string, boolean | string>;
  }> {
    const [reconciliation, semanticExtractors] = await Promise.all([
      this.financeReconciliationOverview(),
      this.financeSemanticExtractorsOverview(),
    ]);
    const extractorByKey = new Map(semanticExtractors.extractors.map((item) => [item.key, item]));
    const metrics = reconciliation.items.map((item) => this.buildFinanceReadModelMetric(item, extractorByKey.get(item.key)));
    const statusCounts = metrics.reduce<Record<FinanceReadModelStatus, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<FinanceReadModelStatus, number>);
    const p0Blocked = metrics.filter((item) => item.priority === 'P0' && !['AUTHORITY_READY', 'READONLY_READY'].includes(item.status)).length;
    const hold = statusCounts.HOLD || 0;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : p0Blocked > 0 ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalMetrics: metrics.length,
        authorityReady: statusCounts.AUTHORITY_READY || 0,
        readonlyReady: statusCounts.READONLY_READY || 0,
        blockedMapping: statusCounts.BLOCKED_MAPPING || 0,
        waitingSample: statusCounts.WAITING_SAMPLE || 0,
        needManualReview: statusCounts.NEED_MANUAL_REVIEW || 0,
        hold,
        p0Blocked,
        nextGate: 'CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK',
      },
      metrics,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        rule: '只读 read model 只决定 ERP 展示与权威候选状态；READY 之前不得把好业财镜像数字写入 ERP 业务事实表，也不得静默替换 ERP 明细。',
      },
    };
  }

  async financeReceiptPaymentDateStatusLockOverview(): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    summary: {
      totalLocks: number;
      locked: number;
      partial: number;
      waitingSample: number;
      hold: number;
      readyForFinanceReview: number;
      readyForCardAuthority: number;
      nextGate: string;
    };
    locks: ReceiptPaymentDateStatusLock[];
    guardrails: Record<string, boolean | string>;
  }> {
    const locks = await Promise.all([
      this.buildReceiptPaymentDateStatusLock('TODAY_RECEIPT', '今日收款', 'AR_RECEIPT'),
      this.buildReceiptPaymentDateStatusLock('TODAY_PAYMENT', '今日付款', 'AP_PAYMENT'),
    ]);
    const statusCounts = locks.reduce<Record<ReceiptPaymentLockStatus, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<ReceiptPaymentLockStatus, number>);
    const hold = statusCounts.HOLD || 0;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : locks.every((item) => item.status === 'LOCKED') ? 'GO' : 'GO_WITH_CONDITIONS',
      summary: {
        totalLocks: locks.length,
        locked: statusCounts.LOCKED || 0,
        partial: statusCounts.PARTIAL || 0,
        waitingSample: statusCounts.WAITING_SAMPLE || 0,
        hold,
        readyForFinanceReview: locks.filter((item) => item.readyForFinanceReview).length,
        readyForCardAuthority: locks.filter((item) => item.readyForCardAuthority).length,
        nextGate: 'CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING',
      },
      locks,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        rule: '本 Gate 只锁定收付款日期/状态/方向候选字段。即使 LOCKED，也只表示可进入财务确认；未进入卡片权威切换前不得替换 ERP 今日收付款主值。',
      },
    };
  }

  async financeCardAuthorityOverview(): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    summary: {
      totalCards: number;
      authorityReady: number;
      readonlyReady: number;
      blocked: number;
      hold: number;
      nextGate: string;
    };
    cards: Array<{
      cardKey: string;
      label: string;
      readModelKey: string;
      status: string;
      authorityEnabled: boolean;
      displayValue: number | null;
      erpAuxiliaryValue: number | null;
      diff: number | null;
      sourceEntityTypes: string[];
      latestPulledAt: string | null;
      receiptPaymentLockStatus?: string | null;
      readyForCardAuthority?: boolean | null;
      reason: string;
      nextAction: string;
    }>;
    guardrails: Record<string, boolean | string>;
  }> {
    const [readModel, receiptPaymentLocks] = await Promise.all([
      this.financeReadModelOverview(),
      this.financeReceiptPaymentDateStatusLockOverview(),
    ]);
    const metricByKey = new Map(readModel.metrics.map((metric) => [metric.key, metric]));
    const lockByKey = new Map(receiptPaymentLocks.locks.map((lock) => [lock.key, lock]));
    const definitions = [
      { cardKey: 'arOpen', label: '应收待收款', readModelKey: 'AR_OPEN' },
      { cardKey: 'apOpen', label: '应付待付款', readModelKey: 'AP_OPEN' },
      { cardKey: 'cashBalance', label: '现金账户余额', readModelKey: 'CASH_BALANCE' },
      { cardKey: 'todayInflow', label: '今日收款', readModelKey: 'TODAY_RECEIPT', lockKey: 'TODAY_RECEIPT' },
      { cardKey: 'todayOutflow', label: '今日付款', readModelKey: 'TODAY_PAYMENT', lockKey: 'TODAY_PAYMENT' },
      { cardKey: 'subjectBalance', label: '科目余额', readModelKey: 'SUBJECT_BALANCE' },
      { cardKey: 'balanceSheet', label: '资产负债表关键项', readModelKey: 'BALANCE_SHEET' },
      { cardKey: 'incomeStatement', label: '利润表关键项', readModelKey: 'INCOME_STATEMENT' },
    ];
    const cards = definitions.map((definition) => {
      const metric = metricByKey.get(definition.readModelKey);
      const lock = definition.lockKey ? lockByKey.get(definition.lockKey as 'TODAY_RECEIPT' | 'TODAY_PAYMENT') : null;
      const authorityEnabled = Boolean(metric?.status === 'AUTHORITY_READY' && (!lock || lock.readyForCardAuthority));
      return {
        cardKey: definition.cardKey,
        label: definition.label,
        readModelKey: definition.readModelKey,
        status: metric?.status || 'WAITING_SAMPLE',
        authorityEnabled,
        displayValue: authorityEnabled ? metric?.displayValue ?? null : null,
        erpAuxiliaryValue: metric?.erpAuxiliaryValue ?? null,
        diff: authorityEnabled ? metric?.diff ?? null : null,
        sourceEntityTypes: metric?.sourceEntityTypes || [],
        latestPulledAt: metric?.latestPulledAt || null,
        receiptPaymentLockStatus: lock?.status || null,
        readyForCardAuthority: lock?.readyForCardAuthority ?? null,
        reason: authorityEnabled
          ? '已达到 AUTHORITY_READY，可接入主卡片，并保留 ERP 辅助差异。'
          : lock?.reason || metric?.reason || '尚未达到 AUTHORITY_READY，主卡片必须保留 ERP 值。',
        nextAction: authorityEnabled
          ? '在财务卡片标明好业财权威口径，并展示 ERP 辅助差异。'
          : lock?.nextAction || metric?.nextAction || '补齐好业财只读样本、语义锁或财务确认。',
      };
    });
    const hold = cards.filter((card) => card.status === 'HOLD').length;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : cards.some((card) => !card.authorityEnabled) ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalCards: cards.length,
        authorityReady: cards.filter((card) => card.authorityEnabled).length,
        readonlyReady: cards.filter((card) => card.status === 'READONLY_READY').length,
        blocked: cards.filter((card) => !card.authorityEnabled && card.status !== 'READONLY_READY').length,
        hold,
        nextGate: 'CHANJET_P3_FINANCE_CARD_DIFF_VISUAL_QA',
      },
      cards,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        rule: '财务卡片只接受 AUTHORITY_READY 的好业财 read model。未锁定的好业财数据只能作为只读对账证据，不能替换 ERP 主值。',
      },
    };
  }

  async financeCardSemanticLockExpansionOverview(): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    summary: {
      totalCards: number;
      currentAuthorityEnabled: number;
      readonlyDetailCandidates: number;
      authorityPromotionCandidates: number;
      requiresFinanceConfirmation: number;
      blocked: number;
      hold: number;
      nextGate: string;
    };
    cards: FinanceCardSemanticExpansionItem[];
    guardrails: Record<string, boolean | string>;
  }> {
    const [readModel, semanticExtractors, receiptPaymentLocks, cardAuthority] = await Promise.all([
      this.financeReadModelOverview(),
      this.financeSemanticExtractorsOverview(),
      this.financeReceiptPaymentDateStatusLockOverview(),
      this.financeCardAuthorityOverview(),
    ]);
    const metricByKey = new Map(readModel.metrics.map((metric) => [metric.key, metric]));
    const extractorByKey = new Map(semanticExtractors.extractors.map((extractor) => [extractor.key, extractor]));
    const receiptLockByKey = new Map(receiptPaymentLocks.locks.map((lock) => [lock.key, lock]));
    const authorityByKey = new Map(cardAuthority.cards.map((card) => [card.readModelKey, card]));
    const definitions: Array<{
      cardKey: string;
      label: string;
      readModelKey: string;
      financeConfirmation: boolean;
      promotionRule: string;
    }> = [
      {
        cardKey: 'arOpen',
        label: '应收待收款',
        readModelKey: 'AR_OPEN',
        financeConfirmation: false,
        promotionRule: '应收/应付汇总已允许 AUTHORITY_READY；继续保留 ERP 明细差异，不写 fin_ar_invoices。',
      },
      {
        cardKey: 'apOpen',
        label: '应付待付款',
        readModelKey: 'AP_OPEN',
        financeConfirmation: false,
        promotionRule: '应付汇总已允许 AUTHORITY_READY；继续保留 ERP 明细差异，不静默覆盖。',
      },
      {
        cardKey: 'cashBalance',
        label: '现金账户余额',
        readModelKey: 'CASH_BALANCE',
        financeConfirmation: true,
        promotionRule: '必须锁定余额字段、币种与余额时点后，由财务确认才能晋级主卡片。',
      },
      {
        cardKey: 'todayInflow',
        label: '今日收款',
        readModelKey: 'TODAY_RECEIPT',
        financeConfirmation: true,
        promotionRule: '必须锁定业务日/入账日/审核状态/作废状态/方向后，才能影响今日收款。',
      },
      {
        cardKey: 'todayOutflow',
        label: '今日付款',
        readModelKey: 'TODAY_PAYMENT',
        financeConfirmation: true,
        promotionRule: '必须锁定业务日/入账日/审核状态/作废状态/方向后，才能影响今日付款。',
      },
      {
        cardKey: 'subjectBalance',
        label: '科目余额',
        readModelKey: 'SUBJECT_BALANCE',
        financeConfirmation: true,
        promotionRule: '必须拆出科目、期间、期初、本期借方、本期贷方、期末余额和方向。',
      },
      {
        cardKey: 'balanceSheet',
        label: '资产负债表关键项',
        readModelKey: 'BALANCE_SHEET',
        financeConfirmation: true,
        promotionRule: '必须锁定报表项目、行次、年初/期末金额和期间。',
      },
      {
        cardKey: 'incomeStatement',
        label: '利润表关键项',
        readModelKey: 'INCOME_STATEMENT',
        financeConfirmation: true,
        promotionRule: '必须锁定报表项目、本期金额、累计金额和期间。',
      },
    ];

    const cards = definitions.map((definition) => {
      const metric = metricByKey.get(definition.readModelKey);
      const extractor = extractorByKey.get(definition.readModelKey);
      const receiptLock = receiptLockByKey.get(definition.readModelKey as 'TODAY_RECEIPT' | 'TODAY_PAYMENT');
      const authority = authorityByKey.get(definition.readModelKey);
      const requiredFields = extractor?.fieldCandidates
        .filter((field) => field.required)
        .map((field) => field.semanticField) || metric?.requiredFields || [];
      const lockedFields = extractor?.fieldCandidates
        .filter((field) => field.status === 'FOUND')
        .map((field) => field.semanticField) || [];
      const missingFields = extractor?.missingRequiredFields || metric?.missingRequiredFields || requiredFields;
      const blockers = [
        ...(metric?.status === 'HOLD' ? ['read_model_hold'] : []),
        ...(metric?.status === 'WAITING_SAMPLE' ? ['waiting_chanjet_sample'] : []),
        ...(missingFields.length ? [`missing_fields:${missingFields.slice(0, 6).join('/')}`] : []),
        ...(receiptLock && !receiptLock.readyForCardAuthority ? ['receipt_payment_date_status_direction_not_confirmed'] : []),
        ...(definition.financeConfirmation && metric?.status !== 'AUTHORITY_READY' ? ['finance_confirmation_required'] : []),
      ];
      const candidateForReadonlyDetail = Boolean(metric && ['AUTHORITY_READY', 'READONLY_READY'].includes(metric.status));
      const currentAuthorityEnabled = Boolean(authority?.authorityEnabled);
      const candidateForAuthorityPromotion = Boolean(
        currentAuthorityEnabled
        || (candidateForReadonlyDetail && missingFields.length === 0 && (!receiptLock || receiptLock.readyForCardAuthority)),
      );
      const requiresFinanceConfirmation = Boolean(
        definition.financeConfirmation
        && !currentAuthorityEnabled
        && (candidateForReadonlyDetail || lockedFields.length > 0 || (receiptLock?.readyForFinanceReview ?? false)),
      );
      return {
        cardKey: definition.cardKey,
        label: definition.label,
        readModelKey: definition.readModelKey,
        currentStatus: metric?.status || 'WAITING_SAMPLE',
        sampleRows: metric?.sampleRows || extractor?.sampleRows || receiptLock?.sampleRows || 0,
        latestPulledAt: metric?.latestPulledAt || extractor?.latestPulledAt || receiptLock?.latestPulledAt || null,
        currentAuthorityEnabled,
        candidateForReadonlyDetail,
        candidateForAuthorityPromotion,
        requiresFinanceConfirmation,
        requiredFields,
        lockedFields,
        missingFields,
        blockers,
        sourceEntityTypes: metric?.sourceEntityTypes || extractor?.sourceEntityTypes || [],
        recommendedAction: currentAuthorityEnabled
          ? '已可作为财务卡片主值；继续显示 ERP 辅助差异并纳入每日对账。'
          : candidateForAuthorityPromotion
            ? `进入财务确认 Gate：${definition.promotionRule}`
            : missingFields.length
              ? `继续补齐字段语义: ${missingFields.slice(0, 6).join(' / ')}。`
              : definition.promotionRule,
      };
    });

    const hold = cards.filter((card) => card.currentStatus === 'HOLD').length;
    const blocked = cards.filter((card) => !card.currentAuthorityEnabled && !card.candidateForReadonlyDetail).length;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : cards.some((card) => !card.currentAuthorityEnabled) ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalCards: cards.length,
        currentAuthorityEnabled: cards.filter((card) => card.currentAuthorityEnabled).length,
        readonlyDetailCandidates: cards.filter((card) => card.candidateForReadonlyDetail).length,
        authorityPromotionCandidates: cards.filter((card) => card.candidateForAuthorityPromotion).length,
        requiresFinanceConfirmation: cards.filter((card) => card.requiresFinanceConfirmation).length,
        blocked,
        hold,
        nextGate: 'CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW',
      },
      cards,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        rule: '本接口只扩展财务卡片语义锁判断和晋级建议。未达到 AUTHORITY_READY 的指标不得替换 ERP 主卡片；任何好业财写入仍保持 HOLD。',
      },
    };
  }

  async financeCardSemanticReviewOverview(): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    summary: {
      totalCards: number;
      approvedForAuthority: number;
      readyForFinanceConfirmation: number;
      blocked: number;
      hold: number;
      unsafePromotionsPrevented: number;
      nextGate: string;
    };
    reviewItems: FinanceCardSemanticReviewItem[];
    guardrails: Record<string, boolean | string>;
  }> {
    const expansion = await this.financeCardSemanticLockExpansionOverview();
    const questionMap: Record<string, string[]> = {
      AR_OPEN: [
        '确认好业财应收统计是否作为集团应收待收卡片权威汇总。',
        '确认负数余额展示规则：保留好业财方向，还是在 UI 侧按借贷方向转换。',
        '确认 ERP 发票级 fin_ar_invoices 仅作为辅助差异，不由好业财汇总覆盖。',
      ],
      AP_OPEN: [
        '确认好业财应付统计是否作为集团应付待付卡片权威汇总。',
        '确认负数余额展示规则：保留好业财方向，还是在 UI 侧按借贷方向转换。',
        '确认 ERP 付款/采购明细仅作为辅助差异，不静默覆盖。',
      ],
      CASH_BALANCE: [
        '确认现金/银行账户余额字段路径及币种字段路径。',
        '确认余额时点：实时余额、期末余额还是最近拉取批次余额。',
        '确认多账套/多币种汇总是否需要折本位币。',
      ],
      TODAY_RECEIPT: [
        '确认今日口径使用业务日期、入账日期还是审核日期。',
        '确认只统计已审核/已生效单据，排除草稿、作废、红冲。',
        '确认收款方向、退款/冲销方向和金额正负号规则。',
      ],
      TODAY_PAYMENT: [
        '确认今日口径使用业务日期、入账日期还是审核日期。',
        '确认只统计已审核/已生效单据，排除草稿、作废、红冲。',
        '确认付款方向、退款/冲销方向和金额正负号规则。',
      ],
      SUBJECT_BALANCE: [
        '确认科目余额表字段：科目编码、期间、期初、本期借方、本期贷方、期末。',
        '确认借贷方向和正负号展示规则。',
        '确认是否按账套/公司分别展示，还是集团汇总。',
      ],
      BALANCE_SHEET: [
        '确认资产负债表字段：报表项目、行次、年初金额、期末金额、期间。',
        '确认资产/负债/权益项目映射关系。',
        '确认集团汇总是否可直接使用好业财报表行。',
      ],
      INCOME_STATEMENT: [
        '确认利润表字段：报表项目、本期金额、累计金额、期间。',
        '确认收入/成本/费用/利润项目映射关系。',
        '确认集团汇总是否可直接使用好业财报表行。',
      ],
    };

    const reviewItems = expansion.cards.map((card) => {
      const reviewStatus: FinanceCardSemanticReviewStatus = card.currentStatus === 'HOLD'
        ? 'HOLD'
        : card.currentAuthorityEnabled
          ? 'APPROVED_FOR_AUTHORITY'
          : card.requiresFinanceConfirmation
            ? 'READY_FOR_FINANCE_CONFIRMATION'
            : 'BLOCKED';
      const evidence = [
        `sampleRows=${card.sampleRows}`,
        `latestPulledAt=${card.latestPulledAt || '-'}`,
        `sourceEntityTypes=${card.sourceEntityTypes.join(',') || '-'}`,
        `lockedFields=${card.lockedFields.join(',') || '-'}`,
        `missingFields=${card.missingFields.join(',') || '-'}`,
      ];
      return {
        reviewId: `CHANJET-FIN-CARD-${card.readModelKey}`,
        cardKey: card.cardKey,
        label: card.label,
        readModelKey: card.readModelKey,
        reviewStatus,
        currentStatus: card.currentStatus,
        sampleRows: card.sampleRows,
        latestPulledAt: card.latestPulledAt,
        currentAuthorityEnabled: card.currentAuthorityEnabled,
        candidateForReadonlyDetail: card.candidateForReadonlyDetail,
        candidateForAuthorityPromotion: card.candidateForAuthorityPromotion,
        requiresFinanceConfirmation: card.requiresFinanceConfirmation,
        financeConfirmationQuestions: questionMap[card.readModelKey] || ['确认该卡片是否可作为财务权威口径。'],
        lockedFields: card.lockedFields,
        missingFields: card.missingFields,
        blockers: card.blockers,
        evidence,
        approvalInstruction: reviewStatus === 'APPROVED_FOR_AUTHORITY'
          ? '可保留当前权威接线；继续展示 ERP 辅助差异和好业财来源。'
          : reviewStatus === 'READY_FOR_FINANCE_CONFIRMATION'
            ? '进入财务字段口径确认；确认前不得升权为主卡片。'
            : reviewStatus === 'HOLD'
              ? 'HOLD；先处理 read model 或数据样本异常。'
              : '继续补语义字段或样本；仅可作为只读证据，不得升权。',
        recommendedAction: card.recommendedAction,
      };
    });
    const hold = reviewItems.filter((item) => item.reviewStatus === 'HOLD').length;
    const unsafePromotionsPrevented = reviewItems.filter((item) => !item.currentAuthorityEnabled).length;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : reviewItems.some((item) => item.reviewStatus !== 'APPROVED_FOR_AUTHORITY') ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalCards: reviewItems.length,
        approvedForAuthority: reviewItems.filter((item) => item.reviewStatus === 'APPROVED_FOR_AUTHORITY').length,
        readyForFinanceConfirmation: reviewItems.filter((item) => item.reviewStatus === 'READY_FOR_FINANCE_CONFIRMATION').length,
        blocked: reviewItems.filter((item) => item.reviewStatus === 'BLOCKED').length,
        hold,
        unsafePromotionsPrevented,
        nextGate: 'CHANJET_P3_FINANCE_CARD_SEMANTIC_CONFIRMATION',
      },
      reviewItems,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        dbWrite: false,
        rule: '本复核矩阵只生成财务确认清单和卡片升权建议；未获确认的好业财数字只能展示为只读证据，不得替换 ERP 主值。',
      },
    };
  }

  async financeCardSystemConfirmationOverview(): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    summary: {
      totalCards: number;
      systemConfirmedAuthority: number;
      systemConfirmedReadonly: number;
      systemBlockedFromAuthority: number;
      hold: number;
      manualFinanceConfirmationRequired: 0;
      nextGate: string;
    };
    confirmations: FinanceCardSystemConfirmationItem[];
    guardrails: Record<string, boolean | string | number>;
  }> {
    const review = await this.financeCardSemanticReviewOverview();
    const confirmationRules: Record<string, Omit<
      FinanceCardSystemConfirmationItem,
      | 'confirmationId'
      | 'cardKey'
      | 'label'
      | 'reviewStatus'
      | 'readModelKey'
      | 'blockers'
      | 'evidence'
    >> = {
      AR_OPEN: {
        confirmationStatus: 'SYSTEM_CONFIRMED_AUTHORITY',
        approvedPrimarySource: 'CHANJET',
        erpSemanticDefinition: 'ERP 应收发票、收款记录和业务流水是单据级辅助明细，不作为集团应收汇总主口径。',
        chanjetSemanticDefinition: '好业财应收统计是往来单位/客户级财务汇总余额，适合集团财务卡片展示。',
        fieldMappingDecision: '好业财 `AR_STATISTICS.amount` 对应 ERP 财务卡片 `arOpen`。不得写入 `fin_ar_invoices`。',
        calculationRule: '按好业财只读镜像汇总当前应收余额；ERP 明细只计算差异和追溯解释。',
        displayRule: '主值显示好业财，应同时展示来源、拉取时间和 ERP 辅助差异。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: true,
        readonlyAllowed: true,
        nextAction: '保持应收待收卡片好业财权威口径，继续做往来单位映射质量提升。',
      },
      AP_OPEN: {
        confirmationStatus: 'SYSTEM_CONFIRMED_AUTHORITY',
        approvedPrimarySource: 'CHANJET',
        erpSemanticDefinition: 'ERP 采购、付款和应付单据是运营明细，不作为集团应付汇总主口径。',
        chanjetSemanticDefinition: '好业财应付统计是供应商/往来单位级财务汇总余额，适合集团财务卡片展示。',
        fieldMappingDecision: '好业财 `AP_STATISTICS.amount` 对应 ERP 财务卡片 `apOpen`。不得静默覆盖 ERP 付款/采购明细。',
        calculationRule: '按好业财只读镜像汇总当前应付余额；ERP 明细只计算差异和追溯解释。',
        displayRule: '主值显示好业财，应同时展示来源、拉取时间和 ERP 辅助差异。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: true,
        readonlyAllowed: true,
        nextAction: '保持应付待付卡片好业财权威口径，继续做供应商/往来单位映射质量提升。',
      },
      CASH_BALANCE: {
        confirmationStatus: 'SYSTEM_BLOCKED_FROM_AUTHORITY',
        approvedPrimarySource: 'ERP',
        erpSemanticDefinition: 'ERP 现金/银行余额来自本地资金账户余额和业务现金流水，是当前可用的主卡片保守口径。',
        chanjetSemanticDefinition: '当前好业财资金账户镜像证明账户存在，但尚未证明实时/期末余额字段、币种余额和余额时点。',
        fieldMappingDecision: '好业财资金账户可作为资金账户只读清单和对账证据，不得把 `amountSum=0` 当真实余额。',
        calculationRule: '主值继续使用 ERP 资金账户余额；好业财余额字段锁定后再进入单独 Gate。',
        displayRule: '显示 ERP 主值，并展示好业财只读证据状态为“余额字段未锁定”。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: false,
        readonlyAllowed: true,
        nextAction: '补好业财现金/银行余额字段抽取，必须证明余额字段、币种和余额时点后才能升权。',
      },
      TODAY_RECEIPT: {
        confirmationStatus: 'SYSTEM_BLOCKED_FROM_AUTHORITY',
        approvedPrimarySource: 'ERP',
        erpSemanticDefinition: 'ERP 今日收款是按业务当日、有效收款状态和本地业务流水计算的运营日指标。',
        chanjetSemanticDefinition: '当前好业财收款单镜像可只读重现，但业务日/入账日/审核日、作废/红冲过滤和方向口径未全部证明。',
        fieldMappingDecision: '好业财 `AR_RECEIPT` 先作为收款单只读明细与对账证据，不替代 ERP 今日收款。',
        calculationRule: '今日主值继续使用 ERP 当日现金流；好业财只读单据按状态/日期字段锁定后再做差异对账。',
        displayRule: '显示 ERP 主值；好业财收款单作为对账明细，不显示为主卡片。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: false,
        readonlyAllowed: true,
        nextAction: '继续锁定收款单业务日期、审核状态、作废状态、方向和正负号。',
      },
      TODAY_PAYMENT: {
        confirmationStatus: 'SYSTEM_BLOCKED_FROM_AUTHORITY',
        approvedPrimarySource: 'ERP',
        erpSemanticDefinition: 'ERP 今日付款是按业务当日、有效付款状态和本地业务流水计算的运营日指标。',
        chanjetSemanticDefinition: '当前好业财付款单镜像可只读重现，但业务日/入账日/审核日、作废/红冲过滤和方向口径未全部证明。',
        fieldMappingDecision: '好业财 `AP_PAYMENT` 先作为付款单只读明细与对账证据，不替代 ERP 今日付款。',
        calculationRule: '今日主值继续使用 ERP 当日现金流；好业财只读单据按状态/日期字段锁定后再做差异对账。',
        displayRule: '显示 ERP 主值；好业财付款单作为对账明细，不显示为主卡片。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: false,
        readonlyAllowed: true,
        nextAction: '继续锁定付款单业务日期、审核状态、作废状态、方向和正负号。',
      },
      SUBJECT_BALANCE: {
        confirmationStatus: 'SYSTEM_CONFIRMED_READONLY',
        approvedPrimarySource: 'CHANJET_READONLY',
        erpSemanticDefinition: 'ERP 当前没有同粒度总账科目余额事实表，不应自行汇总业务表伪造科目余额。',
        chanjetSemanticDefinition: '好业财科目余额表是财务科目级只读权威来源，可用于报表页和差异中心。',
        fieldMappingDecision: '好业财 `GL_BALANCE` 对应 ERP 科目余额只读适配器，不进入业务表。',
        calculationRule: '按账套、期间、科目编码、期初、本期借方、本期贷方、期末余额展示。',
        displayRule: '作为报表/对账只读行展示；除非字段完全锁定，不作为聚合卡片金额。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: false,
        readonlyAllowed: true,
        nextAction: '建立科目余额只读页面和 ERP 差异解释，不写 ERP 业务事实。',
      },
      BALANCE_SHEET: {
        confirmationStatus: 'SYSTEM_CONFIRMED_READONLY',
        approvedPrimarySource: 'CHANJET_READONLY',
        erpSemanticDefinition: 'ERP 运营数据不能直接替代法定资产负债表项目。',
        chanjetSemanticDefinition: '好业财资产负债表是财务报表只读权威来源，适合 ERP 展示和上线准备校验。',
        fieldMappingDecision: '好业财 `BALANCE_SHEET` 对应 ERP 报表只读适配器，不反写业务明细。',
        calculationRule: '按账套、期间、报表项目、行次、年初金额和期末金额展示。',
        displayRule: '作为财务报表只读展示；经营驾驶舱可引用关键项但必须标明好业财来源。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: false,
        readonlyAllowed: true,
        nextAction: '建立资产负债表只读报表与关键项展示，禁止用运营表拼装法定报表。',
      },
      INCOME_STATEMENT: {
        confirmationStatus: 'SYSTEM_CONFIRMED_READONLY',
        approvedPrimarySource: 'CHANJET_READONLY',
        erpSemanticDefinition: 'ERP 销售、采购、费用运营数据不能直接替代法定利润表项目。',
        chanjetSemanticDefinition: '好业财利润表是财务报表只读权威来源，适合 ERP 展示和经营分析辅助。',
        fieldMappingDecision: '好业财 `INCOME_STATEMENT` 对应 ERP 报表只读适配器，不反写业务明细。',
        calculationRule: '按账套、期间、报表项目、本期金额和累计金额展示。',
        displayRule: '作为财务报表只读展示；经营驾驶舱可引用关键项但必须标明好业财来源。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: false,
        readonlyAllowed: true,
        nextAction: '建立利润表只读报表与关键项展示，禁止用运营表拼装法定报表。',
      },
    };
    const confirmations = review.reviewItems.map((item) => {
      const rule = confirmationRules[item.readModelKey] || {
        confirmationStatus: 'SYSTEM_BLOCKED_FROM_AUTHORITY' as const,
        approvedPrimarySource: 'ERP' as const,
        erpSemanticDefinition: '未定义 ERP 语义。',
        chanjetSemanticDefinition: '未定义好业财语义。',
        fieldMappingDecision: '未定义字段映射，保持阻断。',
        calculationRule: '保持 ERP 原主值。',
        displayRule: '不展示为好业财权威。',
        manualFinanceConfirmationRequired: false as const,
        authorityAllowed: false,
        readonlyAllowed: false,
        nextAction: '补充系统语义定义。',
      };
      const blockers = [
        ...item.blockers,
        ...(rule.authorityAllowed ? [] : ['primary_authority_not_allowed_by_system_confirmation']),
      ];
      return {
        confirmationId: `CHANJET-FIN-CARD-SYSTEM-${item.readModelKey}`,
        cardKey: item.cardKey,
        label: item.label,
        readModelKey: item.readModelKey,
        ...rule,
        blockers,
        evidence: [
          ...item.evidence,
          `reviewStatus=${item.reviewStatus}`,
          `manualFinanceConfirmationRequired=false`,
          `approvedPrimarySource=${rule.approvedPrimarySource}`,
        ],
      };
    });
    const hold = confirmations.filter((item) => item.confirmationStatus === 'HOLD').length;
    const systemBlockedFromAuthority = confirmations.filter((item) => item.confirmationStatus === 'SYSTEM_BLOCKED_FROM_AUTHORITY').length;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : systemBlockedFromAuthority > 0 ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalCards: confirmations.length,
        systemConfirmedAuthority: confirmations.filter((item) => item.confirmationStatus === 'SYSTEM_CONFIRMED_AUTHORITY').length,
        systemConfirmedReadonly: confirmations.filter((item) => item.confirmationStatus === 'SYSTEM_CONFIRMED_READONLY').length,
        systemBlockedFromAuthority,
        hold,
        manualFinanceConfirmationRequired: 0,
        nextGate: 'CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT',
      },
      confirmations,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        dbWrite: false,
        manualFinanceConfirmationRequired: 0,
        rule: '本接口由 ERP 系统建设方完成口径确认。只能把 SYSTEM_CONFIRMED_AUTHORITY 的卡片接入好业财主值；SYSTEM_CONFIRMED_READONLY 仅做只读报表/对账；SYSTEM_BLOCKED_FROM_AUTHORITY 继续保留 ERP 主值。',
      },
    };
  }

  async financeP0AdapterOverview() {
    const [fieldMappings, books] = await Promise.all([
      this.fieldMappingRepo.find({ take: 5000 }),
      this.listAccountBooks(),
    ]);

    const buckets = await Promise.all(FINANCE_ADAPTER_BUCKETS.map(async (bucket) => {
      const [snapshotCount, entityCount, latestSnapshot, sampleEntities] = await Promise.all([
        this.readSnapshotRepo.count({ where: { endpointKey: In(bucket.endpointKeys) } }),
        this.entitySnapshotRepo.count({ where: { entityType: In(bucket.entityTypes) } }),
        this.readSnapshotRepo.find({
          where: { endpointKey: In(bucket.endpointKeys) },
          order: { pulledAt: 'DESC' },
          take: 1,
        }),
        this.entitySnapshotRepo.find({
          where: { entityType: In(bucket.entityTypes) },
          order: { updatedAt: 'DESC' },
          take: 5,
        }),
      ]);
      const bucketMappings = fieldMappings.filter((mapping) => this.fieldBelongsToFinanceBucket(mapping, bucket));
      const statusCounts = bucketMappings.reduce<Record<string, number>>((acc, mapping) => {
        acc[mapping.matchStatus] = (acc[mapping.matchStatus] || 0) + 1;
        return acc;
      }, {});
      const riskCounts = bucketMappings.reduce<Record<string, number>>((acc, mapping) => {
        acc[mapping.riskLevel] = (acc[mapping.riskLevel] || 0) + 1;
        return acc;
      }, {});
      const unresolvedHighRisk = bucketMappings.filter((mapping) => (
        ['HIGH', 'CRITICAL'].includes(mapping.riskLevel)
        && ['PENDING', 'HOLD'].includes(mapping.decisionStatus)
      )).length;
      const hasMirrorData = snapshotCount > 0 || entityCount > 0;
      const adapterStatus = hasMirrorData
        ? (unresolvedHighRisk > 0 ? 'READY_WITH_FIELD_GAPS' : 'READY')
        : 'WAITING_MIRROR_SYNC';
      return {
        key: bucket.key,
        title: bucket.title,
        priority: bucket.priority,
        endpointKeys: bucket.endpointKeys,
        entityTypes: bucket.entityTypes,
        erpTarget: bucket.erpTarget,
        adapterScope: bucket.adapterScope,
        adapterStatus,
        snapshotCount,
        entityCount,
        mappedFieldCount: bucketMappings.length,
        statusCounts,
        riskCounts,
        unresolvedHighRisk,
        latestPulledAt: latestSnapshot[0]?.pulledAt ?? null,
        sampleEntities: sampleEntities.map((entity) => ({
          entityType: entity.entityType,
          externalCode: entity.externalCode,
          externalName: entity.externalName,
          amount: entity.amount,
          currency: entity.currency,
          status: entity.status,
          period: entity.period,
        })),
        nextAction: this.financeAdapterNextAction(bucket.priority, adapterStatus, unresolvedHighRisk),
      };
    }));

    const readiness = {
      p0Total: buckets.filter((bucket) => bucket.priority === 'P0').length,
      p0Ready: buckets.filter((bucket) => bucket.priority === 'P0' && bucket.adapterStatus === 'READY').length,
      p0ReadyWithGaps: buckets.filter((bucket) => bucket.priority === 'P0' && bucket.adapterStatus === 'READY_WITH_FIELD_GAPS').length,
      p0WaitingMirrorSync: buckets.filter((bucket) => bucket.priority === 'P0' && bucket.adapterStatus === 'WAITING_MIRROR_SYNC').length,
      p1Total: buckets.filter((bucket) => bucket.priority === 'P1').length,
      pushEnabled: false,
      writeChanjet: false,
      writeBusinessTables: false,
      allowedNextGate: 'CHANJET_P0_READONLY_FINANCE_ADAPTER_REVIEW',
    };

    return {
      generatedAt: new Date().toISOString(),
      accountBooks: books.map((book) => ({
        bookId: book.bookId,
        bookName: book.bookName,
        companyCode: book.companyCode,
        companyName: book.companyName,
        enabled: book.enabled,
      })),
      readiness,
      buckets,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        voucherPush: false,
        erpBusinessTableWrite: false,
        migration: false,
        productionDeploy: false,
        finArInvoicesChanjetLink: false,
        note: '好业财只读镜像只能进入 ERP 中间层和差异分析；不得把好业财汇总数据写入 fin_ar_invoices。',
      },
    };
  }

  async financeReadonlyCoverage() {
    const expectedEndpoints = PROBE_ENDPOINTS.filter((ep) => ep.mirrorDefault);
    const [rawRows, entityRows, fieldRows, recentJobs, books] = await Promise.all([
      this.readSnapshotRepo
        .createQueryBuilder('s')
        .select('s.endpointKey', 'endpointKey')
        .addSelect('COUNT(*)', 'snapshotCount')
        .addSelect('COALESCE(SUM(s.rowCount),0)', 'rowCount')
        .addSelect('MAX(s.pulledAt)', 'latestPulledAt')
        .groupBy('s.endpointKey')
        .getRawMany(),
      this.entitySnapshotRepo
        .createQueryBuilder('s')
        .select('s.entityType', 'entityType')
        .addSelect('COUNT(*)', 'entityCount')
        .addSelect('COALESCE(SUM(s.amount),0)', 'amountSum')
        .addSelect('MAX(s.updatedAt)', 'latestUpdatedAt')
        .groupBy('s.entityType')
        .getRawMany(),
      this.fieldMappingRepo
        .createQueryBuilder('m')
        .select('m.matchStatus', 'matchStatus')
        .addSelect('COUNT(*)', 'count')
        .groupBy('m.matchStatus')
        .getRawMany(),
      this.jobRepo.find({
        where: { jobType: 'SNAPSHOT' },
        order: { createdAt: 'DESC' },
        take: 300,
      }),
      this.listAccountBooks(),
    ]);

    const rawByEndpoint = new Map(rawRows.map((row: any) => [String(row.endpointKey), row]));
    const entityByType = new Map(entityRows.map((row: any) => [String(row.entityType), row]));
    const latestJobByEndpoint = new Map<string, ChanjetSyncJobEntity>();
    for (const job of recentJobs) {
      const key = String(job.requestScope?.key || '');
      if (key && !latestJobByEndpoint.has(key)) latestJobByEndpoint.set(key, job);
    }

    const endpointCoverage = expectedEndpoints.map((ep) => {
      const raw = rawByEndpoint.get(ep.key) as any;
      const entity = ep.entityType ? (entityByType.get(ep.entityType) as any) : null;
      const latestJob = latestJobByEndpoint.get(ep.key);
      const covered = Number(raw?.snapshotCount || 0) > 0 || Number(entity?.entityCount || 0) > 0;
      return {
        key: ep.key,
        label: ep.label,
        apiDomain: ep.apiDomain,
        entityType: ep.entityType || '',
        requiredForP0: true,
        covered,
        snapshotCount: Number(raw?.snapshotCount || 0),
        rowCount: Number(raw?.rowCount || 0),
        entityCount: Number(entity?.entityCount || 0),
        amountSum: Number(entity?.amountSum || 0),
        latestPulledAt: raw?.latestPulledAt || entity?.latestUpdatedAt || null,
        latestJobStatus: latestJob?.status || 'NOT_RUN',
        latestJobError: latestJob?.errorMessage || null,
      };
    });

    const fieldStatusCounts = fieldRows.reduce<Record<string, number>>((acc, row: any) => {
      acc[String(row.matchStatus || 'UNKNOWN')] = Number(row.count || 0);
      return acc;
    }, {});
    const totalFieldMappings = Object.values(fieldStatusCounts).reduce((sum, count) => sum + count, 0);
    const coveredFieldMappings = (fieldStatusCounts.MATCHED || 0) + (fieldStatusCounts.PENDING || 0) + (fieldStatusCounts.TRANSFORM_REQUIRED || 0);
    const endpointCoverageRate = endpointCoverage.length
      ? endpointCoverage.filter((item) => item.covered).length / endpointCoverage.length
      : 0;

    const cardDefinitions = [
      { cardKey: 'arOpen', label: '应收待收', endpoints: ['RECEIVABLE_STATISTICS'], entityTypes: ['AR_STATISTICS'] },
      { cardKey: 'apOpen', label: '应付待付', endpoints: ['PAYABLE_STATISTICS'], entityTypes: ['AP_STATISTICS'] },
      { cardKey: 'cashBalance', label: '现金 / 银行余额', endpoints: ['FIN_ACCOUNT', 'GL_BALANCE'], entityTypes: ['CASH_ACCOUNT', 'GL_BALANCE'] },
      { cardKey: 'todayReceipt', label: '今日收款', endpoints: ['PAYMENT_AR'], entityTypes: ['AR_RECEIPT'] },
      { cardKey: 'todayPayment', label: '今日付款', endpoints: ['PAYMENT_AP'], entityTypes: ['AP_PAYMENT'] },
      { cardKey: 'subjectBalance', label: '科目余额', endpoints: ['GL_BALANCE'], entityTypes: ['GL_BALANCE'] },
      { cardKey: 'incomeStatement', label: '利润表关键项', endpoints: ['INCOME_STATEMENT'], entityTypes: ['INCOME_STATEMENT'] },
      { cardKey: 'balanceSheet', label: '资产负债表关键项', endpoints: ['BALANCE_SHEET'], entityTypes: ['BALANCE_SHEET'] },
      { cardKey: 'counterpartyBalance', label: '客户 / 供应商往来余额', endpoints: ['CUSTOMER_SUPPLIER', 'RECEIVABLE_STATISTICS', 'PAYABLE_STATISTICS'], entityTypes: ['CUSTOMER_SUPPLIER', 'AR_STATISTICS', 'AP_STATISTICS'] },
    ];
    const coveredEndpointSet = new Set(endpointCoverage.filter((item) => item.covered).map((item) => item.key));
    const cardCoverage = cardDefinitions.map((card) => {
      const covered = card.endpoints.every((key) => coveredEndpointSet.has(key));
      return {
        ...card,
        covered,
        status: covered ? 'COVERED' : 'NEED_SYNC_OR_MAPPING',
        sourceRule: covered ? '好业财只读镜像优先；ERP 明细作为辅助差异分析。' : '暂缺好业财镜像，ERP 显示必须标注 ERP-only / 待同步。',
      };
    });
    const cardCoverageRate = cardCoverage.length
      ? cardCoverage.filter((item) => item.covered).length / cardCoverage.length
      : 0;

    const failedLatestJobs = endpointCoverage.filter((item) => item.latestJobStatus === 'FAIL');
    return {
      generatedAt: new Date().toISOString(),
      writeChanjet: false,
      writeBusinessTables: false,
      pushVoucher: false,
      accountBooks: books.map((book) => ({
        bookId: book.bookId,
        bookName: book.bookName,
        companyCode: book.companyCode,
        companyName: book.companyName,
        enabled: book.enabled,
      })),
      fullReadonlyScope: expectedEndpoints.map((ep) => ({
        key: ep.key,
        label: ep.label,
        entityType: ep.entityType || '',
        apiDomain: ep.apiDomain,
      })),
      endpointCoverage,
      cardCoverage,
      fieldCoverage: {
        totalFieldMappings,
        coveredFieldMappings,
        coverageRate: totalFieldMappings ? coveredFieldMappings / totalFieldMappings : 0,
        statusCounts: fieldStatusCounts,
        missingFields: fieldStatusCounts.MISSING_IN_ERP || 0,
        transformRequired: fieldStatusCounts.TRANSFORM_REQUIRED || 0,
      },
      summary: {
        endpointCoverageRate,
        cardCoverageRate,
        fieldCoverageRate: totalFieldMappings ? coveredFieldMappings / totalFieldMappings : 0,
        missingEndpointKeys: endpointCoverage.filter((item) => !item.covered).map((item) => item.key),
        failedLatestJobs: failedLatestJobs.map((item) => ({
          key: item.key,
          label: item.label,
          error: item.latestJobError,
        })),
        decision: endpointCoverageRate >= 0.9 && cardCoverageRate >= 0.9 ? 'GO' : 'GO_WITH_CONDITIONS',
      },
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        erpBusinessOverwrite: false,
        rule: '好业财有数据时财务卡片优先标注好业财口径；ERP 业务明细只做辅助明细和差异解释，不静默覆盖。',
      },
    };
  }

  private fieldBelongsToFinanceBucket(mapping: ChanjetErpFieldMappingEntity, bucket: FinanceAdapterBucketDefinition) {
    const endpoint = `${mapping.chanjetEndpoint || ''}`.toLowerCase();
    const fieldPath = `${mapping.chanjetFieldPath || ''}`.toLowerCase();
    if (bucket.key === 'CHANJET_VOUCHER_LINE') {
      return endpoint.includes('acctgtrans') && fieldPath.includes('.details[');
    }
    if (bucket.key === 'CHANJET_VOUCHER_HEADER') {
      return endpoint.includes('acctgtrans') && !fieldPath.includes('.details[');
    }
    if (bucket.key === 'CHANJET_COUNTERPARTY') {
      return endpoint.includes('custvendor') || /customer|supplier|vendor|counterparty|subjectname/.test(fieldPath);
    }
    if (bucket.key === 'CHANJET_AP_AR_AGGREGATE') {
      return endpoint.includes('/statistics/pay') || endpoint.includes('/statistics/receive') || /receive|payable|amount|balance|期末/.test(fieldPath);
    }
    if (bucket.key === 'CHANJET_PAYMENT_DOCUMENT') {
      return endpoint.includes('/payment/') || /payment|receipt|settle|payee|payer/.test(fieldPath);
    }
    if (bucket.key === 'CHANJET_PURCHASE_LINKAGE') {
      return endpoint.includes('purchaseorder') || /purchase|supplier|po|order/.test(fieldPath);
    }
    return bucket.endpointKeys.some((key) => endpoint.includes(key.toLowerCase()));
  }

  private financeAdapterNextAction(priority: 'P0' | 'P1', adapterStatus: string, unresolvedHighRisk: number) {
    if (adapterStatus === 'WAITING_MIRROR_SYNC') return '先执行只读镜像同步，不得写好业财。';
    if (unresolvedHighRisk > 0) return '先由财务/A2 审核高风险字段映射，再进入 UI/差异分析。';
    if (priority === 'P0') return '可进入 P0 只读财务适配展示与人工映射复核。';
    return 'P1 可排队进入后续采购/收付款链路适配。';
  }

  private masterDataFieldDomains(domainKey: string): string[] {
    const map: Record<string, string[]> = {
      COMPANY_BOOK: ['company'],
      DEPARTMENT_ORG: ['organization'],
      COUNTERPARTY: ['counterparty'],
      SUBJECT: ['accounting', 'finance'],
      PROJECT: ['project'],
      CASH_ACCOUNT: ['finance', 'accounting'],
      CURRENCY: ['currency', 'finance'],
    };
    return map[domainKey] || [];
  }

  private masterDataAlignmentNextAction(status: string, domainKey: string): string {
    if (status === 'WAITING_MIRROR_SYNC') return '先重跑好业财只读镜像同步，不得写好业财。';
    if (status === 'NEED_MAPPING_CANDIDATES') return '从实体镜像生成 ERP ↔ 好业财候选映射，保持 PENDING，禁止自动生效。';
    if (status === 'HOLD_CONFLICT') return '存在冲突映射，必须人工复核后才能进入后续财务对齐。';
    if (status === 'NEED_REVIEW') {
      if (domainKey === 'COUNTERPARTY') return '优先区分客户/供应商/双重身份，并由财务/主数据审核。';
      if (domainKey === 'SUBJECT') return '优先确认会计科目编码、科目层级和余额方向。';
      if (domainKey === 'CASH_ACCOUNT') return '优先确认资金账户、币种、启停状态和公司归属。';
      return '完成候选映射人工审核，APPROVED 后才能作为权威映射。';
    }
    return '可进入差异对账中心或写回前校验设计，仍不得直接写好业财。';
  }

  private async erpFinanceAggregate(sql: string): Promise<{ available: boolean; value: number; rows: number; error?: string }> {
    try {
      const rows = await this.ds.query(sql);
      const row = rows[0] || {};
      return {
        available: true,
        value: Number(row.value || 0),
        rows: Number(row.rows || 0),
      };
    } catch (error) {
      this.log.warn(`ERP finance aggregate unavailable: ${(error as Error).message}`);
      return {
        available: false,
        value: 0,
        rows: 0,
        error: (error as Error).message,
      };
    }
  }

  private async chanjetEntityAggregate(entityTypes: string[]): Promise<{
    available: boolean;
    value: number;
    rows: number;
    latestPulledAt: string | null;
    error?: string;
  }> {
    try {
      const rows = await this.entitySnapshotRepo
        .createQueryBuilder('s')
        .select('COALESCE(SUM(CAST(s.amount AS numeric)),0)', 'value')
        .addSelect('COUNT(*)', 'rows')
        .addSelect('MAX(s.updatedAt)', 'latestPulledAt')
        .where('s.entityType IN (:...entityTypes)', { entityTypes })
        .getRawMany();
      const row = rows[0] || {};
      const count = Number(row.rows || 0);
      return {
        available: count > 0,
        value: Number(row.value || 0),
        rows: count,
        latestPulledAt: row.latestPulledAt ? String(row.latestPulledAt) : null,
      };
    } catch (error) {
      this.log.warn(`Chanjet entity aggregate unavailable for ${entityTypes.join(',')}: ${(error as Error).message}`);
      return {
        available: false,
        value: 0,
        rows: 0,
        latestPulledAt: null,
        error: (error as Error).message,
      };
    }
  }

  private buildFinanceReconciliationItem(input: {
    key: string;
    label: string;
    priority: 'P0' | 'P1';
    chanjetEndpointKeys: string[];
    chanjetEntityTypes: string[];
    erpSources: string[];
    chanjet: { available: boolean; value: number; rows: number; latestPulledAt?: string | null; error?: string };
    erp: { available: boolean; value: number; rows: number; error?: string } | null;
    reason: string;
    forceStatus?: FinanceReconciliationStatus;
  }): FinanceReconciliationItem {
    const semanticLock = this.financeSemanticLockFor(input.key);
    const chanjetValue = input.chanjet.available ? input.chanjet.value : null;
    const erpValue = input.erp?.available ? input.erp.value : null;
    const diff = chanjetValue !== null && erpValue !== null ? chanjetValue - erpValue : null;
    const base = Math.max(Math.abs(chanjetValue ?? 0), Math.abs(erpValue ?? 0), 1);
    const diffRate = diff === null ? null : Math.abs(diff) / base;
    const status = input.forceStatus
      || (!input.chanjet.available
        ? 'NEED_MAPPING'
        : input.erp && !input.erp.available
          ? 'HOLD'
          : diff === null
            ? 'NEED_MAPPING'
            : Math.abs(diff) < 0.01
              ? 'OK'
              : diffRate !== null && diffRate <= 0.01
                ? 'WARN'
                : 'MISMATCH');
    return {
      key: input.key,
      label: input.label,
      priority: input.priority,
      chanjetEndpointKeys: input.chanjetEndpointKeys,
      chanjetEntityTypes: input.chanjetEntityTypes,
      erpSources: input.erpSources,
      chanjetValue,
      erpValue,
      diff,
      diffRate,
      status,
      evidence: {
        chanjetRows: input.chanjet.rows,
        latestPulledAt: input.chanjet.latestPulledAt || null,
        erpRows: input.erp?.rows || 0,
      },
      reason: input.reason,
      recommendedAction: this.financeReconciliationNextAction(status),
      semanticLock,
    };
  }

  private financeSemanticLockFor(key: string): FinanceSemanticLock {
    return FINANCE_SEMANTIC_LOCKS.find((item) => item.key === key) || {
      key,
      label: key,
      status: 'PENDING',
      authorityEligible: false,
      chanjetEntityTypes: [],
      lockedFields: [],
      pendingFields: ['semantic_definition'],
      dateRule: '未定义。',
      amountRule: '未定义。',
      statusRule: '未定义。',
      erpComparisonRule: '未定义。',
      risk: 'HIGH',
      reason: '缺少语义锁定义。',
      nextAction: '补充 FinanceSemanticLock 定义后才能进入财务卡片权威口径。',
    };
  }

  private financeReconciliationNextAction(status: FinanceReconciliationStatus): string {
    if (status === 'OK') return '保持现有好业财权威口径，并纳入每日对账。';
    if (status === 'WARN') return '差异较小，显示差异并进入月末复核。';
    if (status === 'MISMATCH') return '进入差异对账中心，按公司、往来单位、科目、期间拆解差异。';
    if (status === 'NEED_MAPPING') return '补齐字段语义映射和 ERP 对照字段，禁止静默显示为 0。';
    if (status === 'NEED_MANUAL_REVIEW') return '需要财务确认业务日/入账日/审核状态等口径后才能成为卡片权威值。';
    return '存在基础表或查询异常，先修复运行时证据再继续。';
  }

  private buildFinanceReadModelMetric(
    item: FinanceReconciliationItem,
    extractor?: FinanceSemanticExtractor,
  ): FinanceReadModelMetric {
    const selectedValueFields = this.financeReadModelValueFields(extractor);
    const hasMirrorValue = item.chanjetValue !== null;
    const waitingSample = !extractor || extractor.status === 'WAITING_SAMPLE';
    const needManualReview = item.status === 'NEED_MANUAL_REVIEW';
    const blockedMapping = !extractor || ['PARTIAL', 'NEED_EXTRACTION'].includes(extractor.status) || item.status === 'NEED_MAPPING';
    const hold = item.status === 'HOLD' || extractor?.status === 'HOLD';
    const authorityReady = Boolean(
      extractor?.authorityEligible
      && item.semanticLock.authorityEligible
      && hasMirrorValue
      && !needManualReview
      && !blockedMapping
      && !hold,
    );
    const readonlyReady = Boolean(
      extractor?.status === 'READY'
      && !authorityReady
      && hasMirrorValue
      && !needManualReview
      && !hold,
    );
    const status: FinanceReadModelStatus = hold
      ? 'HOLD'
      : authorityReady
        ? 'AUTHORITY_READY'
        : readonlyReady
          ? 'READONLY_READY'
          : needManualReview
            ? 'NEED_MANUAL_REVIEW'
            : waitingSample
              ? 'WAITING_SAMPLE'
              : 'BLOCKED_MAPPING';
    const displayValue = ['AUTHORITY_READY', 'READONLY_READY'].includes(status) ? item.chanjetValue : null;
    return {
      key: item.key,
      label: item.label,
      priority: item.priority,
      status,
      authorityEligible: status === 'AUTHORITY_READY',
      displayValue,
      erpAuxiliaryValue: item.erpValue,
      diff: displayValue !== null && item.erpValue !== null ? displayValue - item.erpValue : null,
      valueSource: displayValue !== null
        ? 'chanjet_entity_snapshots.amount / semantic extractor confirmed'
        : 'blocked_until_semantic_extractor_ready',
      sourceEntityTypes: item.chanjetEntityTypes,
      sampleRows: extractor?.sampleRows || item.evidence.chanjetRows,
      latestPulledAt: extractor?.latestPulledAt || item.evidence.latestPulledAt,
      requiredFields: extractor?.fieldCandidates.filter((field) => field.required).map((field) => field.semanticField) || item.semanticLock.pendingFields,
      missingRequiredFields: extractor?.missingRequiredFields || item.semanticLock.pendingFields,
      selectedValueFields,
      reason: this.financeReadModelReason(status, item, extractor),
      nextAction: this.financeReadModelNextAction(status, item, extractor),
    };
  }

  private financeReadModelValueFields(extractor?: FinanceSemanticExtractor): FinanceReadModelMetric['selectedValueFields'] {
    if (!extractor) return [];
    const amountLike = /(amount|money|balance|closing|ending|debit|credit|tax|current_period|year_to_date)/i;
    return extractor.fieldCandidates
      .filter((field) => amountLike.test(field.semanticField) && field.candidatePaths.length > 0)
      .map((field) => ({
        semanticField: field.semanticField,
        candidatePath: field.candidatePaths[0].path,
        sampleValue: field.candidatePaths[0].sampleValue,
      }));
  }

  private financeReadModelReason(
    status: FinanceReadModelStatus,
    item: FinanceReconciliationItem,
    extractor?: FinanceSemanticExtractor,
  ): string {
    if (status === 'AUTHORITY_READY') return '好业财镜像、语义锁和提取器均满足权威候选条件，可作为财务卡片主值，并保留 ERP 辅助差异。';
    if (status === 'READONLY_READY') return '字段样本已就绪，但该指标尚非权威口径；只能只读展示，不得覆盖 ERP 业务事实。';
    if (status === 'NEED_MANUAL_REVIEW') return '日期、审核状态、作废状态或方向口径仍需财务确认。';
    if (status === 'WAITING_SAMPLE') return '该指标缺少好业财 raw_data 样本，需要先重跑只读同步。';
    if (status === 'HOLD') return '存在基础查询或安全边界异常，必须停止进入人工处理。';
    return extractor?.missingRequiredFields.length
      ? `必需字段未锁定: ${extractor.missingRequiredFields.slice(0, 6).join(' / ')}。`
      : item.reason;
  }

  private financeReadModelNextAction(
    status: FinanceReadModelStatus,
    item: FinanceReconciliationItem,
    extractor?: FinanceSemanticExtractor,
  ): string {
    if (status === 'AUTHORITY_READY') return '接入财务首页主卡片，标明好业财口径，同时显示 ERP 辅助差异。';
    if (status === 'READONLY_READY') return '只读展示明细，不作为主卡片权威值。';
    if (status === 'NEED_MANUAL_REVIEW') return '锁定业务日/入账日/审核状态/作废过滤，再进入下一轮 read model。';
    if (status === 'WAITING_SAMPLE') return '执行好业财全量只读同步，补齐该实体 raw_data 样本。';
    if (status === 'HOLD') return '停止接入卡片，先修复 HOLD 原因。';
    return extractor?.missingRequiredFields.length
      ? `补齐字段候选: ${extractor.missingRequiredFields.slice(0, 5).join(' / ')}`
      : item.recommendedAction;
  }

  private async buildReceiptPaymentDateStatusLock(
    key: 'TODAY_RECEIPT' | 'TODAY_PAYMENT',
    label: string,
    entityType: 'AR_RECEIPT' | 'AP_PAYMENT',
  ): Promise<ReceiptPaymentDateStatusLock> {
    const rows = await this.entitySnapshotRepo.find({
      where: { entityType },
      order: { updatedAt: 'DESC' },
      take: 80,
    });
    const requiredDimensions = ['business_date', 'posted_date', 'approved_status', 'void_status', 'direction', 'amount'];
    const flattened = rows.flatMap((row) => this.flattenSemanticValues(row.rawData || {}, '$'));
    const latestPulledAt = rows.reduce<string | null>((latest, row) => this.maxIso(latest, row.updatedAt ? String(row.updatedAt) : null), null);
    const fieldCandidates = requiredDimensions.map((field) => {
      const candidates = this.matchSemanticFieldCandidates(field, flattened).slice(0, 8);
      return {
        semanticField: field,
        candidatePaths: candidates,
        required: true,
        status: candidates.length ? 'FOUND' as const : 'MISSING' as const,
      };
    });
    const lockedDimensions = fieldCandidates.filter((field) => field.status === 'FOUND').map((field) => field.semanticField);
    const missingDimensions = fieldCandidates.filter((field) => field.status === 'MISSING').map((field) => field.semanticField);
    const status: ReceiptPaymentLockStatus = rows.length === 0
      ? 'WAITING_SAMPLE'
      : missingDimensions.length === 0
        ? 'LOCKED'
        : lockedDimensions.length > 0
          ? 'PARTIAL'
          : 'HOLD';
    const readyForFinanceReview = status === 'LOCKED';
    return {
      key,
      label,
      entityType,
      status,
      sampleRows: rows.length,
      latestPulledAt,
      requiredDimensions,
      lockedDimensions,
      missingDimensions,
      fieldCandidates,
      dateRule: '今日口径必须由业务日与入账日候选字段共同确认，禁止用拉取时间或 created_at 代替。',
      statusRule: '必须显式过滤未审核、草稿、已作废、已取消记录；未锁定前不得进入主卡片。',
      directionRule: key === 'TODAY_RECEIPT'
        ? '仅允许收款方向；退款/冲销/反向单必须排除或单列差异。'
        : '仅允许付款方向；退款/冲销/反向单必须排除或单列差异。',
      amountRule: '金额字段必须来自好业财单据实收/实付金额候选，不能使用列表累计或 amount=0 占位。',
      readyForFinanceReview,
      readyForCardAuthority: false,
      reason: rows.length === 0
        ? `${entityType} 暂无中间层样本，需先重跑只读同步。`
        : missingDimensions.length === 0
          ? '日期、状态、方向和金额候选字段均已识别，可进入财务人工确认；尚未自动切换卡片权威值。'
          : `仍缺少候选维度: ${missingDimensions.join(' / ')}。`,
      nextAction: rows.length === 0
        ? '执行好业财全量只读同步，补齐收付款单 raw_data。'
        : missingDimensions.length === 0
          ? '由财务确认业务日/入账日/审核/作废枚举后，再进入财务卡片权威接线 Gate。'
          : `补齐字段候选: ${missingDimensions.join(' / ')}`,
    };
  }

  private async buildFinanceSemanticExtractor(lock: FinanceSemanticLock): Promise<FinanceSemanticExtractor> {
    const rows = await this.entitySnapshotRepo.find({
      where: { entityType: In(lock.chanjetEntityTypes.length ? lock.chanjetEntityTypes : ['__none__']) },
      order: { updatedAt: 'DESC' },
      take: 50,
    });
    const flattened = rows.flatMap((row) => this.flattenSemanticValues(row.rawData || {}, '$'));
    const latestPulledAt = rows.reduce<string | null>((latest, row) => this.maxIso(latest, row.updatedAt ? String(row.updatedAt) : null), null);
    const fields = lock.pendingFields.length ? lock.pendingFields : lock.lockedFields;
    const fieldCandidates = fields.map((field) => {
      const candidates = this.matchSemanticFieldCandidates(field, flattened).slice(0, 8);
      return {
        semanticField: field,
        candidatePaths: candidates,
        required: true,
        status: candidates.length ? 'FOUND' as const : 'MISSING' as const,
      };
    });
    const missingRequiredFields = fieldCandidates.filter((field) => field.required && field.status === 'MISSING').map((field) => field.semanticField);
    const extractedFields = fieldCandidates.filter((field) => field.status === 'FOUND').length;
    const requiredFields = fieldCandidates.filter((field) => field.required).length;
    const status: FinanceSemanticExtractorStatus = rows.length === 0
      ? 'WAITING_SAMPLE'
      : missingRequiredFields.length === 0
        ? 'READY'
        : extractedFields > 0
          ? 'PARTIAL'
          : 'NEED_EXTRACTION';
    return {
      key: lock.key,
      label: lock.label,
      status,
      authorityEligible: lock.authorityEligible && status === 'READY',
      sourceEntityTypes: lock.chanjetEntityTypes,
      sampleRows: rows.length,
      latestPulledAt,
      fieldCandidates,
      extractedFields,
      requiredFields,
      missingRequiredFields,
      reason: status === 'READY'
        ? 'raw_data 已找到全部必需语义字段候选，可进入只读 read model 设计。'
        : rows.length === 0
          ? '中间层缺少该口径样本，需先重跑好业财只读同步。'
          : '已有部分字段候选，但仍有必需字段未锁定，不能作为权威卡片口径。',
      nextAction: status === 'READY'
        ? '建立只读 read model，并在财务卡片中以好业财口径展示。'
        : rows.length === 0
          ? '执行全量只读同步，确认该实体类型有 raw_data 样本。'
          : `补齐字段候选: ${missingRequiredFields.slice(0, 5).join(' / ')}`,
    };
  }

  private flattenSemanticValues(value: unknown, prefix: string, depth = 0): Array<{
    path: string;
    sampleType: SampleType;
    sampleValue: string | null;
    observedCount: number;
  }> {
    if (depth > 6) return [];
    const sampleType = this.sampleType(value);
    const current = [{ path: prefix, sampleType, sampleValue: this.maskSample(value), observedCount: 1 }];
    if (Array.isArray(value)) {
      return [
        ...current,
        ...value.slice(0, 5).flatMap((item, index) => this.flattenSemanticValues(item, `${prefix}[${index}]`, depth + 1)),
      ];
    }
    if (this.isRecord(value)) {
      return [
        ...current,
        ...Object.entries(value).flatMap(([key, item]) => this.flattenSemanticValues(item, `${prefix}.${key}`, depth + 1)),
      ];
    }
    return current;
  }

  private matchSemanticFieldCandidates(
    semanticField: string,
    flattened: Array<{ path: string; sampleType: SampleType; sampleValue: string | null; observedCount: number }>,
  ): Array<{ path: string; sampleType: SampleType; sampleValue: string | null; observedCount: number }> {
    const keywords = this.semanticFieldKeywords(semanticField);
    const scored = flattened
      .filter((item) => !['object', 'array', 'null'].includes(item.sampleType))
      .map((item) => {
        const path = item.path.toLowerCase();
        const sample = `${item.sampleValue || ''}`.toLowerCase();
        const score = keywords.reduce((sum, keyword) => {
          const k = keyword.toLowerCase();
          return sum + (path.includes(k) ? 3 : 0) + (sample.includes(k) ? 1 : 0);
        }, 0);
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    const deduped = new Map<string, { path: string; sampleType: SampleType; sampleValue: string | null; observedCount: number }>();
    for (const item of scored) {
      const normalizedPath = item.path.replace(/\[\d+\]/g, '[]');
      if (!deduped.has(normalizedPath)) {
        deduped.set(normalizedPath, {
          path: normalizedPath,
          sampleType: item.sampleType,
          sampleValue: item.sampleValue,
          observedCount: 1,
        });
      } else {
        const existing = deduped.get(normalizedPath)!;
        existing.observedCount += 1;
      }
    }
    return [...deduped.values()];
  }

  private semanticFieldKeywords(field: string): string[] {
    const normalized = field.toLowerCase();
    const map: Array<[RegExp, string[]]> = [
      [/business_date|posted_date|date|period/, ['date', 'bizdate', 'businessdate', 'billdate', 'voucherdate', 'postdate', 'period', 'yearmonth', 'accountperiod', 'createdtime', 'updatedtime']],
      [/approved_status|void_status|status|state/, ['status', 'state', 'approve', 'audit', 'voucherstate', 'billstate', 'void', 'cancel', 'enable']],
      [/current_balance|available_balance|balance|opening|closing|ending/, ['balance', 'endbalance', 'beginbalance', 'closing', 'ending', 'available', 'currentbalance', 'remain']],
      [/debit|jf/, ['debit', 'jf', 'borrow', 'dr']],
      [/credit|df/, ['credit', 'df', 'lend', 'cr']],
      [/amount|money|tax|year_to_date|current_period/, ['amount', 'money', 'tax', 'sum', 'total', 'period', 'bq', 'bn', 'current', 'year']],
      [/subject/, ['subject', 'acct', 'account', 'code', 'name']],
      [/currency/, ['currency', 'currencycode', 'currencyname', 'origcurrency']],
      [/line_no|item_name|cash_flow_category/, ['line', 'row', 'item', 'name', 'category', 'project']],
      [/counterparty|assistant|customer|supplier/, ['customer', 'supplier', 'vendor', 'party', 'assistant', 'custvendor', 'subjectname']],
    ];
    const found = map.flatMap(([pattern, keywords]) => pattern.test(normalized) ? keywords : []);
    return [...new Set([...found, normalized.replace(/_/g, ''), normalized])].filter(Boolean);
  }

  private maxIso(left: string | null, right: string | null): string | null {
    if (!left) return right || null;
    if (!right) return left;
    return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
  }

  async syncReadOnlyMirror(scope: string[] = [], bookId?: string, period?: string): Promise<{
    requestedScope: string[];
    books: string[];
    results: Array<{
      key: string;
      bookId: string;
      status: 'SUCCESS' | 'FAIL';
      fields?: number;
      rows?: number;
      rawSnapshotId?: string;
      entityRows?: number;
      error?: string;
    }>;
    fieldGapSummary: { scanned: number; upserted: number; statusCounts: Record<string, number> };
  }> {
    const requested = scope.length
      ? scope.map((s) => s.toUpperCase())
      : PROBE_ENDPOINTS.filter((ep) => ep.mirrorDefault).map((ep) => ep.key);
    const selectedKeys = new Set(requested);
    const endpoints = PROBE_ENDPOINTS.filter((ep) => selectedKeys.has(ep.key));
    if (!endpoints.length) throw new Error(`未找到可执行 mirror scope: ${requested.join(',')}`);

    let books = bookId ? [bookId] : (await this.listEnabledBookIds());
    if (!books.length) {
      const refreshed = await this.refreshAccountBooks();
      books = refreshed.books.filter((b) => b.enabled).map((b) => b.bookId);
    }

    const results: Array<{
      key: string;
      bookId: string;
      status: 'SUCCESS' | 'FAIL';
      fields?: number;
      rows?: number;
      rawSnapshotId?: string;
      entityRows?: number;
      error?: string;
    }> = [];

    for (const ep of endpoints) {
      const targets = ep.requiresBook ? books : [''];
      for (const targetBookId of targets) {
        const path = ep.requiresBook ? ep.path.replace('{bookid}', encodeURIComponent(targetBookId)) : ep.path;
        const effectivePeriod = period || ep.query?.period || '';
        const query = {
          ...(ep.query || {}),
          ...(ep.periodQuery && effectivePeriod ? { period: effectivePeriod } : {}),
        };
        const job = await this.createJob('SNAPSHOT', targetBookId, effectivePeriod, {
          key: ep.key,
          label: ep.label,
          method: ep.method,
          path,
          mode: 'read-chanjet-write-erp-middle-layer',
        });
        try {
          const resp = await this.auth.callApi(path, {
            method: ep.method,
            query,
            body: ep.body,
          });
          const fields = await this.recordApiSample(ep.apiDomain, path, ep.method, resp);
          const rawSnapshot = await this.recordReadSnapshot(ep, targetBookId, path, ep.method, effectivePeriod, resp);
          const entityRows = await this.recordEntitySnapshots(ep, targetBookId, effectivePeriod, resp);
          if (ep.mappingType) {
            await this.createMappingCandidates(ep.mappingType, targetBookId, resp);
          }
          await this.finishJob(job, 'SUCCESS', {
            key: ep.key,
            fields,
            rows: rawSnapshot.rowCount,
            rawSnapshotId: rawSnapshot.id,
            entityRows,
          });
          results.push({
            key: ep.key,
            bookId: targetBookId,
            status: 'SUCCESS',
            fields,
            rows: rawSnapshot.rowCount,
            rawSnapshotId: rawSnapshot.id,
            entityRows,
          });
        } catch (err) {
          const error = (err as Error).message;
          await this.finishJob(job, 'FAIL', { key: ep.key }, error);
          await this.recordChanjetApiAlert(ep, path, targetBookId, error);
          results.push({ key: ep.key, bookId: targetBookId, status: 'FAIL', error });
        }
      }
    }

    const fieldGapSummary = await this.analyzeFieldGaps();
    return { requestedScope: requested, books, results, fieldGapSummary };
  }

  async analyzeFieldGaps(): Promise<{ scanned: number; upserted: number; statusCounts: Record<string, number> }> {
    const fields = await this.fieldCatalogRepo.find({ take: 5000 });
    let upserted = 0;
    const statusCounts: Record<string, number> = {};
    for (const field of fields) {
      if (field.fieldPath === '$' || field.sampleType === 'object' || field.sampleType === 'array') continue;
      const suggestion = this.suggestErpFieldMapping(field);
      statusCounts[suggestion.matchStatus] = (statusCounts[suggestion.matchStatus] || 0) + 1;
      await this.fieldMappingRepo.upsert(
        {
          chanjetEndpoint: field.apiPath,
          chanjetFieldPath: field.fieldPath,
          chanjetType: field.sampleType,
          chanjetSampleMasked: field.sampleValueMasked,
          erpDomain: suggestion.erpDomain,
          erpTable: suggestion.erpTable,
          erpField: suggestion.erpField,
          erpType: suggestion.erpType,
          transformRule: suggestion.transformRule,
          matchStatus: suggestion.matchStatus,
          riskLevel: suggestion.riskLevel,
          decisionStatus: 'PENDING',
          analysisNote: suggestion.analysisNote,
        },
        { conflictPaths: ['chanjetEndpoint', 'chanjetFieldPath', 'erpDomain', 'erpField'], skipUpdateIfNoValuesChanged: false },
      );
      upserted += 1;
    }
    await this.deprecateFakeCounterpartyTargets();
    await this.deprecateApiEnvelopeBusinessTargets();
    return { scanned: fields.length, upserted, statusCounts };
  }

  async listVoucherDrafts(limit = 100, status?: string): Promise<ChanjetVoucherDraftEntity[]> {
    return this.voucherDraftRepo.find({
      where: status ? { status: status as ChanjetVoucherDraftEntity['status'] } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(Number(limit) || 100, 1), 500),
    });
  }

  async createVoucherDraft(input: VoucherDraftInput, createdBy: string): Promise<ChanjetVoucherDraftEntity> {
    if (!input.sourceBizType) throw new Error('sourceBizType 必填');
    if (!input.sourceBizId) throw new Error('sourceBizId 必填');
    if (!Array.isArray(input.voucherLines) || input.voucherLines.length === 0) {
      throw new Error('voucherLines 必须为非空数组');
    }
    const draft = this.voucherDraftRepo.create({
      sourceBizType: input.sourceBizType,
      sourceBizId: input.sourceBizId,
      companyCode: input.companyCode ?? '',
      bookId: input.bookId ?? '',
      period: input.period ?? '',
      title: input.title ?? '',
      voucherLines: input.voucherLines,
      status: 'DRAFT',
      pushAllowed: false,
      pushStatus: 'NOT_PUSHED',
      createdBy: createdBy || '',
      reviewedBy: null,
      reviewedAt: null,
      rawData: input.rawData ?? null,
    });
    return this.voucherDraftRepo.save(draft);
  }

  async updateVoucherDraftStatus(
    id: string,
    status: 'DRAFT' | 'REVIEWED' | 'PUSH_READY' | 'REJECTED',
    reviewedBy: string,
  ): Promise<ChanjetVoucherDraftEntity> {
    const draft = await this.voucherDraftRepo.findOneBy({ id });
    if (!draft) throw new Error(`voucher draft ${id} 不存在`);
    draft.status = status;
    draft.pushAllowed = status === 'PUSH_READY';
    draft.reviewedBy = reviewedBy || null;
    draft.reviewedAt = new Date();
    return this.voucherDraftRepo.save(draft);
  }

  async listReconciliationResults(
    limit = 100,
    status?: string,
    reconciliationType?: string,
  ): Promise<ChanjetReconciliationResultEntity[]> {
    return this.reconciliationRepo.find({
      where: {
        ...(status ? { status: status as ChanjetReconciliationResultEntity['status'] } : {}),
        ...(reconciliationType ? { reconciliationType: reconciliationType as ChanjetReconciliationResultEntity['reconciliationType'] } : {}),
      },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(Number(limit) || 100, 1), 500),
    });
  }

  async runMappingReconciliation(): Promise<{
    scanned: number;
    created: number;
    statusCounts: Record<string, number>;
    results: ChanjetReconciliationResultEntity[];
  }> {
    const job = await this.createJob('RECONCILE', '', '', {
      scope: 'MASTER_MAPPING',
      mode: 'middle-layer-only',
    });

    try {
      const mappings = await this.mappingRepo.find({ take: 2000, order: { mappingType: 'ASC', createdAt: 'DESC' } });
      const results: ChanjetReconciliationResultEntity[] = [];
      for (const mapping of mappings) {
        const issue = this.mappingIssue(mapping);
        if (!issue) continue;
        const result = this.reconciliationRepo.create({
          reconciliationType: 'MASTER_MAPPING',
          companyCode: '',
          bookId: mapping.bookId ?? '',
          period: '',
          status: issue.status,
          severity: issue.severity,
          subjectType: mapping.mappingType,
          subjectKey: mapping.erpCode || mapping.chanjetId || mapping.chanjetCode || String(mapping.id),
          subjectName: mapping.erpName || mapping.chanjetName || '',
          erpValue: {
            code: mapping.erpCode,
            name: mapping.erpName,
          },
          chanjetValue: {
            id: mapping.chanjetId,
            code: mapping.chanjetCode,
            name: mapping.chanjetName,
          },
          diffSummary: issue.diffSummary,
          actionRequired: issue.actionRequired,
          resolved: false,
          resolvedBy: null,
          resolvedAt: null,
        });
        results.push(await this.reconciliationRepo.save(result));
      }
      const statusCounts = results.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});
      await this.finishJob(job, 'SUCCESS', { scanned: mappings.length, created: results.length, statusCounts });
      return { scanned: mappings.length, created: results.length, statusCounts, results };
    } catch (err) {
      await this.finishJob(job, 'FAIL', {}, (err as Error).message);
      throw err;
    }
  }

  async listMasterMappings(mappingType?: string): Promise<ChanjetMasterMappingEntity[]> {
    return this.mappingRepo.find({
      where: mappingType ? { mappingType: mappingType as ChanjetMappingType } : {},
      order: { mappingType: 'ASC', bookId: 'ASC', erpCode: 'ASC', chanjetName: 'ASC' },
      take: 1000,
    });
  }

  async updateMappingReview(
    id: string,
    reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED',
    reviewedBy: string,
  ): Promise<ChanjetMasterMappingEntity> {
    const mapping = await this.mappingRepo.findOneBy({ id });
    if (!mapping) throw new Error(`mapping ${id} 不存在`);
    mapping.reviewStatus = reviewStatus;
    mapping.reviewedBy = reviewedBy || null;
    mapping.reviewedAt = new Date();
    return this.mappingRepo.save(mapping);
  }

  async refreshAccountBooks(): Promise<{ fetched: number; saved: number; books: ChanjetAccountBookEntity[] }> {
    const job = await this.createJob('BOOK_REFRESH', '', '', {
      source: 'listAccountBooks',
      mode: 'read-chanjet-write-middle-layer',
    });

    try {
      const resp = await this.auth.listAccountBooks();
      await this.recordApiSample('account-book', '/accounting/openapi/cc/book/findByEnterpriseId', 'GET', resp);
      const books = this.extractBooks(resp);
      const mapByBook = new Map((await this.bookCompanyMapRepo.find()).map((m) => [m.bookid, m]));

      const savedBooks: ChanjetAccountBookEntity[] = [];
      for (const b of books) {
        const mapped = mapByBook.get(b.bookId);
        const entity = this.accountBookRepo.create({
          bookId: b.bookId,
          bookName: b.bookName,
          companyCode: mapped?.companyCode ?? null,
          companyName: mapped?.companyName ?? null,
          enabled: !!mapped?.syncEnabled,
          rawData: b.rawData,
          lastProbeAt: new Date(),
        });
        savedBooks.push(await this.accountBookRepo.save(entity));
        if (mapped) {
          await this.upsertMasterMapping({
            mappingType: 'COMPANY',
            bookId: b.bookId,
            erpCode: mapped.companyCode,
            erpName: mapped.companyName,
            chanjetId: b.bookId,
            chanjetCode: b.bookId,
            chanjetName: b.bookName,
            matchStatus: 'MATCHED',
            confidence: '100.00',
            reviewStatus: 'APPROVED',
            rawData: b.rawData,
          });
        }
      }

      await this.finishJob(job, 'SUCCESS', {
        fetched: books.length,
        saved: savedBooks.length,
      });
      return { fetched: books.length, saved: savedBooks.length, books: savedBooks };
    } catch (err) {
      await this.finishJob(job, 'FAIL', {}, (err as Error).message);
      throw err;
    }
  }

  async probe(scope: string[] = [], bookId?: string): Promise<{
    requestedScope: string[];
    books: string[];
    results: Array<{ key: string; bookId: string; status: 'SUCCESS' | 'FAIL'; fields?: number; error?: string }>;
  }> {
    const requested = scope.length ? scope : ['ACCOUNT_BOOKS', 'DEPARTMENT', 'CUSTOMER_SUPPLIER', 'SUBJECT'];
    const selectedKeys = new Set(requested.map((s) => s.toUpperCase()));
    const endpoints = PROBE_ENDPOINTS.filter((ep) => selectedKeys.has(ep.key));
    if (!endpoints.length) throw new Error(`未找到可执行 probe scope: ${requested.join(',')}`);

    let books = bookId ? [bookId] : (await this.listEnabledBookIds());
    if (!books.length) {
      const refreshed = await this.refreshAccountBooks();
      books = refreshed.books.filter((b) => b.enabled).map((b) => b.bookId);
    }

    const results: Array<{ key: string; bookId: string; status: 'SUCCESS' | 'FAIL'; fields?: number; error?: string }> = [];
    for (const ep of endpoints) {
      const targets = ep.requiresBook ? books : [''];
      for (const targetBookId of targets) {
        const path = ep.requiresBook ? ep.path.replace('{bookid}', encodeURIComponent(targetBookId)) : ep.path;
        const job = await this.createJob('PROBE', targetBookId, '', {
          key: ep.key,
          label: ep.label,
          method: ep.method,
          path,
        });
        try {
          const resp = await this.auth.callApi(path, {
            method: ep.method,
            query: ep.query,
            body: ep.body,
          });
          const fields = await this.recordApiSample(ep.apiDomain, path, ep.method, resp);
          if (ep.mappingType) {
            await this.createMappingCandidates(ep.mappingType, targetBookId, resp);
          }
          await this.finishJob(job, 'SUCCESS', {
            key: ep.key,
            fields,
          });
          results.push({ key: ep.key, bookId: targetBookId, status: 'SUCCESS', fields });
        } catch (err) {
          const error = (err as Error).message;
          await this.finishJob(job, 'FAIL', { key: ep.key }, error);
          results.push({ key: ep.key, bookId: targetBookId, status: 'FAIL', error });
        }
      }
    }

    return { requestedScope: requested, books, results };
  }

  private async listEnabledBookIds(): Promise<string[]> {
    const books = await this.accountBookRepo.find({ where: { enabled: true } });
    if (books.length) return books.map((b) => b.bookId);
    const maps = await this.bookCompanyMapRepo.find({ where: { syncEnabled: true } });
    return maps.map((m) => m.bookid);
  }

  private async recordReadSnapshot(
    ep: ProbeEndpoint,
    bookId: string,
    apiPath: string,
    method: HttpMethod,
    period: string,
    payload: unknown,
  ): Promise<ChanjetReadSnapshotEntity> {
    const normalizedPayload = this.isRecord(payload) ? payload : { value: payload };
    const rows = this.extractRows(payload);
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(this.maskSensitivePayload(normalizedPayload)))
      .digest('hex');
    const entity = this.readSnapshotRepo.create({
      bookId,
      endpointKey: ep.key,
      apiDomain: ep.apiDomain,
      apiPath,
      method,
      period: period || '',
      pageNo: 1,
      payloadHash,
      rowCount: rows.length,
      rawPayload: this.maskSensitivePayload(normalizedPayload),
    });
    await this.readSnapshotRepo.upsert(entity as any, {
      conflictPaths: ['bookId', 'endpointKey', 'payloadHash'],
      skipUpdateIfNoValuesChanged: false,
    });
    const saved = await this.readSnapshotRepo.findOneBy({ bookId, endpointKey: ep.key, payloadHash });
    return saved || entity;
  }

  private async recordEntitySnapshots(ep: ProbeEndpoint, bookId: string, period: string, payload: unknown): Promise<number> {
    const entityType = ep.entityType || ep.key;
    const rows = this.extractRows(payload).slice(0, 5000);
    if (this.isAggregateStatisticsEndpoint(ep.key, entityType)) {
      await this.entitySnapshotRepo.delete({ bookId, endpointKey: ep.key, entityType });
    }
    let count = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const normalized = this.normalizeExternalEntity(row, entityType, index, ep.key);
      if (!normalized.externalId && !normalized.externalCode && !normalized.externalName) continue;
      const externalId = normalized.externalId || normalized.externalCode || `${ep.key}-${index + 1}`;
      await this.entitySnapshotRepo.upsert(
        {
          bookId,
          endpointKey: ep.key,
          entityType,
          externalId,
          externalCode: normalized.externalCode,
          externalName: normalized.externalName,
          period: period || normalized.period,
          status: normalized.status,
          amount: normalized.amount,
          currency: normalized.currency,
          rawData: this.maskSensitivePayload(row),
          lastSeenAt: new Date(),
        } as any,
        { conflictPaths: ['bookId', 'entityType', 'externalId'], skipUpdateIfNoValuesChanged: false },
      );
      count += 1;
    }
    return count;
  }

  private normalizeExternalEntity(row: Record<string, unknown>, entityType: string, index: number, endpointKey = ''): {
    externalId: string;
    externalCode: string;
    externalName: string;
    period: string;
    status: string;
    amount: string;
    currency: string;
  } {
    const idCandidate = this.firstText(row, ['id', 'ID', 'bookId', 'bookid', 'tenantId', 'subjectId', 'assistantCustomer', 'voucherId', 'code']);
    const id = this.isUsableExternalId(idCandidate, entityType, endpointKey) ? idCandidate : '';
    const code = this.firstText(row, ['code', 'Code', 'bookCode', 'deptCode', 'subjectCode', 'customerCode', 'supplierCode', 'voucherCode', 'billCode', 'billNo', 'number']);
    const name = this.firstText(row, ['name', 'Name', 'bookName', 'deptName', 'subjectName', 'customerName', 'supplierName', 'fullName', 'title', 'summary']);
    const status = this.firstText(row, ['status', 'state', 'voucherState', 'approveStatus', 'auditStatus', 'enableStatus']);
    const period = this.firstText(row, ['period', 'accountPeriod', 'yearMonth', 'bizPeriod']);
    const currency = this.firstText(row, ['currency', 'currencyCode', 'currencyName', 'origCurrency']) || 'RMB';
    const amount = this.firstNumberText(row, [
      'amount',
      'totalAmount',
      'taxAmount',
      'endbalance',
      'balance',
      'currentPeriodJfBalance',
      'currentPeriodDfBalance',
      'debitAmount',
      'creditAmount',
    ]);
    return {
      externalId: id || this.stableExternalId(row, entityType, endpointKey, index),
      externalCode: code,
      externalName: name || code || id,
      period,
      status,
      amount,
      currency,
    };
  }

  private suggestErpFieldMapping(field: ChanjetApiFieldCatalogEntity): {
    erpDomain: string;
    erpTable: string;
    erpField: string;
    erpType: string;
    transformRule: string;
    matchStatus: ChanjetErpFieldMappingEntity['matchStatus'];
    riskLevel: ChanjetErpFieldMappingEntity['riskLevel'];
    analysisNote: string;
  } {
    if (this.isApiEnvelopeField(field.fieldPath)) {
      return {
        erpDomain: 'api_metadata',
        erpTable: 'chanjet_read_snapshots',
        erpField: 'raw_payload',
        erpType: 'jsonb',
        transformRule: '好业财响应 envelope 字段仅作为 raw snapshot 审计元数据保存，不进入 ERP 业务字段改造。',
        matchStatus: 'MATCHED',
        riskLevel: 'LOW',
        analysisNote: 'API envelope 字段，不作为 ERP 业务 schema 缺口。',
      };
    }
    const haystack = `${field.apiDomain} ${field.apiPath} ${field.fieldPath}`.toLowerCase();
    const normalizedName = field.fieldPath.split('.').pop()?.replace(/\[\d+\]/g, '') || field.fieldPath;
    const counterpartyTarget = this.suggestCounterpartyTarget(haystack, normalizedName);
    const candidates: Array<{
      test: RegExp;
      erpDomain: string;
      erpTable: string;
      erpField: string;
      erpType: string;
      transformRule?: string;
      riskLevel?: ChanjetErpFieldMappingEntity['riskLevel'];
    }> = [
      { test: /book(id|name)|tenant/, erpDomain: 'company', erpTable: 'chanjet_account_books', erpField: normalizedName, erpType: 'varchar/jsonb', transformRule: '账套只进入中间层，不直接覆盖公司主数据。', riskLevel: 'LOW' },
      { test: /dept|department/, erpDomain: 'organization', erpTable: 'sys_organizations', erpField: normalizedName, erpType: 'varchar', transformRule: '通过 chanjet_master_mapping(DEPARTMENT) 人工审核后映射。', riskLevel: 'MEDIUM' },
      { test: /customer|supplier|custvendor|party|assistant/, erpDomain: 'counterparty', erpTable: counterpartyTarget.table, erpField: normalizedName, erpType: 'varchar', transformRule: counterpartyTarget.rule, riskLevel: 'HIGH' },
      { test: /subject|account|glaccount/, erpDomain: 'accounting', erpTable: 'chanjet_master_mapping', erpField: normalizedName, erpType: 'varchar', transformRule: '会计科目以好业财为主，ERP 仅引用映射。', riskLevel: 'HIGH' },
      { test: /project/, erpDomain: 'project', erpTable: 'mst_projects', erpField: normalizedName, erpType: 'varchar', transformRule: '项目编码需与 ERP 项目主数据对账。', riskLevel: 'MEDIUM' },
      { test: /currency/, erpDomain: 'currency', erpTable: 'sys_dict', erpField: 'SYS_CURRENCY', erpType: 'varchar', transformRule: '统一映射到 SYS_CURRENCY。', riskLevel: 'LOW' },
      { test: /amount|balance|money|debit|credit|jf|df|tax/, erpDomain: 'finance', erpTable: 'finance-v2/chanjet snapshots', erpField: normalizedName, erpType: 'numeric(18,2)', transformRule: '保留原值，后续按本币/原币/汇率规则转换。', riskLevel: 'HIGH' },
      { test: /date|time|period/, erpDomain: 'period', erpTable: 'finance-v2', erpField: normalizedName, erpType: 'date/varchar(YYYYMM)', transformRule: '业务日期与会计期间分开保存。', riskLevel: 'MEDIUM' },
      { test: /voucher|trans/, erpDomain: 'voucher', erpTable: 'chanjet_voucher_drafts', erpField: normalizedName, erpType: 'jsonb/varchar', transformRule: 'ERP 先生成凭证草稿，不自动推送好业财。', riskLevel: 'HIGH' },
    ];
    const found = candidates.find((c) => c.test.test(haystack));
    if (!found) {
      return {
        erpDomain: 'unclassified',
        erpTable: '',
        erpField: normalizedName,
        erpType: '',
        transformRule: '',
        matchStatus: 'MISSING_IN_ERP',
        riskLevel: 'MEDIUM',
        analysisNote: '字段暂未匹配到 ERP 业务域，需要人工分类后决定是否扩展 ERP。',
      };
    }
    const expectedType = found.erpType.includes('numeric') ? 'number' : found.erpType.includes('date') ? 'string' : field.sampleType;
    const status: ChanjetErpFieldMappingEntity['matchStatus'] = expectedType !== field.sampleType && field.sampleType !== 'null'
      ? 'TRANSFORM_REQUIRED'
      : 'PENDING';
    return {
      erpDomain: found.erpDomain,
      erpTable: found.erpTable,
      erpField: found.erpField,
      erpType: found.erpType,
      transformRule: found.transformRule || '',
      matchStatus: status,
      riskLevel: found.riskLevel || 'MEDIUM',
      analysisNote: status === 'TRANSFORM_REQUIRED'
        ? `好业财类型 ${field.sampleType} 与建议 ERP 类型 ${found.erpType} 需要转换确认。`
        : '自动识别为候选映射，需人工复核后固化。',
    };
  }

  private stableExternalId(row: Record<string, unknown>, entityType: string, endpointKey: string, index: number): string {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(this.maskSensitivePayload(row)))
      .digest('hex')
      .slice(0, 24);
    return `${entityType}:${endpointKey || 'UNKNOWN'}:${hash}:${index + 1}`;
  }

  private isUsableExternalId(value: string, entityType: string, endpointKey: string): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    if (!normalized || ['0', '-1', 'null', 'undefined', 'n/a', 'na', 'none', '合计', '小计', '总计'].includes(normalized)) {
      return false;
    }
    if (this.isAggregateStatisticsEndpoint(endpointKey, entityType) && /^-?\d+$/.test(normalized) && Number(normalized) <= 0) {
      return false;
    }
    return true;
  }

  private isAggregateStatisticsEndpoint(endpointKey: string, entityType: string): boolean {
    return ['AP_STATISTICS', 'AR_STATISTICS'].includes(entityType)
      || ['PAYABLE_STATISTICS', 'RECEIVABLE_STATISTICS'].includes(endpointKey);
  }

  private isApiEnvelopeField(fieldPath: string): boolean {
    return /^\$\.(code|msg|success|requestId|validateResult|multiFieldErrors|msgArgs|verbose|envConfigType|nextStepEnumTypeName|data)$/i.test(fieldPath);
  }

  private suggestCounterpartyTarget(haystack: string, normalizedName: string): { table: string; rule: string } {
    const name = normalizedName.toLowerCase();
    if (/customer/.test(name)) {
      return {
        table: 'mst_customers',
        rule: '客户字段进入客户主数据映射候选，必须经人工审核后固化。',
      };
    }
    if (/supplier|vendor/.test(name)) {
      return {
        table: 'mst_suppliers',
        rule: '供应商字段进入供应商主数据映射候选，必须经人工审核后固化。',
      };
    }
    if (/(^|[^a-z])(supplier|payable|ap)([^a-z]|$)/.test(haystack)) {
      return {
        table: 'mst_suppliers',
        rule: '供应商字段进入供应商主数据映射候选，必须经人工审核后固化。',
      };
    }
    if (/(^|[^a-z])(customer|receivable|ar)([^a-z]|$)/.test(haystack)) {
      return {
        table: 'mst_customers',
        rule: '客户字段进入客户主数据映射候选，必须经人工审核后固化。',
      };
    }
    return {
      table: 'chanjet_master_mapping',
      rule: '好业财往来单位需先判断客户/供应商属性，再拆分映射到 ERP 客户或供应商主数据。',
    };
  }

  private async deprecateFakeCounterpartyTargets(): Promise<void> {
    await this.fieldMappingRepo.update(
      { erpTable: 'mst_customers/mst_suppliers' },
      {
        erpTable: 'chanjet_master_mapping',
        transformRule: '历史候选目标表不存在；往来单位先进入好业财主数据映射中间层，再按客户/供应商属性拆分。',
        analysisNote: '已自动收口历史假目标表 mst_customers/mst_suppliers，禁止据此创建 ERP schema。',
      },
    );
  }

  private async deprecateApiEnvelopeBusinessTargets(): Promise<void> {
    await this.fieldMappingRepo
      .createQueryBuilder()
      .delete()
      .from(ChanjetErpFieldMappingEntity)
      .where('chanjet_field_path ~* :pattern', {
        pattern: '^\\$\\.(code|msg|success|requestId|validateResult|multiFieldErrors|msgArgs|verbose|envConfigType|nextStepEnumTypeName|data)$',
      })
      .andWhere('erp_domain <> :erpDomain', { erpDomain: 'api_metadata' })
      .execute();
  }

  private firstText(row: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = row[key];
      if (value !== null && value !== undefined && typeof value !== 'object') {
        const text = String(value).trim();
        if (text) return text;
      }
    }
    return '';
  }

  private firstNumberText(row: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== '') {
        const num = Number(value);
        if (Number.isFinite(num)) return num.toFixed(2);
      }
    }
    return '0.00';
  }

  private maskSensitivePayload(value: unknown): Record<string, unknown> {
    const masked = this.maskSensitiveUnknown(value);
    return this.isRecord(masked) ? masked : { value: masked };
  }

  private maskSensitiveUnknown(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.maskSensitiveUnknown(item));
    if (!value || typeof value !== 'object') return value;
    const masked: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/certificate|authCode|appTicket|openToken|accessToken|appSecret|secret|token|password/i.test(key)) {
        masked[key] = '[REDACTED]';
      } else {
        masked[key] = this.maskSensitiveUnknown(item);
      }
    }
    return masked;
  }

  private async createJob(
    jobType: ChanjetSyncJobEntity['jobType'],
    bookId: string,
    period: string,
    requestScope: Record<string, unknown>,
  ): Promise<ChanjetSyncJobEntity> {
    return this.jobRepo.save(this.jobRepo.create({
      jobType,
      bookId,
      period,
      status: 'RUNNING',
      requestScope,
    }));
  }

  private async finishJob(
    job: ChanjetSyncJobEntity,
    status: 'SUCCESS' | 'FAIL',
    resultSummary: Record<string, unknown>,
    errorMessage?: string,
  ) {
    job.status = status;
    job.resultSummary = resultSummary;
    job.errorMessage = errorMessage || null;
    await this.jobRepo.save(job);
  }

  private async recordChanjetApiAlert(ep: ProbeEndpoint, path: string, bookId: string, errorMessage: string): Promise<void> {
    try {
      await this.ds.query(
        `INSERT INTO sys_alerts (alert_type, severity, title, detail, related_path)
         VALUES ($1,$2,$3,$4::jsonb,$5)`,
        [
          'CHANJET_API_SYNC_FAILURE',
          'WARNING',
          `好业财只读同步失败：${ep.label}`,
          JSON.stringify({
            endpointKey: ep.key,
            apiDomain: ep.apiDomain,
            path,
            bookId,
            error: errorMessage,
            writeChanjet: false,
          }),
          '/finance2/chanjet-integration',
        ],
      );
    } catch (alertError) {
      this.log.warn(`Chanjet API failure alert skipped: ${(alertError as Error).message}`);
    }
  }

  private mappingIssue(mapping: ChanjetMasterMappingEntity): null | {
    status: ChanjetReconciliationResultEntity['status'];
    severity: ChanjetReconciliationResultEntity['severity'];
    diffSummary: string;
    actionRequired: string;
  } {
    if (mapping.reviewStatus === 'REJECTED') {
      return {
        status: 'HOLD',
        severity: 'HIGH',
        diffSummary: '映射候选已被拒绝，后续凭证/对账不得使用该映射。',
        actionRequired: '重新建立 ERP 与好业财主数据映射候选，并由财务/主数据负责人复核。',
      };
    }
    if (!mapping.erpCode || !mapping.chanjetId) {
      return {
        status: 'WARN',
        severity: mapping.matchStatus === 'PENDING' ? 'MEDIUM' : 'HIGH',
        diffSummary: 'ERP 编码或好业财 ID 缺失，映射尚未形成可用闭环。',
        actionRequired: '补齐 ERP 主数据编码与好业财主数据 ID 后再审核。',
      };
    }
    if (mapping.reviewStatus !== 'APPROVED') {
      return {
        status: 'WARN',
        severity: 'MEDIUM',
        diffSummary: '映射未人工批准。',
        actionRequired: '由财务/主数据负责人审核为 APPROVED 后才能参与凭证建议。',
      };
    }
    if (mapping.matchStatus !== 'MATCHED' && mapping.matchStatus !== 'MANUAL') {
      return {
        status: 'MISMATCH',
        severity: 'HIGH',
        diffSummary: `映射状态为 ${mapping.matchStatus}，不能视为稳定匹配。`,
        actionRequired: '核对两端主数据后改为 MATCHED 或人工标记 MANUAL。',
      };
    }
    return null;
  }

  private extractBooks(resp: unknown): NormalizedBook[] {
    const rows = this.extractRows(resp);
    return rows
      .map((row) => {
        const bookId = String(
          row.id ?? row.bookId ?? row.bookid ?? row.tenantId ?? row.tenantID ?? row.book_id ?? '',
        );
        const bookName = String(
          row.name ?? row.bookName ?? row.book_name ?? row.tenantName ?? row.orgName ?? bookId,
        );
        return bookId ? { bookId, bookName, rawData: row } : null;
      })
      .filter((row): row is NormalizedBook => !!row);
  }

  private extractRows(resp: unknown): Record<string, unknown>[] {
    if (Array.isArray(resp)) return resp.filter(this.isRecord);
    if (!this.isRecord(resp)) return [];
    const candidates = [
      resp.value,
      resp.result,
      resp.data,
      (resp.value as Record<string, unknown> | undefined)?.data,
      (resp.result as Record<string, unknown> | undefined)?.data,
      (resp.data as Record<string, unknown> | undefined)?.rows,
      (resp.data as Record<string, unknown> | undefined)?.list,
      (resp.value as Record<string, unknown> | undefined)?.list,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate.filter(this.isRecord);
    }
    return [resp];
  }

  private async createMappingCandidates(mappingType: ChanjetMappingType, bookId: string, resp: unknown): Promise<void> {
    const rows = this.extractRows(resp).slice(0, 1000);
    for (const row of rows) {
      const id = String(row.id ?? row.ID ?? row.customerId ?? row.supplierId ?? row.subjectId ?? row.code ?? '');
      const code = String(row.code ?? row.deptCode ?? row.subjectCode ?? row.customerCode ?? row.supplierCode ?? '');
      const name = String(row.name ?? row.deptName ?? row.subjectName ?? row.customerName ?? row.supplierName ?? row.fullName ?? '');
      if (!id && !code && !name) continue;
      await this.upsertMasterMapping({
        mappingType,
        bookId,
        erpCode: '',
        erpName: '',
        chanjetId: id,
        chanjetCode: code,
        chanjetName: name || code || id,
        matchStatus: 'PENDING',
        confidence: '0.00',
        reviewStatus: 'PENDING',
        rawData: row,
      });
    }
  }

  private async upsertMasterMapping(input: Partial<ChanjetMasterMappingEntity>) {
    await this.mappingRepo.upsert(
      {
        mappingType: input.mappingType,
        bookId: input.bookId ?? '',
        erpCode: input.erpCode ?? '',
        erpName: input.erpName ?? '',
        chanjetId: input.chanjetId ?? '',
        chanjetCode: input.chanjetCode ?? '',
        chanjetName: input.chanjetName ?? '',
        matchStatus: input.matchStatus ?? 'PENDING',
        confidence: input.confidence ?? '0.00',
        reviewStatus: input.reviewStatus ?? 'PENDING',
        reviewedBy: input.reviewedBy ?? null,
        reviewedAt: input.reviewedAt ?? null,
        rawData: input.rawData ?? null,
      // TypeORM's QueryDeepPartialEntity is too narrow for jsonb Record values.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { conflictPaths: ['mappingType', 'erpCode', 'chanjetId'], skipUpdateIfNoValuesChanged: false },
    );
  }

  private async recordApiSample(apiDomain: string, apiPath: string, method: HttpMethod, sample: unknown): Promise<number> {
    const fields = this.flattenFields(sample);
    for (const field of fields) {
      await this.fieldCatalogRepo.manager.query(
        `INSERT INTO chanjet_api_field_catalog
          (api_domain, api_path, method, field_path, sample_type, sample_value_masked, observed_count, first_seen_at, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,1,now(),now())
         ON CONFLICT (api_domain, api_path, method, field_path)
         DO UPDATE SET
           sample_type = EXCLUDED.sample_type,
           sample_value_masked = EXCLUDED.sample_value_masked,
           observed_count = chanjet_api_field_catalog.observed_count + 1,
           last_seen_at = now()`,
        [apiDomain, apiPath, method, field.path, field.type, field.sample],
      );
    }
    return fields.length;
  }

  private flattenFields(value: unknown, prefix = '$', depth = 0): Array<{ path: string; type: SampleType; sample: string | null }> {
    if (depth > 5) return [];
    const type = this.sampleType(value);
    const current = [{ path: prefix, type, sample: this.maskSample(value) }];
    if (Array.isArray(value)) {
      return [
        ...current,
        ...value.slice(0, 3).flatMap((item, idx) => this.flattenFields(item, `${prefix}[${idx}]`, depth + 1)),
      ];
    }
    if (this.isRecord(value)) {
      return [
        ...current,
        ...Object.entries(value).flatMap(([key, item]) => this.flattenFields(item, `${prefix}.${key}`, depth + 1)),
      ];
    }
    return current;
  }

  private sampleType(value: unknown): SampleType {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }

  private maskSample(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return `[array:${value.length}]`;
    if (this.isRecord(value)) return `{object:${Object.keys(value).slice(0, 10).join(',')}}`;
    const text = String(value);
    if (/certificate|authCode|appTicket|openToken|accessToken|appSecret|secret|token/i.test(text)) {
      return '[REDACTED]';
    }
    if (/^\d{16,}$/.test(text) || text.length > 120) {
      return `${text.slice(0, 24)}...[masked]`;
    }
    return text;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
}
