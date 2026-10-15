import { requireReadonlyOrchestration, assertReadonlyOrchestrationOwnerIfPresent } from './chanjet-readonly-execution';
import { activeExecutionScope, executionWriteGate, executionWriteGateTx } from './chanjet-execution-scope';
import { approvedReadonlyPolicy, requireApprovedReadonlyRequest, readonlyFailureCode } from './chanjet-readonly-policy';
import { requireReadonlySync } from './chanjet-sync-control';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { ChanjetAuthService, getChanjetBusinessFailure } from './chanjet-auth.service';
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
import { ChanjetOutboxState, ChanjetWritebackOutboxEntity } from './chanjet-writeback-outbox.entity';
import {
  buildFinanceMasterGapProposals,
  financeGapSourceKey,
} from './chanjet-erp-master-gap-closure';
import {
  CHANJET_SALES_STOCK_OUT_FIELD_CONTRACT,
  CHANJET_STOCK_IN_FIELD_CONTRACT,
  CHANJET_WMS_ERP_COLUMN_REQUIREMENTS,
  normalizeChanjetInventoryDocument,
} from './chanjet-wms-readonly.contract';
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
  periodBody?: 'SINGLE' | 'RANGE';
  mirrorDefault?: boolean;
  pagination?: {
    pageField: string;
    pageSizeField: string;
    pageSize: number;
    maxPages: number;
  };
}

const DEFAULT_ACCOUNTING_PERIOD = new Date().toISOString().slice(0, 7).replace('-', '');

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

export interface ChanjetExternalCanaryApprovalInput {
  approvalId: string;
  decision: 'APPROVE' | 'HOLD' | 'REJECT';
  targetOutboxId: string;
  environmentName: string;
  environmentType: 'SANDBOX' | 'STAGING' | 'PRODUCTION';
  productionImpactAcknowledged?: boolean;
  bookId: string;
  bookName: string;
  companyCode: string;
  sourceBusinessType: string;
  sourceBusinessId: string;
  documentType: string;
  payloadHash: string;
  debitTotal: string;
  creditTotal: string;
  currency: string;
  period: string;
  maker: string;
  reviewer: string;
  operator: string;
  idempotencyKey: string;
  readback: {
    method: 'GET';
    endpoint: string;
    expectedIdentity: string;
    expectedStatus: string;
    expectedAmount: string;
  };
  compensation: {
    method: string;
    owner: string;
  };
  executionWindow: {
    startsAt: string;
    endsAt: string;
    expiresAt: string;
  };
  stopRules: string[];
  providerContractConfirmed: boolean;
  approvedBy: string;
  approvedAt: string;
}

export interface ChanjetExternalCanaryApprovalPrecheck {
  decision: 'HOLD' | 'READY_FOR_A2_A1_A7_REVIEW';
  missingFields: string[];
  conflicts: string[];
  evidence: Record<string, unknown>;
  externalWriteEnabled: false;
  externalNetworkCalled: false;
  nextGate: string;
}

export interface VoucherDraftValidation {
  valid: boolean;
  debitTotal: string;
  creditTotal: string;
  errors: string[];
  warnings: string[];
  pushEnabled: false;
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

interface ChanjetMirrorEvidenceBook {
  bookId: string;
  bookName: string;
  companyCode: string | null;
  companyName: string | null;
  enabled: boolean;
}

interface ChanjetMirrorEvidenceSnapshot {
  endpointKey: string;
  bookId: string;
  rowCount: number;
  pulledAt: Date;
  rawPayload: Record<string, unknown>;
}

interface ChanjetMirrorEvidenceEntity {
  endpointKey: string;
  bookId: string;
  entityType: string;
  amount: number;
  updatedAt: Date;
  rawData: Record<string, unknown>;
}

interface ChanjetMirrorEvidenceJob {
  endpointKey: string;
  bookId: string;
  status: ChanjetSyncJobEntity['status'];
  errorMessage: string | null;
  updatedAt: Date;
}

interface ChanjetMirrorEvidence {
  books: ChanjetMirrorEvidenceBook[];
  snapshots: ChanjetMirrorEvidenceSnapshot[];
  entities: ChanjetMirrorEvidenceEntity[];
  jobs: ChanjetMirrorEvidenceJob[];
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
export type FinanceReadonlyStatementReportStatus = 'READONLY_READY' | 'BLOCKED_MAPPING' | 'WAITING_SAMPLE' | 'HOLD';
export type ReceiptPaymentLockStatus = 'LOCKED' | 'PARTIAL' | 'WAITING_SAMPLE' | 'HOLD';
export type ChanjetReadonlyAdapterStatus = 'READY' | 'PARTIAL' | 'WAITING_SAMPLE' | 'HOLD';
export type ReceiptPaymentSystemConfirmationStatus =
  | 'SYSTEM_CONFIRMED_LOCK_CANDIDATE'
  | 'SYSTEM_CONFIRMED_PARTIAL'
  | 'SYSTEM_WAITING_SAMPLE'
  | 'HOLD';

export interface FinanceCurrencyBalance {
  currency: string;
  amount: number;
  rows: number;
}

export interface FinanceReadModelMetric {
  key: string;
  label: string;
  priority: 'P0' | 'P1';
  status: FinanceReadModelStatus;
  authorityEligible: boolean;
  displayValue: number | null;
  erpAuxiliaryValue: number | null;
  diff: number | null;
  comparisonComparable: boolean;
  comparisonReason: string;
  chanjetBreakdown: FinanceCurrencyBalance[];
  erpBreakdown: FinanceCurrencyBalance[];
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

export interface FinanceReadonlyStatementReportRow {
  rowId: string;
  rowKey: string;
  rowName: string;
  bookId: string;
  period: string;
  status: string;
  amount: number | null;
  currency: string;
  latestPulledAt: string | null;
  rawEvidenceExcerpt: Record<string, unknown>;
}

export interface FinanceReadonlyStatementReport {
  reportKey: 'SUBJECT_BALANCE' | 'BALANCE_SHEET' | 'INCOME_STATEMENT';
  reportLabel: string;
  entityType: 'GL_BALANCE' | 'BALANCE_SHEET' | 'INCOME_STATEMENT';
  status: FinanceReadonlyStatementReportStatus;
  sampleRows: number;
  latestPulledAt: string | null;
  displayRule: string;
  selectedValueFields: FinanceReadModelMetric['selectedValueFields'];
  missingRequiredFields: string[];
  blockerReasons: string[];
  rows: FinanceReadonlyStatementReportRow[];
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

export interface CashBalanceFieldLock {
  key: 'CASH_BALANCE';
  label: string;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  status: 'AUTHORITY_READY' | 'WAITING_SAMPLE' | 'HOLD';
  sampleRows: number;
  accountDirectoryRows: number;
  glBalanceRows: number;
  eligibleBalanceRows: number;
  invalidContractRows: number;
  duplicateContractRows: number;
  latestPulledAt: string | null;
  amountSum: number;
  amountSumSafeAsBalance: false;
  totalBaseBalance: number | null;
  baseCurrency: 'CNY';
  currentPeriods: string[];
  coveredBooks: number;
  requiredBooks: number;
  unmatchedAccountDirectoryRows: number;
  currencyBalances: Array<{ currency: string; amount: number; rows: number }>;
  bookBalances: Array<{
    bookId: string;
    companyCode: string;
    period: string;
    amount: number;
    rows: number;
  }>;
  rawBalanceCandidateCount: number;
  requiredFields: string[];
  missingFields: string[];
  fieldCandidates: FinanceSemanticFieldCandidate[];
  sourceFields: {
    book: '$entity.bookId';
    period: '$entity.period';
    subjectCode: 'rawData.glAccountCode';
    subjectName: 'rawData.glAccountName';
    baseBalance: 'rawData.baseEndingBalance';
    originalBalance: 'rawData.endingBalance';
    currency: 'rawData.currency';
    leaf: 'rawData.leaf';
  };
  readyForCardAuthority: boolean;
  blockerReasons: string[];
  conditions: string[];
  displayRule: string;
  nextAction: string;
}

export type FinanceCardSourceSwitchStatus =
  | 'SWITCH_READY'
  | 'READONLY_REPORT_READY'
  | 'SWITCH_BLOCKED'
  | 'HOLD';

export interface FinanceCardSourceSwitchAuditItem {
  switchId: string;
  cardKey: string;
  label: string;
  readModelKey: string;
  confirmationStatus: FinanceCardSystemConfirmationStatus;
  sourceSwitchStatus: FinanceCardSourceSwitchStatus;
  primaryValueSource: 'CHANJET' | 'ERP' | 'CHANJET_READONLY_REPORT';
  financePageBehavior: string;
  requiredUiEvidence: string[];
  mustShowErpAuxiliaryValue: boolean;
  mustShowDiff: boolean;
  canFeedPrimaryFinanceCard: boolean;
  canFeedReadonlyReport: boolean;
  blockerReason: string | null;
  validationRule: string;
  evidence: string[];
}

export interface ChanjetReadonlyAdapterBase {
  adapterKey: 'CHANJET_VOUCHER_HEADER' | 'CHANJET_VOUCHER_LINE' | 'CHANJET_COUNTERPARTY';
  title: string;
  status: ChanjetReadonlyAdapterStatus;
  sampleRows: number;
  latestPulledAt: string | null;
  mappedFields: string[];
  missingCriticalFields: string[];
  sourceEntityTypes: string[];
  endpointKeys: string[];
  nextAction: string;
}

export interface ChanjetVoucherHeaderAdapterRow {
  rowId: string;
  voucherId: string;
  voucherNo: string;
  bookId: string;
  period: string;
  voucherDate: string;
  postingDate: string;
  status: string;
  summary: string;
  maker: string;
  reviewer: string;
  rawEvidenceExcerpt: Record<string, unknown>;
}

export interface ChanjetVoucherLineAdapterRow {
  rowId: string;
  voucherId: string;
  voucherNo: string;
  lineNo: string;
  subjectCode: string;
  subjectName: string;
  summary: string;
  debitAmount: string;
  creditAmount: string;
  currency: string;
  counterpartyName: string;
  projectName: string;
  departmentName: string;
  rawEvidenceExcerpt: Record<string, unknown>;
}

export interface ChanjetCounterpartyAdapterRow {
  rowId: string;
  bookId: string;
  externalId: string;
  externalCode: string;
  externalName: string;
  roleCandidate: 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'UNKNOWN';
  status: string;
  erpCandidateCode: string;
  erpCandidateName: string;
  mappingReviewStatus: string;
  confidence: string;
  rawEvidenceExcerpt: Record<string, unknown>;
}

export interface ChanjetReadonlyFieldAdapterOverview {
  generatedAt: string;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  summary: {
    totalAdapters: number;
    ready: number;
    partial: number;
    waitingSample: number;
    hold: number;
    voucherHeaderRows: number;
    voucherLineRows: number;
    counterpartyRows: number;
    fieldCoverage: number;
    nextGate: string;
  };
  adapters: Array<ChanjetReadonlyAdapterBase & {
    rows: Array<ChanjetVoucherHeaderAdapterRow | ChanjetVoucherLineAdapterRow | ChanjetCounterpartyAdapterRow>;
  }>;
  guardrails: Record<string, boolean | string | number>;
}

export type ChanjetBaselineStatus = 'FRESH' | 'STALE' | 'MISSING';

export interface ChanjetMirrorBaselineReadiness {
  generatedAt: string;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  freshnessHours: number;
  summary: {
    expectedScopes: number;
    expectedTargets: number;
    freshTargets: number;
    staleTargets: number;
    missingTargets: number;
    failedRecentJobs: number;
    providerPermissionHolds: number;
    endpointCoverageRate: number;
    nextGate: string;
  };
  accountBookGate: ChanjetAccountBookMappingGate;
  scopes: Array<{
    endpointKey: string;
    label: string;
    bookId: string;
    entityType: string;
    status: ChanjetBaselineStatus;
    rowCount: number;
    entityCount: number;
    latestPulledAt: string | null;
    ageHours: number | null;
    latestJobStatus: string;
    latestJobError: string | null;
  }>;
  guardrails: Record<string, boolean | string>;
}

export interface ChanjetAccountBookMappingGate {
  generatedAt: string;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  canRunBookScopedSync: boolean;
  summary: {
    cachedBooks: number;
    enabledBooks: number;
    configuredMappings: number;
    enabledMappings: number;
    validMappings: number;
    blockingIssues: number;
    warnings: number;
  };
  mappings: Array<{
    bookId: string;
    bookName: string;
    companyCode: string;
    companyName: string;
    syncEnabled: boolean;
    cachedBookExists: boolean;
    cachedBookEnabled: boolean;
    companyExists: boolean;
    status: 'VALID' | 'WARNING' | 'HOLD';
    issues: string[];
  }>;
  blockingIssues: string[];
  warnings: string[];
  guardrails: Record<string, boolean | string>;
}

type CounterpartyMappingType = 'CUSTOMER' | 'SUPPLIER';

interface ErpCounterpartyMaster {
  mappingType: CounterpartyMappingType;
  code: string;
  name: string;
  companyCode: string;
  status: string;
}

export interface ChanjetCounterpartyMappingCandidate {
  candidateKey: string;
  snapshotId: string;
  bookId: string;
  companyCode: string;
  mappingType: CounterpartyMappingType | null;
  roleCandidate: ChanjetCounterpartyAdapterRow['roleCandidate'];
  chanjetId: string;
  chanjetCode: string;
  chanjetName: string;
  matchStatus: 'MATCHED' | 'SOURCE_ONLY' | 'PENDING' | 'CONFLICT';
  confidence: number;
  erpCode: string;
  erpName: string;
  evidence: string[];
  alternatives: Array<{ erpCode: string; erpName: string; companyCode: string; score: number; reason: string }>;
  matchKind: 'EXACT_CODE_AND_NAME' | 'EXACT_CODE' | 'EXACT_NAME' | 'SOURCE_IDENTITY' | 'NONE' | 'CONFLICT';
  systemApprovalEligible: boolean;
  sourceIdentityEligible: boolean;
  systemApprovalReason: string;
  requiresApproval: boolean;
  canAutoApprove: boolean;
}

export interface ChanjetProductionReadiness {
  generatedAt: string;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  summary: {
    mirrorFreshRate: number;
    accountBookMappingRate: number;
    masterDataApprovedRate: number;
    semanticCoverageRate: number;
    authorityReadyRate: number;
    recentJobSuccessRate: number;
    exactSystemApprovalCandidates: number;
    manualMappingCandidates: number;
    nextGate: string;
  };
  phases: Array<{
    key: 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
    title: string;
    status: 'READY' | 'READY_WITH_CONDITIONS' | 'HOLD';
    score: number;
    evidence: string[];
    nextAction: string;
  }>;
  blockers: string[];
  conditions: string[];
  tokenHealth: ReturnType<ChanjetAuthService['diagnostics']>;
  guardrails: Record<string, boolean | string>;
}

export interface ChanjetCurrentStateOverview {
  generatedAt: string;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  authoritativeEvidence: 'RUNTIME_CURRENT_STATE';
  productionReadiness: ChanjetProductionReadiness;
  implementationOrder: Array<{
    phase: 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
    title: string;
    status: 'READY' | 'READY_WITH_CONDITIONS' | 'HOLD';
    score: number;
    evidence: string[];
    nextAction: string;
  }>;
  summary: {
    mirrorFreshRate: number;
    financeAuthorityReady: number;
    financeReadonlyReady: number;
    financeCards: number;
    mappingReadyDomains: number;
    mappingDomains: number;
    reconciliationOpen: number;
    recentJobSuccessRate: number;
    voucherDrafts: number;
    voucherPushReadyCandidates: number;
    fieldMappings: number;
    unmappedFields: number;
    externalWriteEnabled: false;
    nextGate: string;
  };
  blockers: string[];
  conditions: string[];
  staleEvidencePolicy: string;
  guardrails: Record<string, boolean | string>;
}

type ChanjetAlignmentAlertState = Pick<
  ChanjetCurrentStateOverview,
  'generatedAt' | 'decision' | 'blockers' | 'conditions' | 'summary'
> | Pick<
  ChanjetProductionReadiness,
  'generatedAt' | 'decision' | 'blockers' | 'conditions' | 'summary'
>;

export interface ChanjetCounterpartyCandidateOverview {
  generatedAt: string;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  summary: {
    sourceRows: number;
    candidates: number;
    matched: number;
    sourceOnly: number;
    pending: number;
    conflicts: number;
    unknownRole: number;
    approvedMappings: number;
    nextGate: string;
  };
  candidates: ChanjetCounterpartyMappingCandidate[];
  guardrails: Record<string, boolean | string | number>;
}

export interface ReceiptPaymentDateStatusLock {
  key: 'TODAY_RECEIPT' | 'TODAY_PAYMENT';
  label: string;
  entityType: 'AR_RECEIPT' | 'AP_PAYMENT';
  status: ReceiptPaymentLockStatus;
  systemConfirmationStatus: ReceiptPaymentSystemConfirmationStatus;
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
  safeQueryFilter: {
    businessDate: string;
    postedDate: string;
    approvedStatus: string;
    voidStatus: string;
    direction: string;
    amount: string;
  };
  blockedFromPrimaryReason: string;
  amountSumSafeForTodayCard: false;
  readyForFinanceReview: boolean;
  readyForCardAuthority: boolean;
  reason: string;
  nextAction: string;
}

export type ReceiptPaymentDailyReconciliationStatus = 'AUTHORITY_READY' | 'WAITING_SAMPLE' | 'HOLD';

export interface ReceiptPaymentDailyReconciliationMetric {
  key: 'TODAY_RECEIPT' | 'TODAY_PAYMENT';
  label: string;
  entityType: 'AR_RECEIPT' | 'AP_PAYMENT';
  direction: 'RECEIPT' | 'PAYMENT';
  businessDate: string;
  status: ReceiptPaymentDailyReconciliationStatus;
  sourceRows: number;
  businessDateRows: number;
  effectiveRows: number;
  excludedRows: number;
  excludedByStatus: Record<string, number>;
  invalidContractRows: number;
  approvedDateEvidenceRows: number;
  amount: number | null;
  latestPulledAt: string | null;
  sourceFields: {
    businessDate: 'rawData.bizDate';
    status: 'rawData.voucherStatusEnum';
    amount: 'rawData.totalAmount';
    direction: 'entity_type_contract';
  };
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
  comparisonComparable: boolean;
  comparisonReason: string;
  chanjetBreakdown: FinanceCurrencyBalance[];
  erpBreakdown: FinanceCurrencyBalance[];
  status: FinanceReconciliationStatus;
  evidence: {
    chanjetRows: number;
    latestPulledAt: string | null;
    erpRows: number;
  };
  reason: string;
  recommendedAction: string;
  diagnosis: {
    classification: string;
    directlyComparable: boolean;
    dimensions: string[];
    treatment: string;
  };
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
    status: 'LOCKED',
    authorityEligible: true,
    chanjetEntityTypes: ['GL_BALANCE'],
    lockedFields: ['glAccountCode', 'glAccountName', 'baseEndingBalance', 'endingBalance', 'currency', 'leaf'],
    pendingFields: [],
    dateRule: '每个账套只使用最新 YYYYMM 会计期间；镜像超过 24 小时或期间缺失时 fail-closed。',
    amountRule: '仅汇总 1001/1002 子级叶子科目的 rawData.baseEndingBalance，作为 CNY 本位币期末余额；rawData.endingBalance 仅用于原币分组。',
    statusRule: 'GL_BALANCE 的叶子科目余额属于总账事实，不依赖 FIN_ACCOUNT 启停状态；FIN_ACCOUNT 只作账户目录和映射证据。',
    erpComparisonRule: '好业财总账现金/银行本位币期末余额作为主卡片候选；ERP fin_cash_accounts.current_balance 保留为辅助差异。',
    risk: 'CRITICAL',
    reason: '生产只读样本证明 FIN_ACCOUNT 不含余额；真实余额来自 GL_BALANCE 的 1001/1002 叶子科目期末字段。',
    nextAction: '保持每日只读同步和字段漂移检查，继续提高 FIN_ACCOUNT 与总账叶子科目的目录映射覆盖率。',
  },
  {
    key: 'TODAY_RECEIPT',
    label: '今日收款',
    status: 'LOCKED',
    authorityEligible: true,
    chanjetEntityTypes: ['AR_RECEIPT'],
    lockedFields: ['rawData.bizDate', 'rawData.voucherStatusEnum', 'rawData.totalAmount', 'entity_type_contract'],
    pendingFields: [],
    dateRule: '仅使用 rawData.bizDate 等于目标业务日的收款单。',
    amountRule: '仅汇总目标业务日 EFFECTIVE 行的 rawData.totalAmount；列表累计金额禁止使用。',
    statusRule: '仅 voucherStatusEnum=EFFECTIVE 可计入；SUBMITTED 和所有非 EFFECTIVE 状态均排除。',
    erpComparisonRule: '好业财每日有效收款作为主值，ERP 当日现金流水保留为辅助差异。',
    risk: 'CRITICAL',
    reason: '生产只读样本已验证业务日、有效状态、金额和方向契约。',
    nextAction: '保持每日只读同步与对账，字段缺失或镜像过期时 fail-closed。',
  },
  {
    key: 'TODAY_PAYMENT',
    label: '今日付款',
    status: 'LOCKED',
    authorityEligible: true,
    chanjetEntityTypes: ['AP_PAYMENT'],
    lockedFields: ['rawData.bizDate', 'rawData.voucherStatusEnum', 'rawData.totalAmount', 'entity_type_contract'],
    pendingFields: [],
    dateRule: '仅使用 rawData.bizDate 等于目标业务日的付款单。',
    amountRule: '仅汇总目标业务日 EFFECTIVE 行的 rawData.totalAmount；列表累计金额禁止使用。',
    statusRule: '仅 voucherStatusEnum=EFFECTIVE 可计入；SUBMITTED 和所有非 EFFECTIVE 状态均排除。',
    erpComparisonRule: '好业财每日有效付款作为主值，ERP 当日现金流水保留为辅助差异。',
    risk: 'CRITICAL',
    reason: '生产只读样本已验证业务日、有效状态、金额和方向契约。',
    nextAction: '保持每日只读同步与对账，字段缺失或镜像过期时 fail-closed。',
  },
  {
    key: 'SUBJECT_BALANCE',
    label: '科目余额',
    status: 'LOCKED',
    authorityEligible: false,
    chanjetEntityTypes: ['GL_BALANCE'],
    lockedFields: ['subject_code', 'subject_name', 'opening_balance', 'debit_amount', 'credit_amount', 'closing_balance', 'direction'],
    pendingFields: [],
    dateRule: '按账套与镜像会计期间展示，拉取时间不得替代会计期间。',
    amountRule: '按行保留期初、本期借方、本期贷方和期末余额；禁止把行级报表压成 amountSum 单值。',
    statusRule: '科目余额表只读展示，不推导审批状态；科目层级与末级标识按源行保留。',
    erpComparisonRule: 'ERP 无同粒度总账表时仅展示好业财只读报表，不做伪差异。',
    risk: 'HIGH',
    reason: '生产只读样本和 semantic extractor 已覆盖科目与余额字段；该报表保持行级只读，不提升为单值权威卡片。',
    nextAction: '继续维护科目编码映射与字段漂移检测，不构造 ERP 不存在的总账对照值。',
  },
  {
    key: 'BALANCE_SHEET',
    label: '资产负债表关键项',
    status: 'LOCKED',
    authorityEligible: false,
    chanjetEntityTypes: ['BALANCE_SHEET'],
    lockedFields: ['line_no', 'item_name', 'begin_amount', 'ending_amount'],
    pendingFields: [],
    dateRule: '按账套和报表期间展示，期间显式保留。',
    amountRule: '按报表行保留项目、年初和期末金额；禁止使用 amountSum=0 代表整张报表。',
    statusRule: '报表类无审批状态，需保留拉取批次和账套。',
    erpComparisonRule: 'ERP 经营数据只做辅助解释，不与报表行强行一一对应。',
    risk: 'HIGH',
    reason: '生产只读样本和 semantic extractor 已覆盖报表行、项目及期初/期末字段。',
    nextAction: '保持行级只读展示与字段漂移检测，不把整张报表压成单值。',
  },
  {
    key: 'INCOME_STATEMENT',
    label: '利润表关键项',
    status: 'LOCKED',
    authorityEligible: false,
    chanjetEntityTypes: ['INCOME_STATEMENT'],
    lockedFields: ['line_no', 'item_name', 'current_period_amount', 'year_to_date_amount'],
    pendingFields: [],
    dateRule: '按报表期间和账套展示，期间需显式保留。',
    amountRule: '按报表行保留本期金额和累计金额；禁止使用 amountSum=0 代表整张报表。',
    statusRule: '报表类无审批状态，需保留拉取批次和账套。',
    erpComparisonRule: 'ERP 销售/采购/费用经营数据只做辅助解释。',
    risk: 'HIGH',
    reason: '生产只读样本和 semantic extractor 已覆盖报表行、项目、本期及累计字段。',
    nextAction: '保持行级只读展示与字段漂移检测，不把整张报表压成单值。',
  },
  {
    key: 'CASH_FLOW',
    label: '现金流量表关键项',
    status: 'LOCKED',
    authorityEligible: false,
    chanjetEntityTypes: ['CASH_FLOW'],
    lockedFields: ['line_no', 'item_name', 'current_period_amount', 'year_to_date_amount', 'cash_flow_category'],
    pendingFields: [],
    dateRule: '按报表期间和账套展示，期间需显式保留。',
    amountRule: '按报表行保留现金流项目、本期及累计金额；禁止使用 amountSum=0 代表整张报表。',
    statusRule: '报表类无审批状态。',
    erpComparisonRule: 'ERP 现金流水仅作辅助解释。',
    risk: 'MEDIUM',
    reason: '生产只读样本和 semantic extractor 已覆盖现金流项目及金额字段。',
    nextAction: '保持行级只读展示与字段漂移检测，不把整张报表压成单值。',
  },
  {
    key: 'VOUCHER_LIST',
    label: '凭证列表 / 明细',
    status: 'LOCKED',
    authorityEligible: false,
    chanjetEntityTypes: ['VOUCHER'],
    lockedFields: [
      'voucher_id', 'voucher_no', 'book_id', 'period', 'voucher_date', 'posting_date', 'voucher_status',
      'summary', 'maker', 'reviewer', 'line_no', 'subject_code', 'subject_name', 'debit_amount',
      'credit_amount', 'currency', 'counterparty_name', 'project_name', 'department_name',
    ],
    pendingFields: [],
    dateRule: '凭证日期/期间需以好业财凭证字段为准，不能用拉取时间代替。',
    amountRule: '借贷金额必须按行保留 Decimal 字符串，不用 JS 浮点做账。',
    statusRule: '写回仍关闭；只读重现可用，推送必须进入 P4 单独 Gate。',
    erpComparisonRule: 'ERP 凭证草稿仅作为候选，不自动推送。',
    risk: 'CRITICAL',
    reason: '凭证头和凭证明细专用只读适配器已通过字段覆盖验证；该结论不授权任何凭证写回。',
    nextAction: '保持凭证只读详情和差异证据；外部写入继续等待单独最小写入 Gate。',
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
    erpTargets: ['sal_customers.customer_no', 'prc2_suppliers.supplier_code'],
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
    erpTargets: ['biz_projects.project_code', 'sys_user_projects'],
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
    method: 'POST',
    path: '/accounting/openapi/cc/department/list/{bookid}',
    body: { pageSize: 1000, pageNo: 1 },
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
    path: '/accounting/gl/glaccount/getInitBalanceLists/{bookid}',
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
    query: { period: DEFAULT_ACCOUNTING_PERIOD },
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
    query: { period: DEFAULT_ACCOUNTING_PERIOD },
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
    path: '/accounting/openapi/cc/salesorder/list/{bookid}',
    body: {},
    requiresBook: true,
    entityType: 'SALES_ORDER',
    mirrorDefault: true,
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
    mirrorDefault: true,
  },
  {
    key: 'STOCK_IN',
    label: '入库单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/purchasestockin/list/{bookid}',
    body: { page: 1, pageSize: 100 },
    requiresBook: true,
    entityType: 'STOCK_IN',
    mirrorDefault: true,
    pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 200 },
  },
  {
    key: 'SALES_STOCK_OUT',
    label: '销售出库单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/salesstockout/list/{bookid}',
    body: { page: 1, pageSize: 100 },
    requiresBook: true,
    entityType: 'SALES_STOCK_OUT',
    mirrorDefault: true,
    pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 200 },
  },
  {
    key: 'INVENTORY_ON_HAND',
    label: '库存现存量',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/inv/onhandqty/{bookid}',
    body: {
      withZero: false,
      groupCondition: 'WAREHOUSE_PRODUCTSPEC',
      page: 1,
      pageSize: 500,
    },
    requiresBook: true,
    entityType: 'INVENTORY_ON_HAND',
    mirrorDefault: true,
    pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 500, maxPages: 200 },
  },
  {
    key: 'INVENTORY_ON_HAND_LOT',
    label: '库存批次现存量',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/inv/onhandqtylot/{bookid}',
    body: { page: 1, pageSize: 100 },
    requiresBook: true,
    entityType: 'INVENTORY_ON_HAND_LOT',
    mirrorDefault: true,
    pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 500 },
  },
  {
    key: 'FINISHED_GOODS_STOCK_IN',
    label: '产成品入库单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/inv/finishedgoodsstock/list/{bookid}',
    body: { page: 1, pageSize: 100 },
    requiresBook: true,
    entityType: 'FINISHED_GOODS_STOCK_IN',
    mirrorDefault: true,
    pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 200 },
  },
  {
    key: 'MATERIAL_STOCK_OUT',
    label: '材料出库单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/inv/materialstock/list/{bookid}',
    body: { page: 1, pageSize: 100 },
    requiresBook: true,
    entityType: 'MATERIAL_STOCK_OUT',
    mirrorDefault: true,
    pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 200 },
  },
  {
    key: 'OTHER_STOCK_IN',
    label: '其他入库单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/inv/stockin/list/{bookid}',
    body: { page: 1, pageSize: 100 },
    requiresBook: true,
    entityType: 'OTHER_STOCK_IN',
    mirrorDefault: true,
    pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 200 },
  },
  {
    key: 'OTHER_STOCK_OUT',
    label: '其他出库单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/inv/stockout/list/{bookid}',
    body: { page: 1, pageSize: 100 },
    requiresBook: true,
    entityType: 'OTHER_STOCK_OUT',
    mirrorDefault: true,
    pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 200 },
  },
  {
    key: 'STOCK_TRANSFER',
    label: '调拨单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/inv/stocktransfer/list/{bookid}',
    body: { page: 1, pageSize: 100 },
    requiresBook: true,
    entityType: 'STOCK_TRANSFER',
    mirrorDefault: true,
    pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 200 },
  },
  {
    key: 'STOCK_COUNT',
    label: '盘点单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/inv/stockcount/list/{bookid}',
    body: { page: 1, pageSize: 100 },
    requiresBook: true,
    entityType: 'STOCK_COUNT',
    mirrorDefault: true,
    pagination: { pageField: 'page', pageSizeField: 'pageSize', pageSize: 100, maxPages: 200 },
  },
  {
    key: 'RETAIL_STOCK_OUT',
    label: '零售出库单列表',
    apiDomain: 'inventory',
    method: 'POST',
    path: '/accounting/openapi/cc/retailstock/list/{bookid}',
    body: { pageNo: 1, pageSize: 100 },
    requiresBook: true,
    entityType: 'RETAIL_STOCK_OUT',
    mirrorDefault: true,
    pagination: { pageField: 'pageNo', pageSizeField: 'pageSize', pageSize: 100, maxPages: 200 },
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
    body: {
      type: '0',
      showAssistant: false,
      showHidden: false,
      showYearAcc: true,
      onlyShowLeaf: false,
      showEmptyRow: false,
    },
    requiresBook: true,
    entityType: 'GL_BALANCE',
    periodBody: 'RANGE',
    mirrorDefault: true,
  },
  {
    key: 'BALANCE_SHEET',
    label: '资产负债表',
    apiDomain: 'report',
    method: 'GET',
    path: '/accounting/fin/getOldBalanceSheet/{bookid}',
    query: { period: DEFAULT_ACCOUNTING_PERIOD, isReorg: 'false' },
    requiresBook: true,
    entityType: 'BALANCE_SHEET',
    periodQuery: true,
    mirrorDefault: true,
  },
  {
    key: 'INCOME_STATEMENT',
    label: '利润表',
    apiDomain: 'report',
    method: 'GET',
    path: '/accounting/fin/getOldIncomeStatement/{bookid}',
    query: { period: DEFAULT_ACCOUNTING_PERIOD, isQuarter: 'false', enableNewEdition: 'true' },
    requiresBook: true,
    entityType: 'INCOME_STATEMENT',
    periodQuery: true,
    mirrorDefault: true,
  },
  {
    key: 'CASH_FLOW',
    label: '现金流量表',
    apiDomain: 'report',
    method: 'GET',
    path: '/accounting/asr/CashFlow/{bookid}',
    query: { period: DEFAULT_ACCOUNTING_PERIOD, isQuarter: 'false' },
    requiresBook: true,
    entityType: 'CASH_FLOW',
    periodQuery: true,
    mirrorDefault: true,
  },
];

export function classifyChanjetSyncFailure(error: string): {
  retryEligible: boolean;
  capability: 'SUPPORTED' | 'PERMISSION_HOLD' | 'UNSUPPORTED';
} {
  if (/READONLY_HOLD_MAPPING/i.test(error)) return { retryEligible: false, capability: 'SUPPORTED' };
  if (/READONLY_HOLD_RATE_LIMIT|CHANJET_LOCAL_BUDGET_EXHAUSTED|traffic budget exhausted/i.test(error)) {
    return { retryEligible: false, capability: 'SUPPORTED' };
  }
  if (/READONLY_HOLD_REMOTE_AUTH|50111|无调用该接口的权限|permission denied|forbidden/i.test(error)) {
    return { retryEligible: false, capability: 'PERMISSION_HOLD' };
  }
  if (/READONLY_HOLD_UNSUPPORTED|not supported|unsupported|不存在该接口/i.test(error)) {
    return { retryEligible: false, capability: 'UNSUPPORTED' };
  }
  return { retryEligible: true, capability: 'SUPPORTED' };
}

@Injectable()
export class ChanjetIntegrationService {
  private readonly log = new Logger('ChanjetIntegration');
  private readonly runtimeOverviewCacheTtlMs = 30_000;
  private productionReadinessCache?: { expiresAt: number; value: ChanjetProductionReadiness };
  private productionReadinessInFlight?: Promise<ChanjetProductionReadiness>;
  private currentStateCache?: { expiresAt: number; value: ChanjetCurrentStateOverview };
  private currentStateInFlight?: Promise<ChanjetCurrentStateOverview>;
  private mirrorEvidenceCache?: { expiresAt: number; value: ChanjetMirrorEvidence };
  private mirrorEvidenceInFlight?: Promise<ChanjetMirrorEvidence>;

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
    @InjectRepository(ChanjetWritebackOutboxEntity)
    private readonly writebackOutboxRepo: Repository<ChanjetWritebackOutboxEntity>,
  ) {}

  listProbeEndpoints() {
    return PROBE_ENDPOINTS.map(({ key, label, apiDomain, method, path, requiresBook, entityType, mirrorDefault, pagination }) => ({
      key,
      label,
      apiDomain,
      method,
      path,
      requiresBook: !!requiresBook,
      entityType: entityType || '',
      mirrorDefault: !!mirrorDefault,
      paginated: !!pagination,
    }));
  }

  async wmsReadonlyAlignmentOverview() {
    const inventoryEndpoints = PROBE_ENDPOINTS.filter((endpoint) => (
      endpoint.apiDomain === 'inventory'
      && endpoint.mirrorDefault
      && endpoint.entityType
    ));
    const entityTypes = inventoryEndpoints.map((endpoint) => endpoint.entityType as string);
    const balanceEntityTypes = new Set(['INVENTORY_ON_HAND', 'INVENTORY_ON_HAND_LOT']);
    const transactionalEntityTypes = new Set(
      entityTypes.filter((entityType) => !balanceEntityTypes.has(entityType)),
    );
    const [snapshots, syncJobs, enabledBooks, schemaRows] = await Promise.all([
      this.entitySnapshotRepo.find({
        where: { entityType: In(entityTypes) },
        order: { updatedAt: 'DESC' },
        take: 10000,
      }),
      this.jobRepo.find({
        where: { jobType: 'SNAPSHOT' },
        order: { updatedAt: 'DESC' },
        take: 10000,
      }),
      this.accountBookRepo.find({ where: { enabled: true }, order: { bookName: 'ASC' } }),
      this.ds.query(`
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('wms_inbound', 'wms_outbound', 'wms_inbound_items', 'wms_outbound_items')
      `),
    ]);
    const existingColumns = new Set(
      (schemaRows as Array<{ table_name: string; column_name: string }>)
        .map((row) => `${row.table_name}.${row.column_name}`),
    );
    const enabledBookIds = new Set(enabledBooks.map((book) => book.bookId));
    const scopedSnapshots = snapshots.filter((snapshot) => enabledBookIds.has(snapshot.bookId));
    const missingColumns = CHANJET_WMS_ERP_COLUMN_REQUIREMENTS.filter((target) => !existingColumns.has(target));
    const documents = scopedSnapshots
      .filter((snapshot) => transactionalEntityTypes.has(snapshot.entityType))
      .map((snapshot) => normalizeChanjetInventoryDocument(
        snapshot.rawData || {},
        snapshot.entityType as Parameters<typeof normalizeChanjetInventoryDocument>[1],
        snapshot.bookId,
      ));
    const latestByScope = new Map<string, string>();
    const rowCountByScope = new Map<string, number>();
    for (const snapshot of scopedSnapshots) {
      const scopeKey = `${snapshot.entityType}:${snapshot.bookId}`;
      const updatedAt = snapshot.updatedAt ? new Date(snapshot.updatedAt).toISOString() : '';
      const current = latestByScope.get(scopeKey) || '';
      if (updatedAt > current) latestByScope.set(scopeKey, updatedAt);
      rowCountByScope.set(scopeKey, (rowCountByScope.get(scopeKey) || 0) + 1);
    }
    const latestJobByScope = new Map<string, ChanjetSyncJobEntity>();
    const latestSuccessfulJobByScope = new Map<string, ChanjetSyncJobEntity>();
    for (const job of syncJobs) {
      const endpointKey = String(job.requestScope?.key || '');
      if (!endpointKey || !enabledBookIds.has(job.bookId)) continue;
      const scopeKey = `${endpointKey}:${job.bookId}`;
      if (!latestJobByScope.has(scopeKey)) latestJobByScope.set(scopeKey, job);
      if (job.status === 'SUCCESS' && !latestSuccessfulJobByScope.has(scopeKey)) {
        latestSuccessfulJobByScope.set(scopeKey, job);
      }
    }
    const expectedScopes = enabledBooks.flatMap((book) => inventoryEndpoints.map((endpoint) => ({
      endpoint,
      book,
    }))).map(({ endpoint, book }) => {
      const entityScopeKey = `${endpoint.entityType}:${book.bookId}`;
      const jobScopeKey = `${endpoint.key}:${book.bookId}`;
      const latestJob = latestJobByScope.get(jobScopeKey);
      const latestSuccessfulJob = latestSuccessfulJobByScope.get(jobScopeKey);
      const jobRows = Number(latestSuccessfulJob?.resultSummary?.rows);
      const latestSyncError = latestJob?.errorMessage || null;
      const providerCapability = latestJob?.status === 'FAIL'
        && /50111|无调用该接口的权限|permission/i.test(latestSyncError || '')
        ? 'PERMISSION_HOLD'
        : latestJob?.status === 'FAIL'
          && /not supported|unsupported|不存在该接口/i.test(latestSyncError || '')
          ? 'UNSUPPORTED'
          : 'SUPPORTED';
      return {
        endpointKey: endpoint.key,
        label: endpoint.label,
        entityType: endpoint.entityType as string,
        bookId: book.bookId,
        bookName: book.bookName,
        sourceRows: rowCountByScope.get(entityScopeKey)
          || (Number.isFinite(jobRows) ? jobRows : 0),
        latestPulledAt: latestSuccessfulJob?.updatedAt
          ? new Date(latestSuccessfulJob.updatedAt).toISOString()
          : latestByScope.get(entityScopeKey) || null,
        latestSyncStatus: latestJob?.status || 'MISSING',
        latestSyncError,
        providerCapability,
        retryEligible: providerCapability === 'SUPPORTED',
      };
    });
    const staleBefore = Date.now() - 24 * 60 * 60 * 1000;
    const staleOrMissingScopes = expectedScopes.filter((scope) => (
      !scope.latestPulledAt || new Date(scope.latestPulledAt).getTime() < staleBefore
    ));
    const failedScopes = expectedScopes.filter((scope) => scope.latestSyncStatus === 'FAIL');
    const officialReferences: Record<string, string> = {
      STOCK_IN: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/zjkcgl/30644?id=33283',
      SALES_STOCK_OUT: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32791',
      INVENTORY_ON_HAND: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/zjkcgl/kc?id=30797',
      INVENTORY_ON_HAND_LOT: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/zjkcgl/kc?id=32477',
      FINISHED_GOODS_STOCK_IN: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/zjkcgl/ccprkd?id=32394',
      MATERIAL_STOCK_OUT: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/zjkcgl/clckd?id=32386',
      OTHER_STOCK_IN: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/zjkcgl/qtrkd?id=32398',
      OTHER_STOCK_OUT: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32407',
      STOCK_TRANSFER: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/zjkcgl/dbd?id=32390',
      STOCK_COUNT: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/zjkcgl/pdd?id=32858',
      RETAIL_STOCK_OUT: 'https://open.chanjet.com/md/docs/file/apiFile/zplus/lsgl/hyc_retailstock?id=33339',
    };
    const contracts = inventoryEndpoints.map((endpoint) => ({
      key: endpoint.key,
      label: endpoint.label,
      method: endpoint.method,
      path: endpoint.path,
      reference: officialReferences[endpoint.key] || '',
      requestRequiredFields: endpoint.pagination
        ? [endpoint.pagination.pageField, endpoint.pagination.pageSizeField]
        : [],
      statusValues: transactionalEntityTypes.has(endpoint.key) ? ['SUBMITTED', 'EFFECTIVE'] : [],
      fields: endpoint.key === 'STOCK_IN'
        ? CHANJET_STOCK_IN_FIELD_CONTRACT
        : endpoint.key === 'SALES_STOCK_OUT'
          ? CHANJET_SALES_STOCK_OUT_FIELD_CONTRACT
          : [],
      storageLayer: 'CHANJET_READ_SNAPSHOT_AND_ENTITY_SNAPSHOT',
    }));
    const officialFieldCount = contracts.reduce((sum, contract) => sum + contract.fields.length, 0);
    const sourceRows = scopedSnapshots.length;
    const sourceDocuments = documents.length;
    const sourceLines = documents.reduce((sum, document) => sum + document.lines.length, 0);
    const schemaCoverage = CHANJET_WMS_ERP_COLUMN_REQUIREMENTS.length
      ? Number((((CHANJET_WMS_ERP_COLUMN_REQUIREMENTS.length - missingColumns.length)
        / CHANJET_WMS_ERP_COLUMN_REQUIREMENTS.length) * 100).toFixed(2))
      : 100;
    const conditions = [
      ...(staleOrMissingScopes.length ? [`${staleOrMissingScopes.length} 个账套单据 scope 缺失或超过 24 小时`] : []),
      ...(failedScopes.length ? [`${failedScopes.length} 个账套单据 scope 最近同步失败`] : []),
      ...(missingColumns.length ? [`ERP 业务字段仍缺 ${missingColumns.length} 列`] : []),
      ...(sourceRows === 0 ? ['好业财当前 11 类库存 scope 均无镜像数据，需完成生产只读全量拉取后判断源数据完整性'] : []),
      ...(sourceRows > 0 && sourceDocuments === 0
        ? ['库存余额或其他单据已有镜像，但采购入库/销售出库仍无样本，详细业务字段需继续验证']
        : []),
    ];
    return {
      generatedAt: new Date().toISOString(),
      decision: missingColumns.length || staleOrMissingScopes.length || failedScopes.length
        ? 'HOLD'
        : sourceRows === 0
          ? 'GO_WITH_CONDITIONS'
          : 'GO',
      summary: {
        enabledBooks: enabledBooks.length,
        inventoryContracts: inventoryEndpoints.length,
        expectedScopes: expectedScopes.length,
        freshScopes: expectedScopes.length - staleOrMissingScopes.length,
        failedScopes: failedScopes.length,
        sourceRows,
        sourceDocuments,
        sourceLines,
        officialFieldCount,
        losslessMirrorCoverage: 100,
        erpBusinessColumnCoverage: schemaCoverage,
        missingBusinessColumns: missingColumns.length,
      },
      contracts,
      scopes: expectedScopes,
      documentPreview: documents.slice(0, 200),
      documentPreviewTruncated: documents.length > 200,
      missingColumns,
      conditions,
      businessRules: {
        mirrorAuthority: '好业财库存数据先进入只读中间层镜像；镜像不等同于 ERP 库存事实，不触发库存增减。',
        inboundAuthority: '好业财采购入库只读单据用于财务/库存对账；ERP 实际库存仍由 wms confirm 原子事务记账。',
        outboundAuthority: '好业财销售出库只读单据用于销售履约对账；ERP 销售/生产/后勤/配件出库保持独立业务类型。',
        balanceAuthority: '好业财现存量与批次现存量用于基线和差异检测；ERP inv_batches/inv_ledger 继续作为 ERP 业务台账。',
        statusMapping: { SUBMITTED: 'PENDING', EFFECTIVE: 'COMPLETED' },
        redBlueRule: '红字单据必须保留 redBlueFlagEnum，后续写入设计不得按普通正数单据处理。',
        attachmentRule: '好业财 attachmentList 原始 URL 仅留在受控中间层证据，不向普通业务 UI 暴露。',
      },
      reverseSyncReadiness: {
        decision: missingColumns.length || staleOrMissingScopes.length || failedScopes.length
          ? 'HOLD'
          : 'PREPARED_DISABLED',
        externalWriteEnabled: false,
        wmsOutboxImplemented: true,
        promotionCandidateBridgeImplemented: true,
        externalExecutionEndpointExposed: false,
        canonicalDocumentModelReady: missingColumns.length === 0,
        supportedErpDirections: [
          '采购/产成品/其他入库',
          '销售/生产领料/后勤/配件/其他/零售出库',
          '仓库调拨',
          '库存盘点',
        ],
        prerequisites: [
          '账套与 ERP company_code 一一核准',
          '仓库、商品/SKU/规格、计量单位、批次映射覆盖率达到 100%',
          '好业财写入接口、字段、状态机和红蓝单规则完成官方合同审查',
          '库存专用 outbox 已建立；真实 transport 继续保持未实现和不可调用',
          'A2 安全、A1 回归、A7 发布 Gate 通过',
          '先单笔草稿 canary，人工批准后写入并立即只读回查',
        ],
        rule: '当前具备本地候选与 Outbox 草稿能力，但无外部执行端点；任何好业财写入必须另立 Gate。',
      },
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        erpBusinessWrite: false,
        automaticVoucherWrite: false,
        rule: '本接口只读 ERP 中间层与 information_schema；同步任务只写 ERP 中间层镜像，不写好业财，也不写 ERP 出入库业务表。',
      },
    };
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
      readonlySubjectReferences,
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
      this.mappingRepo.count({ where: { reviewStatus: 'PENDING', mappingType: Not('SUBJECT') } }),
      this.mappingRepo.count({ where: { reviewStatus: 'APPROVED' } }),
      this.mappingRepo.count({ where: { mappingType: 'SUBJECT', matchStatus: 'SOURCE_ONLY' } }),
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
      readonlySubjectReferences,
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

  async accountBookMappingGate(): Promise<ChanjetAccountBookMappingGate> {
    const [books, maps, organizationRows] = await Promise.all([
      this.accountBookRepo.find({ order: { bookName: 'ASC' } }),
      this.bookCompanyMapRepo.find({ order: { bookName: 'ASC' } }),
      this.ds.query(
        `SELECT DISTINCT COALESCE(NULLIF(company_code, ''), org_code) AS company_code
           FROM sys_organizations
          WHERE org_type = 'COMPANY' AND status = 'ACTIVE'`,
      ).catch((error) => {
        this.log.warn(`Chanjet account-book gate could not read active companies: ${(error as Error).message}`);
        return [] as Array<{ company_code: string }>;
      }),
    ]);
    const bookById = new Map(books.map((book) => [book.bookId, book]));
    const activeCompanies = new Set(
      (organizationRows as Array<{ company_code?: string }>)
        .map((row) => String(row.company_code || '').trim())
        .filter(Boolean),
    );
    const duplicateBooks = this.findDuplicateValues(maps.map((mapping) => mapping.bookid));
    const duplicateCompanies = this.findDuplicateValues(maps.map((mapping) => mapping.companyCode));
    const blockingIssues: string[] = [];
    const warnings: string[] = [];

    if (duplicateBooks.length) blockingIssues.push(`重复账套映射: ${duplicateBooks.join(', ')}`);
    if (duplicateCompanies.length) blockingIssues.push(`同一 ERP 公司被多个账套占用: ${duplicateCompanies.join(', ')}`);

    const mappings = maps.map((mapping) => {
      const cachedBook = bookById.get(mapping.bookid);
      const issues: string[] = [];
      if (!mapping.bookid || !mapping.companyCode) issues.push('账套或公司编码为空');
      if (!cachedBook) issues.push('账套未出现在好业财账套缓存');
      if (cachedBook && mapping.syncEnabled && !cachedBook.enabled) issues.push('映射已启用但账套缓存未启用');
      if (!activeCompanies.has(mapping.companyCode)) issues.push('ERP ACTIVE 公司主数据不存在');
      if (cachedBook?.companyCode && cachedBook.companyCode !== mapping.companyCode) issues.push('账套缓存公司与审批绑定不一致');
      if (['READONLY_VERIFY', 'READONLY_ACTIVE'].includes(process.env.CHANJET_SYNC_POLICY || '')) {
        const approval = approvedReadonlyPolicy();
        if (!approval.books.some(b => b.bookId === mapping.bookid && b.companyCode === mapping.companyCode)) issues.push('账套不在本配置版本审批范围');
      }
      const status: 'VALID' | 'WARNING' | 'HOLD' = issues.length
        ? (mapping.syncEnabled ? 'HOLD' : 'WARNING')
        : 'VALID';
      const issueText = `${mapping.bookid || '(empty)'}→${mapping.companyCode || '(empty)'}: ${issues.join(' / ')}`;
      if (status === 'HOLD') blockingIssues.push(issueText);
      if (status === 'WARNING') warnings.push(issueText);
      return {
        bookId: mapping.bookid,
        bookName: mapping.bookName,
        companyCode: mapping.companyCode,
        companyName: mapping.companyName,
        syncEnabled: mapping.syncEnabled,
        cachedBookExists: !!cachedBook,
        cachedBookEnabled: !!cachedBook?.enabled,
        companyExists: activeCompanies.has(mapping.companyCode),
        status,
        issues,
      };
    });

    for (const book of books.filter((item) => item.enabled)) {
      if (!maps.some((mapping) => mapping.bookid === book.bookId && mapping.syncEnabled)) {
        blockingIssues.push(`启用账套 ${book.bookId} (${book.bookName}) 缺少启用的一对一公司映射`);
      }
    }

    const decision = blockingIssues.length ? 'HOLD' : warnings.length ? 'GO_WITH_CONDITIONS' : 'GO';
    return {
      generatedAt: new Date().toISOString(),
      decision,
      canRunBookScopedSync: decision !== 'HOLD' && maps.some((mapping) => mapping.syncEnabled),
      summary: {
        cachedBooks: books.length,
        enabledBooks: books.filter((book) => book.enabled).length,
        configuredMappings: maps.length,
        enabledMappings: maps.filter((mapping) => mapping.syncEnabled).length,
        validMappings: mappings.filter((mapping) => mapping.status === 'VALID').length,
        blockingIssues: blockingIssues.length,
        warnings: warnings.length,
      },
      mappings,
      blockingIssues,
      warnings,
      guardrails: {
        nameBasedAutoMatch: false,
        oneBookPerCompany: true,
        oneCompanyPerBook: true,
        chanjetWrite: false,
        rule: '账套同步只接受 chanjet_book_company_map 中启用且通过公司主数据校验的一对一映射。',
      },
    };
  }

  async mirrorBaselineReadiness(freshnessHours = 24): Promise<ChanjetMirrorBaselineReadiness> {
    const safeFreshnessHours = Math.min(Math.max(Number(freshnessHours) || 24, 1), 168);
    const [evidence, accountBookGate] = await Promise.all([
      this.loadMirrorEvidence(),
      this.accountBookMappingGate(),
    ]);
    const books = evidence.books.filter((book) => book.enabled);
    const validSnapshots = evidence.snapshots.filter((snapshot) => !getChanjetBusinessFailure(snapshot.rawPayload));
    const validEntities = evidence.entities.filter((entity) => !getChanjetBusinessFailure(entity.rawData));
    const jobs = evidence.jobs;
    const now = Date.now();
    const endpoints = PROBE_ENDPOINTS.filter((endpoint) => endpoint.mirrorDefault);
    const scopes: ChanjetMirrorBaselineReadiness['scopes'] = [];

    for (const endpoint of endpoints) {
      const targets = endpoint.requiresBook ? books.map((book) => book.bookId) : [''];
      if (endpoint.requiresBook && targets.length === 0) targets.push('');
      for (const targetBookId of targets) {
        const snapshot = validSnapshots.find((item) => item.endpointKey === endpoint.key && item.bookId === targetBookId);
        const latestJob = jobs.find((job) => (
          job.endpointKey === endpoint.key && job.bookId === targetBookId
        ));
        // An unchanged payload is intentionally deduplicated and therefore does not
        // create a new snapshot row. A successful SNAPSHOT job still proves that the
        // source was polled successfully, so include its audit timestamp in freshness.
        const evidenceDates = [
          snapshot?.pulledAt,
          latestJob?.status === 'SUCCESS' ? latestJob.updatedAt : undefined,
        ]
          .filter((value): value is Date => value instanceof Date);
        const latestEvidenceAt = evidenceDates.length
          ? new Date(Math.max(...evidenceDates.map((value) => value.getTime())))
          : null;
        const ageHours = latestEvidenceAt
          ? Math.max(0, (now - latestEvidenceAt.getTime()) / 3_600_000)
          : null;
        const status: ChanjetBaselineStatus = !snapshot
          ? 'MISSING'
          : latestJob?.status === 'FAIL'
            ? 'STALE'
          : ageHours !== null && ageHours <= safeFreshnessHours
            ? 'FRESH'
            : 'STALE';
        scopes.push({
          endpointKey: endpoint.key,
          label: endpoint.label,
          bookId: targetBookId,
          entityType: endpoint.entityType || endpoint.key,
          status,
          rowCount: snapshot?.rowCount || 0,
          entityCount: validEntities.filter((item) => (
            item.endpointKey === endpoint.key && item.bookId === targetBookId
          )).length,
          latestPulledAt: latestEvidenceAt?.toISOString() || null,
          ageHours: ageHours === null ? null : Number(ageHours.toFixed(2)),
          latestJobStatus: latestJob?.status || 'MISSING',
          latestJobError: latestJob?.errorMessage || null,
        });
      }
    }

    const freshTargets = scopes.filter((scope) => scope.status === 'FRESH').length;
    const staleTargets = scopes.filter((scope) => scope.status === 'STALE').length;
    const missingTargets = scopes.filter((scope) => scope.status === 'MISSING').length;
    const failedRecentJobs = scopes.filter((scope) => scope.latestJobStatus === 'FAIL').length;
    const providerPermissionHolds = scopes.filter((scope) => (
      scope.latestJobStatus === 'FAIL'
      && classifyChanjetSyncFailure(scope.latestJobError || '').capability === 'PERMISSION_HOLD'
    )).length;
    const reportEndpointKeys = new Set(['GL_BALANCE', 'BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW']);
    const missingReportTargets = scopes.filter((scope) => scope.status === 'MISSING' && reportEndpointKeys.has(scope.endpointKey)).length;
    const decision = accountBookGate.decision === 'HOLD' || missingTargets > 0
      ? 'HOLD'
      : staleTargets > 0 || failedRecentJobs > 0
        ? 'GO_WITH_CONDITIONS'
        : 'GO';
    return {
      generatedAt: new Date().toISOString(),
      decision,
      freshnessHours: safeFreshnessHours,
      summary: {
        expectedScopes: endpoints.length,
        expectedTargets: scopes.length,
        freshTargets,
        staleTargets,
        missingTargets,
        failedRecentJobs,
        providerPermissionHolds,
        endpointCoverageRate: scopes.length ? Number((((scopes.length - missingTargets) / scopes.length) * 100).toFixed(2)) : 0,
        nextGate: this.mirrorBaselineNextGate({
          missingReportTargets,
          missingTargets,
          staleTargets,
          failedRecentJobs,
          providerPermissionHolds,
        }),
      },
      accountBookGate,
      scopes,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        businessTableWrite: false,
        rule: '基线只读取 ERP 中间层快照、作业审计和账套映射，不调用好业财写接口。',
      },
    };
  }

  /**
   * Load only scalar evidence needed by readiness/coverage. The raw mirror
   * payloads can exceed 80 MB in PostgreSQL and expand far beyond the 320 MB
   * V8 heap when TypeORM materializes them. Extracting failure-envelope fields
   * in SQL preserves fail-closed filtering without loading document bodies.
   */
  private async loadMirrorEvidence(): Promise<ChanjetMirrorEvidence> {
    const now = Date.now();
    if (this.mirrorEvidenceCache && this.mirrorEvidenceCache.expiresAt > now) {
      return this.mirrorEvidenceCache.value;
    }
    if (this.mirrorEvidenceInFlight) {
      return this.mirrorEvidenceInFlight;
    }
    const task = this.computeMirrorEvidence();
    this.mirrorEvidenceInFlight = task;
    try {
      const value = await task;
      this.mirrorEvidenceCache = {
        expiresAt: Date.now() + (this.runtimeOverviewCacheTtlMs || 30_000),
        value,
      };
      return value;
    } finally {
      if (this.mirrorEvidenceInFlight === task) {
        this.mirrorEvidenceInFlight = undefined;
      }
    }
  }

  private async computeMirrorEvidence(): Promise<ChanjetMirrorEvidence> {
    const [bookRows, snapshotRows, entityRows, jobRows] = await Promise.all([
      this.ds.query(
        `SELECT book_id, book_name, company_code, company_name, enabled
           FROM chanjet_account_books
          ORDER BY book_name ASC`,
      ),
      this.ds.query(
        `SELECT endpoint_key, book_id, row_count, pulled_at,
                raw_payload->>'success' AS envelope_success,
                COALESCE(NULLIF(raw_payload->>'code', ''), raw_payload#>>'{error,code}', '') AS envelope_code,
                COALESCE(NULLIF(raw_payload->>'msg', ''), NULLIF(raw_payload->>'message', ''),
                         raw_payload#>>'{error,msg}', raw_payload#>>'{error,message}', '') AS envelope_message,
                COALESCE(NULLIF(raw_payload->>'requestId', ''), NULLIF(raw_payload->>'request_id', ''),
                         raw_payload#>>'{error,requestId}', '') AS envelope_request_id,
                COALESCE(NULLIF(raw_payload->>'status', ''), raw_payload#>>'{error,status}', '') AS envelope_status,
                (raw_payload ? 'data' AND raw_payload->'data' = 'null'::jsonb) AS envelope_null_data,
                (jsonb_typeof(raw_payload->'error') = 'object'
                  AND raw_payload->'error' <> '{}'::jsonb) AS envelope_has_error
           FROM chanjet_read_snapshots
          ORDER BY pulled_at DESC`,
      ),
      this.ds.query(
        `SELECT endpoint_key, book_id, entity_type, amount, updated_at,
                raw_data->>'success' AS envelope_success,
                COALESCE(NULLIF(raw_data->>'code', ''), raw_data#>>'{error,code}', '') AS envelope_code,
                COALESCE(NULLIF(raw_data->>'msg', ''), NULLIF(raw_data->>'message', ''),
                         raw_data#>>'{error,msg}', raw_data#>>'{error,message}', '') AS envelope_message,
                COALESCE(NULLIF(raw_data->>'requestId', ''), NULLIF(raw_data->>'request_id', ''),
                         raw_data#>>'{error,requestId}', '') AS envelope_request_id,
                COALESCE(NULLIF(raw_data->>'status', ''), raw_data#>>'{error,status}', '') AS envelope_status,
                (raw_data ? 'data' AND raw_data->'data' = 'null'::jsonb) AS envelope_null_data,
                (jsonb_typeof(raw_data->'error') = 'object'
                  AND raw_data->'error' <> '{}'::jsonb) AS envelope_has_error
           FROM chanjet_entity_snapshots
          ORDER BY updated_at DESC`,
      ),
      this.ds.query(
        `SELECT DISTINCT ON (COALESCE(request_scope->>'key', ''), book_id)
                COALESCE(request_scope->>'key', '') AS endpoint_key,
                book_id, status, error_message, updated_at
           FROM chanjet_sync_jobs
          WHERE job_type = 'SNAPSHOT'
          ORDER BY COALESCE(request_scope->>'key', ''), book_id, created_at DESC`,
      ),
    ]);
    const failureEnvelope = (row: Record<string, unknown>): Record<string, unknown> => {
      const error = row.envelope_has_error
        ? {
          code: String(row.envelope_code || ''),
          message: String(row.envelope_message || ''),
          requestId: String(row.envelope_request_id || ''),
          status: String(row.envelope_status || ''),
        }
        : undefined;
      return {
        success: row.envelope_success,
        code: String(row.envelope_code || ''),
        message: String(row.envelope_message || ''),
        requestId: String(row.envelope_request_id || ''),
        status: String(row.envelope_status || ''),
        ...(row.envelope_null_data ? { data: null } : {}),
        ...(error ? { error } : {}),
      };
    };
    const toDate = (value: unknown) => value instanceof Date ? value : new Date(String(value || ''));
    return {
      books: (bookRows as Array<Record<string, unknown>>).map((row) => ({
        bookId: String(row.book_id || ''),
        bookName: String(row.book_name || ''),
        companyCode: row.company_code ? String(row.company_code) : null,
        companyName: row.company_name ? String(row.company_name) : null,
        enabled: row.enabled === true || String(row.enabled).toLowerCase() === 'true',
      })),
      snapshots: (snapshotRows as Array<Record<string, unknown>>).map((row) => ({
        endpointKey: String(row.endpoint_key || ''),
        bookId: String(row.book_id || ''),
        rowCount: Number(row.row_count || 0),
        pulledAt: toDate(row.pulled_at),
        rawPayload: failureEnvelope(row),
      })),
      entities: (entityRows as Array<Record<string, unknown>>).map((row) => ({
        endpointKey: String(row.endpoint_key || ''),
        bookId: String(row.book_id || ''),
        entityType: String(row.entity_type || ''),
        amount: Number(row.amount || 0),
        updatedAt: toDate(row.updated_at),
        rawData: failureEnvelope(row),
      })),
      jobs: (jobRows as Array<Record<string, unknown>>).map((row) => ({
        endpointKey: String(row.endpoint_key || ''),
        bookId: String(row.book_id || ''),
        status: String(row.status || 'RUNNING') as ChanjetSyncJobEntity['status'],
        errorMessage: row.error_message ? String(row.error_message) : null,
        updatedAt: toDate(row.updated_at),
      })),
    };
  }

  private mirrorBaselineNextGate(input: {
    missingReportTargets: number;
    missingTargets: number;
    staleTargets: number;
    failedRecentJobs: number;
    providerPermissionHolds: number;
  }): string {
    if (input.missingReportTargets > 0) return 'CHANJET_REPORT_ENDPOINT_PARAMETER_REPAIR';
    if (input.providerPermissionHolds > 0) return 'CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR';
    if (input.missingTargets > 0) return 'CHANJET_MIRROR_BASELINE_REPAIR';
    if (input.failedRecentJobs > 0) return 'CHANJET_READONLY_SYNC_FAILURE_REPAIR';
    if (input.staleTargets > 0) return 'CHANJET_STALE_READONLY_SCOPE_REFRESH';
    return 'KEEP_SCHEDULED_READONLY_SYNC';
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
      this.mappingRepo.find({ take: 10000 }),
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
    for (const row of (mappingRows as ChanjetMasterMappingEntity[])
      .filter((mapping) => !getChanjetBusinessFailure(mapping.rawData))) {
      const type = String(row.mappingType || '');
      if (!type) continue;
      const count = 1;
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
      if (row.confidence !== null && row.confidence !== undefined) {
        item.confidenceSum += Number(row.confidence || 0) * count;
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
      const actionableMappings = Math.max(mappingStats.total - mappingStats.rejected, 0);
      const approvedRate = actionableMappings ? mappingStats.approved / actionableMappings : 0;
      const mirrorReady = entityCount > 0 || endpointEntityCount > 0;
      const reviewReady = actionableMappings > 0
        && mappingStats.approved === actionableMappings
        && mappingStats.pending === 0
        && mappingStats.conflicts === 0;
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
          actionable: actionableMappings,
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

  /**
   * P2 主数据映射复核只读视图。只给出可证明的一对一精确匹配，
   * 名称近似、跨公司、缺少有效源数据等情况全部 fail closed。
   */
  async masterDataMappingReview() {
    const [snapshots, bookMaps, erpRows] = await Promise.all([
      this.entitySnapshotRepo.find({
        where: { entityType: In(['DEPARTMENT', 'PROJECT', 'CASH_ACCOUNT', 'SUBJECT']) },
        order: { updatedAt: 'DESC' },
        take: 10000,
      }),
      this.bookCompanyMapRepo.find({ where: { syncEnabled: true } }),
      this.ds.query(
        `SELECT 'PROJECT' AS domain, project_code AS code, project_name AS name,
                company_code, '' AS currency, status
           FROM biz_projects
         UNION ALL
         SELECT 'CASH_ACCOUNT' AS domain, account_code AS code, account_name AS name,
                company_code, currency_code AS currency, status
           FROM fin_cash_accounts
         UNION ALL
         SELECT 'DEPARTMENT' AS domain, org_code AS code, org_name AS name,
                COALESCE(company_code, '') AS company_code, '' AS currency, status
           FROM sys_organizations
          WHERE org_type = 'DEPARTMENT'
         UNION ALL
         SELECT 'CURRENCY' AS domain, dict_code AS code,
                COALESCE(dict_label_zh, name, dict_value, dict_code) AS name,
                '' AS company_code, dict_code AS currency, status
           FROM sys_dict
          WHERE dict_type = 'SYS_CURRENCY'`,
      ).catch((error) => {
        this.log.warn(`Chanjet master-data mapping review unavailable: ${(error as Error).message}`);
        return [];
      }),
    ]);
    const companyByBook = new Map(bookMaps.map((mapping) => [mapping.bookid, mapping.companyCode]));
    const masters = (erpRows as Array<Record<string, unknown>>).map((row) => ({
      domain: String(row.domain || ''),
      code: String(row.code || ''),
      name: String(row.name || ''),
      companyCode: String(row.company_code || ''),
      currency: String(row.currency || ''),
      status: String(row.status || ''),
    }));
    const validSnapshots = snapshots.filter((snapshot) => this.isValidMasterDataReviewSnapshot(snapshot));
    const sourceRows = validSnapshots.map((snapshot) => {
      const raw = snapshot.rawData || {};
      const domain = snapshot.entityType;
      const rawCode = domain === 'CASH_ACCOUNT'
        ? this.firstChanjetText(raw, ['accountCode', 'code'])
        : domain === 'PROJECT'
          ? this.firstChanjetText(raw, ['projectCode', 'code'])
          : this.firstChanjetText(raw, ['code', 'deptCode', 'subjectCode']);
      const rawName = domain === 'CASH_ACCOUNT'
        ? this.firstChanjetText(raw, ['accountName', 'name'])
        : domain === 'PROJECT'
          ? this.firstChanjetText(raw, ['projectName', 'name'])
          : this.firstChanjetText(raw, ['name', 'deptName', 'subjectName']);
      return {
        snapshotId: snapshot.id,
        domain,
        bookId: snapshot.bookId,
        companyCode: companyByBook.get(snapshot.bookId) || '',
        chanjetId: snapshot.externalId || this.firstChanjetText(raw, ['id', 'ID', 'code']),
        // Old snapshots can contain a numeric fallback name. The preserved raw
        // payload is the authoritative source for domain-specific fields.
        chanjetCode: rawCode || snapshot.externalCode,
        chanjetName: rawName || snapshot.externalName,
        currency: snapshot.currency || this.firstChanjetText(raw, ['currencyCode', 'currency']),
      };
    });
    let candidates = sourceRows.map((source) => this.buildMasterDataReviewCandidate(source, masters));
    const currencySources = [...new Set(sourceRows
      .filter((row) => row.domain === 'CASH_ACCOUNT')
      .map((row) => row.currency)
      .filter(Boolean))]
      .map((currency) => ({
        snapshotId: `currency:${currency}`,
        domain: 'CURRENCY',
        bookId: '',
        companyCode: '',
        chanjetId: currency,
        chanjetCode: currency,
        chanjetName: currency,
        currency,
      }));
    candidates.push(...currencySources.map((source) => this.buildMasterDataReviewCandidate(source, masters)));

    // One ERP target may represent only one source identity inside an account
    // book. Multiple source masters hitting the same target is a conflict, even
    // when every individual name comparison looked exact.
    const exactTargetSources = candidates
      .filter((candidate) => candidate.status === 'EXACT_MATCH' && candidate.erpCode)
      .reduce<Map<string, Set<string>>>((groups, candidate) => {
        const key = [
          candidate.domain,
          candidate.bookId,
          candidate.companyCode,
          candidate.erpCode,
        ].join(':');
        const identities = groups.get(key) || new Set<string>();
        identities.add(candidate.chanjetId);
        groups.set(key, identities);
        return groups;
      }, new Map());
    candidates = candidates.map((candidate) => {
      if (candidate.status !== 'EXACT_MATCH' || !candidate.erpCode) return candidate;
      const key = [
        candidate.domain,
        candidate.bookId,
        candidate.companyCode,
        candidate.erpCode,
      ].join(':');
      const sourceIdentities = exactTargetSources.get(key) || new Set<string>();
      if (sourceIdentities.size <= 1) return candidate;
      return {
        ...candidate,
        status: 'CONFLICT',
        closureState: 'SOURCE_COLLISION_ON_ERP_TARGET',
        blockerCode: 'MULTIPLE_CHANJET_SOURCES_SHARE_ONE_ERP_TARGET',
        nextAction: 'DEDUPLICATE_SOURCE_OR_CREATE_DISTINCT_ERP_MASTERS',
        evidence: [
          `${sourceIdentities.size} 个好业财源身份命中同一 ERP 主档，禁止自动多对一映射`,
        ],
        systemApprovalEligible: false,
        requiresApproval: true,
        usableForErpWrite: false,
      };
    });

    const byDomain = ['DEPARTMENT', 'PROJECT', 'CASH_ACCOUNT', 'SUBJECT', 'CURRENCY'].map((domain) => {
      const rows = candidates.filter((candidate) => candidate.domain === domain);
      return {
        domain,
        sourceRows: rows.length,
        sourceReferences: rows.filter((row) => row.status === 'SOURCE_REFERENCE').length,
        exactMatches: rows.filter((row) => row.status === 'EXACT_MATCH').length,
        needMapping: rows.filter((row) => row.status === 'NEED_MAPPING').length,
        conflicts: rows.filter((row) => row.status === 'CONFLICT').length,
        waitingValidSource: rows.length === 0,
      };
    });
    const conflicts = candidates.filter((candidate) => candidate.status === 'CONFLICT').length;
    const sourceReferences = candidates.filter((candidate) => candidate.status === 'SOURCE_REFERENCE').length;
    const exactMatches = candidates.filter((candidate) => candidate.status === 'EXACT_MATCH').length;
    const needMapping = candidates.filter((candidate) => candidate.status === 'NEED_MAPPING').length;
    const closureStates = Object.entries(candidates.reduce<Record<string, number>>((counts, candidate) => {
      counts[candidate.closureState] = (counts[candidate.closureState] || 0) + 1;
      return counts;
    }, {})).map(([closureState, count]) => ({ closureState, count }));
    return {
      generatedAt: new Date().toISOString(),
      decision: conflicts ? 'HOLD' : 'GO_WITH_CONDITIONS',
      summary: {
        validSourceRows: sourceRows.length,
        invalidSourceRowsExcluded: snapshots.length - validSnapshots.length,
        sourceReferences,
        exactMatches,
        needMapping,
        conflicts,
        closureStates,
        domains: byDomain.length,
        nextGate: conflicts
          ? 'CHANJET_P2_MASTER_DATA_MAPPING_CONFLICT_REPAIR'
          : 'CHANJET_P2_EXACT_MAPPING_APPROVAL_GATE',
      },
      domains: byDomain,
      candidates,
      guardrails: {
        exactOnly: true,
        subjectReferencePolicy: '好业财科目作为只读账套科目基准，不伪造 ERP 科目主数据，也不进入映射批准队列。',
        normalizedExactNameAllowed: true,
        companyScopeRequired: true,
        currencyMatchRequiredForCashAccount: true,
        fuzzyAutoMatch: false,
        crossCompanyMatch: false,
        chanjetWrite: false,
        erpBusinessTableWrite: false,
        middleLayerWrite: false,
      },
    };
  }

  /**
   * Groups missing ERP finance masters into deterministic review proposals.
   * This is evidence preparation only: it does not create ERP masters, alter
   * approved mapping states or call a Chanjet write API.
   */
  async financeMasterGapClosureManifest() {
    const review = await this.masterDataMappingReview();
    const proposals = buildFinanceMasterGapProposals(review.candidates.map((candidate) => ({
      domain: candidate.domain,
      bookId: candidate.bookId,
      companyCode: candidate.companyCode,
      sourceId: candidate.chanjetId,
      sourceCode: candidate.chanjetCode,
      sourceName: candidate.chanjetName,
      currency: candidate.currency,
      closureState: candidate.closureState,
      blockerCode: candidate.blockerCode,
    })));
    return {
      generatedAt: new Date().toISOString(),
      proposalGroups: proposals.length,
      sourceRows: proposals.reduce((sum, proposal) => sum + proposal.sourceCount, 0),
      proposals,
      guardrails: {
        middleLayerEvidenceOnly: true,
        automaticErpMasterCreation: false,
        mappingStateMutation: false,
        erpBusinessTableWrite: false,
        chanjetWrite: false,
      },
    };
  }

  async stageFinanceMasterGapClosureProposals(actor: string) {
    const manifest = await this.financeMasterGapClosureManifest();
    const proposalBySource = new Map(
      manifest.proposals.flatMap((proposal) => proposal.sources.map((source) => [
        financeGapSourceKey({ domain: proposal.sourceDomain, bookId: source.bookId, sourceId: source.sourceId }),
        proposal,
      ] as const)),
    );
    const mappings = await this.mappingRepo.find({
      where: {
        mappingType: In<ChanjetMappingType>(['DEPARTMENT', 'PROJECT', 'CASH_ACCOUNT']),
      },
      order: { updatedAt: 'DESC' },
      take: 10000,
    });
    let stagedSourceRows = 0;
    let unchangedSourceRows = 0;
    const stagedAt = new Date().toISOString();
    for (const mapping of mappings) {
      const proposal = proposalBySource.get(financeGapSourceKey({
        domain: mapping.mappingType,
        bookId: mapping.bookId,
        sourceId: mapping.chanjetId,
      }));
      if (!proposal) continue;
      const current = mapping.rawData?.erpMasterGapProposal as Record<string, unknown> | undefined;
      if (
        current?.proposalId === proposal.proposalId
        && current?.proposedAction === proposal.proposedAction
      ) {
        unchangedSourceRows += 1;
        continue;
      }
      mapping.rawData = {
        ...(mapping.rawData || {}),
        erpMasterGapProposal: {
          proposalId: proposal.proposalId,
          sourceDomain: proposal.sourceDomain,
          targetEntityType: proposal.targetEntityType,
          targetTable: proposal.targetTable,
          proposedAction: proposal.proposedAction,
          riskLevel: proposal.riskLevel,
          requiredFields: proposal.requiredFields,
          blockerCodes: proposal.blockerCodes,
          autoCreateAllowed: false,
          requiresApproval: true,
          stagedBy: actor,
          stagedAt,
        },
      };
      await this.mappingRepo.save(mapping);
      stagedSourceRows += 1;
    }
    return {
      proposalGroups: manifest.proposalGroups,
      sourceRows: manifest.sourceRows,
      stagedSourceRows,
      unchangedSourceRows,
      writeChanjet: false,
      writeErpBusinessTables: false,
      automaticErpMasterCreation: false,
    };
  }

  /**
   * Confirms deterministic non-counterparty mappings in the ERP integration layer.
   * Exact ERP matches become APPROVED/MATCHED. Complete Chanjet identities that do
   * not have an ERP peer become APPROVED/SOURCE_ONLY and remain unusable for writes.
   */
  async confirmDeterministicMasterDataMappings(reviewedBy = 'system:chanjet-master-data'): Promise<{
    reviewed: number;
    exactApproved: number;
    sourceOnlyApproved: number;
    unchanged: number;
    conflicts: number;
    unresolved: number;
    errors: Array<{ domain: string; chanjetId: string; error: string }>;
  }> {
    const review = await this.masterDataMappingReview();
    const candidates = review.candidates.filter((candidate) => (
      ['DEPARTMENT', 'PROJECT', 'CASH_ACCOUNT', 'CURRENCY'].includes(candidate.domain)
      && ['EXACT_MATCH', 'SOURCE_REFERENCE'].includes(candidate.status)
    ));
    let exactApproved = 0;
    let sourceOnlyApproved = 0;
    let unchanged = 0;
    let conflicts = review.summary.conflicts;
    const errors: Array<{ domain: string; chanjetId: string; error: string }> = [];

    for (const candidate of candidates) {
      try {
        const mappingType = candidate.domain as ChanjetMappingType;
        const rows = await this.mappingRepo.find({
          where: { mappingType, bookId: candidate.bookId },
          order: { updatedAt: 'DESC' },
          take: 10000,
        });
        const byExternal = rows.find((row) => row.chanjetId === candidate.chanjetId);
        const byExactPair = candidate.erpCode
          ? rows.find((row) => row.chanjetId === candidate.chanjetId && row.erpCode === candidate.erpCode)
          : undefined;
        if (byExternal && byExactPair && byExternal.id !== byExactPair.id) {
          conflicts += 1;
          errors.push({
            domain: candidate.domain,
            chanjetId: candidate.chanjetId,
            error: `duplicate mapping rows ${byExternal.id}/${byExactPair.id}`,
          });
          continue;
        }
        const mapping = byExactPair || byExternal || this.mappingRepo.create({
          mappingType,
          bookId: candidate.bookId,
          erpCode: '',
          erpName: '',
          chanjetId: candidate.chanjetId,
          chanjetCode: candidate.chanjetCode,
          chanjetName: candidate.chanjetName,
          matchStatus: 'PENDING',
          confidence: '0.00',
          reviewStatus: 'PENDING',
          reviewedBy: null,
          reviewedAt: null,
          rawData: null,
        });
        const sourceOnly = candidate.status === 'SOURCE_REFERENCE';
        const targetStatus = sourceOnly ? 'SOURCE_ONLY' : 'MATCHED';
        if (
          mapping.matchStatus === targetStatus
          && mapping.reviewStatus === 'APPROVED'
          && (sourceOnly || mapping.erpCode === candidate.erpCode)
        ) {
          unchanged += 1;
          continue;
        }
        if (mapping.reviewStatus === 'APPROVED' && mapping.matchStatus !== 'SOURCE_ONLY') {
          conflicts += 1;
          errors.push({
            domain: candidate.domain,
            chanjetId: candidate.chanjetId,
            error: `approved mapping ${mapping.id} differs from deterministic candidate`,
          });
          continue;
        }

        mapping.erpCode = sourceOnly ? '' : candidate.erpCode;
        mapping.erpName = sourceOnly ? '' : candidate.erpName;
        mapping.chanjetCode = candidate.chanjetCode;
        mapping.chanjetName = candidate.chanjetName;
        mapping.matchStatus = targetStatus;
        mapping.confidence = sourceOnly ? '1.00' : '1.00';
        mapping.reviewStatus = sourceOnly ? 'APPROVED' : 'PENDING';
        mapping.reviewedBy = sourceOnly ? `system:source-identity:${reviewedBy}` : null;
        mapping.reviewedAt = sourceOnly ? new Date() : null;
        mapping.rawData = {
          ...(mapping.rawData || {}),
          resolutionKind: sourceOnly ? 'CHANJET_READONLY_SOURCE_IDENTITY' : 'EXACT_ERP_MASTER_MATCH',
          sourceSnapshotId: candidate.snapshotId,
          companyCode: candidate.companyCode,
          currency: candidate.currency,
          usableForErpWrite: !sourceOnly,
          evidence: candidate.evidence,
          confirmedAt: new Date().toISOString(),
        };
        const saved = await this.mappingRepo.save(mapping);
        if (sourceOnly) {
          sourceOnlyApproved += 1;
        } else {
          await this.updateMappingReview(saved.id, 'APPROVED', reviewedBy);
          exactApproved += 1;
        }
      } catch (error) {
        errors.push({
          domain: candidate.domain,
          chanjetId: candidate.chanjetId,
          error: (error as Error).message,
        });
      }
    }

    return {
      reviewed: candidates.length,
      exactApproved,
      sourceOnlyApproved,
      unchanged,
      conflicts,
      unresolved: review.summary.needMapping,
      errors,
    };
  }

  /**
   * Gate A canary: mutate one approved ERP integration mapping, verify readback
   * and idempotency, then restore the exact previous state. The audit job remains.
   */
  async runMinimalMappingWriteCanary(requestedBy: string): Promise<{
    decision: 'GO' | 'HOLD';
    mappingId: string | null;
    mappingType: string | null;
    readbackPassed: boolean;
    idempotencyPassed: boolean;
    compensatingRollbackPassed: boolean;
    writeChanjet: false;
    writeErpBusinessTables: false;
    auditJobId: string;
    error?: string;
  }> {
    const actor = String(requestedBy || 'system:chanjet-minimal-write-canary').slice(0, 128);
    const job = await this.createJob('RECONCILE', '', '', {
      gate: 'CHANJET_MINIMAL_WRITE_PRECHECK',
      canary: 'MASTER_MAPPING',
      requestedBy: actor,
      writeChanjet: false,
      writeErpBusinessTables: false,
      rollbackRequired: true,
    });
    let mapping: ChanjetMasterMappingEntity | null = null;
    let before: Pick<ChanjetMasterMappingEntity, 'reviewedBy' | 'reviewedAt' | 'rawData'> | null = null;
    let readbackPassed = false;
    let idempotencyPassed = false;
    let compensatingRollbackPassed = false;
    try {
      mapping = await this.mappingRepo.findOne({
        where: {
          mappingType: In(['DEPARTMENT', 'PROJECT', 'CASH_ACCOUNT']),
          matchStatus: 'SOURCE_ONLY',
          reviewStatus: 'APPROVED',
        },
        order: { updatedAt: 'DESC' },
      });
      if (!mapping) throw new Error('no approved SOURCE_ONLY mapping available for canary');
      before = {
        reviewedBy: mapping.reviewedBy,
        reviewedAt: mapping.reviewedAt ? new Date(mapping.reviewedAt) : null,
        rawData: mapping.rawData ? JSON.parse(JSON.stringify(mapping.rawData)) : null,
      };
      const marker = `CHANJET-MAPPING-CANARY-${job.id}`;
      const canaryData = {
        ...(mapping.rawData || {}),
        minimalWriteCanary: { marker, requestedBy: actor, writtenAt: new Date().toISOString() },
      };
      mapping.rawData = canaryData;
      mapping.reviewedBy = actor;
      mapping.reviewedAt = new Date();
      await this.mappingRepo.save(mapping);
      const readback = await this.mappingRepo.findOneBy({ id: mapping.id });
      readbackPassed = String(readback?.rawData?.minimalWriteCanary && (readback.rawData.minimalWriteCanary as Record<string, unknown>).marker) === marker;
      if (!readbackPassed) throw new Error('canary readback mismatch');

      await this.mappingRepo.save({ ...readback!, rawData: canaryData });
      const identityCount = await this.mappingRepo.count({
        where: {
          mappingType: mapping.mappingType,
          bookId: mapping.bookId,
          erpCode: mapping.erpCode,
          chanjetId: mapping.chanjetId,
        },
      });
      idempotencyPassed = identityCount === 1;
      if (!idempotencyPassed) throw new Error(`canary idempotency mismatch count=${identityCount}`);

      mapping.reviewedBy = before.reviewedBy;
      mapping.reviewedAt = before.reviewedAt;
      mapping.rawData = before.rawData;
      await this.mappingRepo.save(mapping);
      const restored = await this.mappingRepo.findOneBy({ id: mapping.id });
      compensatingRollbackPassed = JSON.stringify(restored?.rawData ?? null) === JSON.stringify(before.rawData)
        && restored?.reviewedBy === before.reviewedBy;
      if (!compensatingRollbackPassed) throw new Error('canary compensating rollback mismatch');
      await this.finishJob(job, 'SUCCESS', {
        mappingId: mapping.id,
        mappingType: mapping.mappingType,
        readbackPassed,
        idempotencyPassed,
        compensatingRollbackPassed,
        writeChanjet: false,
      });
      return {
        decision: 'GO',
        mappingId: mapping.id,
        mappingType: mapping.mappingType,
        readbackPassed,
        idempotencyPassed,
        compensatingRollbackPassed,
        writeChanjet: false,
        writeErpBusinessTables: false,
        auditJobId: job.id,
      };
    } catch (error) {
      if (mapping && before) {
        try {
          mapping.reviewedBy = before.reviewedBy;
          mapping.reviewedAt = before.reviewedAt;
          mapping.rawData = before.rawData;
          await this.mappingRepo.save(mapping);
          const restored = await this.mappingRepo.findOneBy({ id: mapping.id });
          compensatingRollbackPassed = JSON.stringify(restored?.rawData ?? null) === JSON.stringify(before.rawData)
            && restored?.reviewedBy === before.reviewedBy;
        } catch (rollbackError) {
          this.log.error(`Chanjet mapping canary rollback failed: ${(rollbackError as Error).message}`);
        }
      }
      await this.finishJob(job, 'FAIL', {
        mappingId: mapping?.id || null,
        readbackPassed,
        idempotencyPassed,
        compensatingRollbackPassed,
        writeChanjet: false,
      }, (error as Error).message);
      return {
        decision: 'HOLD',
        mappingId: mapping?.id || null,
        mappingType: mapping?.mappingType || null,
        readbackPassed,
        idempotencyPassed,
        compensatingRollbackPassed,
        writeChanjet: false,
        writeErpBusinessTables: false,
        auditJobId: job.id,
        error: (error as Error).message,
      };
    }
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
      dailyReceiptPayment,
      semanticExtractors,
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
      this.erpCashBalanceAggregate(),
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
      this.chanjetCashBalanceAggregate(),
      this.financeReceiptPaymentDailyReconciliationOverview(),
      this.financeSemanticExtractorsOverview(),
    ]);
    const dailyMetricByKey = new Map(dailyReceiptPayment.metrics.map((metric) => [metric.key, metric]));
    const extractorByKey = new Map(semanticExtractors.extractors.map((extractor) => [extractor.key, extractor]));
    const dailyAggregate = (key: 'TODAY_RECEIPT' | 'TODAY_PAYMENT') => {
      const metric = dailyMetricByKey.get(key);
      return {
        available: metric?.readyForCardAuthority === true,
        value: metric?.amount ?? 0,
        rows: metric?.effectiveRows ?? 0,
        latestPulledAt: metric?.latestPulledAt ?? null,
        error: metric?.readyForCardAuthority ? undefined : metric?.reason || '每日收付款契约证据不可用',
      };
    };
    const dailyForceStatus = (key: 'TODAY_RECEIPT' | 'TODAY_PAYMENT'): FinanceReconciliationStatus | undefined => {
      const metric = dailyMetricByKey.get(key);
      if (metric?.readyForCardAuthority) return undefined;
      return metric?.status === 'HOLD' ? 'HOLD' : 'NEED_MANUAL_REVIEW';
    };
    const readonlyReportAggregate = (key: 'SUBJECT_BALANCE' | 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW' | 'VOUCHER_LIST') => {
      const extractor = extractorByKey.get(key);
      return {
        available: extractor?.status === 'READY' && extractor.sampleRows > 0,
        value: null,
        rows: extractor?.sampleRows || 0,
        latestPulledAt: extractor?.latestPulledAt || null,
        error: extractor?.status === 'READY' ? undefined : extractor?.reason || '只读报表语义证据不可用',
      };
    };
    const readonlyReportStatus = (key: 'SUBJECT_BALANCE' | 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW' | 'VOUCHER_LIST'): FinanceReconciliationStatus => (
      extractorByKey.get(key)?.status === 'READY' ? 'WARN' : 'NEED_MAPPING'
    );

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
        chanjetEntityTypes: ['GL_BALANCE'],
        erpSources: ['fin_cash_accounts.current_balance'],
        chanjet: chanjetCash,
        erp: erpCash,
        reason: '好业财 GL_BALANCE 最新期间 1001/1002 叶子科目的 baseEndingBalance 为现金/银行本位币期末余额；ERP 现金账户余额仅作辅助差异。',
        comparisonComparable: false,
        comparisonReason: '好业财为 CNY 本位币期末余额，ERP 当前保存各币种原币余额；在逐账户汇率和账户映射完成前禁止汇总求差。',
        chanjetBreakdown: chanjetCash.breakdown,
        erpBreakdown: erpCash.breakdown,
      }),
      this.buildFinanceReconciliationItem({
        key: 'TODAY_RECEIPT',
        label: '今日收款',
        priority: 'P0',
        chanjetEndpointKeys: ['PAYMENT_AR'],
        chanjetEntityTypes: ['AR_RECEIPT'],
        erpSources: ['fin_cash_transactions.direction=IN, created_at=current_date'],
        chanjet: dailyAggregate('TODAY_RECEIPT'),
        erp: erpTodayIn,
        forceStatus: dailyForceStatus('TODAY_RECEIPT'),
        reason: dailyMetricByKey.get('TODAY_RECEIPT')?.reason || '每日收款契约证据不可用，保持 fail-closed。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'TODAY_PAYMENT',
        label: '今日付款',
        priority: 'P0',
        chanjetEndpointKeys: ['PAYMENT_AP'],
        chanjetEntityTypes: ['AP_PAYMENT'],
        erpSources: ['fin_cash_transactions.direction=OUT, created_at=current_date'],
        chanjet: dailyAggregate('TODAY_PAYMENT'),
        erp: erpTodayOut,
        forceStatus: dailyForceStatus('TODAY_PAYMENT'),
        reason: dailyMetricByKey.get('TODAY_PAYMENT')?.reason || '每日付款契约证据不可用，保持 fail-closed。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'SUBJECT_BALANCE',
        label: '科目余额',
        priority: 'P0',
        chanjetEndpointKeys: ['GL_BALANCE'],
        chanjetEntityTypes: ['GL_BALANCE'],
        erpSources: ['chanjet_entity_snapshots.GL_BALANCE only'],
        chanjet: readonlyReportAggregate('SUBJECT_BALANCE'),
        erp: null,
        forceStatus: readonlyReportStatus('SUBJECT_BALANCE'),
        reason: '科目余额行级只读模型已就绪；ERP 没有同粒度总账表，因此不构造单值或伪差异。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'BALANCE_SHEET',
        label: '资产负债表关键项',
        priority: 'P0',
        chanjetEndpointKeys: ['BALANCE_SHEET'],
        chanjetEntityTypes: ['BALANCE_SHEET'],
        erpSources: ['chanjet_entity_snapshots.BALANCE_SHEET only'],
        chanjet: readonlyReportAggregate('BALANCE_SHEET'),
        erp: null,
        forceStatus: readonlyReportStatus('BALANCE_SHEET'),
        reason: '资产负债表行级只读模型已就绪；ERP 没有同粒度法定报表，因此不构造单值或伪差异。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'INCOME_STATEMENT',
        label: '利润表关键项',
        priority: 'P0',
        chanjetEndpointKeys: ['INCOME_STATEMENT'],
        chanjetEntityTypes: ['INCOME_STATEMENT'],
        erpSources: ['chanjet_entity_snapshots.INCOME_STATEMENT only'],
        chanjet: readonlyReportAggregate('INCOME_STATEMENT'),
        erp: null,
        forceStatus: readonlyReportStatus('INCOME_STATEMENT'),
        reason: '利润表行级只读模型已就绪；ERP 经营明细仅作解释，不与法定报表行强行一一对应。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'CASH_FLOW',
        label: '现金流量表关键项',
        priority: 'P1',
        chanjetEndpointKeys: ['CASH_FLOW'],
        chanjetEntityTypes: ['CASH_FLOW'],
        erpSources: ['chanjet_entity_snapshots.CASH_FLOW only'],
        chanjet: readonlyReportAggregate('CASH_FLOW'),
        erp: null,
        forceStatus: readonlyReportStatus('CASH_FLOW'),
        reason: '现金流量表行级只读模型已就绪；ERP 现金流水仅作辅助解释，不构造单值或伪差异。',
      }),
      this.buildFinanceReconciliationItem({
        key: 'VOUCHER_LIST',
        label: '凭证列表 / 明细',
        priority: 'P1',
        chanjetEndpointKeys: ['VOUCHER_SEARCH'],
        chanjetEntityTypes: ['VOUCHER'],
        erpSources: ['chanjet_voucher_drafts only'],
        chanjet: readonlyReportAggregate('VOUCHER_LIST'),
        erp: null,
        forceStatus: readonlyReportStatus('VOUCHER_LIST'),
        reason: '凭证头和明细专用适配器已支持只读重现；ERP→好业财写入继续关闭，不把只读就绪误报为写回就绪。',
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

  async financeCashBalanceFieldLockOverview(companyCodes?: string[]): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    lock: CashBalanceFieldLock;
    guardrails: Record<string, boolean | string>;
  }> {
    const [storedCashAccounts, storedGlBalances, enabledBooks] = await Promise.all([
      this.entitySnapshotRepo.find({
        where: { entityType: 'CASH_ACCOUNT' },
        order: { updatedAt: 'DESC' },
        take: 10000,
      }),
      this.entitySnapshotRepo.find({
        where: { entityType: 'GL_BALANCE' },
        order: { updatedAt: 'DESC' },
        take: 10000,
      }),
      this.accountBookRepo.find({ where: { enabled: true }, order: { bookName: 'ASC' } }),
    ]);
    const normalizedCompanies = companyCodes === undefined
      ? null
      : new Set(companyCodes.map((code) => String(code || '').trim()).filter(Boolean));
    const selectedBooks = enabledBooks.filter((book) => (
      normalizedCompanies === null || normalizedCompanies.has(String(book.companyCode || '').trim())
    ));
    const selectedBookIds = new Set(selectedBooks.map((book) => String(book.bookId)));
    const inSelectedBook = (bookId: string) => selectedBookIds.has(String(bookId));
    const cashAccounts = storedCashAccounts.filter((row) => (
      inSelectedBook(row.bookId) && !getChanjetBusinessFailure(row.rawData)
    ));
    const glBalances = storedGlBalances.filter((row) => (
      inSelectedBook(row.bookId) && !getChanjetBusinessFailure(row.rawData)
    ));
    const latestPeriodByBook = new Map<string, string>();
    for (const row of glBalances) {
      const period = String(row.period || '').trim();
      if (!/^\d{6}$/.test(period)) continue;
      const current = latestPeriodByBook.get(String(row.bookId));
      if (!current || period > current) latestPeriodByBook.set(String(row.bookId), period);
    }
    const currentRows = glBalances.filter((row) => (
      row.period === latestPeriodByBook.get(String(row.bookId))
    ));
    const isCashLeaf = (raw: Record<string, unknown>) => {
      const code = String(raw.glAccountCode || '').trim();
      return /^100[12]\d+$/.test(code)
        && raw.leaf === true
        && raw.isSumLine !== true
        && raw.isTotalLine !== true;
    };
    const cashLeafRows = currentRows.filter((row) => isCashLeaf(row.rawData || {}));
    const isNumeric = (value: unknown) => (
      value !== null && value !== '' && Number.isFinite(Number(value))
    );
    const invalidRows = cashLeafRows.filter((row) => {
      const raw = row.rawData || {};
      return !String(row.bookId || '').trim()
        || !/^\d{6}$/.test(String(row.period || '').trim())
        || !String(raw.glAccountCode || '').trim()
        || !String(raw.glAccountName || '').trim()
        || !isNumeric(raw.baseEndingBalance)
        || !isNumeric(raw.endingBalance)
        || typeof raw.currency !== 'string'
        || raw.leaf !== true;
    });
    const eligibleRows = cashLeafRows.filter((row) => !invalidRows.includes(row));
    const contractKeys = new Map<string, number>();
    for (const row of eligibleRows) {
      const key = `${row.bookId}:${row.period}:${String(row.rawData.glAccountCode || '').trim()}`;
      contractKeys.set(key, (contractKeys.get(key) || 0) + 1);
    }
    const duplicateContractRows = [...contractKeys.values()]
      .filter((count) => count > 1)
      .reduce((sum, count) => sum + count, 0);
    const latestPulledAt = eligibleRows.reduce<string | null>(
      (latest, row) => this.maxIso(latest, row.updatedAt ? new Date(row.updatedAt).toISOString() : null),
      null,
    );
    const stale = !latestPulledAt || Date.now() - new Date(latestPulledAt).getTime() > 24 * 60 * 60 * 1000;
    const coveredBookIds = new Set(eligibleRows.map((row) => String(row.bookId)));
    const missingBookIds = [...selectedBookIds].filter((bookId) => !coveredBookIds.has(bookId));
    const totalBaseBalance = eligibleRows.reduce(
      (sum, row) => sum + Number(row.rawData.baseEndingBalance),
      0,
    );
    const currencyGroups = new Map<string, { amount: number; rows: number }>();
    for (const row of eligibleRows) {
      const raw = row.rawData || {};
      const currency = String(raw.currency || '').trim().toUpperCase() || 'CNY';
      const amount = currency === 'CNY'
        ? Number(raw.baseEndingBalance)
        : Number(raw.endingBalance);
      const current = currencyGroups.get(currency) || { amount: 0, rows: 0 };
      current.amount += amount;
      current.rows += 1;
      currencyGroups.set(currency, current);
    }
    const companyByBook = new Map(selectedBooks.map((book) => [String(book.bookId), String(book.companyCode || '')]));
    const bookGroups = new Map<string, { companyCode: string; period: string; amount: number; rows: number }>();
    for (const row of eligibleRows) {
      const bookId = String(row.bookId);
      const current = bookGroups.get(bookId) || {
        companyCode: companyByBook.get(bookId) || '',
        period: String(row.period),
        amount: 0,
        rows: 0,
      };
      current.amount += Number(row.rawData.baseEndingBalance);
      current.rows += 1;
      bookGroups.set(bookId, current);
    }
    const normalizeName = (value: unknown) => String(value || '')
      .normalize('NFKC')
      .replace(/[\s\u3000]+/g, '')
      .toLowerCase();
    const ledgerDirectoryKeys = new Set(eligibleRows.map((row) => {
      const raw = row.rawData || {};
      const currency = String(raw.currency || '').trim().toUpperCase() || 'CNY';
      return `${row.bookId}:${normalizeName(raw.glAccountName)}:${currency}`;
    }));
    const unmatchedAccountDirectoryRows = cashAccounts.filter((row) => {
      const raw = row.rawData || {};
      const currency = String(raw.currencyCode || '').trim().toUpperCase() || 'CNY';
      return !ledgerDirectoryKeys.has(`${row.bookId}:${normalizeName(raw.accountName)}:${currency}`);
    }).length;
    const requiredFields = [
      'book_id',
      'period',
      'gl_account_code',
      'gl_account_name',
      'base_ending_balance',
      'original_ending_balance',
      'currency',
      'leaf',
    ];
    const sourcePathByField: Record<string, string> = {
      book_id: '$entity.bookId',
      period: '$entity.period',
      gl_account_code: '$.glAccountCode',
      gl_account_name: '$.glAccountName',
      base_ending_balance: '$.baseEndingBalance',
      original_ending_balance: '$.endingBalance',
      currency: '$.currency',
      leaf: '$.leaf',
    };
    const fieldCandidates = requiredFields.map((field) => {
      const observedCount = field === 'book_id' || field === 'period'
        ? currentRows.length
        : currentRows.filter((row) => {
            const key = sourcePathByField[field].replace(/^\$\./, '');
            return Object.prototype.hasOwnProperty.call(row.rawData || {}, key);
          }).length;
      const candidates = observedCount > 0 ? [{
        path: sourcePathByField[field],
        sampleType: ['base_ending_balance', 'original_ending_balance'].includes(field)
          ? 'number' as const
          : field === 'leaf'
            ? 'boolean' as const
            : 'string' as const,
        sampleValue: null,
        observedCount,
      }] : [];
      return {
        semanticField: field,
        candidatePaths: candidates,
        required: true,
        status: candidates.length ? 'FOUND' as const : 'MISSING' as const,
      };
    });
    const missingFields = fieldCandidates
      .filter((field) => field.status === 'MISSING')
      .map((field) => field.semanticField);
    const rawBalanceCandidateCount = fieldCandidates
      .filter((field) => ['base_ending_balance', 'original_ending_balance'].includes(field.semanticField))
      .reduce((sum, field) => sum + field.candidatePaths.length, 0);
    const blockerReasons = [
      ...(selectedBooks.length === 0 ? ['missing_enabled_account_book_scope'] : []),
      ...(glBalances.length === 0 ? ['missing_gl_balance_samples'] : []),
      ...(eligibleRows.length === 0 ? ['missing_cash_bank_leaf_balance_rows'] : []),
      ...(missingFields.length ? [`missing_required_fields:${missingFields.join('/')}`] : []),
      ...(invalidRows.length ? [`invalid_cash_balance_contract_rows:${invalidRows.length}`] : []),
      ...(duplicateContractRows ? [`duplicate_cash_balance_contract_rows:${duplicateContractRows}`] : []),
      ...(missingBookIds.length ? [`missing_cash_balance_books:${missingBookIds.join('/')}`] : []),
      ...(stale ? ['cash_balance_mirror_stale_over_24h'] : []),
    ];
    const readyForCardAuthority = blockerReasons.length === 0;
    const conditions = [
      ...(unmatchedAccountDirectoryRows > 0
        ? [`cash_account_directory_mapping_incomplete:${unmatchedAccountDirectoryRows}`]
        : []),
      'FIN_ACCOUNT_is_directory_only_not_balance_source',
      'group_total_uses_CNY_baseEndingBalance',
      'foreign_currency_breakdown_uses_endingBalance',
    ];
    const status: CashBalanceFieldLock['status'] = glBalances.length === 0
      ? 'WAITING_SAMPLE'
      : readyForCardAuthority
        ? 'AUTHORITY_READY'
        : 'HOLD';
    const decision: CashBalanceFieldLock['decision'] = status === 'HOLD' || status === 'WAITING_SAMPLE'
      ? 'HOLD'
      : conditions.some((item) => item.startsWith('cash_account_directory_mapping_incomplete'))
        ? 'GO_WITH_CONDITIONS'
        : 'GO';
    const lock: CashBalanceFieldLock = {
      key: 'CASH_BALANCE',
      label: '现金 / 银行余额',
      decision,
      status,
      sampleRows: cashAccounts.length + glBalances.length,
      accountDirectoryRows: cashAccounts.length,
      glBalanceRows: glBalances.length,
      eligibleBalanceRows: eligibleRows.length,
      invalidContractRows: invalidRows.length,
      duplicateContractRows,
      latestPulledAt,
      amountSum: 0,
      amountSumSafeAsBalance: false,
      totalBaseBalance: readyForCardAuthority ? Number(totalBaseBalance.toFixed(2)) : null,
      baseCurrency: 'CNY',
      currentPeriods: [...new Set(eligibleRows.map((row) => String(row.period)))].sort(),
      coveredBooks: coveredBookIds.size,
      requiredBooks: selectedBooks.length,
      unmatchedAccountDirectoryRows,
      currencyBalances: [...currencyGroups.entries()].map(([currency, value]) => ({
        currency,
        amount: Number(value.amount.toFixed(2)),
        rows: value.rows,
      })).sort((left, right) => left.currency.localeCompare(right.currency)),
      bookBalances: [...bookGroups.entries()].map(([bookId, value]) => ({
        bookId,
        companyCode: value.companyCode,
        period: value.period,
        amount: Number(value.amount.toFixed(2)),
        rows: value.rows,
      })).sort((left, right) => left.bookId.localeCompare(right.bookId)),
      rawBalanceCandidateCount,
      requiredFields,
      missingFields,
      fieldCandidates,
      sourceFields: {
        book: '$entity.bookId',
        period: '$entity.period',
        subjectCode: 'rawData.glAccountCode',
        subjectName: 'rawData.glAccountName',
        baseBalance: 'rawData.baseEndingBalance',
        originalBalance: 'rawData.endingBalance',
        currency: 'rawData.currency',
        leaf: 'rawData.leaf',
      },
      readyForCardAuthority,
      blockerReasons,
      conditions,
      displayRule: readyForCardAuthority
        ? '现金/银行余额主卡片使用好业财 GL_BALANCE 最新期间 1001/1002 叶子科目的 CNY 本位币期末余额，并显示 ERP 辅助差异。'
        : '字段合同、新鲜度、账套覆盖或唯一性未通过时继续使用 ERP 主值；不得把 CASH_ACCOUNT.amountSum=0 当真实余额。',
      nextAction: readyForCardAuthority
        ? '保持每日只读同步和字段漂移告警；继续完善 FIN_ACCOUNT 账户目录映射，但不得影响已锁定的总账余额口径。'
        : `修复字段锁阻断项后重跑 Gate: ${blockerReasons.join(' / ')}`,
    };
    return {
      generatedAt: new Date().toISOString(),
      decision: lock.decision,
      lock,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        dbWrite: false,
        amountSumZeroAsBusinessZero: false,
        balanceSource: 'GL_BALANCE_latest_period_cash_bank_leaf_baseEndingBalance',
        accountDirectorySource: 'FIN_ACCOUNT_directory_only',
        rule: '本接口只读 ERP 好业财中间层。集团主值只使用总账 1001/1002 叶子科目本位币期末余额；资金账户目录和 amountSum 均不得冒充余额。',
      },
    };
  }

  private async chanjetCashBalanceAggregate(companyCodes?: string[]): Promise<{
    available: boolean;
    value: number;
    rows: number;
    latestPulledAt: string | null;
    breakdown: FinanceCurrencyBalance[];
    error?: string;
  }> {
    try {
      const { lock } = await this.financeCashBalanceFieldLockOverview(companyCodes);
      return {
        available: lock.readyForCardAuthority && lock.totalBaseBalance !== null,
        value: lock.totalBaseBalance ?? 0,
        rows: lock.eligibleBalanceRows,
        latestPulledAt: lock.latestPulledAt,
        breakdown: lock.currencyBalances,
        ...(lock.readyForCardAuthority ? {} : { error: lock.blockerReasons.join(';') || lock.status }),
      };
    } catch (error) {
      this.log.warn(`Chanjet cash balance aggregate unavailable: ${(error as Error).message}`);
      return {
        available: false,
        value: 0,
        rows: 0,
        latestPulledAt: null,
        breakdown: [],
        error: (error as Error).message,
      };
    }
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
    const [reconciliation, semanticExtractors, receiptPaymentLocks, receiptPaymentDaily] = await Promise.all([
      this.financeReconciliationOverview(),
      this.financeSemanticExtractorsOverview(),
      this.financeReceiptPaymentDateStatusLockOverview(),
      this.financeReceiptPaymentDailyReconciliationOverview(),
    ]);
    const extractorByKey = new Map(semanticExtractors.extractors.map((item) => [item.key, item]));
    const dailyByKey = new Map(receiptPaymentDaily.metrics.map((item) => [item.key, item]));
    const metrics = reconciliation.items.map((item) => this.buildFinanceReadModelMetric(
      item,
      extractorByKey.get(item.key),
      dailyByKey.get(item.key as ReceiptPaymentDailyReconciliationMetric['key']),
    ));
    const statusCounts = metrics.reduce<Record<FinanceReadModelStatus, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<FinanceReadModelStatus, number>);
    const p0Blocked = metrics.filter((item) => item.priority === 'P0' && !['AUTHORITY_READY', 'READONLY_READY'].includes(item.status)).length;
    const hold = statusCounts.HOLD || 0;
    const reportEndpointRepairRequired = metrics.some((item) => (
      ['SUBJECT_BALANCE', 'BALANCE_SHEET', 'INCOME_STATEMENT'].includes(item.key)
      && item.status === 'WAITING_SAMPLE'
    ));
    const receiptPaymentLockReady = receiptPaymentLocks.locks.every((item) => item.status === 'LOCKED');
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
        nextGate: reportEndpointRepairRequired
          ? 'CHANJET_REPORT_ENDPOINT_PARAMETER_REPAIR'
          : receiptPaymentLockReady
            ? 'CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING'
            : 'CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK',
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

  async financeSubjectBalanceReadonlyReportOverview(): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    summary: {
      totalReports: number;
      readonlyReady: number;
      blockedMapping: number;
      waitingSample: number;
      hold: number;
      totalRows: number;
      nextGate: string;
    };
    reports: FinanceReadonlyStatementReport[];
    guardrails: Record<string, boolean | string>;
  }> {
    const readModel = await this.financeReadModelOverview();
    const metricByKey = new Map(readModel.metrics.map((metric) => [metric.key, metric]));
    const definitions: Array<{
      reportKey: FinanceReadonlyStatementReport['reportKey'];
      reportLabel: string;
      entityType: FinanceReadonlyStatementReport['entityType'];
      displayRule: string;
      nextAction: string;
    }> = [
      {
        reportKey: 'SUBJECT_BALANCE',
        reportLabel: '科目余额表',
        entityType: 'GL_BALANCE',
        displayRule: '按账套、期间、科目维度展示好业财只读科目余额行；只作为财务对账证据，不覆盖 ERP 业务明细。',
        nextAction: '继续对齐 ERP 科目、费用类型、现金账户与好业财科目编码，形成差异对账中心。',
      },
      {
        reportKey: 'BALANCE_SHEET',
        reportLabel: '资产负债表',
        entityType: 'BALANCE_SHEET',
        displayRule: '按账套、期间、报表项目展示资产负债表只读行；只用于管理报表校验，不写 ERP 事实表。',
        nextAction: '锁定行次、报表项目、期初/期末金额字段后，再进入财务首页关键项对齐。',
      },
      {
        reportKey: 'INCOME_STATEMENT',
        reportLabel: '利润表',
        entityType: 'INCOME_STATEMENT',
        displayRule: '按账套、期间、利润表项目展示只读行；只作为经营报表证据，不替代 ERP 销售/POS 明细。',
        nextAction: '锁定本期金额、累计金额、期间字段后，再进入利润表关键项对齐。',
      },
    ];

    const reports = await Promise.all(definitions.map(async (definition) => {
      const metric = metricByKey.get(definition.reportKey);
      const storedRows = await this.entitySnapshotRepo.find({
        where: { entityType: definition.entityType },
        order: { updatedAt: 'DESC' },
        take: 100,
      });
      const rows = storedRows.filter((row) => !getChanjetBusinessFailure(row.rawData));
      const latestPulledAt = rows.reduce<string | null>(
        (latest, row) => this.maxIso(latest, row.updatedAt ? String(row.updatedAt) : null),
        metric?.latestPulledAt || null,
      );
      const status = this.buildReadonlyStatementReportStatus(metric, rows.length);
      const blockerReasons = [
        ...(rows.length === 0 ? ['missing_chanjet_report_samples'] : []),
        ...((metric?.missingRequiredFields || []).length ? [`missing_required_fields:${metric?.missingRequiredFields.slice(0, 8).join('/')}`] : []),
        ...(!metric || ['BLOCKED_MAPPING', 'NEED_MANUAL_REVIEW'].includes(metric.status) ? ['read_model_not_ready_for_primary_finance_card'] : []),
        ...(metric?.status === 'HOLD' ? ['read_model_hold'] : []),
      ];
      return {
        reportKey: definition.reportKey,
        reportLabel: definition.reportLabel,
        entityType: definition.entityType,
        status,
        sampleRows: rows.length,
        latestPulledAt,
        displayRule: definition.displayRule,
        selectedValueFields: metric?.selectedValueFields || [],
        missingRequiredFields: metric?.missingRequiredFields || [],
        blockerReasons,
        rows: rows.map((row) => ({
          rowId: row.id,
          rowKey: row.externalCode || row.externalId || row.externalName || `${row.entityType}-${row.id}`,
          rowName: row.externalName || row.externalCode || row.externalId || row.entityType,
          bookId: row.bookId,
          period: row.period,
          status: row.status,
          amount: Number.isFinite(Number(row.amount)) ? Number(row.amount) : null,
          currency: row.currency,
          latestPulledAt: row.updatedAt ? row.updatedAt.toISOString() : null,
          rawEvidenceExcerpt: this.compactChanjetRawEvidence(row.rawData),
        })),
        nextAction: blockerReasons.length ? metric?.nextAction || definition.nextAction : definition.nextAction,
      };
    }));

    const statusCounts = reports.reduce<Record<FinanceReadonlyStatementReportStatus, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<FinanceReadonlyStatementReportStatus, number>);
    const hold = statusCounts.HOLD || 0;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : reports.every((item) => item.status === 'READONLY_READY') ? 'GO' : 'GO_WITH_CONDITIONS',
      summary: {
        totalReports: reports.length,
        readonlyReady: statusCounts.READONLY_READY || 0,
        blockedMapping: statusCounts.BLOCKED_MAPPING || 0,
        waitingSample: statusCounts.WAITING_SAMPLE || 0,
        hold,
        totalRows: reports.reduce((sum, item) => sum + item.rows.length, 0),
        nextGate: 'CHANJET_P4_VOUCHER_DRAFT_PREP',
      },
      reports,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        dbWrite: false,
        primaryFinanceCardSwitch: false,
        rule: '本接口只读 ERP 好业财中间层，展示科目余额表/资产负债表/利润表行级证据；不得写好业财，不得推凭证，不得静默覆盖 ERP 财务卡片。',
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

  async financeReceiptPaymentDailyReconciliationOverview(businessDate?: string): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    businessDate: string;
    summary: {
      totalMetrics: number;
      authorityReady: number;
      waitingSample: number;
      hold: number;
      effectiveRows: number;
      excludedRows: number;
      nextGate: string;
    };
    metrics: ReceiptPaymentDailyReconciliationMetric[];
    guardrails: Record<string, boolean | string>;
  }> {
    const targetDate = this.normalizeReceiptPaymentBusinessDate(businessDate);
    const definitions: Array<{
      key: ReceiptPaymentDailyReconciliationMetric['key'];
      label: string;
      entityType: ReceiptPaymentDailyReconciliationMetric['entityType'];
      direction: ReceiptPaymentDailyReconciliationMetric['direction'];
    }> = [
      { key: 'TODAY_RECEIPT', label: '今日收款', entityType: 'AR_RECEIPT', direction: 'RECEIPT' },
      { key: 'TODAY_PAYMENT', label: '今日付款', entityType: 'AP_PAYMENT', direction: 'PAYMENT' },
    ];
    const metrics = await Promise.all(definitions.map(async (definition) => {
      const storedRows = await this.entitySnapshotRepo.find({
        where: { entityType: definition.entityType },
        order: { updatedAt: 'DESC' },
        take: 10000,
      });
      const deduped = new Map<string, ChanjetEntitySnapshotEntity>();
      for (const row of storedRows) {
        if (getChanjetBusinessFailure(row.rawData)) continue;
        const rowKey = `${row.bookId || ''}:${row.entityType}:${row.externalId || row.externalCode || row.id}`;
        if (!deduped.has(rowKey)) deduped.set(rowKey, row);
      }
      const rows = [...deduped.values()];
      const latestPulledAt = rows.reduce<string | null>(
        (latest, row) => this.maxIso(latest, row.updatedAt ? String(row.updatedAt) : null),
        null,
      );
      const excludedByStatus: Record<string, number> = {};
      let invalidContractRows = 0;
      let businessDateRows = 0;
      let effectiveRows = 0;
      let approvedDateEvidenceRows = 0;
      let amount = 0;
      for (const row of rows) {
        const raw = row.rawData || {};
        const rowDate = typeof raw.bizDate === 'string' ? raw.bizDate.trim() : '';
        const status = typeof raw.voucherStatusEnum === 'string' ? raw.voucherStatusEnum.trim().toUpperCase() : '';
        if (typeof raw.approvedDate === 'string' && raw.approvedDate.trim()) approvedDateEvidenceRows += 1;
        // A missing business date is always unsafe because the row cannot be assigned
        // to or excluded from the requested day. Other fields are only material once
        // the row belongs to that day; historical rows must not block today's card.
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rowDate)) {
          invalidContractRows += 1;
          continue;
        }
        if (rowDate !== targetDate) continue;
        businessDateRows += 1;
        if (!status) {
          invalidContractRows += 1;
          continue;
        }
        if (status !== 'EFFECTIVE') {
          excludedByStatus[status] = (excludedByStatus[status] || 0) + 1;
          continue;
        }
        const rawAmount = raw.totalAmount;
        const parsedAmount = typeof rawAmount === 'number' || typeof rawAmount === 'string'
          ? Number(rawAmount)
          : Number.NaN;
        if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
          invalidContractRows += 1;
          continue;
        }
        effectiveRows += 1;
        amount += parsedAmount;
      }
      const latestTimestamp = latestPulledAt ? Date.parse(latestPulledAt) : Number.NaN;
      const fresh = Number.isFinite(latestTimestamp) && (Date.now() - latestTimestamp) <= 24 * 60 * 60 * 1000;
      const status: ReceiptPaymentDailyReconciliationStatus = rows.length === 0
        ? 'WAITING_SAMPLE'
        : invalidContractRows > 0 || !fresh
          ? 'HOLD'
          : 'AUTHORITY_READY';
      const readyForCardAuthority = status === 'AUTHORITY_READY';
      const excludedRows = businessDateRows - effectiveRows;
      return {
        ...definition,
        businessDate: targetDate,
        status,
        sourceRows: rows.length,
        businessDateRows,
        effectiveRows,
        excludedRows,
        excludedByStatus,
        invalidContractRows,
        approvedDateEvidenceRows,
        amount: readyForCardAuthority ? Number(amount.toFixed(2)) : null,
        latestPulledAt,
        sourceFields: {
          businessDate: 'rawData.bizDate' as const,
          status: 'rawData.voucherStatusEnum' as const,
          amount: 'rawData.totalAmount' as const,
          direction: 'entity_type_contract' as const,
        },
        readyForCardAuthority,
        reason: rows.length === 0
          ? `${definition.entityType} 没有可用只读镜像样本。`
          : invalidContractRows > 0
            ? `${invalidContractRows} 条镜像缺少 bizDate，或目标业务日缺少 voucherStatusEnum / EFFECTIVE totalAmount，已 fail-closed。`
            : !fresh
              ? '收付款镜像超过 24 小时未刷新，禁止作为今日卡片权威值。'
              : `按 bizDate=${targetDate} 且 voucherStatusEnum=EFFECTIVE 汇总；其余状态全部排除。`,
        nextAction: readyForCardAuthority
          ? '保持每日只读对账并显示 ERP 辅助差异；禁止将 SUBMITTED、未知状态或累计金额混入今日卡片。'
          : rows.length === 0
            ? '执行好业财全量只读同步后重跑本 Gate。'
            : '修复镜像字段契约或刷新过期镜像后重跑本 Gate。',
      } satisfies ReceiptPaymentDailyReconciliationMetric;
    }));
    const hold = metrics.filter((metric) => metric.status === 'HOLD').length;
    const waitingSample = metrics.filter((metric) => metric.status === 'WAITING_SAMPLE').length;
    const authorityReady = metrics.filter((metric) => metric.readyForCardAuthority).length;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : authorityReady === metrics.length ? 'GO' : 'GO_WITH_CONDITIONS',
      businessDate: targetDate,
      summary: {
        totalMetrics: metrics.length,
        authorityReady,
        waitingSample,
        hold,
        effectiveRows: metrics.reduce((sum, metric) => sum + metric.effectiveRows, 0),
        excludedRows: metrics.reduce((sum, metric) => sum + metric.excludedRows, 0),
        nextGate: authorityReady === metrics.length
          ? 'CHANJET_P3_CASH_BALANCE_FIELD_LOCK'
          : 'CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION_REPAIR',
      },
      metrics,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        dbWrite: false,
        businessDateField: 'rawData.bizDate',
        effectiveStatus: 'EFFECTIVE',
        excludedStatuses: 'SUBMITTED_and_all_non_EFFECTIVE',
        amountField: 'rawData.totalAmount',
        directionRule: 'AR_RECEIPT=RECEIPT; AP_PAYMENT=PAYMENT',
        rule: '本 Gate 只读 ERP 好业财镜像；今日卡片只汇总目标业务日的 EFFECTIVE 单据。未知、待审核、作废、红冲和字段异常一律 fail-closed。',
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
      authorityWiringVerified: boolean;
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
      comparisonComparable: boolean;
      comparisonReason: string;
      chanjetBreakdown: FinanceCurrencyBalance[];
      erpBreakdown: FinanceCurrencyBalance[];
      sourceEntityTypes: string[];
      latestPulledAt: string | null;
      businessDate?: string | null;
      receiptPaymentLockStatus?: string | null;
      readyForCardAuthority?: boolean | null;
      reason: string;
      nextAction: string;
    }>;
    guardrails: Record<string, boolean | string>;
  }> {
    const [readModel, receiptPaymentLocks, dailyReconciliation] = await Promise.all([
      this.financeReadModelOverview(),
      this.financeReceiptPaymentDateStatusLockOverview(),
      this.financeReceiptPaymentDailyReconciliationOverview(),
    ]);
    const metricByKey = new Map(readModel.metrics.map((metric) => [metric.key, metric]));
    const lockByKey = new Map(receiptPaymentLocks.locks.map((lock) => [lock.key, lock]));
    const dailyByKey = new Map(dailyReconciliation.metrics.map((metric) => [metric.key, metric]));
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
      const daily = definition.lockKey
        ? dailyByKey.get(definition.lockKey as 'TODAY_RECEIPT' | 'TODAY_PAYMENT')
        : null;
      const authorityEnabled = daily
        ? daily.readyForCardAuthority
        : Boolean(metric?.status === 'AUTHORITY_READY');
      const displayValue = daily
        ? (authorityEnabled ? daily.amount : null)
        : (authorityEnabled ? metric?.displayValue ?? null : null);
      const erpAuxiliaryValue = metric?.erpAuxiliaryValue ?? null;
      const comparisonComparable = metric?.comparisonComparable ?? true;
      return {
        cardKey: definition.cardKey,
        label: definition.label,
        readModelKey: definition.readModelKey,
        status: daily?.status || metric?.status || 'WAITING_SAMPLE',
        authorityEnabled,
        displayValue,
        erpAuxiliaryValue,
        diff: comparisonComparable && authorityEnabled && displayValue !== null && erpAuxiliaryValue !== null
          ? displayValue - erpAuxiliaryValue
          : null,
        comparisonComparable,
        comparisonReason: metric?.comparisonReason || '两端已使用同一汇总口径，可计算差异。',
        chanjetBreakdown: metric?.chanjetBreakdown || [],
        erpBreakdown: metric?.erpBreakdown || [],
        sourceEntityTypes: daily ? [daily.entityType] : metric?.sourceEntityTypes || [],
        latestPulledAt: daily?.latestPulledAt || metric?.latestPulledAt || null,
        businessDate: daily?.businessDate || null,
        receiptPaymentLockStatus: lock?.status || null,
        readyForCardAuthority: daily?.readyForCardAuthority ?? lock?.readyForCardAuthority ?? null,
        reason: !comparisonComparable
          ? metric?.comparisonReason || '两端口径不可直接比较。'
          : authorityEnabled
          ? daily
            ? `已按 ${daily.businessDate} 业务日与 EFFECTIVE 状态完成只读对账，可接入主卡片并保留 ERP 辅助差异。`
            : '已达到 AUTHORITY_READY，可接入主卡片，并保留 ERP 辅助差异。'
          : daily?.reason || lock?.reason || metric?.reason || '尚未达到 AUTHORITY_READY，主卡片必须保留 ERP 值。',
        nextAction: !comparisonComparable
          ? '完成资金账户映射和汇率口径锁定；当前按币种并列展示，禁止汇总求差。'
          : authorityEnabled
          ? daily
            ? '每日重跑业务日对账，SUBMITTED 和所有非 EFFECTIVE 状态保持排除。'
            : '在财务卡片标明好业财权威口径，并展示 ERP 辅助差异。'
          : daily?.nextAction || lock?.nextAction || metric?.nextAction || '补齐好业财只读样本、语义锁或系统确认。',
      };
    });
    const hold = cards.filter((card) => card.status === 'HOLD').length;
    const authorityWiringVerified = ['arOpen', 'apOpen'].every((cardKey) => (
      cards.some((card) => card.cardKey === cardKey && card.authorityEnabled)
    ));
    const receiptPaymentDailyReconciliationRequired = cards.some((card) => (
      ['todayInflow', 'todayOutflow'].includes(card.cardKey)
      && card.receiptPaymentLockStatus === 'LOCKED'
      && !card.authorityEnabled
    ));
    const cashBalanceFieldLockRequired = cards.some((card) => (
      card.cardKey === 'cashBalance' && !card.authorityEnabled
    ));
    const nextGate = hold > 0
      ? 'CHANJET_P3_FINANCE_CARD_AUTHORITY_HOLD_REPAIR'
      : !authorityWiringVerified
        ? 'CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING'
        : receiptPaymentDailyReconciliationRequired
          ? 'CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION'
          : cashBalanceFieldLockRequired
            ? 'CHANJET_P3_CASH_BALANCE_FIELD_LOCK'
            : 'CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW';
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : cards.some((card) => !card.authorityEnabled) ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalCards: cards.length,
        authorityReady: cards.filter((card) => card.authorityEnabled).length,
        readonlyReady: cards.filter((card) => card.status === 'READONLY_READY').length,
        blocked: cards.filter((card) => !card.authorityEnabled && card.status !== 'READONLY_READY').length,
        hold,
        authorityWiringVerified,
        nextGate,
      },
      cards,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        todayAmountAggregation: dailyReconciliation.summary.authorityReady === 2
          ? 'rawData.bizDate_target_day_plus_EFFECTIVE_plus_rawData.totalAmount'
          : 'blocked_until_daily_filter_and_status_reconciliation',
        rule: '财务卡片只接受 AUTHORITY_READY 的好业财 read model；今日收付款额外要求业务日对账 Gate READY。未锁定数据只能作为只读证据，不能替换 ERP 主值。',
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
        financeConfirmation: false,
        promotionRule: '已锁定 GL_BALANCE 最新期间 1001/1002 叶子科目本位币期末余额；字段、账套、新鲜度或唯一性异常时自动 fail-closed。',
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
        '系统已确认余额路径为 rawData.baseEndingBalance，原币路径为 rawData.endingBalance / currency。',
        '系统已确认余额时点为每个账套最新 YYYYMM 会计期间的期末余额。',
        '集团主值使用 CNY 本位币汇总，原币余额只做分组展示。',
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
        confirmationStatus: 'SYSTEM_CONFIRMED_AUTHORITY',
        approvedPrimarySource: 'CHANJET',
        erpSemanticDefinition: 'ERP 现金/银行账户余额是运营辅助值，只用于差异解释，不覆盖好业财总账口径。',
        chanjetSemanticDefinition: '好业财 GL_BALANCE 最新会计期间的 1001/1002 子级叶子科目是现金/银行总账余额权威源。',
        fieldMappingDecision: '`GL_BALANCE.rawData.baseEndingBalance` 对应 ERP 现金/银行主卡片的 CNY 本位币期末余额；`endingBalance` 仅用于原币分组。',
        calculationRule: '每个启用账套只取最新 YYYYMM 期间，精确筛选 1001/1002 叶子科目，汇总有符号 baseEndingBalance；缺字段、缺账套、重复或过期均 fail-closed。',
        displayRule: '主值显示好业财总账本位币余额，同时显示账期、拉取时间、ERP 辅助差异和原币分组。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: true,
        readonlyAllowed: true,
        nextAction: '保持每日只读同步、账期/字段漂移告警和 FIN_ACCOUNT 目录映射质量提升。',
      },
      TODAY_RECEIPT: {
        confirmationStatus: 'SYSTEM_CONFIRMED_AUTHORITY',
        approvedPrimarySource: 'CHANJET',
        erpSemanticDefinition: 'ERP 今日收款是按业务当日、有效收款状态和本地业务流水计算的运营日指标。',
        chanjetSemanticDefinition: '好业财 AR_RECEIPT 以 bizDate 为业务日，仅 EFFECTIVE 单据参与今日收款，totalAmount 为实收金额。',
        fieldMappingDecision: '好业财 `AR_RECEIPT.rawData.bizDate/voucherStatusEnum/totalAmount` 对应 ERP 今日收款卡片；方向由 AR_RECEIPT 实体契约确定。',
        calculationRule: '按目标 bizDate 精确过滤，只汇总 voucherStatusEnum=EFFECTIVE 的 totalAmount；SUBMITTED、未知、作废、红冲及字段异常全部排除。',
        displayRule: '主值显示好业财业务日有效收款，同时展示 ERP 当日现金流水辅助差异。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: true,
        readonlyAllowed: true,
        nextAction: '保持每日只读对账，监控字段漂移、镜像新鲜度及 ERP 辅助差异。',
      },
      TODAY_PAYMENT: {
        confirmationStatus: 'SYSTEM_CONFIRMED_AUTHORITY',
        approvedPrimarySource: 'CHANJET',
        erpSemanticDefinition: 'ERP 今日付款是按业务当日、有效付款状态和本地业务流水计算的运营日指标。',
        chanjetSemanticDefinition: '好业财 AP_PAYMENT 以 bizDate 为业务日，仅 EFFECTIVE 单据参与今日付款，totalAmount 为实付金额。',
        fieldMappingDecision: '好业财 `AP_PAYMENT.rawData.bizDate/voucherStatusEnum/totalAmount` 对应 ERP 今日付款卡片；方向由 AP_PAYMENT 实体契约确定。',
        calculationRule: '按目标 bizDate 精确过滤，只汇总 voucherStatusEnum=EFFECTIVE 的 totalAmount；SUBMITTED、未知、作废、红冲及字段异常全部排除。',
        displayRule: '主值显示好业财业务日有效付款，同时展示 ERP 当日现金流水辅助差异。',
        manualFinanceConfirmationRequired: false,
        authorityAllowed: true,
        readonlyAllowed: true,
        nextAction: '保持每日只读对账，监控字段漂移、镜像新鲜度及 ERP 辅助差异。',
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
      const configuredRule = confirmationRules[item.readModelKey] || {
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
      const authorityEvidenceReady = item.currentAuthorityEnabled || item.currentStatus === 'AUTHORITY_READY';
      const readonlyEvidenceReady = ['AUTHORITY_READY', 'READONLY_READY'].includes(item.currentStatus);
      const evidenceReady = configuredRule.confirmationStatus === 'SYSTEM_CONFIRMED_AUTHORITY'
        ? authorityEvidenceReady
        : configuredRule.confirmationStatus === 'SYSTEM_CONFIRMED_READONLY'
          ? readonlyEvidenceReady
          : true;
      const rule = evidenceReady
        ? configuredRule
        : {
            ...configuredRule,
            confirmationStatus: 'SYSTEM_BLOCKED_FROM_AUTHORITY' as const,
            approvedPrimarySource: 'ERP' as const,
            authorityAllowed: false,
            readonlyAllowed: false,
            displayRule: '运行态有效样本或必需字段未就绪，保持 ERP 主值并禁止只读报表升权。',
            nextAction: item.currentStatus === 'WAITING_SAMPLE'
              ? '修复好业财报表接口参数并重新执行只读镜像。'
              : item.recommendedAction,
          };
      const blockers = [
        ...item.blockers,
        ...(!evidenceReady ? [`runtime_evidence_not_ready:${item.currentStatus}`] : []),
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

  async financeCardSourceSwitchAuditOverview(): Promise<{
    generatedAt: string;
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    summary: {
      totalCards: number;
      switchReady: number;
      readonlyReportReady: number;
      switchBlocked: number;
      hold: number;
      unsafeSwitchesPrevented: number;
      nextGate: string;
    };
    sourceSwitches: FinanceCardSourceSwitchAuditItem[];
    guardrails: Record<string, boolean | string | number>;
  }> {
    const systemConfirmation = await this.financeCardSystemConfirmationOverview();
    const sourceSwitches = systemConfirmation.confirmations.map((item): FinanceCardSourceSwitchAuditItem => {
      if (item.confirmationStatus === 'SYSTEM_CONFIRMED_AUTHORITY') {
        return {
          switchId: `CHANJET-FIN-CARD-SOURCE-SWITCH-${item.readModelKey}`,
          cardKey: item.cardKey,
          label: item.label,
          readModelKey: item.readModelKey,
          confirmationStatus: item.confirmationStatus,
          sourceSwitchStatus: 'SWITCH_READY',
          primaryValueSource: 'CHANJET',
          financePageBehavior: '主卡片可显示好业财权威值；ERP 值必须作为辅助值和差异解释保留。',
          requiredUiEvidence: ['sourceBadge', 'latestPulledAt', 'erpAuxiliaryValue', 'diff', 'fieldMappingDecision'],
          mustShowErpAuxiliaryValue: true,
          mustShowDiff: true,
          canFeedPrimaryFinanceCard: true,
          canFeedReadonlyReport: true,
          blockerReason: null,
          validationRule: '只有该状态的卡片允许在 /finance2 主卡片用好业财作为 authoritativeValue。',
          evidence: item.evidence,
        };
      }
      if (item.confirmationStatus === 'SYSTEM_CONFIRMED_READONLY') {
        return {
          switchId: `CHANJET-FIN-CARD-SOURCE-SWITCH-${item.readModelKey}`,
          cardKey: item.cardKey,
          label: item.label,
          readModelKey: item.readModelKey,
          confirmationStatus: item.confirmationStatus,
          sourceSwitchStatus: 'READONLY_REPORT_READY',
          primaryValueSource: 'CHANJET_READONLY_REPORT',
          financePageBehavior: '可作为只读报表/对账行展示；不得伪装成 ERP 运营主卡片金额。',
          requiredUiEvidence: ['sourceBadge', 'latestPulledAt', 'reportPeriod', 'fieldMappingDecision', 'readonlyNotice'],
          mustShowErpAuxiliaryValue: false,
          mustShowDiff: false,
          canFeedPrimaryFinanceCard: false,
          canFeedReadonlyReport: true,
          blockerReason: 'system_confirmation_readonly_only',
          validationRule: '只读报表类数据不能被聚合卡片当作 ERP 经营事实或静默覆盖本地指标。',
          evidence: item.evidence,
        };
      }
      return {
        switchId: `CHANJET-FIN-CARD-SOURCE-SWITCH-${item.readModelKey}`,
        cardKey: item.cardKey,
        label: item.label,
        readModelKey: item.readModelKey,
        confirmationStatus: item.confirmationStatus,
        sourceSwitchStatus: item.confirmationStatus === 'HOLD' ? 'HOLD' : 'SWITCH_BLOCKED',
        primaryValueSource: 'ERP',
        financePageBehavior: '主卡片必须保留 ERP 主值；好业财只能显示为只读证据、差异或阻断原因。',
        requiredUiEvidence: ['sourceBadge', 'erpPrimaryValue', 'chanjetReadonlyValue', 'blockerReason'],
        mustShowErpAuxiliaryValue: false,
        mustShowDiff: true,
        canFeedPrimaryFinanceCard: false,
        canFeedReadonlyReport: true,
        blockerReason: item.blockers.join('; ') || item.displayRule,
        validationRule: '该卡片不允许切到好业财主值，即使好业财有镜像数据也必须 fail-closed 到 ERP 主值。',
        evidence: item.evidence,
      };
    });
    const hold = sourceSwitches.filter((item) => item.sourceSwitchStatus === 'HOLD').length;
    const switchBlocked = sourceSwitches.filter((item) => item.sourceSwitchStatus === 'SWITCH_BLOCKED').length;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 ? 'HOLD' : switchBlocked > 0 ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalCards: sourceSwitches.length,
        switchReady: sourceSwitches.filter((item) => item.sourceSwitchStatus === 'SWITCH_READY').length,
        readonlyReportReady: sourceSwitches.filter((item) => item.sourceSwitchStatus === 'READONLY_REPORT_READY').length,
        switchBlocked,
        hold,
        unsafeSwitchesPrevented: sourceSwitches.filter((item) => !item.canFeedPrimaryFinanceCard).length,
        nextGate: 'CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_UI_QA',
      },
      sourceSwitches,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        dbWrite: false,
        manualFinanceConfirmationRequired: 0,
        primarySwitchAllowedOnlyFor: 'SYSTEM_CONFIRMED_AUTHORITY',
        rule: '来源切换只允许 AR/AP 等 SYSTEM_CONFIRMED_AUTHORITY 卡片进入好业财主值；只读报表不进运营主卡片；阻断项继续 ERP 主值。',
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

  async financeFieldGapReviewGate() {
    const [fieldMappings, adapter, masterAlignment, readModel] = await Promise.all([
      this.fieldMappingRepo.find({
        order: { riskLevel: 'DESC', chanjetEndpoint: 'ASC', chanjetFieldPath: 'ASC' },
        take: 12000,
      }),
      this.financeP0AdapterOverview(),
      this.masterDataAlignmentOverview(),
      this.financeReadModelOverview(),
    ]);

    const reviewFields = fieldMappings.filter((mapping) => (
      mapping.erpDomain !== 'api_metadata'
      && mapping.matchStatus !== 'MATCHED'
      && mapping.decisionStatus !== 'REJECTED'
    ));
    const highReviewFields = reviewFields.filter((mapping) => ['HIGH', 'CRITICAL'].includes(mapping.riskLevel));
    const bucketReviews = FINANCE_ADAPTER_BUCKETS.map((bucket) => {
      const fields = reviewFields.filter((mapping) => this.fieldBelongsToFinanceBucket(mapping, bucket));
      const highFields = fields.filter((mapping) => ['HIGH', 'CRITICAL'].includes(mapping.riskLevel));
      const entityReady = adapter.buckets.find((item) => item.key === bucket.key);
      const adapterStatus = entityReady?.adapterStatus || 'WAITING_MIRROR_SYNC';
      // The raw catalog contains response envelope, nested and provider-specific fields.
      // Once a reviewed readonly adapter has a complete contract, those differences remain
      // visible for drift audit but must not be reported as missing ERP schema fields.
      const adapterContractCoversFields = adapterStatus !== 'WAITING_MIRROR_SYNC';
      const blockingFields = adapterContractCoversFields ? [] : fields;
      const blockingHighFields = blockingFields.filter((mapping) => ['HIGH', 'CRITICAL'].includes(mapping.riskLevel));
      const blockingReasons = [
        ...(adapterStatus === 'WAITING_MIRROR_SYNC' ? ['mirror_data_not_ready'] : []),
        ...(blockingHighFields.length ? [`high_or_critical_blocking_fields:${blockingHighFields.length}`] : []),
        ...(bucket.key === 'CHANJET_VOUCHER_LINE' ? ['voucher_writeback_remains_disabled'] : []),
        ...(bucket.key === 'CHANJET_COUNTERPARTY'
          && masterAlignment.summary.approvedCoverageRate < 0.9
          ? ['master_mapping_review_not_90_percent_approved']
          : []),
      ];
      const canImplementReadonly = Boolean(entityReady)
        && adapterStatus !== 'WAITING_MIRROR_SYNC'
        && bucket.key !== 'CHANJET_COUNTERPARTY';
      return {
        reviewId: `FIELD-GAP-${bucket.key}`,
        priority: bucket.priority,
        bucketKey: bucket.key,
        title: bucket.title,
        endpointKeys: bucket.endpointKeys,
        entityTypes: bucket.entityTypes,
        erpTarget: bucket.erpTarget,
        adapterScope: bucket.adapterScope,
        status: blockingReasons.length ? 'GO_WITH_CONDITIONS' : 'READY',
        canImplementReadonly,
        canPromoteToFinanceCard: readModel.metrics
          .some((metric) => metric.status === 'AUTHORITY_READY' && bucket.entityTypes.some((type) => metric.sourceEntityTypes.includes(type))),
        reviewFieldCount: fields.length,
        adapterCoveredFieldCount: adapterContractCoversFields ? fields.length : 0,
        openFieldCount: blockingFields.length,
        highOrCriticalOpenFieldCount: blockingHighFields.length,
        riskCounts: fields.reduce<Record<string, number>>((acc, mapping) => {
          acc[mapping.riskLevel] = (acc[mapping.riskLevel] || 0) + 1;
          return acc;
        }, {}),
        matchStatusCounts: fields.reduce<Record<string, number>>((acc, mapping) => {
          acc[mapping.matchStatus] = (acc[mapping.matchStatus] || 0) + 1;
          return acc;
        }, {}),
        blockingReasons,
        implementationContract: {
          allowedPaths: [
            'apps/api/src/modules/chanjet/**',
            'apps/api/src/modules/finance-v2/**',
            'apps/web/src/app/(admin)/**/chanjet/**',
            'docs/ops/**',
          ],
          forbiddenActions: [
            'write_chanjet',
            'delete_chanjet',
            'modify_chanjet',
            'voucher_push',
            'production_migration_without_gate',
            'silent_overwrite_erp_business_facts',
            'link_chanjet_aggregate_to_fin_ar_invoices',
          ],
          validationCommands: [
            'cd apps/api && ./node_modules/.bin/tsc --noEmit',
            'cd apps/web && ./node_modules/.bin/tsc --noEmit',
            'node scripts/ci/check-w5-closeout-gate.mjs',
          ],
          acceptanceCriteria: this.financeFieldGapAcceptanceCriteria(bucket.key),
        },
        sampleFields: highFields.slice(0, 12).map((mapping) => ({
          endpoint: mapping.chanjetEndpoint,
          fieldPath: mapping.chanjetFieldPath,
          chanjetType: mapping.chanjetType,
          erpDomain: mapping.erpDomain,
          erpTarget: [mapping.erpTable, mapping.erpField].filter(Boolean).join('.'),
          erpType: mapping.erpType,
          transformRule: mapping.transformRule,
          riskLevel: mapping.riskLevel,
          matchStatus: mapping.matchStatus,
          decisionStatus: mapping.decisionStatus,
          analysisNote: mapping.analysisNote,
        })),
      };
    });

    const p0OpenBuckets = bucketReviews.filter((item) => item.priority === 'P0' && item.highOrCriticalOpenFieldCount > 0);
    const readyReadonlyBuckets = bucketReviews.filter((item) => item.canImplementReadonly);
    const coveredReviewFields = bucketReviews.reduce((sum, item) => sum + item.adapterCoveredFieldCount, 0);
    const blockingOpenFields = bucketReviews.reduce((sum, item) => sum + item.openFieldCount, 0);
    const blockingHighFields = bucketReviews.reduce((sum, item) => sum + item.highOrCriticalOpenFieldCount, 0);
    return {
      generatedAt: new Date().toISOString(),
      decision: p0OpenBuckets.length ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalFields: fieldMappings.length,
        reviewFields: reviewFields.length,
        highOrCriticalReviewFields: highReviewFields.length,
        adapterCoveredReviewFields: coveredReviewFields,
        openFields: blockingOpenFields,
        highOrCriticalOpenFields: blockingHighFields,
        buckets: bucketReviews.length,
        p0Buckets: bucketReviews.filter((item) => item.priority === 'P0').length,
        p0OpenBuckets: p0OpenBuckets.length,
        readyReadonlyBuckets: readyReadonlyBuckets.length,
        nextGate: readyReadonlyBuckets.length
          ? 'CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION'
          : 'CHANJET_MASTER_MAPPING_AND_FIELD_REVIEW',
      },
      bucketReviews,
      recommendedExecutionOrder: bucketReviews
        .filter((item) => item.canImplementReadonly || item.priority === 'P0')
        .sort((a, b) => {
          const priority = { P0: 0, P1: 1 } as Record<string, number>;
          return (priority[a.priority] ?? 9) - (priority[b.priority] ?? 9)
            || b.highOrCriticalOpenFieldCount - a.highOrCriticalOpenFieldCount;
        })
        .map((item) => ({
          gateId: item.reviewId,
          title: item.title,
          recommendedAgent: item.bucketKey === 'CHANJET_COUNTERPARTY' ? 'A5-Data-Readiness + A2-Security-Regression-Gate' : 'A3-Backend-Critical-Path + A2-Security-Regression-Gate',
          action: item.canImplementReadonly
            ? 'implement_readonly_adapter_and_review_ui'
            : 'complete_mapping_review_before_code',
          approvalRequired: true,
        })),
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        productionDeploy: false,
        note: '字段缺口 Review Gate 只给出只读适配合同和实施顺序，不调用好业财写接口，不自动修改业务事实表。',
      },
    };
  }

  async financeReadonlyFieldAdaptersOverview(): Promise<ChanjetReadonlyFieldAdapterOverview> {
    const [storedVoucherRows, storedCounterpartyRows, counterpartyMappings] = await Promise.all([
      this.entitySnapshotRepo.find({
        where: { entityType: 'VOUCHER' },
        order: { updatedAt: 'DESC' },
        take: 120,
      }),
      this.entitySnapshotRepo.find({
        where: { entityType: 'CUSTOMER_SUPPLIER' },
        order: { updatedAt: 'DESC' },
        take: 200,
      }),
      this.mappingRepo.find({
        where: { mappingType: In(['CUSTOMER', 'SUPPLIER']) },
        order: { reviewStatus: 'ASC', updatedAt: 'DESC' },
        take: 3000,
      }),
    ]);
    const voucherRows = storedVoucherRows.filter((row) => !getChanjetBusinessFailure(row.rawData));
    const counterpartyRows = storedCounterpartyRows.filter((row) => !getChanjetBusinessFailure(row.rawData));

    const latestVoucher = voucherRows.reduce<string | null>(
      (latest, row) => this.maxIso(latest, row.updatedAt ? row.updatedAt.toISOString() : null),
      null,
    );
    const latestCounterparty = counterpartyRows.reduce<string | null>(
      (latest, row) => this.maxIso(latest, row.updatedAt ? row.updatedAt.toISOString() : null),
      null,
    );

    const voucherHeaderRows = voucherRows.slice(0, 60).map((row) => this.buildVoucherHeaderAdapterRow(row));
    const voucherLineRows = voucherRows
      .slice(0, 60)
      .flatMap((row) => this.buildVoucherLineAdapterRows(row))
      .slice(0, 160);
    const counterpartyAdapterRows = counterpartyRows
      .slice(0, 120)
      .map((row) => this.buildCounterpartyAdapterRow(row, counterpartyMappings));

    const headerMissing = this.requiredAdapterFields(voucherHeaderRows, [
      ['voucherId', 'voucher_id'],
      ['voucherNo', 'voucher_no'],
      ['voucherDate', 'voucher_date'],
      ['status', 'voucher_status'],
    ]);
    const lineMissing = voucherRows.length === 0
      ? ['voucher_sample']
      : voucherLineRows.length === 0
        ? ['voucher_line_items']
        : this.requiredAdapterFields(voucherLineRows, [
          ['subjectCode', 'subject_code'],
          ['subjectName', 'subject_name'],
          ['debitAmount', 'debit_amount'],
          ['creditAmount', 'credit_amount'],
        ]);
    const counterpartyMissing = this.requiredAdapterFields(counterpartyAdapterRows, [
      ['externalId', 'external_id'],
      ['externalName', 'external_name'],
      ['roleCandidate', 'counterparty_role'],
    ]);
    const approvedCounterpartyMappings = counterpartyMappings.filter((mapping) => mapping.reviewStatus === 'APPROVED').length;
    if (counterpartyRows.length > 0 && approvedCounterpartyMappings === 0) {
      counterpartyMissing.push('approved_customer_supplier_mapping');
    }

    const adapters: ChanjetReadonlyFieldAdapterOverview['adapters'] = [
      {
        adapterKey: 'CHANJET_VOUCHER_HEADER',
        title: '凭证头只读适配器',
        status: this.buildReadonlyAdapterStatus(voucherRows.length, headerMissing),
        sampleRows: voucherHeaderRows.length,
        latestPulledAt: latestVoucher,
        mappedFields: ['voucherId', 'voucherNo', 'bookId', 'period', 'voucherDate', 'postingDate', 'status', 'summary', 'maker', 'reviewer'],
        missingCriticalFields: headerMissing,
        sourceEntityTypes: ['VOUCHER'],
        endpointKeys: ['VOUCHER_SEARCH'],
        rows: voucherHeaderRows,
        nextAction: headerMissing.length
          ? `继续锁定凭证头字段: ${headerMissing.join(' / ')}。`
          : '凭证头字段已可只读展示；仍禁止生成或推送好业财凭证。',
      },
      {
        adapterKey: 'CHANJET_VOUCHER_LINE',
        title: '凭证明细只读适配器',
        status: this.buildReadonlyAdapterStatus(voucherRows.length, lineMissing),
        sampleRows: voucherLineRows.length,
        latestPulledAt: latestVoucher,
        mappedFields: ['lineNo', 'subjectCode', 'subjectName', 'summary', 'debitAmount', 'creditAmount', 'currency', 'counterpartyName', 'projectName', 'departmentName'],
        missingCriticalFields: lineMissing,
        sourceEntityTypes: ['VOUCHER'],
        endpointKeys: ['VOUCHER_SEARCH'],
        rows: voucherLineRows,
        nextAction: lineMissing.length
          ? `继续锁定凭证明细字段: ${lineMissing.join(' / ')}。`
          : '凭证明细可进入只读对账视图；借贷金额必须继续以字符串/decimal 保留精度。',
      },
      {
        adapterKey: 'CHANJET_COUNTERPARTY',
        title: '往来单位只读适配器',
        status: this.buildReadonlyAdapterStatus(counterpartyRows.length, counterpartyMissing),
        sampleRows: counterpartyAdapterRows.length,
        latestPulledAt: latestCounterparty,
        mappedFields: ['externalId', 'externalCode', 'externalName', 'roleCandidate', 'status', 'erpCandidateCode', 'erpCandidateName', 'mappingReviewStatus', 'confidence'],
        missingCriticalFields: counterpartyMissing,
        sourceEntityTypes: ['CUSTOMER_SUPPLIER'],
        endpointKeys: ['CUSTOMER_SUPPLIER'],
        rows: counterpartyAdapterRows,
        nextAction: counterpartyMissing.includes('approved_customer_supplier_mapping')
          ? '往来单位已可只读展示，但 CUSTOMER/SUPPLIER 映射未达到批准状态；业务页面不得自动采用。'
          : counterpartyMissing.length
            ? `继续锁定往来单位字段: ${counterpartyMissing.join(' / ')}。`
            : '往来单位只读适配已具备映射证据，可进入差异对账中心。',
      },
    ];

    const statusCounts = adapters.reduce<Record<ChanjetReadonlyAdapterStatus, number>>((acc, adapter) => {
      acc[adapter.status] = (acc[adapter.status] || 0) + 1;
      return acc;
    }, {} as Record<ChanjetReadonlyAdapterStatus, number>);
    const hold = statusCounts.HOLD || 0;
    const partial = statusCounts.PARTIAL || 0;
    const waitingSample = statusCounts.WAITING_SAMPLE || 0;
    const mappedFieldCount = adapters.reduce((sum, adapter) => sum + adapter.mappedFields.length, 0);
    const missingCriticalFieldCount = adapters.reduce((sum, adapter) => sum + adapter.missingCriticalFields.length, 0);
    const fieldCoverage = mappedFieldCount
      ? Math.max(0, (mappedFieldCount - missingCriticalFieldCount) / mappedFieldCount)
      : 0;
    return {
      generatedAt: new Date().toISOString(),
      decision: hold > 0 || waitingSample > 0 ? 'HOLD' : partial > 0 ? 'GO_WITH_CONDITIONS' : 'GO',
      summary: {
        totalAdapters: adapters.length,
        ready: statusCounts.READY || 0,
        partial,
        waitingSample,
        hold,
        voucherHeaderRows: voucherHeaderRows.length,
        voucherLineRows: voucherLineRows.length,
        counterpartyRows: counterpartyAdapterRows.length,
        fieldCoverage,
        nextGate: partial || waitingSample || hold
          ? 'CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC'
          : 'CHANJET_BUSINESS_FUSION_UI_PASS',
      },
      adapters,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        migration: false,
        dbWrite: false,
        ordinaryUserVisible: false,
        rule: '只读适配器只消费 ERP 中间层快照，输出管理员可审查的凭证头、凭证明细、往来单位合同；禁止写好业财、禁止推凭证、禁止静默覆盖 ERP 业务事实。',
      },
    };
  }

  async financeReadonlyCoverage() {
    const expectedEndpoints = PROBE_ENDPOINTS.filter((ep) => ep.mirrorDefault);
    const [evidence, fieldMappings] = await Promise.all([
      this.loadMirrorEvidence(),
      this.ds.query(
        `SELECT erp_domain, match_status, chanjet_endpoint
           FROM chanjet_erp_field_mapping`,
      ),
    ]);
    const validRawRows = evidence.snapshots.filter((row) => !getChanjetBusinessFailure(row.rawPayload));
    const validEntityRows = evidence.entities.filter((row) => !getChanjetBusinessFailure(row.rawData));
    const rawRows = expectedEndpoints.map((endpoint) => {
      const rows = validRawRows.filter((row) => row.endpointKey === endpoint.key);
      return {
        endpointKey: endpoint.key,
        snapshotCount: rows.length,
        rowCount: rows.reduce((sum, row) => sum + Number(row.rowCount || 0), 0),
        latestPulledAt: rows.reduce<string | null>(
          (latest, row) => this.maxIso(latest, row.pulledAt ? row.pulledAt.toISOString() : null),
          null,
        ),
      };
    });
    const entityTypes = [...new Set(expectedEndpoints.map((endpoint) => endpoint.entityType).filter(Boolean))] as string[];
    const entityRows = entityTypes.map((entityType) => {
      const rows = validEntityRows.filter((row) => row.entityType === entityType);
      return {
        entityType,
        entityCount: rows.length,
        amountSum: rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
        latestUpdatedAt: rows.reduce<string | null>(
          (latest, row) => this.maxIso(latest, row.updatedAt ? row.updatedAt.toISOString() : null),
          null,
        ),
      };
    });

    const rawByEndpoint = new Map(rawRows.map((row: any) => [String(row.endpointKey), row]));
    const entityByType = new Map(entityRows.map((row: any) => [String(row.entityType), row]));
    const latestJobByEndpoint = new Map<string, ChanjetMirrorEvidenceJob>();
    for (const job of evidence.jobs) {
      const key = job.endpointKey;
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

    const coveredEndpointKeys = new Set(endpointCoverage.filter((item) => item.covered).map((item) => item.key));
    const validBusinessFieldMappings = (fieldMappings as Array<Record<string, unknown>>).filter((mapping) => {
      if (String(mapping.erp_domain || '') === 'api_metadata') return false;
      const endpoint = expectedEndpoints.find((item) => {
        const prefix = item.path.split('{bookid}')[0];
        const chanjetEndpoint = String(mapping.chanjet_endpoint || '');
        return chanjetEndpoint === item.path || chanjetEndpoint.startsWith(prefix);
      });
      return Boolean(endpoint && coveredEndpointKeys.has(endpoint.key));
    });
    const fieldStatusCounts = validBusinessFieldMappings.reduce<Record<string, number>>((acc, row) => {
      const status = String(row.match_status || 'UNKNOWN');
      acc[status] = (acc[status] || 0) + 1;
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
      { cardKey: 'cashBalance', label: '现金 / 银行余额', endpoints: ['GL_BALANCE'], entityTypes: ['GL_BALANCE'] },
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
      accountBooks: evidence.books.map((book) => ({
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

  async productionReadinessOverview(): Promise<ChanjetProductionReadiness> {
    const now = Date.now();
    if (this.productionReadinessCache && this.productionReadinessCache.expiresAt > now) {
      return this.productionReadinessCache.value;
    }
    if (this.productionReadinessInFlight) {
      return this.productionReadinessInFlight;
    }
    const task = this.computeProductionReadinessOverview();
    this.productionReadinessInFlight = task;
    try {
      const value = await task;
      this.productionReadinessCache = {
        expiresAt: Date.now() + (this.runtimeOverviewCacheTtlMs || 30_000),
        value,
      };
      return value;
    } finally {
      if (this.productionReadinessInFlight === task) {
        this.productionReadinessInFlight = undefined;
      }
    }
  }

  private async computeProductionReadinessOverview(): Promise<ChanjetProductionReadiness> {
    // These aggregates can each contain thousands of mirror rows. Resolve them
    // sequentially and retain only the compact fields used by this endpoint so
    // the 512 MB production API container never holds every raw model at once.
    const baseline = await this.mirrorBaselineReadiness(24).then((value) => ({
      decision: value.decision,
      summary: value.summary,
    }));
    const accountBookGate = await this.accountBookMappingGate().then((value) => ({
      decision: value.decision,
      summary: value.summary,
      blockingIssues: value.blockingIssues,
    }));
    const masterAlignment = await this.masterDataAlignmentOverview().then((value) => ({
      summary: value.summary,
    }));
    const masterMappingReview = await this.masterDataMappingReview().then((value) => ({
      decision: value.decision,
      summary: value.summary,
    }));
    const coverage = await this.financeReadonlyCoverage().then((value) => ({
      summary: value.summary,
    }));
    const readModel = await this.financeReadModelOverview().then((value) => ({
      decision: value.decision,
      summary: value.summary,
    }));
    const cardAuthority = await this.financeCardAuthorityOverview().then((value) => ({
      decision: value.decision,
      summary: value.summary,
    }));
    const reconciliation = await this.financeReconciliationOverview().then((value) => ({
      decision: value.decision,
      summary: value.summary,
    }));
    const counterpartyCandidateCounts = await this.counterpartyMappingCandidates().then((value) => ({
      exact: value.candidates.filter((candidate) => (
        candidate.systemApprovalEligible && candidate.requiresApproval
      )).length,
      manual: value.candidates.filter((candidate) => (
        candidate.requiresApproval && !candidate.systemApprovalEligible
      )).length,
    }));
    const recentJobCounts = await this.listSyncJobs(100).then((jobs) => {
      const relevant = jobs.filter((job) => job.jobType === 'SNAPSHOT').slice(0, 50);
      return {
        total: relevant.length,
        success: relevant.filter((job) => job.status === 'SUCCESS').length,
      };
    });
    const tokenHealth = this.auth.diagnostics();
    const percent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;
    const mirrorFreshRate = percent(ratio(baseline.summary.freshTargets, baseline.summary.expectedTargets) * 100);
    const accountBookMappingRate = percent(ratio(
      accountBookGate.summary.validMappings,
      Math.max(accountBookGate.summary.enabledBooks, accountBookGate.summary.enabledMappings),
    ) * 100);
    const reviewedMappingRows = masterMappingReview.summary.exactMatches
      + masterMappingReview.summary.needMapping
      + masterMappingReview.summary.conflicts;
    const masterDataApprovedRate = percent(ratio(
      masterMappingReview.summary.exactMatches,
      reviewedMappingRows,
    ) * 100);
    const semanticCoverageRate = percent(coverage.summary.fieldCoverageRate * 100);
    const authorityReadyRate = percent(ratio(cardAuthority.summary.authorityReady, cardAuthority.summary.totalCards) * 100);
    const recentJobSuccessRate = percent(ratio(
      recentJobCounts.success,
      recentJobCounts.total,
    ) * 100);
    const exactSystemApprovalCandidates = masterMappingReview.summary.exactMatches
      + counterpartyCandidateCounts.exact;
    const manualMappingCandidates = masterMappingReview.summary.needMapping
      + masterMappingReview.summary.conflicts
      + counterpartyCandidateCounts.manual;
    const readModelReadyRate = percent(ratio(
      readModel.summary.authorityReady + readModel.summary.readonlyReady,
      readModel.summary.totalMetrics,
    ) * 100);
    const reconciliationSafeRate = percent(ratio(
      reconciliation.summary.ok + reconciliation.summary.warn,
      reconciliation.summary.totalItems,
    ) * 100);
    const tokenEntries = Object.values(tokenHealth.tokens || {});
    const tokenReady = Boolean(tokenHealth.configured && tokenEntries.length > 0 && tokenEntries.every((token) => token.valid));
    const reliabilityScore = percent((recentJobSuccessRate * 0.7) + (tokenReady ? 30 : 0));

    const phases: ChanjetProductionReadiness['phases'] = [
      {
        key: 'P0', title: '全量只读镜像', score: mirrorFreshRate,
        status: baseline.decision === 'HOLD' ? 'HOLD' : mirrorFreshRate === 100 ? 'READY' : 'READY_WITH_CONDITIONS',
        evidence: [`24h 新鲜目标 ${baseline.summary.freshTargets}/${baseline.summary.expectedTargets}`, `缺失 ${baseline.summary.missingTargets}，过期 ${baseline.summary.staleTargets}`],
        nextAction: baseline.summary.nextGate,
      },
      {
        key: 'P1', title: '账套与主数据映射', score: percent((accountBookMappingRate + masterDataApprovedRate) / 2),
        status: accountBookGate.decision === 'HOLD' || masterMappingReview.summary.conflicts > 0 ? 'HOLD' : masterDataApprovedRate >= 90 && manualMappingCandidates === 0 ? 'READY' : 'READY_WITH_CONDITIONS',
        evidence: [
          `账套映射 ${accountBookMappingRate}%`,
          `有效主数据精确匹配 ${masterMappingReview.summary.exactMatches}/${reviewedMappingRows}`,
          `待映射 ${masterMappingReview.summary.needMapping}，冲突 ${masterMappingReview.summary.conflicts}`,
          `可进入精确映射批准 Gate ${exactSystemApprovalCandidates}`,
        ],
        nextAction: masterMappingReview.summary.conflicts > 0
          ? 'CHANJET_P2_MASTER_DATA_MAPPING_CONFLICT_REPAIR'
          : exactSystemApprovalCandidates
            ? 'CHANJET_P2_EXACT_MAPPING_APPROVAL_GATE'
            : masterAlignment.summary.nextGate,
      },
      {
        key: 'P2', title: '标准只读模型', score: percent((semanticCoverageRate + readModelReadyRate) / 2),
        status: readModel.decision === 'HOLD' ? 'HOLD' : readModelReadyRate === 100 ? 'READY' : 'READY_WITH_CONDITIONS',
        evidence: [`字段语义覆盖 ${semanticCoverageRate}%`, `read model 可用 ${readModelReadyRate}%`],
        nextAction: readModel.summary.nextGate,
      },
      {
        key: 'P3', title: '财务卡片权威口径', score: authorityReadyRate,
        status: cardAuthority.decision === 'HOLD' ? 'HOLD' : authorityReadyRate === 100 ? 'READY' : 'READY_WITH_CONDITIONS',
        evidence: [`权威卡片 ${cardAuthority.summary.authorityReady}/${cardAuthority.summary.totalCards}`, '未达权威条件时保持 ERP 主值并显式展示差异'],
        nextAction: cardAuthority.summary.nextGate,
      },
      {
        key: 'P4', title: '差异对账中心', score: reconciliationSafeRate,
        status: reconciliation.decision === 'HOLD' ? 'HOLD' : reconciliationSafeRate >= 95 ? 'READY' : 'READY_WITH_CONDITIONS',
        evidence: [`安全对账 ${reconciliation.summary.ok + reconciliation.summary.warn}/${reconciliation.summary.totalItems}`, `不一致 ${reconciliation.summary.mismatch}，待映射 ${reconciliation.summary.needMapping}`],
        nextAction: reconciliation.summary.nextGate,
      },
      {
        key: 'P5', title: '生产同步韧性', score: reliabilityScore,
        status: tokenReady && recentJobSuccessRate >= 95 ? 'READY' : tokenHealth.configured ? 'READY_WITH_CONDITIONS' : 'HOLD',
        evidence: [`最近镜像作业成功率 ${recentJobSuccessRate}%`, `Token 健康 ${tokenReady ? 'READY' : 'NOT_READY'}`, '失败最多重试 3 次且仍失败转 HOLD/告警'],
        nextAction: tokenReady ? 'KEEP_SCHEDULED_READONLY_SYNC' : 'REPAIR_CHANJET_TOKEN_HEALTH',
      },
      {
        key: 'P6', title: '管理员融合边界', score: 100,
        status: 'READY',
        evidence: ['中间层控制台受 MENU_SETTINGS_CHANJET 门禁保护', '普通业务用户只消费经过权威门禁的业务视图'],
        nextAction: 'KEEP_MIDDLE_LAYER_ADMIN_ONLY',
      },
    ];
    const blockers: string[] = [];
    const conditions: string[] = [];
    if (!tokenHealth.configured) blockers.push('好业财认证配置不完整');
    if (!tokenReady) blockers.push('没有可证明有效的运行态 token');
    if (baseline.summary.providerPermissionHolds > 0) {
      blockers.push(`好业财 openToken 对 ${baseline.summary.providerPermissionHolds} 个只读镜像目标缺少接口权限`);
    } else if (baseline.summary.missingTargets > 0) {
      blockers.push(`缺失 ${baseline.summary.missingTargets} 个只读镜像目标`);
    }
    if (accountBookGate.decision === 'HOLD') blockers.push(...accountBookGate.blockingIssues);
    if (manualMappingCandidates > 0) conditions.push(`${manualMappingCandidates} 个主数据候选仍需映射或复核`);
    if (semanticCoverageRate < 90) conditions.push(`业务字段语义覆盖仅 ${semanticCoverageRate}%`);
    if (authorityReadyRate < 100) conditions.push(`财务卡片权威覆盖 ${authorityReadyRate}%，未就绪卡片继续使用 ERP 主值`);
    if (recentJobSuccessRate < 100) conditions.push(`最近只读同步成功率 ${recentJobSuccessRate}%`);
    const score = percent(phases.reduce((sum, phase) => sum + phase.score, 0) / phases.length);
    const decision: ChanjetProductionReadiness['decision'] = blockers.length
      ? 'HOLD'
      : score >= 95 && phases.every((phase) => phase.status === 'READY')
        ? 'GO'
        : 'GO_WITH_CONDITIONS';
    return {
      generatedAt: new Date().toISOString(),
      decision,
      score,
      grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D',
      summary: {
        mirrorFreshRate,
        accountBookMappingRate,
        masterDataApprovedRate,
        semanticCoverageRate,
        authorityReadyRate,
        recentJobSuccessRate,
        exactSystemApprovalCandidates,
        manualMappingCandidates,
        nextGate: blockers.length
          ? baseline.summary.nextGate
          : exactSystemApprovalCandidates
            ? 'CHANJET_P2_EXACT_MAPPING_APPROVAL_GATE'
            : 'CHANJET_CONTINUOUS_READONLY_RECONCILIATION',
      },
      phases,
      blockers,
      conditions,
      tokenHealth,
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        ordinaryUserVisible: false,
        exactMappingSystemConfirmation: 'code+name+company+active only',
        rule: '好业财只读镜像是财务权威候选；只有通过字段语义、映射、时效和卡片权威 Gate 后才可作为主值，所有差异必须显式保留。',
      },
    };
  }

  /**
   * 唯一实时状态入口。历史 docs/ops/runs 只保留审计价值，不得覆盖本端点的当前结论。
   */
  async currentStateOverview(): Promise<ChanjetCurrentStateOverview> {
    const now = Date.now();
    if (this.currentStateCache && this.currentStateCache.expiresAt > now) {
      return this.currentStateCache.value;
    }
    if (this.currentStateInFlight) {
      return this.currentStateInFlight;
    }
    const task = this.computeCurrentStateOverview();
    this.currentStateInFlight = task;
    try {
      const value = await task;
      this.currentStateCache = {
        expiresAt: Date.now() + (this.runtimeOverviewCacheTtlMs || 30_000),
        value,
      };
      return value;
    } finally {
      if (this.currentStateInFlight === task) {
        this.currentStateInFlight = undefined;
      }
    }
  }

  private async computeCurrentStateOverview(): Promise<ChanjetCurrentStateOverview> {
    const readiness = await this.productionReadinessOverview();
    const readModel = await this.financeReadModelOverview().then((value) => ({
      decision: value.decision,
      summary: value.summary,
    }));
    const cardAuthority = await this.financeCardAuthorityOverview().then((value) => ({
      decision: value.decision,
      summary: value.summary,
    }));
    const masterMappingReview = await this.masterDataMappingReview().then((value) => ({
      decision: value.decision,
      summary: value.summary,
    }));
    const reconciliation = await this.financeReconciliationOverview().then((value) => ({
      summary: value.summary,
    }));
    const overview = await this.overview().then((value) => ({
      voucherDrafts: value.voucherDrafts,
      pushReadyDrafts: value.pushReadyDrafts,
      fieldMappings: value.fieldMappings,
      unmappedFields: value.unmappedFields,
    }));
    const unsafePushAllowed = await this.voucherDraftRepo.count({ where: { pushAllowed: true } });
    const phase = (key: ChanjetProductionReadiness['phases'][number]['key']) =>
      readiness.phases.find((item) => item.key === key);
    const reconciliationOpen = reconciliation.summary.mismatch
      + reconciliation.summary.needMapping
      + reconciliation.summary.needManualReview
      + reconciliation.summary.hold;
    const p0 = phase('P0');
    const p2 = phase('P2');
    const p4 = phase('P4');
    const p5 = phase('P5');
    const financeUiScore = cardAuthority.summary.totalCards
      ? Math.round(((cardAuthority.summary.authorityReady + cardAuthority.summary.readonlyReady) / cardAuthority.summary.totalCards) * 100)
      : 0;
    const reviewedMappingRows = masterMappingReview.summary.exactMatches
      + masterMappingReview.summary.needMapping
      + masterMappingReview.summary.conflicts;
    const mappingScore = reviewedMappingRows
      ? Math.round((masterMappingReview.summary.exactMatches / reviewedMappingRows) * 100)
      : 0;
    const implementationOrder: ChanjetCurrentStateOverview['implementationOrder'] = [
      {
        phase: 'P0',
        title: '全量只读镜像基线',
        status: p0?.status || 'HOLD',
        score: p0?.score || 0,
        evidence: p0?.evidence || ['缺少实时镜像证据'],
        nextAction: p0?.nextAction || 'CHANJET_MIRROR_BASELINE_REPAIR',
      },
      {
        phase: 'P1',
        title: '财务 Read Model 与卡片权威',
        status: readModel.decision === 'HOLD'
          ? 'HOLD'
          : cardAuthority.summary.authorityReady + cardAuthority.summary.readonlyReady === cardAuthority.summary.totalCards
            ? 'READY'
            : 'READY_WITH_CONDITIONS',
        score: financeUiScore,
        evidence: [
          `权威主卡片 ${cardAuthority.summary.authorityReady}/${cardAuthority.summary.totalCards}`,
          `只读可用 ${cardAuthority.summary.readonlyReady}/${cardAuthority.summary.totalCards}`,
          `P0 read model 阻断 ${readModel.summary.p0Blocked}`,
        ],
        nextAction: cardAuthority.summary.nextGate,
      },
      {
        phase: 'P2',
        title: '公司/往来/科目/项目/资金账户映射',
        status: masterMappingReview.decision === 'HOLD'
          ? 'HOLD'
          : masterMappingReview.summary.needMapping === 0
            ? 'READY'
            : 'READY_WITH_CONDITIONS',
        score: mappingScore,
        evidence: [
          `有效源行 ${masterMappingReview.summary.validSourceRows}`,
          `精确匹配 ${masterMappingReview.summary.exactMatches}`,
          `待映射 ${masterMappingReview.summary.needMapping}`,
          `冲突 ${masterMappingReview.summary.conflicts}`,
        ],
        nextAction: masterMappingReview.summary.nextGate,
      },
      {
        phase: 'P3',
        title: '普通业务页面无感融合',
        status: cardAuthority.decision === 'HOLD' ? 'HOLD' : financeUiScore === 100 ? 'READY' : 'READY_WITH_CONDITIONS',
        score: financeUiScore,
        evidence: [
          '管理员中间层继续受 MENU_SETTINGS_CHANJET 门禁保护',
          '普通用户只消费财务业务接口中的 authority/fallback/diff 合同',
          `已具备来源合同的卡片 ${cardAuthority.summary.authorityReady + cardAuthority.summary.readonlyReady}/${cardAuthority.summary.totalCards}`,
        ],
        nextAction: 'KEEP_ADMIN_MIDDLE_LAYER_HIDDEN_AND_PROMOTE_SAFE_READ_MODELS',
      },
      {
        phase: 'P4',
        title: '增量同步、SLO、漂移与失败告警',
        status: p5?.status || 'HOLD',
        score: p5?.score || 0,
        evidence: p5?.evidence || ['缺少同步韧性证据'],
        nextAction: p5?.nextAction || 'REPAIR_CHANJET_SYNC_RELIABILITY',
      },
      {
        phase: 'P5',
        title: '凭证写回准备（外部写入关闭）',
        status: unsafePushAllowed > 0 ? 'HOLD' : 'READY_WITH_CONDITIONS',
        score: unsafePushAllowed > 0 ? 0 : 90,
        evidence: [
          `凭证草稿 ${overview.voucherDrafts}`,
          `PUSH_READY 候选 ${overview.pushReadyDrafts}`,
          `错误开启 push_allowed ${unsafePushAllowed}`,
          '复式记账校验、状态机和幂等候选已在 ERP 中间层执行；好业财写接口仍不存在',
        ],
        nextAction: unsafePushAllowed > 0
          ? 'REPAIR_LEGACY_PUSH_ALLOWED_FLAGS_WITH_SEPARATE_DB_GATE'
          : 'KEEP_CHANJET_WRITE_HOLD_UNTIL_SEPARATE_APPROVAL',
      },
    ];
    const blockers = [
      ...readiness.blockers,
      ...(unsafePushAllowed > 0 ? [`发现 ${unsafePushAllowed} 条历史凭证草稿 push_allowed=true，需单独 DB Gate 清理`] : []),
      ...(masterMappingReview.summary.conflicts > 0 ? [`存在 ${masterMappingReview.summary.conflicts} 个主数据映射冲突`] : []),
    ];
    const conditions = [
      ...readiness.conditions,
      ...(reconciliationOpen > 0 ? [`差异中心仍有 ${reconciliationOpen} 个非 OK/WARN 项`] : []),
      ...(readModel.summary.p0Blocked > 0 ? [`P0 财务 read model 仍有 ${readModel.summary.p0Blocked} 个阻断项`] : []),
    ];
    return {
      generatedAt: new Date().toISOString(),
      decision: blockers.length
        ? 'HOLD'
        : implementationOrder.every((item) => item.status === 'READY')
          ? 'GO'
          : 'GO_WITH_CONDITIONS',
      authoritativeEvidence: 'RUNTIME_CURRENT_STATE',
      productionReadiness: readiness,
      implementationOrder,
      summary: {
        mirrorFreshRate: readiness.summary.mirrorFreshRate,
        financeAuthorityReady: cardAuthority.summary.authorityReady,
        financeReadonlyReady: cardAuthority.summary.readonlyReady,
        financeCards: cardAuthority.summary.totalCards,
        mappingReadyDomains: masterMappingReview.summary.exactMatches,
        mappingDomains: reviewedMappingRows,
        reconciliationOpen,
        recentJobSuccessRate: readiness.summary.recentJobSuccessRate,
        voucherDrafts: overview.voucherDrafts,
        voucherPushReadyCandidates: overview.pushReadyDrafts,
        fieldMappings: overview.fieldMappings,
        unmappedFields: overview.unmappedFields,
        externalWriteEnabled: false,
        nextGate: implementationOrder.find((item) => item.status !== 'READY')?.nextAction
          || p4?.nextAction
          || p2?.nextAction
          || 'KEEP_CONTINUOUS_READONLY_ALIGNMENT',
      },
      blockers,
      conditions,
      staleEvidencePolicy: 'docs/ops/runs 中带 latest 的历史文件只作为当时审计快照；当前判断必须读取本端点 generatedAt 对应的实时数据库证据。',
      guardrails: {
        chanjetWrite: false,
        chanjetDelete: false,
        chanjetModify: false,
        voucherPush: false,
        erpBusinessOverwrite: false,
        ordinaryUserMiddleLayerVisible: false,
        migration: false,
        rule: '严格按 P0→P5 顺序推进；前序 HOLD 时后序只能生成只读证据，不得自动升权或写回。',
      },
    };
  }

  async recordCurrentStateAlert(state: ChanjetAlignmentAlertState): Promise<void> {
    if (state.decision === 'GO') return;
    const severity = state.decision === 'HOLD' ? 'CRITICAL' : 'WARNING';
    const title = state.decision === 'HOLD'
      ? '好业财只读融合当前态 HOLD'
      : '好业财只读融合存在条件项';
    try {
      await this.ds.query(
        `INSERT INTO sys_alerts (alert_type, severity, title, detail, related_path)
         SELECT $1::varchar,$2::varchar,$3::varchar,$4::jsonb,$5::varchar
          WHERE NOT EXISTS (
            SELECT 1
              FROM sys_alerts
             WHERE resolved = FALSE
               AND alert_type = $1::varchar
               AND title = $3::varchar
               AND COALESCE(related_path, '') = COALESCE($5::varchar, '')
          )`,
        [
          'CHANJET_READONLY_ALIGNMENT_DEGRADED',
          severity,
          title,
          JSON.stringify({
            generatedAt: state.generatedAt,
            decision: state.decision,
            blockers: state.blockers,
            conditions: state.conditions,
            summary: state.summary,
            externalWriteEnabled: false,
          }),
          '/finance2/chanjet-integration',
        ],
      );
    } catch (error) {
      this.log.warn(`Chanjet current-state alert skipped: ${(error as Error).message}`);
    }
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

  private financeFieldGapAcceptanceCriteria(bucketKey: string): string[] {
    const common = [
      '只读读取 ERP 好业财中间层，不调用好业财写接口。',
      '展示字段必须标注账套、期间、拉取时间和来源实体类型。',
      '字段缺失或类型不确定时显示 NEED_MAPPING，不得伪造默认值。',
      'ERP 业务明细作为辅助差异，不被好业财镜像静默覆盖。',
    ];
    const map: Record<string, string[]> = {
      CHANJET_VOUCHER_HEADER: [
        '凭证头保留凭证号、期间、日期、制单人、状态、来源单据候选。',
        '凭证写回、推送、反审核继续关闭。',
      ],
      CHANJET_VOUCHER_LINE: [
        '凭证明细保留摘要、科目、借方、贷方、数量核算和辅助核算候选。',
        '金额以 Decimal 字符串处理，不使用 JS 浮点重算财务金额。',
      ],
      CHANJET_COUNTERPARTY: [
        '往来单位必须区分客户、供应商和双重属性。',
        '未审核映射不得进入凭证草稿、收付款匹配或主数据覆盖。',
      ],
      CHANJET_AP_AR_AGGREGATE: [
        '应收/应付统计保持汇总粒度，不写入 fin_ar_invoices / fin_ap_invoices。',
        '卡片必须同时显示好业财主值与 ERP 辅助差异。',
      ],
      CHANJET_PAYMENT_DOCUMENT: [
        '收付款单必须锁定业务日、入账日、审核状态、作废状态和方向。',
        '未锁定日期/状态前不得影响今日收款/今日付款主卡片。',
      ],
      CHANJET_PURCHASE_LINKAGE: [
        '采购链路只做只读差异对照，不自动生成采购单、入库单或付款单。',
      ],
    };
    return [...common, ...(map[bucketKey] || [])];
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

  private async erpCashBalanceAggregate(): Promise<{
    available: boolean;
    value: number;
    rows: number;
    breakdown: FinanceCurrencyBalance[];
    error?: string;
  }> {
    try {
      const rows = await this.ds.query(
        `SELECT UPPER(COALESCE(NULLIF(TRIM(currency_code), ''), 'CNY')) AS currency,
                COALESCE(SUM(current_balance), 0) AS value,
                COUNT(*) AS rows
           FROM fin_cash_accounts
          WHERE status = 'ACTIVE'
          GROUP BY UPPER(COALESCE(NULLIF(TRIM(currency_code), ''), 'CNY'))
          ORDER BY currency`,
      );
      const breakdown: FinanceCurrencyBalance[] = rows.map((row: Record<string, unknown>) => ({
        currency: String(row.currency || 'CNY').toUpperCase(),
        amount: Number(row.value || 0),
        rows: Number(row.rows || 0),
      }));
      return {
        available: true,
        // 仅保留兼容旧接口的原币算术和，前端和对账逻辑不得把它当作可比较总额。
        value: breakdown.reduce((sum, row) => sum + row.amount, 0),
        rows: breakdown.reduce((sum, row) => sum + row.rows, 0),
        breakdown,
      };
    } catch (error) {
      this.log.warn(`ERP cash balance aggregate unavailable: ${(error as Error).message}`);
      return {
        available: false,
        value: 0,
        rows: 0,
        breakdown: [],
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
      const storedRows = await this.entitySnapshotRepo.find({
        where: { entityType: In(entityTypes) },
        order: { updatedAt: 'DESC' },
        take: 10000,
      });
      const rows = storedRows.filter((row) => !getChanjetBusinessFailure(row.rawData));
      const count = rows.length;
      const latestPulledAt = rows.reduce<string | null>(
        (latest, row) => this.maxIso(latest, row.updatedAt ? row.updatedAt.toISOString() : null),
        null,
      );
      return {
        available: count > 0,
        value: rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
        rows: count,
        latestPulledAt,
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
    chanjet: { available: boolean; value: number | null; rows: number; latestPulledAt?: string | null; error?: string };
    erp: { available: boolean; value: number; rows: number; error?: string } | null;
    reason: string;
    forceStatus?: FinanceReconciliationStatus;
    comparisonComparable?: boolean;
    comparisonReason?: string;
    chanjetBreakdown?: FinanceCurrencyBalance[];
    erpBreakdown?: FinanceCurrencyBalance[];
  }): FinanceReconciliationItem {
    const semanticLock = this.financeSemanticLockFor(input.key);
    const chanjetValue = input.chanjet.available && input.chanjet.value !== null ? input.chanjet.value : null;
    const erpValue = input.erp?.available ? input.erp.value : null;
    const comparisonComparable = input.comparisonComparable ?? true;
    const comparisonReason = input.comparisonReason || (
      comparisonComparable ? '两端已使用同一汇总口径，可计算差异。' : '两端口径尚未锁定，禁止计算汇总差异。'
    );
    const diff = comparisonComparable && chanjetValue !== null && erpValue !== null
      ? chanjetValue - erpValue
      : null;
    const base = Math.max(Math.abs(chanjetValue ?? 0), Math.abs(erpValue ?? 0), 1);
    const diffRate = diff === null ? null : Math.abs(diff) / base;
    const status = input.forceStatus
      || (!input.chanjet.available
        ? 'NEED_MAPPING'
        : input.erp && !input.erp.available
          ? 'HOLD'
          : !comparisonComparable
            ? 'WARN'
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
      comparisonComparable,
      comparisonReason,
      chanjetBreakdown: input.chanjetBreakdown || [],
      erpBreakdown: input.erpBreakdown || [],
      status,
      evidence: {
        chanjetRows: input.chanjet.rows,
        latestPulledAt: input.chanjet.latestPulledAt || null,
        erpRows: input.erp?.rows || 0,
      },
      reason: input.reason,
      recommendedAction: !comparisonComparable
        ? '按币种和账户展示两端余额；完成账户映射与汇率口径前，不显示总额差异。'
        : status === 'WARN' && input.erp === null
          ? '保持好业财行级只读展示和字段漂移检测；ERP 无同粒度事实时不构造伪差异。'
          : this.financeReconciliationNextAction(status),
      diagnosis: this.financeDifferenceDiagnosis(input.key),
      semanticLock,
    };
  }

  private financeDifferenceDiagnosis(key: string): FinanceReconciliationItem['diagnosis'] {
    if (key === 'AR_OPEN' || key === 'AP_OPEN') {
      return {
        classification: 'DIFFERENT_GRAIN_AND_LIFECYCLE',
        directlyComparable: false,
        dimensions: ['账套/公司', '币种', '会计期间', '往来单位', '科目方向', '单据状态'],
        treatment: '好业财往来单位级期末余额作为财务汇总权威源；ERP 发票/应付单据只作业务明细解释，禁止用总差额反写任一侧。',
      };
    }
    if (key === 'CASH_BALANCE') {
      return {
        classification: 'BALANCE_SOURCE_OR_CURRENCY_SCOPE_MISMATCH',
        directlyComparable: false,
        dimensions: ['账套/公司', '币种', '原币/本币', '科目 1001/1002', '余额日期', '账户映射'],
        treatment: '按账套、币种和资金账户映射拆分后才允许比较；禁止跨币种直接求和。',
      };
    }
    if (key === 'TODAY_RECEIPT' || key === 'TODAY_PAYMENT') {
      return {
        classification: 'ERP_OPERATIONAL_POSTING_GAP',
        directlyComparable: true,
        dimensions: ['账套/公司', '币种', '业务日', '审核状态', '作废状态', '单据号'],
        treatment: '使用同一业务日与 EFFECTIVE 状态逐单核对；差异保留为业务流水未落 ERP 或状态口径不一致，不静默归零。',
      };
    }
    return {
      classification: 'CHANJET_READONLY_REPORT_WITHOUT_ERP_PEER',
      directlyComparable: false,
      dimensions: ['账套', '会计期间', '报表行/科目', '币种'],
      treatment: '在 ERP 中完整重现好业财只读行，不构造不存在的 ERP 法定报表事实。',
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
    if (status === 'NEED_MANUAL_REVIEW') return '业务日、入账日、审核状态等口径尚未通过系统侧契约验证。';
    return '存在基础表或查询异常，先修复运行时证据再继续。';
  }

  private buildFinanceReadModelMetric(
    item: FinanceReconciliationItem,
    extractor?: FinanceSemanticExtractor,
    dailyMetric?: ReceiptPaymentDailyReconciliationMetric,
  ): FinanceReadModelMetric {
    const selectedValueFields = this.financeReadModelValueFields(extractor);
    const readonlyReportOnly = ['SUBJECT_BALANCE', 'BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'VOUCHER_LIST'].includes(item.key);
    const dailyAuthorityReady = Boolean(dailyMetric?.readyForCardAuthority && dailyMetric.amount !== null);
    const effectiveChanjetValue = dailyAuthorityReady ? dailyMetric!.amount : item.chanjetValue;
    const hasMirrorValue = effectiveChanjetValue !== null;
    const waitingSample = !extractor || extractor.status === 'WAITING_SAMPLE';
    const needManualReview = item.status === 'NEED_MANUAL_REVIEW' && !dailyAuthorityReady;
    const blockedMapping = !extractor
      || ['PARTIAL', 'NEED_EXTRACTION'].includes(extractor.status)
      || item.status === 'NEED_MAPPING';
    const hold = item.status === 'HOLD' || extractor?.status === 'HOLD';
    // AR/AP 是好业财往来单位级汇总口径，不要求 ERP 发票级 aging/invoice 字段。
    // 有有效镜像金额且基础查询未 HOLD 时，可以作为汇总卡片权威值；ERP 单据只保留为差异明细。
    const aggregateAuthorityReady = Boolean(
      ['AR_OPEN', 'AP_OPEN'].includes(item.key)
      && item.semanticLock.authorityEligible
      && hasMirrorValue
      && item.evidence.chanjetRows > 0
      && !needManualReview
      && !hold,
    );
    const authorityReady = Boolean(
      dailyAuthorityReady
      || aggregateAuthorityReady
      || (
        extractor?.authorityEligible
        && item.semanticLock.authorityEligible
        && hasMirrorValue
        && !needManualReview
        && !blockedMapping
        && !hold
      ),
    );
    const readonlyReady = Boolean(
      extractor?.status === 'READY'
      && !authorityReady
      && (hasMirrorValue || (readonlyReportOnly && extractor.sampleRows > 0))
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
    const displayValue = ['AUTHORITY_READY', 'READONLY_READY'].includes(status) && !readonlyReportOnly
      ? effectiveChanjetValue
      : null;
    const dailyRequiredFields = dailyMetric ? Object.values(dailyMetric.sourceFields) : [];
    return {
      key: item.key,
      label: item.label,
      priority: item.priority,
      status,
      authorityEligible: status === 'AUTHORITY_READY',
      displayValue,
      erpAuxiliaryValue: item.erpValue,
      diff: item.comparisonComparable && displayValue !== null && item.erpValue !== null
        ? displayValue - item.erpValue
        : null,
      comparisonComparable: item.comparisonComparable,
      comparisonReason: item.comparisonReason,
      chanjetBreakdown: item.chanjetBreakdown,
      erpBreakdown: item.erpBreakdown,
      valueSource: readonlyReportOnly && status === 'READONLY_READY'
        ? `chanjet_entity_snapshots.${item.chanjetEntityTypes.join('_')}.rawData semantic rows`
        : displayValue !== null
        ? dailyAuthorityReady
          ? `chanjet_entity_snapshots.${dailyMetric!.entityType}.rawData.bizDate/voucherStatusEnum/totalAmount`
          : item.key === 'CASH_BALANCE'
            ? 'chanjet_entity_snapshots.GL_BALANCE.latest_period.1001_1002_leaf.baseEndingBalance'
            : 'chanjet_entity_snapshots.amount / semantic extractor confirmed'
        : 'blocked_until_semantic_extractor_ready',
      sourceEntityTypes: item.chanjetEntityTypes,
      sampleRows: dailyMetric?.sourceRows || extractor?.sampleRows || item.evidence.chanjetRows,
      latestPulledAt: dailyMetric?.latestPulledAt || extractor?.latestPulledAt || item.evidence.latestPulledAt,
      requiredFields: dailyAuthorityReady
        ? dailyRequiredFields
        : extractor?.fieldCandidates.filter((field) => field.required).map((field) => field.semanticField) || item.semanticLock.pendingFields,
      missingRequiredFields: dailyAuthorityReady ? [] : extractor?.missingRequiredFields || item.semanticLock.pendingFields,
      selectedValueFields,
      reason: dailyAuthorityReady ? dailyMetric!.reason : this.financeReadModelReason(status, item, extractor),
      nextAction: dailyAuthorityReady ? dailyMetric!.nextAction : this.financeReadModelNextAction(status, item, extractor),
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

  private buildReadonlyStatementReportStatus(
    metric: FinanceReadModelMetric | undefined,
    sampleRows: number,
  ): FinanceReadonlyStatementReportStatus {
    if (metric?.status === 'HOLD') return 'HOLD';
    if (sampleRows === 0 || !metric || metric.status === 'WAITING_SAMPLE') return 'WAITING_SAMPLE';
    if (['AUTHORITY_READY', 'READONLY_READY'].includes(metric.status)) return 'READONLY_READY';
    return 'BLOCKED_MAPPING';
  }

  private buildReadonlyAdapterStatus(sampleRows: number, missingCriticalFields: string[]): ChanjetReadonlyAdapterStatus {
    if (sampleRows === 0) return 'WAITING_SAMPLE';
    if (missingCriticalFields.length === 0) return 'READY';
    if (missingCriticalFields.length <= 2) return 'PARTIAL';
    return 'HOLD';
  }

  private requiredAdapterFields<T extends object>(
    rows: T[],
    fields: Array<[keyof T & string, string]>,
  ): string[] {
    if (rows.length === 0) return fields.map(([, label]) => label);
    return fields
      .filter(([field]) => rows.every((row) => this.isEmptyAdapterValue((row as Record<string, unknown>)[field])))
      .map(([, label]) => label);
  }

  private isEmptyAdapterValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') {
      const text = value.trim();
      return !text || text === '—' || text === 'UNKNOWN';
    }
    return false;
  }

  private buildVoucherHeaderAdapterRow(row: ChanjetEntitySnapshotEntity): ChanjetVoucherHeaderAdapterRow {
    const raw = row.rawData || {};
    const status = row.status
      || this.firstChanjetText(raw, ['status', 'voucherStatus', 'auditStatus', 'state', 'billStatus'])
      || this.inferChanjetVoucherStatus(raw);
    return {
      rowId: row.id,
      voucherId: this.firstChanjetText(raw, ['id', 'voucherId', 'acctgTransId', 'transId', 'docId', 'billId']) || row.externalId || row.id,
      voucherNo: this.firstChanjetText(raw, ['voucherNo', 'voucherCode', 'voucherNum', 'transNo', 'docNo', 'billNo', 'code']) || row.externalCode || '—',
      bookId: row.bookId || this.firstChanjetText(raw, ['bookId', 'bookid', 'accountBookId']) || '—',
      period: row.period || this.firstChanjetText(raw, ['period', 'accountPeriod', 'acctPeriod', 'fiscalPeriod', 'yearPeriod']) || '—',
      voucherDate: this.firstChanjetText(raw, ['voucherDate', 'bizDate', 'businessDate', 'transDate', 'date', 'postedDate', 'createDate']) || '—',
      postingDate: this.firstChanjetText(raw, ['postingDate', 'postedDate', 'auditDate', 'bookkeepingDate', 'accountingDate']) || '—',
      status: status || '—',
      summary: this.firstChanjetText(raw, ['summary', 'abstract', 'memo', 'description', 'remark', 'comments']) || row.externalName || '—',
      maker: this.firstChanjetText(raw, ['maker', 'creator', 'createUserName', 'createdBy', 'operatorName', 'createName']) || '—',
      reviewer: this.firstChanjetText(raw, ['reviewer', 'auditor', 'approveUserName', 'auditUserName', 'reviewUserName']) || '—',
      rawEvidenceExcerpt: this.compactChanjetRawEvidence(raw),
    };
  }

  private buildVoucherLineAdapterRows(row: ChanjetEntitySnapshotEntity): ChanjetVoucherLineAdapterRow[] {
    const raw = row.rawData || {};
    const header = this.buildVoucherHeaderAdapterRow(row);
    const lines = this.firstChanjetArray(raw, [
      'entries',
      'entryList',
      'items',
      'lines',
      'details',
      'detailList',
      'voucherLines',
      'voucherDetails',
      'voucherDetailsList',
      'acctgTransDetails',
      'acctgTransItems',
      'children',
      'rows',
      'data.details',
      'data.items',
      'data.lines',
    ]);
    return lines
      .filter((line) => this.isRecord(line))
      .map((line, index) => {
        const item = line as Record<string, unknown>;
        return {
          rowId: `${row.id}:${index + 1}`,
          voucherId: header.voucherId,
          voucherNo: header.voucherNo,
          lineNo: this.firstChanjetText(item, ['lineNo', 'rowNo', 'seq', 'sequence', 'index']) || String(index + 1),
          subjectCode: this.firstChanjetText(item, ['subjectCode', 'subject.code', 'subjectNo', 'accountCode', 'accountSubjectCode', 'glAccount.code']) || '—',
          subjectName: this.firstChanjetText(item, ['subjectName', 'subject.name', 'accountName', 'accountSubjectName', 'glAccount.name', 'glAccount.longName']) || '—',
          summary: this.firstChanjetText(item, ['summary', 'abstract', 'memo', 'remark', 'comments', 'longText']) || header.summary,
          debitAmount: this.firstChanjetText(item, ['debitAmount', 'debit', 'debitOriginalAmount', 'drAmount', 'borrowAmount', 'postedDr']) || '0',
          creditAmount: this.firstChanjetText(item, ['creditAmount', 'credit', 'creditOriginalAmount', 'crAmount', 'loanAmount', 'postedCr']) || '0',
          currency: this.firstChanjetText(item, ['currency', 'currencyCode', 'currencyName', 'currencyTO.code']) || row.currency || '—',
          counterpartyName: this.firstChanjetText(item, ['counterpartyName', 'customerName', 'supplierName', 'custVendorName', 'assistantCustomerName', 'partyName']) || '—',
          projectName: this.firstChanjetText(item, ['projectName', 'project.name', 'assistantProjectName']) || '—',
          departmentName: this.firstChanjetText(item, ['departmentName', 'department.name', 'deptName', 'assistantDepartmentName']) || '—',
          rawEvidenceExcerpt: this.compactChanjetRawEvidence(item),
        };
      });
  }

  private inferChanjetVoucherStatus(raw: Record<string, unknown>): string {
    const cancelUserId = this.readChanjetPath(raw, 'cancelUserId');
    if (this.isRecord(cancelUserId) && Object.keys(cancelUserId).length > 0) return 'CANCELLED';
    if (this.firstChanjetText(raw, ['hasAdjusted']).toLowerCase() === 'true') return 'ADJUSTED';
    const hasEditAuth = this.firstChanjetText(raw, ['hasEditAuth']).toLowerCase();
    if (hasEditAuth === 'false') return 'POSTED_LOCKED';
    if (hasEditAuth === 'true') return 'EDITABLE';
    return '';
  }

  private buildCounterpartyAdapterRow(
    row: ChanjetEntitySnapshotEntity,
    mappings: ChanjetMasterMappingEntity[],
  ): ChanjetCounterpartyAdapterRow {
    const raw = row.rawData || {};
    const roleCandidate = this.detectCounterpartyRole(raw);
    const match = mappings.find((mapping) => (
      mapping.bookId === row.bookId
      && (
        (!!row.externalId && mapping.chanjetId === row.externalId)
        || (!!row.externalCode && mapping.chanjetCode === row.externalCode)
        || (!!row.externalName && mapping.chanjetName === row.externalName)
      )
    )) || mappings.find((mapping) => (
      (!!row.externalId && mapping.chanjetId === row.externalId)
      || (!!row.externalCode && mapping.chanjetCode === row.externalCode)
      || (!!row.externalName && mapping.chanjetName === row.externalName)
    ));
    return {
      rowId: row.id,
      bookId: row.bookId || '—',
      externalId: row.externalId || this.firstChanjetText(raw, ['id', 'partyId', 'customerId', 'supplierId']) || '—',
      externalCode: row.externalCode || this.firstChanjetText(raw, ['code', 'partyCode', 'customerCode', 'supplierCode']) || '—',
      externalName: row.externalName || this.firstChanjetText(raw, ['name', 'partyName', 'customerName', 'supplierName', 'subjectName']) || '—',
      roleCandidate,
      status: row.status || this.firstChanjetText(raw, ['status', 'state', 'enabled', 'disabled']) || '—',
      erpCandidateCode: match?.erpCode || '',
      erpCandidateName: match?.erpName || '',
      mappingReviewStatus: match?.reviewStatus || 'PENDING',
      confidence: String(match?.confidence ?? '0'),
      rawEvidenceExcerpt: this.compactChanjetRawEvidence(raw),
    };
  }

  private detectCounterpartyRole(raw: Record<string, unknown>): ChanjetCounterpartyAdapterRow['roleCandidate'] {
    const partyRoleTypeId = this.firstChanjetText(raw, ['partyRoleTypeId']);
    if (partyRoleTypeId === '100001') return 'CUSTOMER';
    if (partyRoleTypeId === '100101') return 'SUPPLIER';
    if (partyRoleTypeId === '100400') return 'BOTH';

    const text = JSON.stringify(this.compactChanjetRawEvidence(raw))
      .replace(/"(?:isSupplier|isVendor|supplierFlag|vendorFlag)"\s*:\s*(?:false|0|"false"|"0")/gi, '')
      .replace(/"(?:isCustomer|customerFlag|custFlag)"\s*:\s*(?:false|0|"false"|"0")/gi, '')
      .toLowerCase();
    const customerFlag = this.firstChanjetText(raw, [
      'isCustomer', 'customerFlag', 'custFlag', 'customerType', 'customerId', 'customerCode', 'customerName',
    ]).toLowerCase();
    const supplierFlag = this.firstChanjetText(raw, [
      'isSupplier', 'isVendor', 'supplierFlag', 'vendorFlag', 'supplierType', 'supplierId', 'supplierCode', 'supplierName',
    ]).toLowerCase();
    const enabledFlag = (value: string) => !!value && !['false', '0', 'no', '否', 'null', 'undefined'].includes(value);
    const customer = enabledFlag(customerFlag) || /customer|cust|客户|应收|receive/.test(text);
    const supplier = enabledFlag(supplierFlag) || /supplier|vendor|供应商|应付|payable/.test(text);
    if (customer && supplier) return 'BOTH';
    if (customer) return 'CUSTOMER';
    if (supplier) return 'SUPPLIER';
    return 'UNKNOWN';
  }

  private counterpartyMappingTypes(
    role: ChanjetCounterpartyAdapterRow['roleCandidate'],
  ): CounterpartyMappingType[] {
    if (role === 'BOTH') return ['CUSTOMER', 'SUPPLIER'];
    if (role === 'CUSTOMER' || role === 'SUPPLIER') return [role];
    return [];
  }

  private isStaleCounterpartyRoleMapping(
    mapping: Pick<ChanjetMasterMappingEntity, 'bookId' | 'chanjetId' | 'mappingType'>,
    candidates: ChanjetCounterpartyMappingCandidate[],
  ): boolean {
    const current = candidates.filter((candidate) => (
      candidate.bookId === mapping.bookId
      && candidate.chanjetId === mapping.chanjetId
      && !!candidate.mappingType
    ));
    return current.length > 0
      && !current.some((candidate) => candidate.mappingType === mapping.mappingType);
  }

  private buildCounterpartyMappingCandidate(
    snapshot: ChanjetEntitySnapshotEntity,
    mappingType: CounterpartyMappingType | null,
    roleCandidate: ChanjetCounterpartyAdapterRow['roleCandidate'],
    companyCode: string,
    masters: ErpCounterpartyMaster[],
  ): ChanjetCounterpartyMappingCandidate {
    const chanjetId = snapshot.externalId || this.firstChanjetText(snapshot.rawData || {}, ['id', 'partyId']) || snapshot.id;
    const chanjetCode = snapshot.externalCode || this.firstChanjetText(snapshot.rawData || {}, ['code', 'customerCode', 'supplierCode']);
    const chanjetName = snapshot.externalName || this.firstChanjetText(snapshot.rawData || {}, ['name', 'customerName', 'supplierName', 'partyName']);
    const evidence: string[] = [];
    const partyRoleTypeId = this.firstChanjetText(snapshot.rawData || {}, ['partyRoleTypeId']);
    if (['100001', '100101', '100400'].includes(partyRoleTypeId)) {
      evidence.push(`好业财 partyRoleTypeId=${partyRoleTypeId} 已锁定为 ${roleCandidate}`);
    } else if (partyRoleTypeId) {
      evidence.push(`未知好业财 partyRoleTypeId=${partyRoleTypeId}，禁止按余额或名称猜测角色`);
    }
    if (!mappingType) evidence.push('无法从好业财样本确定客户/供应商属性，禁止猜测');
    if (!companyCode) evidence.push('账套尚未形成启用的公司映射');
    const eligible = mappingType
      ? masters.filter((master) => (
        master.mappingType === mappingType
        && (!companyCode || !master.companyCode || master.companyCode === companyCode)
      ))
      : [];
    const normalizedCode = this.normalizeCounterpartyCode(chanjetCode);
    const normalizedName = this.normalizeCounterpartyName(chanjetName);
    const scored = eligible
      .map((master) => {
        const codeMatches = !!normalizedCode && this.normalizeCounterpartyCode(master.code) === normalizedCode;
        const nameMatches = !!normalizedName && this.normalizeCounterpartyName(master.name) === normalizedName;
        const score = codeMatches ? 100 : nameMatches ? 95 : 0;
        return {
          master,
          score,
          reason: codeMatches ? '编码精确匹配' : nameMatches ? '规范化名称精确匹配' : '',
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.master.code.localeCompare(right.master.code));
    const topScore = scored[0]?.score || 0;
    const top = scored.filter((item) => item.score === topScore);
    const selected = top.length === 1 ? top[0] : null;
    const sourceIdentityEligible = Boolean(
      mappingType
      && top.length === 0
      && companyCode
      && chanjetId
      && chanjetCode
      && chanjetName,
    );
    const sourceIdentityCode = sourceIdentityEligible
      ? this.buildCounterpartySourceIdentityCode(snapshot.bookId, mappingType!, chanjetCode, chanjetId)
      : '';
    const matchStatus: ChanjetCounterpartyMappingCandidate['matchStatus'] = !mappingType
      ? 'PENDING'
      : top.length === 0
        ? sourceIdentityEligible ? 'SOURCE_ONLY' : 'PENDING'
      : top.length > 1
        ? 'CONFLICT'
        : 'MATCHED';
    if (selected) evidence.push(selected.reason);
    if (top.length > 1) evidence.push(`发现 ${top.length} 个同分 ERP 主数据，必须人工消歧`);
    if (sourceIdentityEligible) {
      evidence.push('ERP 真实主档中无对应项，已建立隔离的好业财只读源身份');
      evidence.push('该身份不写入 sal_customers / prc2_suppliers，不作为 ERP 业务主档');
    } else if (mappingType && top.length === 0) {
      evidence.push('ERP 真实主档中无编码或名称精确匹配项');
    }
    const selectedCodeMatches = Boolean(
      selected
      && normalizedCode
      && this.normalizeCounterpartyCode(selected.master.code) === normalizedCode,
    );
    const selectedNameMatches = Boolean(
      selected
      && normalizedName
      && this.normalizeCounterpartyName(selected.master.name) === normalizedName,
    );
    const matchKind: ChanjetCounterpartyMappingCandidate['matchKind'] = top.length > 1
      ? 'CONFLICT'
      : sourceIdentityEligible
        ? 'SOURCE_IDENTITY'
      : selectedCodeMatches && selectedNameMatches
        ? 'EXACT_CODE_AND_NAME'
        : selectedCodeMatches
          ? 'EXACT_CODE'
          : selectedNameMatches
            ? 'EXACT_NAME'
            : 'NONE';
    const deterministicExactMatch = [
      'EXACT_CODE_AND_NAME',
      'EXACT_CODE',
      'EXACT_NAME',
    ].includes(matchKind);
    const companyScopeEligible = Boolean(
      companyCode
      && selected
      && (!selected.master.companyCode || selected.master.companyCode === companyCode),
    );
    const systemApprovalEligible = Boolean(
      matchStatus === 'MATCHED'
      && deterministicExactMatch
      && top.length === 1
      && companyScopeEligible
      && String(selected?.master.status || '').toUpperCase() === 'ACTIVE',
    );
    const systemApprovalReason = systemApprovalEligible
      ? `账套公司范围、角色、唯一${selected?.reason || '精确匹配'}和 ACTIVE 状态一致${selected?.master.companyCode ? '' : '；ERP 主档为集团共享主档'}，可由系统确认中间层映射。`
      : sourceIdentityEligible
        ? '账套、角色、好业财 ID/编码/名称完整且 ERP 无候选，系统确认隔离的只读源身份。'
      : matchKind === 'CONFLICT'
        ? '存在多个同分候选，必须人工消歧。'
        : !companyCode
          ? '账套未映射到 ERP 公司，禁止系统确认。'
          : !deterministicExactMatch
            ? '编码和名称均未形成唯一精确匹配，禁止系统确认。'
            : !companyScopeEligible
              ? 'ERP 主数据归属其他公司，禁止跨公司自动确认。'
            : String(selected?.master.status || '').toUpperCase() !== 'ACTIVE'
              ? 'ERP 主数据不是 ACTIVE，禁止系统确认。'
              : '未满足系统确认条件。';
    return {
      candidateKey: `${snapshot.bookId}:${mappingType || 'UNKNOWN'}:${chanjetId}`,
      snapshotId: snapshot.id,
      bookId: snapshot.bookId,
      companyCode,
      mappingType,
      roleCandidate,
      chanjetId,
      chanjetCode,
      chanjetName,
      matchStatus,
      confidence: selected?.score || (sourceIdentityEligible ? 100 : 0),
      erpCode: selected?.master.code || sourceIdentityCode,
      erpName: selected?.master.name || (sourceIdentityEligible ? chanjetName : ''),
      evidence,
      alternatives: scored.slice(0, 5).map((item) => ({
        erpCode: item.master.code,
        erpName: item.master.name,
        companyCode: item.master.companyCode,
        score: item.score,
        reason: item.reason,
      })),
      matchKind,
      systemApprovalEligible,
      sourceIdentityEligible,
      systemApprovalReason,
      requiresApproval: !(systemApprovalEligible || sourceIdentityEligible),
      canAutoApprove: systemApprovalEligible || sourceIdentityEligible,
    };
  }

  private buildCounterpartySourceIdentityCode(
    bookId: string,
    mappingType: CounterpartyMappingType,
    chanjetCode: string,
    chanjetId: string,
  ): string {
    const sourcePart = this.normalizeCounterpartyCode(chanjetCode) || this.normalizeCounterpartyCode(chanjetId);
    const readable = `CJRO:${bookId}:${mappingType === 'CUSTOMER' ? 'C' : 'S'}:${sourcePart}`;
    if (readable.length <= 128) return readable;
    const digest = crypto.createHash('sha256').update(readable).digest('hex').slice(0, 24).toUpperCase();
    return `CJRO:${bookId}:${mappingType === 'CUSTOMER' ? 'C' : 'S'}:${digest}`;
  }

  private normalizeCounterpartyCode(value: string): string {
    return String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, '');
  }

  private normalizeCounterpartyName(value: string): string {
    return String(value || '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu, '')
      .replace(/(有限责任公司|股份有限公司|有限公司|公司)$/u, '');
  }

  private findDuplicateValues(values: string[]): string[] {
    const counts = new Map<string, number>();
    for (const value of values.map((item) => String(item || '').trim()).filter(Boolean)) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
  }

  private firstChanjetArray(rawData: Record<string, unknown>, paths: string[]): unknown[] {
    for (const path of paths) {
      const value = this.readChanjetPath(rawData, path);
      if (Array.isArray(value)) return value;
    }
    for (const value of Object.values(rawData)) {
      if (Array.isArray(value)) return value;
      if (this.isRecord(value)) {
        const nested = this.firstChanjetArray(value, paths);
        if (nested.length) return nested;
      }
    }
    return [];
  }

  private firstChanjetText(rawData: Record<string, unknown>, paths: string[]): string {
    for (const path of paths) {
      const value = this.readChanjetPath(rawData, path);
      if (value === null || value === undefined) continue;
      if (typeof value === 'string') {
        if (value.trim()) return value.trim();
        continue;
      }
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    }
    return '';
  }

  private readChanjetPath(rawData: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, segment) => {
      if (!this.isRecord(current)) return undefined;
      return current[segment];
    }, rawData);
  }

  private compactChanjetRawEvidence(rawData: Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (!rawData || !this.isRecord(rawData)) return {};
    const evidence: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawData).slice(0, 12)) {
      if (/certificate|authCode|appTicket|openToken|accessToken|appSecret|secret|token|password/i.test(key)) {
        evidence[key] = '[REDACTED]';
      } else if (Array.isArray(value)) {
        evidence[key] = `[array:${value.length}]`;
      } else if (this.isRecord(value)) {
        evidence[key] = `{object:${Object.keys(value).slice(0, 8).join(',')}}`;
      } else {
        evidence[key] = this.maskSample(value);
      }
    }
    return evidence;
  }

  private financeReadModelReason(
    status: FinanceReadModelStatus,
    item: FinanceReconciliationItem,
    extractor?: FinanceSemanticExtractor,
  ): string {
    if (status === 'AUTHORITY_READY') return '好业财镜像、语义锁和提取器均满足权威候选条件，可作为财务卡片主值，并保留 ERP 辅助差异。';
    if (status === 'READONLY_READY') return '字段样本已就绪，但该指标尚非权威口径；只能只读展示，不得覆盖 ERP 业务事实。';
    if (status === 'NEED_MANUAL_REVIEW') return '日期、审核状态、作废状态或方向口径尚未通过系统侧契约验证。';
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
    if (status === 'NEED_MANUAL_REVIEW') return '完成业务日、状态、方向与金额的系统侧只读对账，再进入下一轮 read model。';
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
    const storedRows = await this.entitySnapshotRepo.find({
      where: { entityType },
      order: { updatedAt: 'DESC' },
      take: 80,
    });
    const rows = storedRows.filter((row) => !getChanjetBusinessFailure(row.rawData));
    const requiredDimensions = ['business_date', 'posted_date', 'approved_status', 'void_status', 'direction', 'amount'];
    const flattened = rows.flatMap((row) => this.flattenSemanticValues(row.rawData || {}, '$'));
    const latestPulledAt = rows.reduce<string | null>((latest, row) => this.maxIso(latest, row.updatedAt ? String(row.updatedAt) : null), null);
    const fieldCandidates = requiredDimensions.map((field) => {
      // PAYMENT_AR and PAYMENT_AP are direction-specific Chanjet APIs. Their
      // entity type is therefore stronger evidence than a non-existent raw
      // `direction` field. Keep the derived path explicit so it remains
      // inspectable and cannot be mistaken for vendor payload data.
      if (field === 'direction') {
        return {
          semanticField: field,
          candidatePaths: rows.length ? [{
            path: '$.__derived.entityTypeDirection',
            sampleType: 'string' as const,
            sampleValue: key === 'TODAY_RECEIPT' ? 'RECEIPT' : 'PAYMENT',
            observedCount: rows.length,
          }] : [],
          required: true,
          status: rows.length ? 'FOUND' as const : 'MISSING' as const,
        };
      }
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
    const systemConfirmationStatus: ReceiptPaymentSystemConfirmationStatus = rows.length === 0
      ? 'SYSTEM_WAITING_SAMPLE'
      : status === 'LOCKED'
        ? 'SYSTEM_CONFIRMED_LOCK_CANDIDATE'
        : status === 'PARTIAL'
          ? 'SYSTEM_CONFIRMED_PARTIAL'
          : 'HOLD';
    const readyForFinanceReview = status === 'LOCKED';
    const blockedFromPrimaryReason = status === 'LOCKED'
      ? '系统已找到日期、状态、方向和金额候选字段，但今日卡片仍需单独对账验证；本 Gate 不允许自动切主值。'
      : '收付款日期、状态、方向或金额维度未完整锁定，禁止进入今日收款/付款主卡片。';
    return {
      key,
      label,
      entityType,
      status,
      systemConfirmationStatus,
      sampleRows: rows.length,
      latestPulledAt,
      requiredDimensions,
      lockedDimensions,
      missingDimensions,
      fieldCandidates,
      dateRule: '今日口径必须由业务日与入账日候选字段共同确认，禁止用拉取时间或 created_at 代替。',
      statusRule: '必须显式过滤未审核、草稿、已作废、已取消记录；未锁定前不得进入主卡片。',
      directionRule: key === 'TODAY_RECEIPT'
        ? '方向由 PAYMENT_AR / AR_RECEIPT 实体契约派生为 RECEIPT；退款/冲销/反向单仍必须按状态排除或单列差异。'
        : '方向由 PAYMENT_AP / AP_PAYMENT 实体契约派生为 PAYMENT；退款/冲销/反向单仍必须按状态排除或单列差异。',
      amountRule: '金额字段必须来自好业财单据实收/实付金额候选，不能使用列表累计或 amount=0 占位。',
      safeQueryFilter: {
        businessDate: lockedDimensions.includes('business_date') ? 'candidate_required' : 'blocked_missing_candidate',
        postedDate: lockedDimensions.includes('posted_date') ? 'candidate_required' : 'blocked_missing_candidate',
        approvedStatus: lockedDimensions.includes('approved_status') ? 'approved_or_audited_only' : 'blocked_missing_candidate',
        voidStatus: lockedDimensions.includes('void_status') ? 'exclude_void_cancel_reversal' : 'blocked_missing_candidate',
        direction: lockedDimensions.includes('direction')
          ? (key === 'TODAY_RECEIPT'
            ? 'derived_from_PAYMENT_AR_AR_RECEIPT_contract'
            : 'derived_from_PAYMENT_AP_AP_PAYMENT_contract')
          : 'blocked_missing_candidate',
        amount: lockedDimensions.includes('amount') ? 'actual_receipt_payment_amount_only' : 'blocked_missing_candidate',
      },
      blockedFromPrimaryReason,
      amountSumSafeForTodayCard: false,
      readyForFinanceReview,
      readyForCardAuthority: false,
      reason: rows.length === 0
        ? `${entityType} 暂无中间层样本，需先重跑只读同步。`
        : missingDimensions.length === 0
          ? '日期、状态、方向和金额候选字段均已识别，可进入系统侧对账验证；尚未自动切换卡片权威值。'
          : `仍缺少候选维度: ${missingDimensions.join(' / ')}。`,
      nextAction: rows.length === 0
        ? '执行好业财全量只读同步，补齐收付款单 raw_data。'
        : missingDimensions.length === 0
          ? '执行收付款日期/状态/方向只读对账脚本，确认今日口径后再申请财务卡片权威接线 Gate。'
          : `补齐字段候选: ${missingDimensions.join(' / ')}`,
    };
  }

  private normalizeReceiptPaymentBusinessDate(value?: string): string {
    if (value !== undefined) {
      const normalized = value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        throw new Error('businessDate must use YYYY-MM-DD');
      }
      const parsed = new Date(`${normalized}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
        throw new Error('businessDate is not a valid calendar date');
      }
      return normalized;
    }
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private async buildFinanceSemanticExtractor(lock: FinanceSemanticLock): Promise<FinanceSemanticExtractor> {
    if (lock.key === 'CASH_BALANCE') {
      const { lock: cashLock } = await this.financeCashBalanceFieldLockOverview();
      const status: FinanceSemanticExtractorStatus = cashLock.readyForCardAuthority
        ? 'READY'
        : cashLock.status === 'WAITING_SAMPLE'
          ? 'WAITING_SAMPLE'
          : cashLock.fieldCandidates.some((field) => field.status === 'FOUND')
            ? 'PARTIAL'
            : 'HOLD';
      return {
        key: lock.key,
        label: lock.label,
        status,
        authorityEligible: lock.authorityEligible && cashLock.readyForCardAuthority,
        sourceEntityTypes: ['GL_BALANCE'],
        sampleRows: cashLock.eligibleBalanceRows,
        latestPulledAt: cashLock.latestPulledAt,
        fieldCandidates: cashLock.fieldCandidates,
        extractedFields: cashLock.fieldCandidates.filter((field) => field.status === 'FOUND').length,
        requiredFields: cashLock.fieldCandidates.length,
        missingRequiredFields: cashLock.missingFields,
        reason: cashLock.readyForCardAuthority
          ? '现金/银行余额精确合同已通过：最新期间 1001/1002 叶子科目 baseEndingBalance。'
          : `现金/银行余额字段锁未通过: ${cashLock.blockerReasons.join(' / ') || cashLock.status}。`,
        nextAction: cashLock.nextAction,
      };
    }
    if (lock.key === 'VOUCHER_LIST') {
      const overview = await this.financeReadonlyFieldAdaptersOverview();
      const voucherAdapters = overview.adapters.filter((adapter) => (
        adapter.adapterKey === 'CHANJET_VOUCHER_HEADER' || adapter.adapterKey === 'CHANJET_VOUCHER_LINE'
      ));
      const adapterByField = new Map<string, ChanjetReadonlyFieldAdapterOverview['adapters'][number]>();
      for (const adapter of voucherAdapters) {
        for (const field of adapter.mappedFields) adapterByField.set(field.toLowerCase(), adapter);
      }
      const fieldAliases: Record<string, string> = {
        voucher_id: 'voucherid', voucher_no: 'voucherno', book_id: 'bookid', period: 'period',
        voucher_date: 'voucherdate', posting_date: 'postingdate', voucher_status: 'status', summary: 'summary',
        maker: 'maker', reviewer: 'reviewer', line_no: 'lineno', subject_code: 'subjectcode',
        subject_name: 'subjectname', debit_amount: 'debitamount', credit_amount: 'creditamount',
        currency: 'currency', counterparty_name: 'counterpartyname', project_name: 'projectname',
        department_name: 'departmentname',
      };
      const fieldCandidates = lock.lockedFields.map((field) => {
        const adapter = adapterByField.get(fieldAliases[field] || field.replace(/_/g, ''));
        return {
          semanticField: field,
          candidatePaths: adapter ? [{
            path: `readonly_adapter.${adapter.adapterKey}.${fieldAliases[field] || field}`,
            sampleType: 'string' as const,
            sampleValue: null,
            observedCount: adapter.sampleRows,
          }] : [],
          required: true,
          status: adapter ? 'FOUND' as const : 'MISSING' as const,
        };
      });
      const missingRequiredFields = fieldCandidates.filter((field) => field.status === 'MISSING').map((field) => field.semanticField);
      const allAdaptersReady = voucherAdapters.length === 2 && voucherAdapters.every((adapter) => adapter.status === 'READY');
      const sampleRows = voucherAdapters.reduce((sum, adapter) => sum + adapter.sampleRows, 0);
      const latestPulledAt = voucherAdapters.reduce<string | null>(
        (latest, adapter) => this.maxIso(latest, adapter.latestPulledAt),
        null,
      );
      const status: FinanceSemanticExtractorStatus = allAdaptersReady && missingRequiredFields.length === 0
        ? 'READY'
        : sampleRows === 0
          ? 'WAITING_SAMPLE'
          : voucherAdapters.some((adapter) => adapter.status === 'HOLD')
            ? 'HOLD'
            : 'PARTIAL';
      return {
        key: lock.key,
        label: lock.label,
        status,
        authorityEligible: false,
        sourceEntityTypes: ['VOUCHER'],
        sampleRows,
        latestPulledAt,
        fieldCandidates,
        extractedFields: fieldCandidates.length - missingRequiredFields.length,
        requiredFields: fieldCandidates.length,
        missingRequiredFields,
        reason: status === 'READY'
          ? '凭证头和明细专用只读适配器均已 READY；写回权限仍保持关闭。'
          : '凭证只读适配器证据不完整，保持 fail-closed。',
        nextAction: status === 'READY'
          ? '保持只读重现与字段漂移检测；最少写入必须进入独立审批 Gate。'
          : `补齐凭证只读字段: ${missingRequiredFields.join(' / ') || status}`,
      };
    }
    const storedRows = await this.entitySnapshotRepo.find({
      where: { entityType: In(lock.chanjetEntityTypes.length ? lock.chanjetEntityTypes : ['__none__']) },
      order: { updatedAt: 'DESC' },
      take: 50,
    });
    const rows = storedRows.filter((row) => !getChanjetBusinessFailure(row.rawData));
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
    const numericSemantic = /(amount|money|balance|opening|closing|ending|debit|credit|tax|current_period|year_to_date|line_no)/i.test(semanticField);
    const metadataPath = /(?:^|\.)(?:requestid|request_id|msg|message|success|error|code)$/i;
    const scored = flattened
      .filter((item) => !['object', 'array', 'null'].includes(item.sampleType))
      .filter((item) => !metadataPath.test(item.path))
      .filter((item) => !numericSemantic
        || item.sampleType === 'number'
        || /^-?\d+(?:\.\d+)?$/.test(String(item.sampleValue || '').trim()))
      .map((item) => {
        const path = item.path.toLowerCase();
        const score = keywords.reduce((sum, keyword) => {
          const k = keyword.toLowerCase();
          return sum + (path.includes(k) ? 3 : 0);
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
    requireReadonlySync();
    requireReadonlyOrchestration();
    const requested = scope.length
      ? scope.map((s) => s.toUpperCase())
      : PROBE_ENDPOINTS.filter((ep) => ep.mirrorDefault).map((ep) => ep.key);
    const approval = requireApprovedReadonlyRequest({ scope: requested, bookId, period });
    const selectedKeys = new Set(requested);
    const endpoints = PROBE_ENDPOINTS.filter((ep) => selectedKeys.has(ep.key));
    if (!endpoints.length) throw new Error(`未找到可执行 mirror scope: ${requested.join(',')}`);

    if (endpoints.some((endpoint) => endpoint.requiresBook) && await this.accountBookRepo.count() === 0) {
      await this.refreshAccountBooks();
    }

    let books = bookId ? [bookId] : (await this.listEnabledBookIds()).filter(id => approval.books.some(b => b.bookId === id));
    if (!books.length) {
      const refreshed = await this.refreshAccountBooks();
      books = refreshed.books.filter((b) => b.enabled && approval.books.some(a => a.bookId === b.bookId)).map((b) => b.bookId);
    }
    if (endpoints.some((endpoint) => endpoint.requiresBook)) {
      const mappingGate = await this.accountBookMappingGate();
      if (!mappingGate.canRunBookScopedSync) {
        throw new Error(`账套-公司映射 Gate HOLD: ${mappingGate.blockingIssues.join('；') || '无可用启用映射'}`);
      }
      const allowedBooks = new Set(
        mappingGate.mappings
          .filter((mapping) => mapping.syncEnabled && mapping.status === 'VALID')
          .map((mapping) => mapping.bookId),
      );
      const deniedBooks = books.filter((candidate) => !allowedBooks.has(candidate));
      if (deniedBooks.length) throw new Error(`账套未通过一对一映射 Gate: ${deniedBooks.join(', ')}`);
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
        assertReadonlyOrchestrationOwnerIfPresent();
        // execution-bound write gate: a held/expired admission refuses before
        // this target's snapshot upsert / aggregate delete+upsert / mapping
        // candidate writes (legacy non-execution paths pass through)
        await executionWriteGate();
        const path = ep.requiresBook ? ep.path.replace('{bookid}', encodeURIComponent(targetBookId)) : ep.path;
        const request = this.buildProbeRequest(ep, period);
        const effectivePeriod = request.period;
        const job = await this.createJob('SNAPSHOT', targetBookId, effectivePeriod, {
          key: ep.key,
          label: ep.label,
          method: ep.method,
          path,
          mode: 'read-chanjet-write-erp-middle-layer',
        });
        try {
          const resp = await this.fetchProbePayload(ep, path, request);
          assertReadonlyOrchestrationOwnerIfPresent();
          if (ep.key === 'ACCOUNT_BOOKS') {
            await this.persistAccountBooks(resp);
          }
          const fields = await this.recordApiSample(ep.apiDomain, path, ep.method, resp);
          // execution-bound: the snapshot upsert, aggregate delete+upsert and
          // mapping-candidate writes share ONE transaction whose FIRST
          // statement is the admission liveness gate — a HOLD/deadline after
          // the gate rolls the whole batch back to zero writes (legacy
          // non-execution paths keep their existing behavior).
          const scopeState = activeExecutionScope();
          const persistWrites = async (manager?: EntityManager): Promise<{ rawSnapshotId: string; rowCount: number; entityRows: number }> => {
            const rawSnapshot = await this.recordReadSnapshot(ep, targetBookId, path, ep.method, effectivePeriod, resp, manager);
            const entityRows = await this.recordEntitySnapshots(ep, targetBookId, effectivePeriod, resp, manager);
            if (ep.mappingType && ep.key !== 'CUSTOMER_SUPPLIER') {
              await this.createMappingCandidates(ep.mappingType, targetBookId, resp, manager);
            }
            return { rawSnapshotId: rawSnapshot.id, rowCount: rawSnapshot.rowCount, entityRows };
          };
          let written!: { rawSnapshotId: string; rowCount: number; entityRows: number };
          if (scopeState) {
            // execution-bound: the liveness gate is the FIRST statement on the
            // SAME queryRunner transaction as the snapshot upsert, aggregate
            // delete+upsert and mapping-candidate writes; SET LOCAL budgets
            // every statement in the transaction; the COMMIT is raced against
            // the same absolute deadline and a lost race terminates the
            // backend so nothing can land late
            const deadline = scopeState.deadlineAt instanceof Date ? scopeState.deadlineAt.getTime() : Number.NaN;
            if (!Number.isFinite(deadline) || deadline - Date.now() <= 1) throw new Error('CHANJET_EXECUTION_DEADLINE');
            const queryRunner = this.ds.createQueryRunner();
            await queryRunner.connect();
            let commitTimer: ReturnType<typeof setTimeout> | undefined;
            let commitUnknown = false;
            await queryRunner.query('BEGIN');
            try {
              await queryRunner.query(`SET LOCAL statement_timeout=${deadline - Date.now()}`);
              await queryRunner.query(`SET LOCAL lock_timeout=${Math.min(deadline - Date.now(), 1_000)}`);
              await executionWriteGateTx(queryRunner.manager, scopeState.current, { forUpdate: true });
              const written = await persistWrites(queryRunner.manager);
              const remaining = deadline - Date.now();
              if (remaining <= 1) {
                commitUnknown = true;
                throw new Error('CHANJET_EXECUTION_TERMINAL_UNKNOWN');
              }
              const committed = await Promise.race([
                queryRunner.query('COMMIT').then(() => true as const),
                new Promise<false>((resolve) => { commitTimer = setTimeout(() => resolve(false), remaining); }),
              ]).catch(() => false as const);
              if (committed !== true) {
                commitUnknown = true;
                throw new Error('CHANJET_EXECUTION_TERMINAL_UNKNOWN');
              }
            } catch (error) {
              // bounded ROLLBACK on the same session; if it cannot be
              // confirmed the backend is terminated via the INDEPENDENT
              // cancellation channel (never this pool) and the discard is
              // confirmed — the session never returns carrying a raw BEGIN
              let rolled = false;
              try {
                rolled = await Promise.race([
                  queryRunner.query('ROLLBACK').then(() => true as const),
                  new Promise<false>((resolve) => { commitTimer = setTimeout(() => resolve(false), 1_000); }),
                ]).catch(() => false as const);
              } catch { /* handled below */ }
              if (rolled !== true) {
                // the rollback could not be confirmed on this session:
                // terminate the backend via the INDEPENDENT cancellation
                // channel (a fresh connection, never this pool) so the
                // transaction can never land late, then confirm the session
                // is gone. The UNKNOWN outcome propagates accurately.
                commitUnknown = true;
                const [self] = await queryRunner.query('SELECT pg_backend_pid() AS pid');
                const cancelClient = new (await import('pg')).Client({ connectionString: process.env.CHANJET_ADMISSION_FIXTURE_URL } as never);
                try {
                  await cancelClient.connect();
                  await cancelClient.query('SELECT pg_terminate_backend($1)', [(self as { pid: number }).pid]);
                } catch { /* best effort */ }
                let gone = false;
                for (let i = 0; i < 20 && !gone; i += 1) {
                  const rows = await cancelClient.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [(self as { pid: number }).pid]).catch(() => []);
                  gone = !(rows as unknown[]).length;
                  if (!gone) await new Promise((resolve) => setTimeout(resolve, 100));
                }
                this.log.error(`READONLY_HOLD_MIRROR_TX_CLEANUP_UNKNOWN;sessionDiscarded=${gone}`);
              }
              throw error;
            } finally {
              if (commitTimer) clearTimeout(commitTimer);
              await queryRunner.release().catch(() => undefined);
            }
          } else {
            written = await persistWrites();
          }
          const { rawSnapshotId, rowCount, entityRows } = written;
          await this.finishJob(job, 'SUCCESS', {
            key: ep.key,
            fields,
            rows: rowCount,
            rawSnapshotId,
            entityRows,
          });
          results.push({
            key: ep.key,
            bookId: targetBookId,
            status: 'SUCCESS',
            fields,
            rows: rowCount,
            rawSnapshotId,
            entityRows,
          });
        } catch (err) {
          const error = readonlyFailureCode(err);
          await this.finishJob(job, 'FAIL', { key: ep.key }, error);
          await this.recordChanjetApiAlert(ep, path, targetBookId, error);
          results.push({ key: ep.key, bookId: targetBookId, status: 'FAIL', error });
        }
      }
    }

    // Mapping review/reclassification remains a separate human-authorized workflow.
    const fieldGapSummary = { scanned: 0, upserted: 0, statusCounts: {} };
    return { requestedScope: requested, books, results, fieldGapSummary };
  }

  async syncReadOnlyMirrorResilient(
    scope: string[] = [],
    bookId?: string,
    period?: string,
    maxAttempts = 3,
  ): Promise<{
    decision: 'GO' | 'HOLD';
    requestedScope: string[];
    books: string[];
    attempts: number;
    results: Array<{
      key: string;
      bookId: string;
      status: 'SUCCESS' | 'FAIL';
      fields?: number;
      rows?: number;
      rawSnapshotId?: string;
      entityRows?: number;
      error?: string;
      attempt: number;
    }>;
    unresolvedFailures: Array<{ key: string; bookId: string; error: string }>;
    fieldGapSummary: { scanned: number; upserted: number; statusCounts: Record<string, number> };
  }> {
    requireReadonlySync();
    requireReadonlyOrchestration();
    const safeMaxAttempts = Math.min(Math.max(Number(maxAttempts) || 3, 1), 3);
    const initial = await this.syncReadOnlyMirror(scope, bookId, period);
    const resultByTarget = new Map<string, (typeof initial.results)[number] & { attempt: number }>();
    initial.results.forEach((result) => resultByTarget.set(
      `${result.key}:${result.bookId}`,
      { ...result, attempt: 1 },
    ));
    let attempts = 1;

    while (attempts < safeMaxAttempts) {
      const failures = [...resultByTarget.values()].filter((result) => (
        result.status === 'FAIL'
        && classifyChanjetSyncFailure(result.error || '').retryEligible
      ));
      if (!failures.length) break;
      attempts += 1;
      for (const failed of failures) {
        try {
          const retried = await this.syncReadOnlyMirror(
            [failed.key],
            failed.bookId || undefined,
            period,
          );
          const retryResult = retried.results.find((result) => (
            result.key === failed.key && result.bookId === failed.bookId
          )) || retried.results[0];
          if (retryResult) {
            resultByTarget.set(`${failed.key}:${failed.bookId}`, { ...retryResult, attempt: attempts });
          }
        } catch (error) {
          resultByTarget.set(`${failed.key}:${failed.bookId}`, {
            ...failed,
            status: 'FAIL',
            error: readonlyFailureCode(error),
            attempt: attempts,
          });
        }
      }
    }

    const results = [...resultByTarget.values()];
    const unresolvedFailures = results
      .filter((result) => result.status === 'FAIL')
      .map((result) => ({
        key: result.key,
        bookId: result.bookId,
        error: result.error || 'unknown_error',
      }));
    return {
      decision: unresolvedFailures.length ? 'HOLD' : 'GO',
      requestedScope: initial.requestedScope,
      books: initial.books,
      attempts,
      results,
      unresolvedFailures,
      fieldGapSummary: await this.analyzeFieldGaps(),
    };
  }

  /**
   * Runs the complete safe Chanjet read-only lifecycle.
   *
   * The sequence deliberately stops after a failed mirror sync. Every write is
   * limited to ERP integration/audit tables; no Chanjet mutation or ERP
   * business-table overwrite is performed here.
   */
  async runReadonlyAlignmentCycle(
    requestedBy: string,
    scope: string[] = [],
    bookId?: string,
    period?: string,
    maxAttempts = 3,
    options: { compact?: boolean } = {},
  ): Promise<{
    decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
    requestedBy: string;
    startedAt: string;
    completedAt: string;
    writeChanjet: false;
    writeErpBusinessTables: false;
    mirror: Awaited<ReturnType<ChanjetIntegrationService['syncReadOnlyMirrorResilient']>>;
    exactMappings: Awaited<ReturnType<ChanjetIntegrationService['confirmDeterministicCounterpartyMappings']>>
      | { eligible: number; approved: number; skipped: number; sourceOnlyResolved: number; remainingPending: number; remainingConflicts: number; errors: Array<{ candidateKey: string; error: string }> }
      | null;
    masterDataMappings: Awaited<ReturnType<ChanjetIntegrationService['confirmDeterministicMasterDataMappings']>> | null;
    reconciliation: Awaited<ReturnType<ChanjetIntegrationService['runMappingReconciliation']>>
      | { scanned: number; created: number; unchanged: number; autoResolved: number; statusCounts: Record<string, number> }
      | null;
    readiness: ChanjetProductionReadiness | null;
    stoppedAt: string | null;
  }> {
    requireReadonlySync();
    const startedAt = new Date().toISOString();
    const actor = String(requestedBy || 'system:chanjet-readonly-cycle').slice(0, 128);
    const mirror = await this.syncReadOnlyMirrorResilient(scope, bookId, period, maxAttempts);
    if (mirror.decision === 'HOLD') {
      return {
        decision: 'HOLD',
        requestedBy: actor,
        startedAt,
        completedAt: new Date().toISOString(),
        writeChanjet: false,
        writeErpBusinessTables: false,
        mirror,
        exactMappings: null,
        masterDataMappings: null,
        reconciliation: null,
        readiness: null,
        stoppedAt: 'READONLY_MIRROR',
      };
    }

    // Keep these phases sequential. Each can inspect thousands of mapping rows;
    // running them in parallel made the API retain multiple large object graphs
    // and repeatedly exceed the production Node heap during scheduled recovery.
    const exactMappings = null;
    const masterDataMappings = null;
    const reconciliationFull = options.compact
      ? await this.runMappingReconciliation({ compact: true })
      : await this.runMappingReconciliation();
    const reconciliation = options.compact
      ? {
          scanned: reconciliationFull.scanned,
          created: reconciliationFull.created,
          unchanged: reconciliationFull.unchanged,
          autoResolved: reconciliationFull.autoResolved,
          statusCounts: reconciliationFull.statusCounts,
        }
      : reconciliationFull;
    const readiness = process.env.CHANJET_SYNC_POLICY === 'READONLY_VERIFY' ? null : await this.productionReadinessOverview();
    return {
      decision: readiness?.decision || mirror.decision,
      requestedBy: actor,
      startedAt,
      completedAt: new Date().toISOString(),
      writeChanjet: false,
      writeErpBusinessTables: false,
      mirror,
      exactMappings,
      masterDataMappings,
      reconciliation,
      readiness,
      stoppedAt: null,
    };
  }

  async analyzeFieldGaps(): Promise<{ scanned: number; upserted: number; statusCounts: Record<string, number> }> {
    requireReadonlySync();
    const approval = approvedReadonlyPolicy();
    const bookIds = process.env.CHANJET_SYNC_POLICY === 'READONLY_VERIFY' ? [approval.verification.bookId] : approval.books.map(b => b.bookId);
    const scope = process.env.CHANJET_SYNC_POLICY === 'READONLY_VERIFY' ? approval.verification.scope : approval.scopes;
    const approvedPaths = new Set(PROBE_ENDPOINTS.filter(ep => scope.includes(ep.key)).flatMap(ep => ep.requiresBook ? bookIds.map(id => ep.path.replace('{bookid}', id)) : [ep.path]));
    const [catalog, existingMappings] = await Promise.all([
      this.fieldCatalogRepo.find({ take: 5000 }),
      this.fieldMappingRepo.find({ take: 12000 }),
    ]);
    const fields = catalog.filter(field => approvedPaths.has(field.apiPath));
    const existingDecisions = new Map(existingMappings.map((mapping) => [
      this.fieldMappingIdentity(mapping.chanjetEndpoint, mapping.chanjetFieldPath, mapping.erpDomain, mapping.erpField),
      mapping.decisionStatus,
    ]));
    let upserted = 0;
    const statusCounts: Record<string, number> = {};
    for (const field of fields) {
      if (field.fieldPath === '$' || field.sampleType === 'object' || field.sampleType === 'array') continue;
      const suggestion = this.suggestErpFieldMapping(field);
      const identity = this.fieldMappingIdentity(
        field.apiPath,
        field.fieldPath,
        suggestion.erpDomain,
        suggestion.erpField,
      );
      const existingDecision = existingDecisions.get(identity);
      const decisionStatus = existingDecision || 'PENDING';
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
          decisionStatus,
          analysisNote: suggestion.analysisNote,
        },
        { conflictPaths: ['chanjetEndpoint', 'chanjetFieldPath', 'erpDomain', 'erpField'], skipUpdateIfNoValuesChanged: false },
      );
      upserted += 1;
    }
    return { scanned: fields.length, upserted, statusCounts };
  }

  private fieldMappingIdentity(endpoint: string, fieldPath: string, erpDomain: string, erpField: string): string {
    return [endpoint, fieldPath, erpDomain, erpField].join('\u001f');
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
    const validation = this.validateVoucherDraftInput(input);
    if (!validation.valid) {
      throw new Error(`VOUCHER_DRAFT_VALIDATION_FAILED: ${validation.errors.join('；')}`);
    }
    const existing = await this.voucherDraftRepo.findOne({
      where: { sourceBizType: input.sourceBizType, sourceBizId: input.sourceBizId },
      order: { createdAt: 'DESC' },
    });
    if (existing && existing.status !== 'REJECTED') {
      throw new Error(`DUPLICATE_ACTIVE_VOUCHER_DRAFT: ${input.sourceBizType}/${input.sourceBizId} 已有 ${existing.status} 草稿`);
    }
    const payloadHash = this.hashVoucherPayload(input);
    const idempotencyKey = this.hashText([
      input.sourceBizType,
      input.sourceBizId,
      input.bookId || '',
      input.period || '',
      payloadHash,
    ].join('\u001f'));
    const draft = this.voucherDraftRepo.create({
      sourceBizType: input.sourceBizType,
      sourceBizId: input.sourceBizId,
      companyCode: input.companyCode ?? '',
      bookId: input.bookId ?? '',
      period: input.period ?? '',
      title: input.title ?? '',
      voucherLines: input.voucherLines,
      status: 'DRAFT',
      idempotencyKey,
      payloadHash,
      pushAllowed: false,
      pushStatus: 'NOT_PUSHED',
      createdBy: createdBy || '',
      reviewedBy: null,
      reviewedAt: null,
      validatedBy: null,
      validatedAt: null,
      approvedBy: null,
      approvedAt: null,
      rawData: {
        ...(input.rawData || {}),
        validation: {
          debitTotal: validation.debitTotal,
          creditTotal: validation.creditTotal,
          warnings: validation.warnings,
          validatedAt: new Date().toISOString(),
        },
        externalWriteEnabled: false,
      },
    });
    return this.voucherDraftRepo.save(draft);
  }

  validateVoucherDraftInput(input: VoucherDraftInput): VoucherDraftValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!input.sourceBizType?.trim()) errors.push('sourceBizType 必填');
    if (!input.sourceBizId?.trim()) errors.push('sourceBizId 必填');
    if (!Array.isArray(input.voucherLines) || input.voucherLines.length === 0) {
      errors.push('voucherLines 必须为非空数组');
      return { valid: false, debitTotal: '0.00', creditTotal: '0.00', errors, warnings, pushEnabled: false };
    }
    let debitCents = 0;
    let creditCents = 0;
    input.voucherLines.forEach((line, index) => {
      const lineNo = index + 1;
      const summary = String(line.summary || line.memo || line.comments || '').trim();
      const debitSubject = String(line.debitSubject || line.debitSubjectCode || '').trim();
      const creditSubject = String(line.creditSubject || line.creditSubjectCode || '').trim();
      const subjectCode = String(line.subjectCode || line.accountCode || '').trim();
      const legacyAmount = this.voucherAmountToCents(line.amount);
      let debit = this.voucherAmountToCents(line.debitAmount ?? line.postedDr ?? line.basePostedDr);
      let credit = this.voucherAmountToCents(line.creditAmount ?? line.postedCr ?? line.basePostedCr);
      if (legacyAmount > 0 && debitSubject && creditSubject && debit === 0 && credit === 0) {
        debit = legacyAmount;
        credit = legacyAmount;
      }
      if (!summary) warnings.push(`第 ${lineNo} 行摘要为空`);
      if (!subjectCode && !debitSubject && !creditSubject) errors.push(`第 ${lineNo} 行缺少会计科目`);
      if (debit < 0 || credit < 0) errors.push(`第 ${lineNo} 行借贷金额不得为负数，冲销必须使用独立红字/反向策略`);
      if (debit === 0 && credit === 0) errors.push(`第 ${lineNo} 行借方和贷方金额不能同时为 0`);
      if (subjectCode && debit > 0 && credit > 0) errors.push(`第 ${lineNo} 行单科目分录不能同时有借方和贷方金额`);
      debitCents += debit;
      creditCents += credit;
    });
    if (debitCents !== creditCents) {
      errors.push(`借贷不平：借方 ${this.centsToAmount(debitCents)}，贷方 ${this.centsToAmount(creditCents)}`);
    }
    return {
      valid: errors.length === 0,
      debitTotal: this.centsToAmount(debitCents),
      creditTotal: this.centsToAmount(creditCents),
      errors,
      warnings,
      pushEnabled: false,
    };
  }

  async updateVoucherDraftStatus(
    id: string,
    status: ChanjetVoucherDraftEntity['status'],
    reviewedBy: string,
  ): Promise<ChanjetVoucherDraftEntity> {
    const draft = await this.voucherDraftRepo.findOneBy({ id });
    if (!draft) throw new Error(`voucher draft ${id} 不存在`);
    const previousStatus = draft.status;
    const allowedTransitions: Record<ChanjetVoucherDraftEntity['status'], ChanjetVoucherDraftEntity['status'][]> = {
      DRAFT: ['VALIDATED', 'REJECTED'],
      VALIDATED: ['DRAFT', 'REVIEWED', 'REJECTED'],
      REVIEWED: ['VALIDATED', 'APPROVED', 'REJECTED'],
      APPROVED: ['REVIEWED', 'PUSH_READY', 'REJECTED'],
      PUSH_READY: ['APPROVED', 'REJECTED', 'CANCELLED'],
      REJECTED: ['DRAFT'],
      CANCELLED: [],
    };
    if (draft.status !== status && !allowedTransitions[draft.status].includes(status)) {
      throw new Error(`INVALID_VOUCHER_DRAFT_TRANSITION: ${draft.status} -> ${status}`);
    }
    if (['VALIDATED', 'REVIEWED', 'APPROVED', 'PUSH_READY'].includes(status)) {
      const validation = this.validateVoucherDraftInput({
        sourceBizType: draft.sourceBizType,
        sourceBizId: draft.sourceBizId,
        voucherLines: draft.voucherLines,
      });
      if (!validation.valid) {
        throw new Error(`VOUCHER_DRAFT_VALIDATION_FAILED: ${validation.errors.join('；')}`);
      }
    }
    const actor = String(reviewedBy || '').trim();
    if (['REVIEWED', 'APPROVED'].includes(status) && (!actor || actor === draft.createdBy)) {
      throw new Error('VOUCHER_DUAL_CONTROL_REQUIRED: 制单人与复核/批准人必须不同');
    }
    if (status === 'VALIDATED') {
      draft.validatedBy = actor || null;
      draft.validatedAt = new Date();
    }
    if (status === 'REVIEWED') {
      if (!draft.validatedAt) throw new Error('VOUCHER_MUST_BE_VALIDATED_BEFORE_REVIEW');
      draft.reviewedBy = actor;
      draft.reviewedAt = new Date();
    }
    if (status === 'APPROVED') {
      if (!draft.reviewedAt) throw new Error('VOUCHER_MUST_BE_REVIEWED_BEFORE_APPROVAL');
      draft.approvedBy = actor;
      draft.approvedAt = new Date();
    }
    if (status === 'PUSH_READY' && (!draft.approvedAt || !draft.approvedBy)) {
      throw new Error('VOUCHER_MUST_BE_APPROVED_BEFORE_PUSH_READY');
    }
    draft.status = status;
    // PUSH_READY 只是 ERP 内部候选态；外部写入必须由未来独立 Gate 和独立写入服务开放。
    draft.pushAllowed = false;
    const rawData = draft.rawData || {};
    const lifecycle = Array.isArray(rawData.lifecycle) ? rawData.lifecycle : [];
    draft.rawData = {
      ...rawData,
      lifecycle: [...lifecycle, {
        from: previousStatus,
        to: status,
        actor,
        at: new Date().toISOString(),
        externalWriteEnabled: false,
      }],
    };
    return this.voucherDraftRepo.save(draft);
  }

  async listWritebackOutbox(limit = 100, state?: string): Promise<ChanjetWritebackOutboxEntity[]> {
    return this.writebackOutboxRepo.find({
      where: state ? { state: state as ChanjetOutboxState } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(Number(limit) || 100, 1), 500),
    });
  }

  async writebackPreparationOverview() {
    const draftStates = ['DRAFT', 'VALIDATED', 'REVIEWED', 'APPROVED', 'PUSH_READY', 'REJECTED', 'CANCELLED'] as const;
    const outboxStates: ChanjetOutboxState[] = [
      'READY', 'SENDING', 'ACKNOWLEDGED', 'FAILED', 'RETRYABLE', 'DEAD_LETTER', 'CANCELLED', 'REVERSED',
    ];
    const [draftCounts, outboxCounts, unsafeDrafts, unsafeOutbox] = await Promise.all([
      Promise.all(draftStates.map(async (state) => [state, await this.voucherDraftRepo.count({ where: { status: state } })] as const)),
      Promise.all(outboxStates.map(async (state) => [state, await this.writebackOutboxRepo.count({ where: { state } })] as const)),
      this.voucherDraftRepo.count({ where: { pushAllowed: true } }),
      this.writebackOutboxRepo.count({ where: { externalWriteEnabled: true } }),
    ]);
    const blockers = [
      ...(unsafeDrafts ? [`${unsafeDrafts} 个凭证草稿错误开放 pushAllowed`] : []),
      ...(unsafeOutbox ? [`${unsafeOutbox} 个 Outbox 错误开放 externalWriteEnabled`] : []),
    ];
    return {
      decision: blockers.length ? 'HOLD' : 'GO_WITH_CONDITIONS',
      externalWriteEnabled: false,
      externalNetworkTransportImplemented: false,
      draftStateCounts: Object.fromEntries(draftCounts),
      outboxStateCounts: Object.fromEntries(outboxCounts),
      unsafeDrafts,
      unsafeOutbox,
      capabilities: {
        doubleEntryValidation: true,
        makerReviewerSeparation: true,
        payloadHashLock: true,
        idempotentOutbox: true,
        boundedRetrySimulation: true,
        deadLetterSimulation: true,
        providerReceiptAudit: true,
        realProviderWrite: false,
      },
      wave7ApprovalPrecheck: {
        endpoint: '/api/chanjet/integration/external-write-approval/precheck',
        persistsApproval: false,
        executesExternalWrite: false,
        requiredSections: [
          'environment_and_book',
          'document_and_payload_hash',
          'amount_currency_period',
          'maker_reviewer_operator',
          'idempotency_and_readback',
          'compensation_and_stop_rules',
          'execution_window_and_expiry',
        ],
      },
      blockers,
      conditions: [
        'Wave 7 必须取得逐项、限时、可回退的外部最小写入批准。',
        '批准前仅允许 ERP 内部草稿、审核、Outbox 与 provider stub 演练。',
      ],
      nextGate: 'CHANJET_WAVE_7_EXTERNAL_MINIMAL_WRITE_APPROVAL',
    };
  }

  async precheckExternalMinimalWriteApproval(
    input: Partial<ChanjetExternalCanaryApprovalInput>,
  ): Promise<ChanjetExternalCanaryApprovalPrecheck> {
    const missingFields: string[] = [];
    const conflicts: string[] = [];
    const required = (field: string, value: unknown) => {
      if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
        missingFields.push(field);
      }
    };

    required('approvalId', input.approvalId);
    required('decision', input.decision);
    required('targetOutboxId', input.targetOutboxId);
    required('environmentName', input.environmentName);
    required('environmentType', input.environmentType);
    required('bookId', input.bookId);
    required('bookName', input.bookName);
    required('companyCode', input.companyCode);
    required('sourceBusinessType', input.sourceBusinessType);
    required('sourceBusinessId', input.sourceBusinessId);
    required('documentType', input.documentType);
    required('payloadHash', input.payloadHash);
    required('debitTotal', input.debitTotal);
    required('creditTotal', input.creditTotal);
    required('currency', input.currency);
    required('period', input.period);
    required('maker', input.maker);
    required('reviewer', input.reviewer);
    required('operator', input.operator);
    required('idempotencyKey', input.idempotencyKey);
    required('readback.method', input.readback?.method);
    required('readback.endpoint', input.readback?.endpoint);
    required('readback.expectedIdentity', input.readback?.expectedIdentity);
    required('readback.expectedStatus', input.readback?.expectedStatus);
    required('readback.expectedAmount', input.readback?.expectedAmount);
    required('compensation.method', input.compensation?.method);
    required('compensation.owner', input.compensation?.owner);
    required('executionWindow.startsAt', input.executionWindow?.startsAt);
    required('executionWindow.endsAt', input.executionWindow?.endsAt);
    required('executionWindow.expiresAt', input.executionWindow?.expiresAt);
    required('approvedBy', input.approvedBy);
    required('approvedAt', input.approvedAt);

    if (input.decision && input.decision !== 'APPROVE') conflicts.push(`approval decision is ${input.decision}`);
    if (input.environmentType === 'PRODUCTION' && input.productionImpactAcknowledged !== true) {
      conflicts.push('production environment requires productionImpactAcknowledged=true');
    }
    if (input.maker && input.reviewer && input.maker.trim() === input.reviewer.trim()) {
      conflicts.push('maker and reviewer must be different');
    }
    if (input.providerContractConfirmed !== true) {
      conflicts.push('provider readback and compensation contract is not confirmed');
    }
    if (!Array.isArray(input.stopRules) || input.stopRules.length < 4) {
      missingFields.push('stopRules(timeout/mismatch/duplicate/missing-receipt)');
    } else {
      const normalizedRules = input.stopRules.join(' ').toLowerCase();
      for (const rule of ['timeout', 'mismatch', 'duplicate', 'receipt']) {
        if (!normalizedRules.includes(rule)) conflicts.push(`stop rule missing ${rule}`);
      }
    }
    if (input.readback?.method && input.readback.method !== 'GET') conflicts.push('readback must use GET');
    if (input.readback?.endpoint) {
      const endpoint = input.readback.endpoint.trim();
      if (!endpoint.startsWith('/') || /^https?:\/\//i.test(endpoint)) {
        conflicts.push('readback endpoint must be a reviewed relative API path');
      }
    }

    const startsAt = this.parseApprovalDate(input.executionWindow?.startsAt, 'executionWindow.startsAt', conflicts);
    const endsAt = this.parseApprovalDate(input.executionWindow?.endsAt, 'executionWindow.endsAt', conflicts);
    const expiresAt = this.parseApprovalDate(input.executionWindow?.expiresAt, 'executionWindow.expiresAt', conflicts);
    const approvedAt = this.parseApprovalDate(input.approvedAt, 'approvedAt', conflicts);
    const now = Date.now();
    if (startsAt && endsAt) {
      if (endsAt.getTime() <= startsAt.getTime()) conflicts.push('execution window end must be after start');
      if (endsAt.getTime() - startsAt.getTime() > 2 * 60 * 60 * 1000) conflicts.push('execution window exceeds 2 hours');
      if (endsAt.getTime() <= now) conflicts.push('execution window has expired');
    }
    if (expiresAt) {
      if (expiresAt.getTime() <= now) conflicts.push('approval has expired');
      if (endsAt && expiresAt.getTime() < endsAt.getTime()) conflicts.push('approval expires before execution window ends');
    }
    if (approvedAt && approvedAt.getTime() > now + 5 * 60 * 1000) conflicts.push('approvedAt is in the future');

    let outbox: ChanjetWritebackOutboxEntity | null = null;
    let draft: ChanjetVoucherDraftEntity | null = null;
    if (input.targetOutboxId) {
      outbox = await this.writebackOutboxRepo.findOneBy({ id: input.targetOutboxId });
      if (!outbox) {
        conflicts.push(`outbox ${input.targetOutboxId} does not exist`);
      } else {
        if (outbox.state !== 'READY') conflicts.push(`outbox state must be READY, got ${outbox.state}`);
        if (outbox.externalWriteEnabled) conflicts.push('outbox externalWriteEnabled must remain false before execution Gate');
        if (input.payloadHash && outbox.payloadHash !== input.payloadHash) conflicts.push('payloadHash does not match outbox');
        if (input.idempotencyKey && outbox.idempotencyKey !== input.idempotencyKey) conflicts.push('idempotencyKey does not match outbox');
        draft = await this.voucherDraftRepo.findOneBy({ id: outbox.draftId });
        if (!draft) conflicts.push(`voucher draft ${outbox.draftId} does not exist`);
      }
    }

    let validation: VoucherDraftValidation | null = null;
    if (draft) {
      if (draft.status !== 'PUSH_READY') conflicts.push(`voucher draft state must be PUSH_READY, got ${draft.status}`);
      if (!draft.approvedAt || !draft.approvedBy) conflicts.push('voucher draft approval evidence is missing');
      if (draft.pushAllowed) conflicts.push('voucher draft pushAllowed must remain false before execution Gate');
      if (input.bookId && input.bookId !== draft.bookId) conflicts.push('bookId does not match voucher draft');
      if (input.companyCode && input.companyCode !== draft.companyCode) conflicts.push('companyCode does not match voucher draft');
      if (input.sourceBusinessType && input.sourceBusinessType !== draft.sourceBizType) conflicts.push('sourceBusinessType does not match voucher draft');
      if (input.sourceBusinessId && input.sourceBusinessId !== draft.sourceBizId) conflicts.push('sourceBusinessId does not match voucher draft');
      if (input.period && input.period !== draft.period) conflicts.push('period does not match voucher draft');
      if (input.maker && input.maker !== draft.createdBy) conflicts.push('maker does not match voucher draft creator');
      if (input.reviewer && input.reviewer !== draft.approvedBy) conflicts.push('reviewer does not match voucher draft approver');
      validation = this.validateVoucherDraftInput({
        sourceBizType: draft.sourceBizType,
        sourceBizId: draft.sourceBizId,
        voucherLines: draft.voucherLines,
      });
      if (!validation.valid) conflicts.push(`voucher validation failed: ${validation.errors.join('; ')}`);
      if (input.debitTotal && this.normalizeApprovalAmount(input.debitTotal) !== validation.debitTotal) conflicts.push('debitTotal does not match voucher draft');
      if (input.creditTotal && this.normalizeApprovalAmount(input.creditTotal) !== validation.creditTotal) conflicts.push('creditTotal does not match voucher draft');
      if (input.readback?.expectedAmount && this.normalizeApprovalAmount(input.readback.expectedAmount) !== validation.debitTotal) {
        conflicts.push('readback expectedAmount does not match voucher draft');
      }
    }

    const decision = missingFields.length === 0 && conflicts.length === 0
      ? 'READY_FOR_A2_A1_A7_REVIEW'
      : 'HOLD';
    return {
      decision,
      missingFields: [...new Set(missingFields)],
      conflicts: [...new Set(conflicts)],
      evidence: {
        approvalId: input.approvalId || null,
        outboxId: outbox?.id || null,
        draftId: draft?.id || null,
        outboxState: outbox?.state || null,
        draftState: draft?.status || null,
        payloadHashMatched: Boolean(outbox && input.payloadHash && outbox.payloadHash === input.payloadHash),
        idempotencyKeyMatched: Boolean(outbox && input.idempotencyKey && outbox.idempotencyKey === input.idempotencyKey),
        debitTotal: validation?.debitTotal || null,
        creditTotal: validation?.creditTotal || null,
        executionWindowHours: startsAt && endsAt
          ? Number(((endsAt.getTime() - startsAt.getTime()) / 3_600_000).toFixed(2))
          : null,
      },
      externalWriteEnabled: false,
      externalNetworkCalled: false,
      nextGate: decision === 'HOLD'
        ? 'CHANJET_WAVE_7_EXTERNAL_MINIMAL_WRITE_APPROVAL'
        : 'CHANJET_WAVE_7_A2_A1_A7_PRE_EXECUTION_REVIEW',
    };
  }

  async prepareVoucherWritebackOutbox(draftId: string, actor: string): Promise<ChanjetWritebackOutboxEntity> {
    const draft = await this.voucherDraftRepo.findOneBy({ id: draftId });
    if (!draft) throw new Error(`voucher draft ${draftId} 不存在`);
    if (draft.status !== 'PUSH_READY') throw new Error('VOUCHER_NOT_PUSH_READY');
    if (!draft.approvedBy || !draft.approvedAt) throw new Error('VOUCHER_APPROVAL_EVIDENCE_MISSING');
    const currentHash = this.hashVoucherPayload({
      sourceBizType: draft.sourceBizType,
      sourceBizId: draft.sourceBizId,
      companyCode: draft.companyCode,
      bookId: draft.bookId,
      period: draft.period,
      title: draft.title,
      voucherLines: draft.voucherLines,
    });
    if (!draft.payloadHash || currentHash !== draft.payloadHash) throw new Error('VOUCHER_PAYLOAD_HASH_MISMATCH');
    const existing = await this.writebackOutboxRepo.findOneBy({ idempotencyKey: draft.idempotencyKey });
    if (existing) return existing;
    const createdAt = new Date().toISOString();
    return this.writebackOutboxRepo.save(this.writebackOutboxRepo.create({
      draftId: draft.id,
      idempotencyKey: draft.idempotencyKey,
      payloadHash: draft.payloadHash,
      state: 'READY',
      attemptCount: 0,
      maxAttempts: 3,
      nextAttemptAt: null,
      providerRequestHash: '',
      providerResponseHash: '',
      providerReceipt: null,
      errorMessage: null,
      compensationRef: '',
      externalWriteEnabled: false,
      createdBy: actor,
      approvedBy: draft.approvedBy,
      stateHistory: [{ state: 'READY', actor, at: createdAt, transport: 'DISABLED' }],
    }));
  }

  async simulateWritebackOutbox(
    id: string,
    outcome: 'ACKNOWLEDGED' | 'RETRYABLE' | 'FAILED' | 'REVERSED' | 'CANCELLED',
    actor: string,
  ): Promise<ChanjetWritebackOutboxEntity> {
    const outbox = await this.writebackOutboxRepo.findOneBy({ id });
    if (!outbox) throw new Error(`writeback outbox ${id} 不存在`);
    if (outbox.externalWriteEnabled) throw new Error('CHANJET_EXTERNAL_WRITE_MUST_REMAIN_DISABLED');
    if (outbox.state === outcome && ['ACKNOWLEDGED', 'FAILED', 'DEAD_LETTER', 'CANCELLED', 'REVERSED'].includes(outbox.state)) {
      return outbox;
    }
    const allowedOutcomes: Partial<Record<ChanjetOutboxState, ChanjetOutboxState[]>> = {
      READY: ['ACKNOWLEDGED', 'RETRYABLE', 'FAILED', 'CANCELLED'],
      RETRYABLE: ['ACKNOWLEDGED', 'RETRYABLE', 'FAILED', 'CANCELLED'],
      ACKNOWLEDGED: ['REVERSED'],
    };
    if (!(allowedOutcomes[outbox.state] || []).includes(outcome)) {
      throw new Error(`OUTBOX_NOT_SIMULATABLE: ${outbox.state} -> ${outcome}`);
    }
    outbox.attemptCount += 1;
    let nextState: ChanjetOutboxState = outcome;
    if (outcome === 'RETRYABLE' && outbox.attemptCount >= outbox.maxAttempts) nextState = 'DEAD_LETTER';
    const now = new Date();
    outbox.state = nextState;
    outbox.nextAttemptAt = nextState === 'RETRYABLE' ? new Date(now.getTime() + 5 * 60 * 1000) : null;
    outbox.errorMessage = nextState === 'ACKNOWLEDGED' ? null : `PROVIDER_STUB_${nextState}`;
    outbox.providerRequestHash = this.hashText(`stub-request:${outbox.payloadHash}:${outbox.attemptCount}`);
    outbox.providerResponseHash = this.hashText(`stub-response:${nextState}:${outbox.attemptCount}`);
    const previousReceipt = outbox.providerReceipt;
    const receiptHistory = Array.isArray(previousReceipt?.history)
      ? previousReceipt.history
      : previousReceipt
        ? [previousReceipt]
        : [];
    const receipt = {
      simulator: true,
      externalNetworkCalled: false,
      outcome: nextState,
      attempt: outbox.attemptCount,
      at: now.toISOString(),
    };
    outbox.providerReceipt = { ...receipt, history: [...receiptHistory, receipt] };
    if (nextState === 'REVERSED') {
      outbox.compensationRef = `STUB-REVERSAL-${outbox.id}-${outbox.attemptCount}`;
    }
    outbox.stateHistory = [...(outbox.stateHistory || []), {
      state: nextState,
      actor,
      at: now.toISOString(),
      simulator: true,
      externalNetworkCalled: false,
    }];
    return this.writebackOutboxRepo.save(outbox);
  }

  private hashVoucherPayload(input: VoucherDraftInput): string {
    return this.hashText(JSON.stringify(this.stableJsonValue({
      sourceBizType: input.sourceBizType,
      sourceBizId: input.sourceBizId,
      companyCode: input.companyCode || '',
      bookId: input.bookId || '',
      period: input.period || '',
      title: input.title || '',
      voucherLines: input.voucherLines,
    })));
  }

  private parseApprovalDate(value: string | undefined, field: string, conflicts: string[]): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      conflicts.push(`${field} is not a valid ISO timestamp`);
      return null;
    }
    return parsed;
  }

  private normalizeApprovalAmount(value: string): string {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : value.trim();
  }

  private stableJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.stableJsonValue(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, this.stableJsonValue(item)]));
  }

  private hashText(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private voucherAmountToCents(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount * 100);
  }

  private centsToAmount(value: number): string {
    return (value / 100).toFixed(2);
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

  async runMappingReconciliation(options: { compact?: boolean } = {}): Promise<{
    scanned: number;
    created: number;
    unchanged: number;
    autoResolved: number;
    statusCounts: Record<string, number>;
    results: ChanjetReconciliationResultEntity[];
  }> {
    requireReadonlySync();
    // execution-bound write gate: reconciliation candidate/resolution writes
    // refuse for a held/expired execution (legacy paths pass through)
    await executionWriteGate();
    const job = await this.createJob('RECONCILE', '', '', {
      scope: 'MASTER_MAPPING',
      mode: 'middle-layer-only',
    });
    const scopeState = activeExecutionScope();

    try {
      const approval = approvedReadonlyPolicy();
      const bookIds = process.env.CHANJET_SYNC_POLICY === 'READONLY_VERIFY' ? [approval.verification.bookId] : approval.books.map(b => b.bookId);
      const [mappings, openResults] = await Promise.all([
        this.mappingRepo.find({ where: { bookId: In(bookIds) }, take: 2000, order: { mappingType: 'ASC', createdAt: 'DESC' } }),
        this.reconciliationRepo.find({
          where: { reconciliationType: 'MASTER_MAPPING', resolved: false, bookId: In(bookIds) },
          order: { createdAt: 'DESC' },
          take: 5000,
        }),
      ]);
      const results: ChanjetReconciliationResultEntity[] = [];
      const statusCounts: Record<string, number> = {};
      let created = 0;
        let unchanged = 0;
      for (const mapping of mappings) {
        const issue = this.mappingIssue(mapping);
        if (!issue) continue;
        const subjectKey = mapping.erpCode || mapping.chanjetId || mapping.chanjetCode || String(mapping.id);
        const issueKey = this.reconciliationIssueKey(
          mapping.mappingType,
          mapping.bookId ?? '',
          subjectKey,
          issue.status,
          issue.diffSummary,
        );
        const existing = openResults.find((result) => this.reconciliationIssueKey(
          result.subjectType,
          result.bookId,
          result.subjectKey,
          result.status,
          result.diffSummary,
        ) === issueKey);
        if (existing) {
          unchanged += 1;
          continue;
        }
        const result = this.reconciliationRepo.create({
          reconciliationType: 'MASTER_MAPPING',
          companyCode: '',
          bookId: mapping.bookId ?? '',
          period: '',
          status: issue.status,
          severity: issue.severity,
          subjectType: mapping.mappingType,
          subjectKey,
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
        assertReadonlyOrchestrationOwnerIfPresent();
        // execution-bound: each reconciliation save shares a transaction with
        // its own liveness gate — a HOLD/deadline after the worker's last ACK
        // rolls back this save (zero late writes)
        const saved = scopeState
          ? await this.ds.transaction(async manager => {
              await executionWriteGateTx(manager.queryRunner!, scopeState.current, { forUpdate: true });
              return manager.getRepository(ChanjetReconciliationResultEntity).save(result);
            })
          : await this.reconciliationRepo.save(result);
        created += 1;
        statusCounts[saved.status] = (statusCounts[saved.status] || 0) + 1;
        if (!options.compact) results.push(saved);
      }

      const autoResolved = 0;
      // A finite readonly run cannot approve or auto-resolve historical differences.
      await this.finishJob(job, 'SUCCESS', {
        scanned: mappings.length,
        created,
        unchanged,
        autoResolved,
        statusCounts,
      });
      return { scanned: mappings.length, created, unchanged, autoResolved, statusCounts, results };
    } catch (err) {
      await this.finishJob(job, 'FAIL', {}, (err as Error).message);
      throw err;
    }
  }

  private reconciliationIssueKey(
    subjectType: string,
    bookId: string,
    subjectKey: string,
    status: string,
    diffSummary: string,
  ): string {
    return [subjectType, bookId, subjectKey, status, diffSummary]
      .map((value) => String(value || '').trim())
      .join('|');
  }

  async listMasterMappings(mappingType?: string): Promise<ChanjetMasterMappingEntity[]> {
    return this.mappingRepo.find({
      where: mappingType ? { mappingType: mappingType as ChanjetMappingType } : {},
      order: { mappingType: 'ASC', bookId: 'ASC', erpCode: 'ASC', chanjetName: 'ASC' },
      take: 1000,
    });
  }

  async counterpartyMappingCandidates(): Promise<ChanjetCounterpartyCandidateOverview> {
    const [snapshots, bookMaps, customerRows, supplierRows, approvedMappings] = await Promise.all([
      this.entitySnapshotRepo.find({
        where: { entityType: 'CUSTOMER_SUPPLIER' },
        order: { updatedAt: 'DESC' },
        take: 5000,
      }),
      this.bookCompanyMapRepo.find({ where: { syncEnabled: true } }),
      this.ds.query(
        `SELECT customer_no AS code, customer_name AS name, company_code, status
           FROM sal_customers`,
      ).catch((error) => {
        this.log.warn(`Chanjet customer mapping candidates unavailable: ${(error as Error).message}`);
        return [];
      }),
      this.ds.query(
        `SELECT supplier_code AS code, supplier_name AS name,
                COALESCE(owner_company_code, '') AS company_code, status
           FROM prc2_suppliers`,
      ).catch((error) => {
        this.log.warn(`Chanjet supplier mapping candidates unavailable: ${(error as Error).message}`);
        return [];
      }),
      this.mappingRepo.find({
        where: { mappingType: In(['CUSTOMER', 'SUPPLIER']), reviewStatus: 'APPROVED' },
        take: 10000,
      }),
    ]);
    const companyByBook = new Map(bookMaps.map((mapping) => [mapping.bookid, mapping.companyCode]));
    const masters: ErpCounterpartyMaster[] = [
      ...(customerRows as Array<Record<string, unknown>>).map((row) => ({
        mappingType: 'CUSTOMER' as const,
        code: String(row.code || ''),
        name: String(row.name || ''),
        companyCode: String(row.company_code || ''),
        status: String(row.status || ''),
      })),
      ...(supplierRows as Array<Record<string, unknown>>).map((row) => ({
        mappingType: 'SUPPLIER' as const,
        code: String(row.code || ''),
        name: String(row.name || ''),
        companyCode: String(row.company_code || ''),
        status: String(row.status || ''),
      })),
    ];
    const validSnapshots = snapshots.filter((snapshot) => !getChanjetBusinessFailure(snapshot.rawData));
    const generatedCandidates = validSnapshots.flatMap((snapshot) => {
      const role = this.detectCounterpartyRole(snapshot.rawData || {});
      const mappingTypes = this.counterpartyMappingTypes(role);
      if (!mappingTypes.length) {
        return [this.buildCounterpartyMappingCandidate(snapshot, null, role, companyByBook.get(snapshot.bookId) || '', masters)];
      }
      return mappingTypes.map((mappingType) => (
        this.buildCounterpartyMappingCandidate(snapshot, mappingType, role, companyByBook.get(snapshot.bookId) || '', masters)
      ));
    });
    const candidates = generatedCandidates.map((candidate) => {
      if (!candidate.mappingType) return candidate;
      const approvedByExternal = approvedMappings.find((mapping) => (
        mapping.mappingType === candidate.mappingType
        && mapping.bookId === candidate.bookId
        && mapping.chanjetId === candidate.chanjetId
      ));
      const approvedResolutionKind = String(
        (approvedByExternal?.rawData as Record<string, unknown> | null)?.resolutionKind || '',
      );
      const approvedIsSourceIdentity = approvedResolutionKind === 'CHANJET_SOURCE_IDENTITY'
        || approvedByExternal?.matchStatus === 'SOURCE_ONLY';
      if (approvedByExternal && (!approvedIsSourceIdentity || candidate.matchStatus === 'SOURCE_ONLY')) {
        return {
          ...candidate,
          matchStatus: approvedIsSourceIdentity ? 'SOURCE_ONLY' as const : 'MATCHED' as const,
          matchKind: approvedIsSourceIdentity ? 'SOURCE_IDENTITY' as const : candidate.matchKind,
          confidence: Number(approvedByExternal.confidence || 100),
          erpCode: approvedByExternal.erpCode,
          erpName: approvedByExternal.erpName,
          sourceIdentityEligible: approvedIsSourceIdentity,
          systemApprovalEligible: false,
          requiresApproval: false,
          canAutoApprove: true,
          evidence: [
            ...candidate.evidence,
            approvedIsSourceIdentity
              ? '采用已确认的好业财只读源身份；不代表 ERP 业务主档已存在'
              : '采用当前账套内已确认的精确映射',
          ],
        };
      }
      const approvedByErp = candidate.erpCode
        ? approvedMappings.find((mapping) => (
          mapping.mappingType === candidate.mappingType
          && mapping.bookId === candidate.bookId
          && mapping.erpCode === candidate.erpCode
          && mapping.chanjetId !== candidate.chanjetId
        ))
        : null;
      if (candidate.matchStatus === 'MATCHED' && approvedByErp) {
        return {
          ...candidate,
          matchStatus: 'CONFLICT' as const,
          matchKind: 'CONFLICT' as const,
          systemApprovalEligible: false,
          systemApprovalReason: `ERP 编码已被映射 ${approvedByErp.id} 占用，必须人工处理。`,
          requiresApproval: true,
          canAutoApprove: false,
          evidence: [
            ...candidate.evidence,
            `ERP 编码 ${candidate.erpCode} 已批准映射到另一好业财 ID ${approvedByErp.chanjetId}`,
          ],
        };
      }
      return candidate;
    });
    const matched = candidates.filter((candidate) => candidate.matchStatus === 'MATCHED').length;
    const sourceOnly = candidates.filter((candidate) => candidate.matchStatus === 'SOURCE_ONLY').length;
    const conflicts = candidates.filter((candidate) => candidate.matchStatus === 'CONFLICT').length;
    const pending = candidates.length - matched - sourceOnly - conflicts;
    const unknownRole = candidates.filter((candidate) => candidate.roleCandidate === 'UNKNOWN').length;
    const approvedCoverage = candidates.filter((candidate) => (
      !!candidate.mappingType
      && approvedMappings.some((mapping) => (
        mapping.mappingType === candidate.mappingType
        && mapping.bookId === candidate.bookId
        && mapping.chanjetId === candidate.chanjetId
        && mapping.erpCode === candidate.erpCode
      ))
    )).length;
    const decision = conflicts > 0 || unknownRole > 0
      ? 'HOLD'
      : pending > 0 || approvedCoverage < matched + sourceOnly
        ? 'GO_WITH_CONDITIONS'
        : 'GO';
    return {
      generatedAt: new Date().toISOString(),
      decision,
      summary: {
        sourceRows: validSnapshots.length,
        candidates: candidates.length,
        matched,
        sourceOnly,
        pending,
        conflicts,
        unknownRole,
        approvedMappings: approvedCoverage,
        nextGate: matched + sourceOnly > approvedCoverage
          ? 'CHANJET_COUNTERPARTY_MAPPING_APPROVAL'
          : 'CHANJET_FINANCE_READ_MODEL_PROMOTION_REVIEW',
      },
      candidates,
      guardrails: {
        exactCodeMatchScore: 100,
        exactNormalizedNameMatchScore: 95,
        fuzzyAutoMatch: false,
        autoApprove: 'exact_code_name_company_active_or_readonly_source_identity',
        chanjetWrite: false,
        erpBusinessTableWrite: false,
        rule: '优先与真实 sal_customers / prc2_suppliers 精确匹配；ERP 主档不存在但好业财身份完整时，只在中间层确认 SOURCE_ONLY 只读身份，不写客户/供应商业务表；日后 ERP 主档出现时自动晋升为精确映射。',
      },
    };
  }

  async generateCounterpartyMappingCandidates(reviewedBy: string): Promise<{
    preview: ChanjetCounterpartyCandidateOverview;
    created: number;
    updated: number;
    sourceOnlyResolved: number;
    staleRoleMappingsRejected: number;
    skippedApproved: number;
    skippedUnmatched: number;
  }> {
    const preview = await this.counterpartyMappingCandidates();
    const existingMappings = await this.mappingRepo.find({
      where: { mappingType: In(['CUSTOMER', 'SUPPLIER']) },
      take: 10000,
    });
    let created = 0;
    let updated = 0;
    let sourceOnlyResolved = 0;
    let staleRoleMappingsRejected = 0;
    let skippedApproved = 0;
    let skippedUnmatched = 0;

    for (const mapping of existingMappings) {
      if (
        mapping.reviewStatus !== 'PENDING'
        || !this.isStaleCounterpartyRoleMapping(mapping, preview.candidates)
      ) continue;
      const currentTypes = preview.candidates
        .filter((candidate) => candidate.bookId === mapping.bookId && candidate.chanjetId === mapping.chanjetId)
        .map((candidate) => candidate.mappingType)
        .filter((value): value is CounterpartyMappingType => !!value);
      mapping.reviewStatus = 'REJECTED';
      mapping.reviewedBy = `system:role-reclassification:${reviewedBy || 'system'}`.slice(0, 128);
      mapping.reviewedAt = new Date();
      mapping.rawData = {
        ...(mapping.rawData || {}),
        resolutionKind: 'STALE_ROLE_CLASSIFICATION',
        staleMappingType: mapping.mappingType,
        currentMappingTypes: [...new Set(currentTypes)],
        rejectedAt: new Date().toISOString(),
        rejectedBy: reviewedBy || 'system',
        writeErpBusinessTables: false,
        writeChanjet: false,
        reason: '好业财 partyRoleTypeId 已确定当前角色，旧映射类型不再适用；保留记录用于审计。',
      };
      await this.mappingRepo.save(mapping);
      staleRoleMappingsRejected += 1;
    }

    for (const candidate of preview.candidates) {
      const sourceOnly = candidate.matchStatus === 'SOURCE_ONLY';
      if (
        !candidate.mappingType
        || (candidate.matchStatus !== 'MATCHED' && !sourceOnly)
        || !candidate.erpCode
      ) {
        skippedUnmatched += 1;
        continue;
      }
      const existing = existingMappings.find((mapping) => (
        mapping.mappingType === candidate.mappingType
        && mapping.bookId === candidate.bookId
        && mapping.chanjetId === candidate.chanjetId
      ));
      const existingResolutionKind = String(
        (existing?.rawData as Record<string, unknown> | null)?.resolutionKind || '',
      );
      const existingIsSourceIdentity = existingResolutionKind === 'CHANJET_SOURCE_IDENTITY'
        || existing?.matchStatus === 'SOURCE_ONLY';
      if (existing?.reviewStatus === 'APPROVED' && (sourceOnly || !existingIsSourceIdentity)) {
        skippedApproved += 1;
        if (sourceOnly) sourceOnlyResolved += 1;
        continue;
      }
      const resolutionKind = sourceOnly ? 'CHANJET_SOURCE_IDENTITY' : 'ERP_EXACT_CANDIDATE';
      const rawData = {
        source: 'counterparty_mapping_candidate_generator',
        resolutionKind,
        sourceOnly,
        erpBusinessMasterExists: !sourceOnly,
        writeErpBusinessTables: false,
        writeChanjet: false,
        generatedBy: reviewedBy || 'system',
        generatedAt: new Date().toISOString(),
        evidence: candidate.evidence,
        alternatives: candidate.alternatives,
        sourceSnapshotId: candidate.snapshotId,
      };
      if (existing) {
        existing.erpCode = candidate.erpCode;
        existing.erpName = candidate.erpName;
        existing.chanjetCode = candidate.chanjetCode;
        existing.chanjetName = candidate.chanjetName;
        existing.matchStatus = sourceOnly ? 'SOURCE_ONLY' : 'MATCHED';
        existing.confidence = candidate.confidence.toFixed(2);
        existing.reviewStatus = sourceOnly ? 'APPROVED' : 'PENDING';
        existing.reviewedBy = sourceOnly ? `system:source-identity:${reviewedBy || 'system'}` : null;
        existing.reviewedAt = sourceOnly ? new Date() : null;
        existing.rawData = rawData;
        await this.mappingRepo.save(existing);
        updated += 1;
        if (sourceOnly) sourceOnlyResolved += 1;
      } else {
        await this.upsertMasterMapping({
          mappingType: candidate.mappingType,
          bookId: candidate.bookId,
          erpCode: candidate.erpCode,
          erpName: candidate.erpName,
          chanjetId: candidate.chanjetId,
          chanjetCode: candidate.chanjetCode,
          chanjetName: candidate.chanjetName,
          matchStatus: sourceOnly ? 'SOURCE_ONLY' : 'MATCHED',
          confidence: candidate.confidence.toFixed(2),
          reviewStatus: sourceOnly ? 'APPROVED' : 'PENDING',
          reviewedBy: sourceOnly ? `system:source-identity:${reviewedBy || 'system'}` : null,
          reviewedAt: sourceOnly ? new Date() : null,
          rawData,
        });
        created += 1;
        if (sourceOnly) sourceOnlyResolved += 1;
      }
    }
    return {
      preview,
      created,
      updated,
      sourceOnlyResolved,
      staleRoleMappingsRejected,
      skippedApproved,
      skippedUnmatched,
    };
  }

  async confirmDeterministicCounterpartyMappings(
    reviewedBy = 'system:chanjet-exact-match',
    options: { compact?: boolean } = {},
  ): Promise<{
    generated: Awaited<ReturnType<ChanjetIntegrationService['generateCounterpartyMappingCandidates']>>;
    eligible: number;
    approved: number;
    skipped: number;
    sourceOnlyResolved: number;
    remainingPending: number;
    remainingConflicts: number;
    errors: Array<{ candidateKey: string; error: string }>;
  }> {
    const generated = await this.generateCounterpartyMappingCandidates(reviewedBy);
    const eligibleCandidates = generated.preview.candidates.filter((candidate) => (
      candidate.mappingType && candidate.systemApprovalEligible
    ));
    const pendingMappings = await this.mappingRepo.find({
      where: {
        mappingType: In(['CUSTOMER', 'SUPPLIER']),
        reviewStatus: 'PENDING',
      },
      take: 10000,
    });
    let approved = 0;
    let skipped = 0;
    const errors: Array<{ candidateKey: string; error: string }> = [];

    for (const candidate of eligibleCandidates) {
      const mapping = pendingMappings.find((item) => (
        item.mappingType === candidate.mappingType
        && item.bookId === candidate.bookId
        && item.chanjetId === candidate.chanjetId
        && item.erpCode === candidate.erpCode
      ));
      if (!mapping) {
        skipped += 1;
        continue;
      }
      try {
        await this.updateMappingReview(mapping.id, 'APPROVED', reviewedBy);
        approved += 1;
      } catch (error) {
        errors.push({ candidateKey: candidate.candidateKey, error: (error as Error).message });
      }
    }
    const eligible = eligibleCandidates.length;
    const compactGenerated = options.compact
      ? {
          ...generated,
          preview: {
            ...generated.preview,
            candidates: [],
          },
        }
      : generated;
    if (options.compact) {
      generated.preview.candidates.length = 0;
      eligibleCandidates.length = 0;
      pendingMappings.length = 0;
    }
    const resolvedOverview = await this.counterpartyMappingCandidates();
    const resolvedSummary = resolvedOverview.summary;
    if (options.compact) resolvedOverview.candidates.length = 0;
    return {
      generated: compactGenerated,
      eligible,
      approved,
      skipped,
      sourceOnlyResolved: resolvedSummary.sourceOnly,
      remainingPending: resolvedSummary.pending,
      remainingConflicts: resolvedSummary.conflicts,
      errors: options.compact ? errors.slice(0, 20) : errors,
    };
  }

  async updateMappingReview(
    id: string,
    reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED',
    reviewedBy: string,
  ): Promise<ChanjetMasterMappingEntity> {
    const mapping = await this.mappingRepo.findOneBy({ id });
    if (!mapping) throw new Error(`mapping ${id} 不存在`);
    if (reviewStatus === 'APPROVED') {
      if (!mapping.erpCode || !mapping.chanjetId) {
        throw new Error('映射缺少 ERP 编码或好业财 ID，禁止批准');
      }
      if (!['MATCHED', 'MANUAL'].includes(mapping.matchStatus)) {
        throw new Error(`映射状态 ${mapping.matchStatus} 不可批准，必须先达到 MATCHED 或 MANUAL`);
      }
      if (mapping.bookId) {
        const bookMap = await this.bookCompanyMapRepo.findOneBy({ bookid: mapping.bookId });
        if (!bookMap?.syncEnabled) throw new Error(`账套 ${mapping.bookId} 未通过启用的一对一公司映射 Gate`);
      }
      const approved = await this.mappingRepo.find({
        where: { mappingType: mapping.mappingType, reviewStatus: 'APPROVED' },
        take: 10000,
      });
      const conflict = approved.find((item) => (
        item.id !== mapping.id
        && item.bookId === mapping.bookId
        && (
          (item.chanjetId === mapping.chanjetId && item.erpCode !== mapping.erpCode)
          || (item.erpCode === mapping.erpCode && item.chanjetId !== mapping.chanjetId)
        )
      ));
      if (conflict) {
        throw new Error(
          `一对一映射冲突: ${mapping.mappingType} ${mapping.erpCode} ↔ ${mapping.chanjetId} 与已批准映射 ${conflict.id} 冲突`,
        );
      }
    }
    mapping.reviewStatus = reviewStatus;
    mapping.reviewedBy = reviewedBy || null;
    mapping.reviewedAt = new Date();
    return this.mappingRepo.save(mapping);
  }

  async refreshAccountBooks(): Promise<{ fetched: number; saved: number; books: ChanjetAccountBookEntity[] }> {
    requireReadonlySync();
    const job = await this.createJob('BOOK_REFRESH', '', '', {
      source: 'listAccountBooks',
      mode: 'read-chanjet-write-middle-layer',
    });

    try {
      const resp = await this.auth.listAccountBooks();
      await this.recordApiSample('account-book', '/accounting/openapi/cc/book/findByEnterpriseId', 'GET', resp);
      const books = this.extractBooks(resp);
      const savedBooks = await this.persistAccountBooks(resp);

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

  private async persistAccountBooks(resp: unknown): Promise<ChanjetAccountBookEntity[]> {
    const books = this.extractBooks(resp);
    const mapByBook = new Map((await this.bookCompanyMapRepo.find()).map((mapping) => [mapping.bookid, mapping]));
    const savedBooks: ChanjetAccountBookEntity[] = [];

    for (const book of books) {
      const mapped = mapByBook.get(book.bookId);
      const entity = this.accountBookRepo.create({
        bookId: book.bookId,
        bookName: book.bookName,
        companyCode: mapped?.companyCode ?? null,
        companyName: mapped?.companyName ?? null,
        enabled: !!mapped?.syncEnabled,
        rawData: book.rawData,
        lastProbeAt: new Date(),
      });
      assertReadonlyOrchestrationOwnerIfPresent();
      savedBooks.push(await this.accountBookRepo.save(entity));
      if (mapped) {
        await this.upsertMasterMapping({
          mappingType: 'COMPANY',
          bookId: book.bookId,
          erpCode: mapped.companyCode,
          erpName: mapped.companyName,
          chanjetId: book.bookId,
          chanjetCode: book.bookId,
          chanjetName: book.bookName,
          matchStatus: 'MATCHED',
          confidence: '100.00',
          reviewStatus: 'APPROVED',
          rawData: book.rawData,
        });
      }
    }
    return savedBooks;
  }

  async probe(scope: string[] = [], bookId?: string): Promise<{
    requestedScope: string[];
    books: string[];
    results: Array<{ key: string; bookId: string; status: 'SUCCESS' | 'FAIL'; fields?: number; error?: string }>;
  }> {
    requireReadonlySync();
    const requested = scope.length ? scope : ['ACCOUNT_BOOKS', 'DEPARTMENT', 'CUSTOMER_SUPPLIER', 'SUBJECT'];
    const approval = requireApprovedReadonlyRequest({ scope: requested, bookId });
    const selectedKeys = new Set(requested.map((s) => s.toUpperCase()));
    const endpoints = PROBE_ENDPOINTS.filter((ep) => selectedKeys.has(ep.key));
    if (!endpoints.length) throw new Error(`未找到可执行 probe scope: ${requested.join(',')}`);

    let books = bookId ? [bookId] : (await this.listEnabledBookIds()).filter(id => approval.books.some(b => b.bookId === id));
    if (!books.length) {
      const refreshed = await this.refreshAccountBooks();
      books = refreshed.books.filter((b) => b.enabled && approval.books.some(a => a.bookId === b.bookId)).map((b) => b.bookId);
    }

    const results: Array<{ key: string; bookId: string; status: 'SUCCESS' | 'FAIL'; fields?: number; error?: string }> = [];
    for (const ep of endpoints) {
      const targets = ep.requiresBook ? books : [''];
      for (const targetBookId of targets) {
        assertReadonlyOrchestrationOwnerIfPresent();
        // execution-bound write gate: a held/expired admission refuses before
        // this target's snapshot upsert / aggregate delete+upsert / mapping
        // candidate writes (legacy non-execution paths pass through)
        await executionWriteGate();
        const path = ep.requiresBook ? ep.path.replace('{bookid}', encodeURIComponent(targetBookId)) : ep.path;
        const job = await this.createJob('PROBE', targetBookId, '', {
          key: ep.key,
          label: ep.label,
          method: ep.method,
          path,
        });
        try {
          const request = this.buildProbeRequest(ep);
          const resp = await this.fetchProbePayload(ep, path, request);
          const fields = await this.recordApiSample(ep.apiDomain, path, ep.method, resp);
          if (ep.mappingType && ep.key !== 'CUSTOMER_SUPPLIER') {
            await this.createMappingCandidates(ep.mappingType, targetBookId, resp);
          }
          await this.finishJob(job, 'SUCCESS', {
            key: ep.key,
            fields,
          });
          results.push({ key: ep.key, bookId: targetBookId, status: 'SUCCESS', fields });
        } catch (err) {
          const error = readonlyFailureCode(err);
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

  private buildProbeRequest(ep: ProbeEndpoint, requestedPeriod?: string): {
    period: string;
    query: Record<string, string>;
    body?: Record<string, unknown>;
  } {
    const periodRequired = !!ep.periodQuery || !!ep.periodBody;
    const period = String(
      requestedPeriod || ep.query?.period || (periodRequired ? DEFAULT_ACCOUNTING_PERIOD : ''),
    ).trim();
    const query = {
      ...(ep.query || {}),
      ...(ep.periodQuery && period ? { period } : {}),
    };
    const body = ep.body
      ? {
        ...ep.body,
        ...(ep.periodBody === 'SINGLE' && period ? { period } : {}),
        ...(ep.periodBody === 'RANGE' && period ? { period: `${period}-${period}` } : {}),
      }
      : undefined;
    return { period, query, body };
  }

  private async fetchProbePayload(
    ep: ProbeEndpoint,
    path: string,
    request: { query: Record<string, string>; body?: Record<string, unknown> },
  ): Promise<unknown> {
    if (!ep.pagination) {
      return this.auth.callApi(path, {
        method: ep.method,
        query: request.query,
        body: request.body,
      });
    }

    const config = ep.pagination;
    const collectedRows: Record<string, unknown>[] = [];
    let lastResponse: unknown = null;
    let sourceTotalPages: number | null = null;
    let sourceTotalRows: number | null = null;
    let pagesFetched = 0;
    const seenPageFingerprints = new Set<string>();

    for (let page = 1; page <= config.maxPages; page += 1) {
      const response = await this.auth.callApi(path, {
        method: ep.method,
        query: request.query,
        body: {
          ...(request.body || {}),
          [config.pageField]: page,
          [config.pageSizeField]: config.pageSize,
        },
      });
      const failure = getChanjetBusinessFailure(response);
      if (failure) {
        throw new Error(
          `好业财 ${ep.key} 第 ${page} 页失败 code=${failure.code} requestId=${failure.requestId || '-'} msg=${failure.message}`,
        );
      }
      lastResponse = response;
      pagesFetched = page;
      const pageRows = this.extractRows(response);
      if (pageRows.length > 0) {
        const pageFingerprint = crypto
          .createHash('sha256')
          .update(JSON.stringify(pageRows))
          .digest('hex');
        if (seenPageFingerprints.has(pageFingerprint)) {
          throw new Error(
            `好业财 ${ep.key} 第 ${page} 页与之前页面重复；接口可能忽略分页参数，拒绝生成重复或截断镜像`,
          );
        }
        seenPageFingerprints.add(pageFingerprint);
      }
      collectedRows.push(...pageRows);
      const responseRecord = this.isRecord(response) ? response : {};
      const data = this.isRecord(responseRecord.data) ? responseRecord.data : {};
      const totalPageValue = Number(data.totalPage ?? data.totalPages ?? responseRecord.totalPage);
      const totalRowsValue = Number(data.count ?? data.total ?? data.totalCount ?? responseRecord.total);
      if (Number.isFinite(totalPageValue) && totalPageValue >= 0) sourceTotalPages = totalPageValue;
      if (Number.isFinite(totalRowsValue) && totalRowsValue >= 0) sourceTotalRows = totalRowsValue;

      const reachedDeclaredEnd = sourceTotalPages !== null && page >= sourceTotalPages;
      const reachedCount = sourceTotalRows !== null && collectedRows.length >= sourceTotalRows;
      // Some Chanjet endpoints cap a page below the requested pageSize (for
      // example 50 rows when 100 was requested). Only an empty page or
      // declared total is authoritative; a short page is not.
      if (pageRows.length === 0 || reachedDeclaredEnd || reachedCount) break;
      if (page === config.maxPages) {
        throw new Error(
          `好业财 ${ep.key} 分页超过安全上限 ${config.maxPages} 页；已读取 ${collectedRows.length} 行，拒绝静默截断`,
        );
      }
    }

    const responseRecord = this.isRecord(lastResponse) ? lastResponse : {};
    const responseData = this.isRecord(responseRecord.data) ? responseRecord.data : {};
    return {
      ...responseRecord,
      data: {
        ...responseData,
        rows: collectedRows,
        count: sourceTotalRows ?? collectedRows.length,
        currentPage: 1,
        currentPageSize: collectedRows.length,
        totalPage: 1,
      },
      erpReadonlyPagination: {
        pagesFetched,
        rowsFetched: collectedRows.length,
        sourceTotalPages,
        sourceTotalRows,
        truncated: false,
      },
    };
  }

  private async recordReadSnapshot(
    ep: ProbeEndpoint,
    bookId: string,
    apiPath: string,
    method: HttpMethod,
    period: string,
    payload: unknown,
    tx?: EntityManager,
  ): Promise<ChanjetReadSnapshotEntity> {
    const failure = getChanjetBusinessFailure(payload);
    if (failure) {
      throw new Error(`拒绝持久化好业财失败响应 code=${failure.code} requestId=${failure.requestId || '-'} msg=${failure.message}`);
    }
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
    assertReadonlyOrchestrationOwnerIfPresent();
    // within an execution-bound write transaction the SAME connection is used
    const repo = tx ? tx.getRepository(ChanjetReadSnapshotEntity) : this.readSnapshotRepo;
    await repo.upsert(entity as any, {
      conflictPaths: ['bookId', 'endpointKey', 'payloadHash'],
      skipUpdateIfNoValuesChanged: false,
    });
    const saved = await repo.findOneBy({ bookId, endpointKey: ep.key, payloadHash });
    return saved || entity;
  }

  private async recordEntitySnapshots(ep: ProbeEndpoint, bookId: string, period: string, payload: unknown, tx?: EntityManager): Promise<number> {
    const failure = getChanjetBusinessFailure(payload);
    if (failure) {
      throw new Error(`拒绝生成好业财实体快照 code=${failure.code} requestId=${failure.requestId || '-'} msg=${failure.message}`);
    }
    const entityType = ep.entityType || ep.key;
    const rows = this.extractRows(payload);
    const repo = tx ? tx.getRepository(ChanjetEntitySnapshotEntity) : this.entitySnapshotRepo;
    if (this.isAggregateStatisticsEndpoint(ep.key, entityType)) {
      assertReadonlyOrchestrationOwnerIfPresent();
      await repo.delete({ bookId, endpointKey: ep.key, entityType });
    }
    let count = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const normalized = this.normalizeExternalEntity(row, entityType, index, ep.key);
      if (!normalized.externalId && !normalized.externalCode && !normalized.externalName) continue;
      const externalId = normalized.externalId || normalized.externalCode || `${ep.key}-${index + 1}`;
      assertReadonlyOrchestrationOwnerIfPresent();
      // aggregate delete/upsert liveness re-check on the SAME transaction: a
      // HOLD/deadline landing mid-loop rolls the whole batch back to zero
      if (tx) await executionWriteGateTx(tx, activeExecutionScope()!.current, { forUpdate: false });
      await repo.upsert(
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
    const sourceRow = entityType === 'ACCOUNT_BOOK' && this.isRecord(row.tenant) ? row.tenant : row;
    const idCandidate = this.firstText(sourceRow, [
      'id', 'ID', 'bookId', 'bookid', 'tenantId', 'subjectId', 'projectId',
      'accountId', 'glAccountId', 'assistantCustomer', 'voucherId', 'externalCode', 'code',
    ]);
    const id = this.isUsableExternalId(idCandidate, entityType, endpointKey) ? idCandidate : '';
    const code = this.firstText(sourceRow, [
      'code', 'Code', 'bookCode', 'deptCode', 'subjectCode', 'projectCode',
      'accountCode', 'glAccountCode', 'customerCode', 'supplierCode', 'voucherCode', 'billCode',
      'billNo', 'number',
    ]);
    const name = this.firstText(sourceRow, [
      'name', 'Name', 'bookName', 'deptName', 'subjectName', 'projectName',
      'accountName', 'glAccountName', 'customerName', 'supplierName', 'fullName', 'title', 'summary',
    ]);
    const statusEnum = this.isRecord(sourceRow.statusEnum)
      ? this.firstText(sourceRow.statusEnum, ['value', 'code', 'name'])
      : '';
    const status = this.firstText(sourceRow, ['voucherStatusEnum', 'status', 'state', 'statusEnum', 'voucherState', 'approveStatus', 'auditStatus', 'enableStatus'])
      || statusEnum;
    const periodCandidate = this.firstText(sourceRow, ['period', 'openingPeriod', 'accountPeriod', 'yearMonth', 'bizPeriod', 'bizDate']);
    const currencyCandidate = this.firstText(sourceRow, ['currency', 'currencyCode', 'currencyName', 'baseCurrencyId', 'origCurrency']);
    // Standard columns are deliberately bounded; the complete provider value
    // remains available in raw_data. Reject an overlong semantic candidate
    // instead of letting one new master row abort the entire readonly mirror.
    const period = this.boundedMirrorText(periodCandidate, 16, 'period');
    const currency = currencyCandidate
      ? this.boundedMirrorText(currencyCandidate, 16, 'currency')
      : 'RMB';
    const amount = this.firstNumberText(sourceRow, [
      'amount',
      'totalAmount',
      'taxAmount',
      'endbalance',
      'baseEndingBalance',
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
    const inventoryContracts = /\/purchasestockin\/list\//i.test(field.apiPath)
      ? CHANJET_STOCK_IN_FIELD_CONTRACT
      : /\/salesstockout\/list\//i.test(field.apiPath)
        ? CHANJET_SALES_STOCK_OUT_FIELD_CONTRACT
        : [];
    if (inventoryContracts.length) {
      const observedLeaf = String(field.fieldPath || '')
        .split('.')
        .pop()
        ?.replace(/\[\d+\]|\[\]/g, '')
        .toLowerCase() || '';
      const contract = inventoryContracts.find((candidate) => (
        candidate.sourcePath
          .split('.')
          .pop()
          ?.replace(/\[\d+\]|\[\]/g, '')
          .toLowerCase() === observedLeaf
      ));
      if (contract) {
        const numericTarget = /(qty|price|amount|rate|tax|discount)/i.test(contract.canonicalField);
        return {
          erpDomain: 'inventory',
          erpTable: contract.erpTarget.split('.')[0],
          erpField: contract.erpTarget.split('.').slice(1).join('.'),
          erpType: contract.storage === 'MIDDLE_LAYER_JSON'
            ? 'jsonb'
            : numericTarget
              ? 'numeric'
              : 'varchar/date/jsonb',
          transformRule: contract.storage === 'BUSINESS_COLUMN'
            ? '按好业财库存单据官方契约标准化；只读镜像不直接覆盖 ERP 库存台账。'
            : '完整保存在中间层 raw_data；附件 URL 不进入普通业务返回。',
          matchStatus: contract.storage === 'BUSINESS_COLUMN' ? 'PENDING' : 'MATCHED',
          riskLevel: /(amount|price|tax|status|customer|vendor|warehouse|serial)/i.test(contract.canonicalField)
            ? 'HIGH'
            : 'MEDIUM',
          analysisNote: `命中好业财库存单据契约 ${contract.sourcePath} → ${contract.erpTarget}。`,
        };
      }
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
      { test: /project/, erpDomain: 'project', erpTable: 'biz_projects', erpField: normalizedName, erpType: 'varchar', transformRule: '项目编码需与 ERP 项目主数据对账。', riskLevel: 'MEDIUM' },
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
        table: 'sal_customers',
        rule: '客户字段进入 sal_customers 客户主数据映射候选，必须经人工审核后固化。',
      };
    }
    if (/supplier|vendor/.test(name)) {
      return {
        table: 'prc2_suppliers',
        rule: '供应商字段进入 prc2_suppliers 供应商主数据映射候选，必须经人工审核后固化。',
      };
    }
    if (/(^|[^a-z])(supplier|payable|ap)([^a-z]|$)/.test(haystack)) {
      return {
        table: 'prc2_suppliers',
        rule: '供应商字段进入 prc2_suppliers 供应商主数据映射候选，必须经人工审核后固化。',
      };
    }
    if (/(^|[^a-z])(customer|receivable|ar)([^a-z]|$)/.test(haystack)) {
      return {
        table: 'sal_customers',
        rule: '客户字段进入 sal_customers 客户主数据映射候选，必须经人工审核后固化。',
      };
    }
    return {
      table: 'chanjet_master_mapping',
      rule: '好业财往来单位需先判断客户/供应商属性，再拆分映射到 ERP 客户或供应商主数据。',
    };
  }

  private async deprecateFakeCounterpartyTargets(): Promise<void> {
    await this.fieldMappingRepo
      .createQueryBuilder()
      .update(ChanjetErpFieldMappingEntity)
      .set({
        erpTable: 'chanjet_master_mapping',
        transformRule: '历史候选目标表不存在；往来单位先进入好业财主数据映射中间层，再按客户/供应商属性拆分。',
        analysisNote: '已自动收口历史假目标表，禁止据此创建 ERP schema；重新分析后再指向真实 sal_customers / prc2_suppliers。',
      })
      .where('erp_table IN (:...tables)', { tables: ['mst_customers', 'mst_suppliers', 'mst_customers/mst_suppliers'] })
      .execute();
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

  private boundedMirrorText(value: string, maxLength: number, field: 'period' | 'currency'): string {
    const text = String(value || '').trim();
    if (text.length <= maxLength) return text;
    (this.log as Logger | undefined)?.warn(
      `Chanjet mirror ignored overlong ${field} candidate length=${text.length}`,
    );
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
    assertReadonlyOrchestrationOwnerIfPresent();
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
    job.errorMessage = errorMessage ? readonlyFailureCode(errorMessage) : null;
    assertReadonlyOrchestrationOwnerIfPresent();
    await this.jobRepo.save(job);
  }

  private async recordChanjetApiAlert(ep: ProbeEndpoint, path: string, bookId: string, errorMessage: string): Promise<void> {
    try {
      const title = `好业财只读同步失败：${ep.label}${bookId ? ` (${bookId})` : ''}`;
      await this.ds.query(
        `INSERT INTO sys_alerts (alert_type, severity, title, detail, related_path)
         SELECT $1,$2,$3,$4::jsonb,$5
          WHERE NOT EXISTS (
            SELECT 1
              FROM sys_alerts
             WHERE resolved = FALSE
               AND alert_type = $1
               AND title = $3
               AND COALESCE(related_path, '') = COALESCE($5, '')
               AND created_at > NOW() - INTERVAL '30 minutes'
          )`,
        [
          'CHANJET_API_SYNC_FAILURE',
          'WARNING',
          title,
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
        diffSummary: '映射尚未确认。',
        actionRequired: '由系统确定性规则或授权审核确认为 APPROVED 后才能参与凭证建议。',
      };
    }
    if (mapping.matchStatus === 'SOURCE_ONLY') {
      return null;
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
    const books = rows
      .map((row) => {
        const source = this.isRecord(row.tenant) ? row.tenant : row;
        const bookId = String(
          source.id ?? source.bookId ?? source.bookid ?? source.tenantId ?? source.tenantID ?? source.book_id ?? '',
        );
        const bookName = String(
          source.name ?? source.bookName ?? source.book_name ?? source.tenantName ?? source.orgName ?? bookId,
        );
        return bookId ? { bookId, bookName, rawData: row } : null;
      })
      .filter((row): row is NormalizedBook => !!row);
    return [...new Map(books.map((book) => [book.bookId, book])).values()];
  }

  private extractRows(resp: unknown): Record<string, unknown>[] {
    if (Array.isArray(resp)) return resp.filter(this.isRecord);
    if (!this.isRecord(resp)) return [];
    if (getChanjetBusinessFailure(resp)) return [];
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
      if (Array.isArray(candidate)) {
        return candidate
          .filter(this.isRecord)
          .filter((row) => !getChanjetBusinessFailure(row));
      }
    }
    return [resp];
  }

  private buildMasterDataReviewCandidate(
    source: {
      snapshotId: string;
      domain: string;
      bookId: string;
      companyCode: string;
      chanjetId: string;
      chanjetCode: string;
      chanjetName: string;
      currency: string;
    },
    masters: Array<{
      domain: string;
      code: string;
      name: string;
      companyCode: string;
      currency: string;
      status: string;
    }>,
  ) {
    if (source.domain === 'SUBJECT') {
      return {
        ...source,
        status: 'SOURCE_REFERENCE',
        closureState: 'READONLY_REFERENCE',
        blockerCode: '',
        nextAction: 'KEEP_AS_CHANJET_READONLY_SUBJECT_REFERENCE',
        erpCode: '',
        erpName: '',
        evidence: ['ERP 当前没有同粒度总账科目主表；保留为好业财账套级只读科目基准，不写 ERP 业务事实表'],
        alternatives: [],
        systemApprovalEligible: false,
        requiresApproval: false,
      };
    }
    const activeMasters = masters.filter((master) => (
      master.domain === source.domain
      && master.status === 'ACTIVE'
      && (source.domain === 'CURRENCY' || (!!source.companyCode && master.companyCode === source.companyCode))
    ));
    const normalizedCode = this.normalizeMasterDataCode(source.chanjetCode);
    const normalizedName = this.normalizeMasterDataName(source.chanjetName);
    const matches = activeMasters.filter((master) => {
      if (source.domain === 'CASH_ACCOUNT') {
        return !!normalizedName
          && this.normalizeMasterDataName(master.name) === normalizedName
          && !!source.currency
          && master.currency === source.currency;
      }
      if (source.domain === 'CURRENCY') {
        return !!normalizedCode && this.normalizeMasterDataCode(master.code) === normalizedCode;
      }
      const codeMatches = !!normalizedCode && this.normalizeMasterDataCode(master.code) === normalizedCode;
      const nameMatches = !!normalizedName && this.normalizeMasterDataName(master.name) === normalizedName;
      return codeMatches || nameMatches;
    });
    const sourceIdentityEligible = matches.length === 0
      && this.masterDataSourceIdentityEligible(source);
    const status = matches.length === 1
      ? 'EXACT_MATCH'
      : matches.length > 1
        ? 'CONFLICT'
        : sourceIdentityEligible
          ? 'SOURCE_REFERENCE'
          : 'NEED_MAPPING';
    const selected = matches.length === 1 ? matches[0] : null;
    return {
      ...source,
      status,
      closureState: status === 'EXACT_MATCH'
        ? 'EXACT_AUTO_CONFIRMABLE'
        : status === 'CONFLICT'
          ? 'AMBIGUOUS_EXACT_TARGET'
          : status === 'SOURCE_REFERENCE'
            ? 'ERP_MASTER_MISSING'
            : 'UNRESOLVED',
      blockerCode: status === 'CONFLICT'
        ? 'MULTIPLE_EXACT_ERP_TARGETS'
        : status === 'SOURCE_REFERENCE'
          ? 'ERP_MASTER_NOT_FOUND'
          : status === 'NEED_MAPPING'
            ? 'SOURCE_IDENTITY_INCOMPLETE_OR_TARGET_MISSING'
            : '',
      nextAction: status === 'EXACT_MATCH'
        ? 'SYSTEM_CONFIRM_EXACT_MAPPING'
        : status === 'CONFLICT'
          ? 'RESOLVE_DUPLICATE_ERP_MASTER_OR_SOURCE_IDENTITY'
          : status === 'SOURCE_REFERENCE'
            ? 'CREATE_OR_ACTIVATE_ERP_MASTER_THEN_RERUN_EXACT_MAPPING'
            : 'COMPLETE_SOURCE_IDENTITY_AND_ERP_MASTER_EVIDENCE',
      erpCode: selected?.code || '',
      erpName: selected?.name || '',
      evidence: status === 'EXACT_MATCH'
        ? source.domain === 'CASH_ACCOUNT'
          ? ['账套公司、规范化账户名称、币种唯一精确匹配']
          : source.domain === 'CURRENCY'
            ? ['币种编码与 SYS_CURRENCY 唯一精确匹配']
            : ['账套公司内编码或规范化名称唯一精确匹配']
        : status === 'SOURCE_REFERENCE'
          ? ['好业财源 ID、编码/名称、账套公司证据完整；ERP 暂无同一主档，仅确认只读源身份，不写 ERP 业务主数据']
          : status === 'CONFLICT'
          ? [`发现 ${matches.length} 个精确候选，禁止自动消歧`]
          : ['没有可证明的唯一精确匹配，禁止模糊匹配或跨公司猜测'],
      alternatives: matches.map((match) => ({
        erpCode: match.code,
        erpName: match.name,
        companyCode: match.companyCode,
      })),
      systemApprovalEligible: status === 'EXACT_MATCH' || status === 'SOURCE_REFERENCE',
      requiresApproval: status !== 'SOURCE_REFERENCE',
      usableForErpWrite: status === 'EXACT_MATCH',
    };
  }

  private masterDataSourceIdentityEligible(source: {
    domain: string;
    bookId: string;
    companyCode: string;
    chanjetId: string;
    chanjetCode: string;
    chanjetName: string;
    currency: string;
  }): boolean {
    if (!['DEPARTMENT', 'PROJECT', 'CASH_ACCOUNT'].includes(source.domain)) return false;
    if (!source.bookId || !source.companyCode || !source.chanjetId) return false;
    if (!source.chanjetCode && !source.chanjetName) return false;
    if (source.domain === 'CASH_ACCOUNT' && !source.currency) return false;
    return true;
  }

  private normalizeMasterDataCode(value: string): string {
    return String(value || '').normalize('NFKC').trim().replace(/[\s_-]+/g, '').toUpperCase();
  }

  private normalizeMasterDataName(value: string): string {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[\s\u3000（）()\-—_]+/g, '')
      .toLowerCase();
  }

  private isValidMasterDataReviewSnapshot(snapshot: ChanjetEntitySnapshotEntity): boolean {
    if (!this.isRecord(snapshot.rawData)) return false;
    if (getChanjetBusinessFailure(snapshot.rawData)) return false;
    return Object.keys(snapshot.rawData).length > 0;
  }

  private async createMappingCandidates(mappingType: ChanjetMappingType, bookId: string, resp: unknown, tx?: EntityManager): Promise<void> {
    const rows = this.extractRows(resp).slice(0, 1000);
    const mappingRepo = tx ? tx.getRepository(ChanjetMasterMappingEntity) : this.mappingRepo;
    for (const row of rows) {
      if (getChanjetBusinessFailure(row)) continue;
      const id = String(
        row.id ?? row.ID ?? row.customerId ?? row.supplierId ?? row.subjectId ?? row.glAccountId ?? row.projectId ?? row.code ?? '',
      );
      const code = String(
        row.code
        ?? row.deptCode
        ?? row.subjectCode
        ?? row.glAccountCode
        ?? row.customerCode
        ?? row.supplierCode
        ?? row.projectCode
        ?? row.accountCode
        ?? '',
      );
      const name = String(
        row.name
        ?? row.deptName
        ?? row.subjectName
        ?? row.glAccountName
        ?? row.customerName
        ?? row.supplierName
        ?? row.projectName
        ?? row.accountName
        ?? row.fullName
        ?? '',
      );
      if (!id && !code && !name) continue;
      const readonlySubjectReference = mappingType === 'SUBJECT';
      await this.upsertMasterMapping({
        mappingType,
        bookId,
        erpCode: '',
        erpName: '',
        chanjetId: id,
        chanjetCode: code,
        chanjetName: name || code || id,
        matchStatus: readonlySubjectReference ? 'SOURCE_ONLY' : 'PENDING',
        confidence: readonlySubjectReference ? '1.00' : '0.00',
        reviewStatus: readonlySubjectReference ? 'APPROVED' : 'PENDING',
        reviewedBy: readonlySubjectReference ? 'system:chanjet-readonly-subject-reference' : null,
        reviewedAt: readonlySubjectReference ? new Date() : null,
        rawData: row,
      }, tx);
    }
  }

  private async upsertMasterMapping(input: Partial<ChanjetMasterMappingEntity>, tx?: EntityManager) {
    const mappingRepo = tx ? tx.getRepository(ChanjetMasterMappingEntity) : this.mappingRepo;
    const mappingType = input.mappingType;
    const bookId = input.bookId ?? '';
    const chanjetId = input.chanjetId ?? '';
    const incomingReviewStatus = input.reviewStatus ?? 'PENDING';

    if (mappingType && chanjetId) {
      const sourceRows = await mappingRepo.find({
        where: { mappingType, bookId, chanjetId },
        order: { updatedAt: 'DESC' },
      });
      const approvedRows = sourceRows.filter((row) => row.reviewStatus === 'APPROVED');
      const approvedErpCodes = [...new Set(approvedRows.map((row) => row.erpCode).filter(Boolean))];
      if (approvedErpCodes.length > 1) {
        throw new Error(
          `CHANJET_MAPPING_SOURCE_IDENTITY_CONFLICT:${mappingType}:${bookId}:${chanjetId}`,
        );
      }

      const preferred = [...sourceRows].sort((left, right) => (
        this.masterMappingPreservationRank(right) - this.masterMappingPreservationRank(left)
      ))[0];
      if (preferred) {
        const existingApproved = preferred.reviewStatus === 'APPROVED';
        const incomingApproved = incomingReviewStatus === 'APPROVED';
        if (
          existingApproved
          && incomingApproved
          && preferred.erpCode
          && input.erpCode
          && preferred.erpCode !== input.erpCode
        ) {
          throw new Error(
            `CHANJET_MAPPING_APPROVED_TARGET_CONFLICT:${mappingType}:${bookId}:${chanjetId}`,
          );
        }

        preferred.chanjetCode = input.chanjetCode ?? preferred.chanjetCode;
        preferred.chanjetName = input.chanjetName ?? preferred.chanjetName;
        preferred.rawData = input.rawData ?? preferred.rawData;
        if (!existingApproved || incomingApproved) {
          preferred.erpCode = input.erpCode ?? preferred.erpCode;
          preferred.erpName = input.erpName ?? preferred.erpName;
          preferred.matchStatus = input.matchStatus ?? preferred.matchStatus;
          preferred.confidence = input.confidence ?? preferred.confidence;
          preferred.reviewStatus = incomingReviewStatus;
          preferred.reviewedBy = input.reviewedBy ?? preferred.reviewedBy;
          preferred.reviewedAt = input.reviewedAt ?? preferred.reviewedAt;
        }
        assertReadonlyOrchestrationOwnerIfPresent();
        await mappingRepo.save(preferred);
        return;
      }
    }

    assertReadonlyOrchestrationOwnerIfPresent();
    await mappingRepo.upsert(
      {
        mappingType,
        bookId,
        erpCode: input.erpCode ?? '',
        erpName: input.erpName ?? '',
        chanjetId,
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
      {
        // Chanjet master IDs are scoped to an account book. Keep this list in
        // sync with uq_chanjet_master_mapping or PostgreSQL cannot resolve the
        // ON CONFLICT target during a readonly mirror refresh.
        conflictPaths: ['mappingType', 'bookId', 'erpCode', 'chanjetId'],
        skipUpdateIfNoValuesChanged: false,
      },
    );
  }

  private masterMappingPreservationRank(mapping: ChanjetMasterMappingEntity): number {
    if (
      mapping.reviewStatus === 'APPROVED'
      && ['MATCHED', 'MANUAL'].includes(mapping.matchStatus)
      && mapping.erpCode
    ) return 400;
    if (mapping.reviewStatus === 'APPROVED' && mapping.matchStatus === 'SOURCE_ONLY') return 300;
    if (mapping.reviewStatus === 'APPROVED') return 200;
    return 100;
  }

  private async recordApiSample(apiDomain: string, apiPath: string, method: HttpMethod, sample: unknown): Promise<number> {
    const fields = this.flattenFields(sample);
    for (const field of fields) {
      assertReadonlyOrchestrationOwnerIfPresent();
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
