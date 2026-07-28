'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  FileText,
  GitCompareArrows,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

type TabKey = 'readiness' | 'governance' | 'adapter' | 'coverage' | 'readonlyAdapters' | 'wmsAlignment' | 'mirror' | 'fieldGaps' | 'mappings' | 'reconciliation' | 'semantic' | 'readModel' | 'statementReports' | 'receiptPaymentLocks' | 'drafts' | 'fields' | 'jobs';

interface Overview {
  accountBooks: number;
  enabledBooks: number;
  fields: number;
  mappings: number;
  pendingMappings: number;
  approvedMappings: number;
  jobs: number;
  failedJobs: number;
  voucherDrafts: number;
  pushReadyDrafts: number;
  openReconciliationIssues: number;
  readSnapshots: number;
  entitySnapshots: number;
  fieldMappings: number;
  unmappedFields: number;
  pushEnabled: boolean;
  boundary: string;
}

interface WmsReadonlyAlignment {
  generatedAt: string;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  summary: {
    enabledBooks: number;
    expectedScopes: number;
    freshScopes: number;
    sourceDocuments: number;
    sourceLines: number;
    officialFieldCount: number;
    losslessMirrorCoverage: number;
    erpBusinessColumnCoverage: number;
    missingBusinessColumns: number;
  };
  contracts: Array<{
    key: string;
    label: string;
    method: string;
    path: string;
    reference: string;
    statusValues: string[];
    fields: Array<{
      sourcePath: string;
      canonicalField: string;
      erpTarget: string;
      required: boolean;
      storage: string;
    }>;
  }>;
  scopes: Array<{
    entityType: string;
    bookId: string;
    bookName: string;
    latestPulledAt: string | null;
  }>;
  documentPreview: Array<{
    entityType: string;
    bookId: string;
    externalDocumentCode: string;
    status: string;
    businessDate: string;
    counterpartyName: string;
    soldToCustomerName: string;
    warehouseName: string;
    lines: unknown[];
  }>;
  documentPreviewTruncated: boolean;
  missingColumns: string[];
  conditions: string[];
}

interface AccountBook {
  bookId: string;
  bookName: string;
  companyCode: string | null;
  companyName: string | null;
  enabled: boolean;
}

interface Mapping {
  id: string;
  mappingType: string;
  bookId: string;
  erpCode: string;
  erpName: string;
  chanjetId: string;
  chanjetCode: string;
  chanjetName: string;
  matchStatus: string;
  confidence: string;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface AccountBookMappingGate {
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  canRunBookScopedSync: boolean;
  summary: { cachedBooks: number; enabledBooks: number; configuredMappings: number; enabledMappings: number; validMappings: number; blockingIssues: number; warnings: number };
  mappings: Array<{ bookId: string; bookName: string; companyCode: string; companyName: string; syncEnabled: boolean; status: 'VALID' | 'WARNING' | 'HOLD'; issues: string[] }>;
  blockingIssues: string[];
  warnings: string[];
}

interface MirrorBaselineReadiness {
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  freshnessHours: number;
  summary: { expectedScopes: number; expectedTargets: number; freshTargets: number; staleTargets: number; missingTargets: number; failedRecentJobs: number; endpointCoverageRate: number; nextGate: string };
  accountBookGate: AccountBookMappingGate;
  scopes: Array<{ endpointKey: string; label: string; bookId: string; entityType: string; status: 'FRESH' | 'STALE' | 'MISSING'; rowCount: number; entityCount: number; latestPulledAt: string | null; ageHours: number | null; latestJobStatus: string; latestJobError: string | null }>;
}

interface CounterpartyCandidateOverview {
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  summary: { sourceRows: number; candidates: number; matched: number; sourceOnly: number; pending: number; conflicts: number; unknownRole: number; approvedMappings: number; nextGate: string };
  candidates: Array<{ candidateKey: string; bookId: string; companyCode: string; mappingType: 'CUSTOMER' | 'SUPPLIER' | null; roleCandidate: string; chanjetId: string; chanjetCode: string; chanjetName: string; matchStatus: 'MATCHED' | 'SOURCE_ONLY' | 'PENDING' | 'CONFLICT'; confidence: number; erpCode: string; erpName: string; evidence: string[]; matchKind: string; systemApprovalEligible: boolean; sourceIdentityEligible: boolean; systemApprovalReason: string; requiresApproval: boolean }>;
}

interface ProductionReadiness {
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
  phases: Array<{ key: string; title: string; status: 'READY' | 'READY_WITH_CONDITIONS' | 'HOLD'; score: number; evidence: string[]; nextAction: string }>;
  blockers: string[];
  conditions: string[];
  tokenHealth: { configured: boolean; tokens: Record<string, { expiresAt: string; valid: boolean }> };
}

interface CurrentStateOverview {
  generatedAt: string;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  authoritativeEvidence: 'RUNTIME_CURRENT_STATE';
  productionReadiness: ProductionReadiness;
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
}

interface VoucherDraftValidation {
  valid: boolean;
  debitTotal: string;
  creditTotal: string;
  errors: string[];
  warnings: string[];
  pushEnabled: false;
}

interface ReadonlyAlignmentCycleResult {
  success: boolean;
  decision: 'GO' | 'GO_WITH_CONDITIONS' | 'HOLD';
  startedAt: string;
  completedAt: string;
  stoppedAt: string | null;
  writeChanjet: false;
  writeErpBusinessTables: false;
  mirror: { attempts: number; results: Array<{ status: string }>; unresolvedFailures: Array<{ key: string; bookId: string; error: string }> };
  exactMappings: { eligible: number; approved: number; skipped: number; sourceOnlyResolved: number; remainingPending: number; remainingConflicts: number; errors: Array<{ candidateKey: string; error: string }> } | null;
  reconciliation: { scanned: number; created: number; unchanged: number; autoResolved: number } | null;
  readiness: ProductionReadiness | null;
  error?: string;
}

interface ReadonlyAlignmentRunState {
  runId: string | null;
  state: 'IDLE' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'HOLD' | 'FAILED' | 'SKIPPED';
  requestedBy: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  decision: string | null;
  message: string | null;
}

interface FieldCatalog {
  id: string;
  apiDomain: string;
  apiPath: string;
  method: string;
  fieldPath: string;
  sampleType: string;
  sampleValueMasked: string | null;
  observedCount: number;
}

interface ReadSnapshot {
  id: string;
  bookId: string;
  endpointKey: string;
  apiDomain: string;
  apiPath: string;
  method: string;
  period: string;
  rowCount: number;
  payloadHash: string;
  pulledAt: string;
}

interface EntitySnapshot {
  id: string;
  bookId: string;
  endpointKey: string;
  entityType: string;
  externalId: string;
  externalCode: string;
  externalName: string;
  period: string;
  status: string;
  amount: string;
  currency: string;
  updatedAt: string;
}

interface FieldMapping {
  id: string;
  chanjetEndpoint: string;
  chanjetFieldPath: string;
  chanjetType: string;
  chanjetSampleMasked: string | null;
  erpDomain: string;
  erpTable: string;
  erpField: string;
  erpType: string;
  transformRule: string;
  matchStatus: string;
  riskLevel: string;
  decisionStatus: string;
  analysisNote: string;
}

interface SyncJob {
  id: string;
  jobType: string;
  bookId: string;
  period: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface VoucherDraft {
  id: string;
  sourceBizType: string;
  sourceBizId: string;
  companyCode: string;
  bookId: string;
  period: string;
  title: string;
  status: 'DRAFT' | 'VALIDATED' | 'REVIEWED' | 'APPROVED' | 'PUSH_READY' | 'REJECTED' | 'CANCELLED';
  pushAllowed: boolean;
  pushStatus: string;
  createdBy: string;
  createdAt: string;
  voucherLines: Array<Record<string, unknown>>;
}

interface WritebackOutbox {
  id: string;
  draftId: string;
  idempotencyKey: string;
  state: 'READY' | 'SENDING' | 'ACKNOWLEDGED' | 'FAILED' | 'RETRYABLE' | 'DEAD_LETTER' | 'CANCELLED' | 'REVERSED';
  attemptCount: number;
  maxAttempts: number;
  externalWriteEnabled: false;
  errorMessage: string | null;
  createdAt: string;
}

interface WritebackPreparation {
  decision: 'GO_WITH_CONDITIONS' | 'HOLD';
  externalWriteEnabled: false;
  externalNetworkTransportImplemented: false;
  unsafeDrafts: number;
  unsafeOutbox: number;
  blockers: string[];
  conditions: string[];
  nextGate: string;
  wave7ApprovalPrecheck: {
    endpoint: string;
    persistsApproval: false;
    executesExternalWrite: false;
    requiredSections: string[];
  };
}

interface ReconciliationResult {
  id: string;
  reconciliationType: string;
  bookId: string;
  status: 'OK' | 'WARN' | 'MISMATCH' | 'HOLD';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  subjectType: string;
  subjectKey: string;
  subjectName: string;
  diffSummary: string;
  actionRequired: string;
  resolved: boolean;
  createdAt: string;
}

interface FinanceAdapterBucket {
  key: string;
  title: string;
  priority: 'P0' | 'P1';
  endpointKeys: string[];
  entityTypes: string[];
  erpTarget: string;
  adapterScope: string;
  adapterStatus: 'READY' | 'READY_WITH_FIELD_GAPS' | 'WAITING_MIRROR_SYNC';
  snapshotCount: number;
  entityCount: number;
  mappedFieldCount: number;
  statusCounts: Record<string, number>;
  riskCounts: Record<string, number>;
  unresolvedHighRisk: number;
  latestPulledAt: string | null;
  nextAction: string;
}

interface FinanceAdapterOverview {
  readiness: {
    p0Total: number;
    p0Ready: number;
    p0ReadyWithGaps: number;
    p0WaitingMirrorSync: number;
    p1Total: number;
    pushEnabled: boolean;
    writeChanjet: boolean;
    writeBusinessTables: boolean;
    allowedNextGate: string;
  };
  buckets: FinanceAdapterBucket[];
  guardrails: {
    chanjetWrite: boolean;
    voucherPush: boolean;
    erpBusinessTableWrite: boolean;
    finArInvoicesChanjetLink: boolean;
    note: string;
  };
}

interface FinanceReadonlyCoverage {
  generatedAt: string;
  writeChanjet: boolean;
  writeBusinessTables: boolean;
  pushVoucher: boolean;
  fullReadonlyScope: Array<{ key: string; label: string; entityType: string; apiDomain: string }>;
  endpointCoverage: Array<{
    key: string;
    label: string;
    apiDomain: string;
    entityType: string;
    covered: boolean;
    snapshotCount: number;
    rowCount: number;
    entityCount: number;
    latestPulledAt: string | null;
    latestJobStatus: string;
    latestJobError: string | null;
  }>;
  cardCoverage: Array<{
    cardKey: string;
    label: string;
    endpoints: string[];
    covered: boolean;
    status: string;
    sourceRule: string;
  }>;
  fieldCoverage: {
    totalFieldMappings: number;
    coveredFieldMappings: number;
    coverageRate: number;
    statusCounts: Record<string, number>;
    missingFields: number;
    transformRequired: number;
  };
  summary: {
    endpointCoverageRate: number;
    cardCoverageRate: number;
    fieldCoverageRate: number;
    missingEndpointKeys: string[];
    failedLatestJobs: Array<{ key: string; label: string; error: string | null }>;
    decision: string;
  };
  guardrails: { rule: string };
}

type FinanceRuntimeReconciliationStatus = 'OK' | 'WARN' | 'MISMATCH' | 'HOLD' | 'NEED_MAPPING' | 'NEED_MANUAL_REVIEW';
type FinanceSemanticLockStatus = 'LOCKED' | 'PARTIAL' | 'PENDING' | 'HOLD';

interface FinanceSemanticLock {
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

interface FinanceRuntimeReconciliationItem {
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
  status: FinanceRuntimeReconciliationStatus;
  evidence: {
    chanjetRows: number;
    latestPulledAt: string | null;
    erpRows: number | null;
    erpEvidence: string | null;
  };
  reason: string;
  recommendedAction: string;
  semanticLock: FinanceSemanticLock;
}

interface FinanceRuntimeReconciliation {
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
  items: FinanceRuntimeReconciliationItem[];
  guardrails: {
    chanjetWrite: boolean;
    chanjetDelete: boolean;
    chanjetModify: boolean;
    voucherPush: boolean;
    erpBusinessOverwrite: boolean;
    migration: boolean;
    rule: string;
  };
}

type FinanceSemanticExtractorStatus = 'READY' | 'PARTIAL' | 'WAITING_SAMPLE' | 'NEED_EXTRACTION' | 'HOLD';

interface FinanceSemanticExtractor {
  key: string;
  label: string;
  status: FinanceSemanticExtractorStatus;
  authorityEligible: boolean;
  sourceEntityTypes: string[];
  sampleRows: number;
  latestPulledAt: string | null;
  fieldCandidates: Array<{
    semanticField: string;
    candidatePaths: Array<{
      path: string;
      sampleType: string;
      sampleValue: string | null;
      observedCount: number;
    }>;
    required: boolean;
    status: 'FOUND' | 'MISSING';
  }>;
  extractedFields: number;
  requiredFields: number;
  missingRequiredFields: string[];
  reason: string;
  nextAction: string;
}

interface FinanceSemanticExtractorsOverview {
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
  guardrails: { rule: string };
}

type FinanceReadModelStatus = 'AUTHORITY_READY' | 'READONLY_READY' | 'BLOCKED_MAPPING' | 'WAITING_SAMPLE' | 'NEED_MANUAL_REVIEW' | 'HOLD';

interface FinanceReadModelMetric {
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

interface FinanceReadModelOverview {
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
  guardrails: { rule: string };
}

type FinanceReadonlyStatementReportStatus = 'READONLY_READY' | 'BLOCKED_MAPPING' | 'WAITING_SAMPLE' | 'HOLD';

interface FinanceReadonlyStatementReport {
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
  rows: Array<{
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
  }>;
  nextAction: string;
}

interface FinanceReadonlyStatementReportOverview {
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
  guardrails: { rule: string };
}

type ReceiptPaymentLockStatus = 'LOCKED' | 'PARTIAL' | 'WAITING_SAMPLE' | 'HOLD';

interface ReceiptPaymentDateStatusLock {
  key: 'TODAY_RECEIPT' | 'TODAY_PAYMENT';
  label: string;
  entityType: 'AR_RECEIPT' | 'AP_PAYMENT';
  status: ReceiptPaymentLockStatus;
  sampleRows: number;
  latestPulledAt: string | null;
  requiredDimensions: string[];
  lockedDimensions: string[];
  missingDimensions: string[];
  fieldCandidates: Array<{
    semanticField: string;
    candidatePaths: Array<{
      path: string;
      sampleType: string;
      sampleValue: string | null;
      observedCount: number;
    }>;
    required: boolean;
    status: 'FOUND' | 'MISSING';
  }>;
  dateRule: string;
  statusRule: string;
  directionRule: string;
  amountRule: string;
  readyForFinanceReview: boolean;
  readyForCardAuthority: boolean;
  reason: string;
  nextAction: string;
}

interface ReceiptPaymentLocksOverview {
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
  guardrails: { rule: string };
}

type ReadonlyAdapterStatus = 'READY' | 'PARTIAL' | 'WAITING_SAMPLE' | 'HOLD';

interface ReadonlyFieldAdapterRow {
  rowId: string;
  [key: string]: unknown;
}

interface ReadonlyFieldAdapter {
  adapterKey: 'CHANJET_VOUCHER_HEADER' | 'CHANJET_VOUCHER_LINE' | 'CHANJET_COUNTERPARTY';
  title: string;
  status: ReadonlyAdapterStatus;
  sampleRows: number;
  latestPulledAt: string | null;
  mappedFields: string[];
  missingCriticalFields: string[];
  sourceEntityTypes: string[];
  endpointKeys: string[];
  nextAction: string;
  rows: ReadonlyFieldAdapterRow[];
}

interface ReadonlyFieldAdaptersOverview {
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
  adapters: ReadonlyFieldAdapter[];
  guardrails: { rule: string };
}

const cardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  padding: 16,
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const cellStyle: CSSProperties = {
  borderBottom: '1px solid var(--border)',
  padding: '10px 8px',
  verticalAlign: 'top',
};

function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'green' | 'red' | 'amber' | 'blue' | 'muted' }) {
  const colors = {
    green: ['#dcfce7', '#166534'],
    red: ['#fee2e2', '#991b1b'],
    amber: ['#fef3c7', '#92400e'],
    blue: ['#dbeafe', '#1d4ed8'],
    muted: ['var(--bg-muted)', 'var(--text-secondary)'],
  }[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '2px 8px', background: colors[0], color: colors[1], fontSize: 12, fontWeight: 600 }}>
      {children}
    </span>
  );
}

function statusTone(status: string): 'green' | 'red' | 'amber' | 'blue' | 'muted' {
  if (['SUCCESS', 'APPROVED', 'OK', 'REVIEWED', 'PUSH_READY', 'LOCKED', 'READY', 'FOUND', 'AUTHORITY_READY', 'READONLY_READY', 'SOURCE_ONLY', 'FRESH', 'VALID', 'GO'].includes(status)) return 'green';
  if (['FAIL', 'REJECTED', 'HOLD', 'CRITICAL', 'CONFLICT'].includes(status)) return 'red';
  if (['WARN', 'MISMATCH', 'PENDING', 'PARTIAL', 'DRAFT', 'NEED_MAPPING', 'NEED_MANUAL_REVIEW', 'WAITING_SAMPLE', 'NEED_EXTRACTION', 'MISSING', 'STALE', 'BLOCKED_MAPPING', 'GO_WITH_CONDITIONS', 'READY_WITH_CONDITIONS'].includes(status)) return 'amber';
  return 'muted';
}

function fmtMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSignedMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${abs}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function pct(value: number | null | undefined) {
  return `${Math.round((Number(value || 0)) * 100)}%`;
}

export default function ChanjetIntegrationPage() {
  const { t } = useLanguage();
  const { canView, canEdit } = usePermission('MENU_SETTINGS_CHANJET');
  const [tab, setTab] = useState<TabKey>('readiness');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [books, setBooks] = useState<AccountBook[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [fields, setFields] = useState<FieldCatalog[]>([]);
  const [readSnapshots, setReadSnapshots] = useState<ReadSnapshot[]>([]);
  const [entitySnapshots, setEntitySnapshots] = useState<EntitySnapshot[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [financeAdapter, setFinanceAdapter] = useState<FinanceAdapterOverview | null>(null);
  const [financeCoverage, setFinanceCoverage] = useState<FinanceReadonlyCoverage | null>(null);
  const [financeRuntimeRecon, setFinanceRuntimeRecon] = useState<FinanceRuntimeReconciliation | null>(null);
  const [financeSemanticExtractors, setFinanceSemanticExtractors] = useState<FinanceSemanticExtractorsOverview | null>(null);
  const [financeReadModel, setFinanceReadModel] = useState<FinanceReadModelOverview | null>(null);
  const [financeReadonlyReports, setFinanceReadonlyReports] = useState<FinanceReadonlyStatementReportOverview | null>(null);
  const [receiptPaymentLocks, setReceiptPaymentLocks] = useState<ReceiptPaymentLocksOverview | null>(null);
  const [readonlyFieldAdapters, setReadonlyFieldAdapters] = useState<ReadonlyFieldAdaptersOverview | null>(null);
  const [wmsAlignment, setWmsAlignment] = useState<WmsReadonlyAlignment | null>(null);
  const [baselineReadiness, setBaselineReadiness] = useState<MirrorBaselineReadiness | null>(null);
  const [accountBookGate, setAccountBookGate] = useState<AccountBookMappingGate | null>(null);
  const [counterpartyCandidates, setCounterpartyCandidates] = useState<CounterpartyCandidateOverview | null>(null);
  const [productionReadiness, setProductionReadiness] = useState<ProductionReadiness | null>(null);
  const [currentState, setCurrentState] = useState<CurrentStateOverview | null>(null);
  const [lastAlignmentCycle, setLastAlignmentCycle] = useState<ReadonlyAlignmentCycleResult | null>(null);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [drafts, setDrafts] = useState<VoucherDraft[]>([]);
  const [writebackOutbox, setWritebackOutbox] = useState<WritebackOutbox[]>([]);
  const [writebackPreparation, setWritebackPreparation] = useState<WritebackPreparation | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult[]>([]);
  const [draftSourceType, setDraftSourceType] = useState('MANUAL');
  const [draftSourceId, setDraftSourceId] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftLines, setDraftLines] = useState(() => JSON.stringify([
    { summary: t('finance.chanjet.example_debit_summary'), subjectCode: '100201', debitAmount: 100, creditAmount: 0 },
    { summary: t('finance.chanjet.example_credit_summary'), subjectCode: '220201', debitAmount: 0, creditAmount: 100 },
  ]));
  const [draftValidation, setDraftValidation] = useState<VoucherDraftValidation | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const [ov, bookResp, mapResp, fieldResp, jobResp, draftResp, outboxResp, writebackPreparationResp, reconResp, readResp, entityResp, fieldMapResp, financeAdapterResp, financeCoverageResp, financeRuntimeReconResp, financeSemanticExtractorResp, financeReadModelResp, financeReadonlyReportResp, receiptPaymentLocksResp, readonlyFieldAdaptersResp, wmsAlignmentResp, baselineResp, accountBookGateResp, counterpartyCandidateResp, currentStateResp] = await Promise.all([
        request<{ success: boolean; overview: Overview; error?: string }>('/chanjet/integration/overview'),
        request<{ success: boolean; books: AccountBook[]; error?: string }>('/chanjet/integration/account-books'),
        request<{ success: boolean; mappings: Mapping[]; error?: string }>('/chanjet/integration/master-mappings'),
        request<{ success: boolean; fields: FieldCatalog[]; error?: string }>('/chanjet/integration/field-catalog?limit=200'),
        request<{ success: boolean; jobs: SyncJob[]; error?: string }>('/chanjet/integration/sync-jobs?limit=80'),
        request<{ success: boolean; drafts: VoucherDraft[]; error?: string }>('/chanjet/integration/voucher-drafts?limit=80'),
        request<{ success: boolean; outbox: WritebackOutbox[]; error?: string }>('/chanjet/integration/writeback-outbox?limit=80'),
        request<{ success: boolean; preparation: WritebackPreparation; error?: string }>('/chanjet/integration/writeback-preparation'),
        request<{ success: boolean; results: ReconciliationResult[]; error?: string }>('/chanjet/integration/reconciliation-results?limit=120'),
        request<{ success: boolean; snapshots: ReadSnapshot[]; error?: string }>('/chanjet/integration/mirror/read-snapshots?limit=80'),
        request<{ success: boolean; entities: EntitySnapshot[]; error?: string }>('/chanjet/integration/mirror/entity-snapshots?limit=160'),
        request<{ success: boolean; mappings: FieldMapping[]; error?: string }>('/chanjet/integration/field-mappings?limit=300'),
        request<{ success: boolean; adapter: FinanceAdapterOverview; error?: string }>('/chanjet/integration/finance-adapter/p0'),
        request<{ success: boolean; coverage: FinanceReadonlyCoverage; error?: string }>('/chanjet/integration/finance-coverage'),
        request<{ success: boolean; reconciliation: FinanceRuntimeReconciliation; error?: string }>('/chanjet/integration/finance-reconciliation'),
        request<{ success: boolean; semanticExtractors: FinanceSemanticExtractorsOverview; error?: string }>('/chanjet/integration/finance-semantic-extractors'),
        request<{ success: boolean; readModel: FinanceReadModelOverview; error?: string }>('/chanjet/integration/finance-read-model'),
        request<{ success: boolean; readonlyReport: FinanceReadonlyStatementReportOverview; error?: string }>('/chanjet/integration/subject-balance-readonly-report'),
        request<{ success: boolean; receiptPaymentLocks: ReceiptPaymentLocksOverview; error?: string }>('/chanjet/integration/receipt-payment-locks'),
        request<{ success: boolean; readonlyFieldAdapters: ReadonlyFieldAdaptersOverview; error?: string }>('/chanjet/integration/readonly-field-adapters'),
        request<{ success: boolean; alignment: WmsReadonlyAlignment; error?: string }>('/chanjet/integration/wms-readonly-alignment'),
        request<{ success: boolean; baseline: MirrorBaselineReadiness; error?: string }>('/chanjet/integration/baseline-readiness?freshnessHours=24'),
        request<{ success: boolean; gate: AccountBookMappingGate; error?: string }>('/chanjet/integration/account-book-mapping-gate'),
        request<{ success: boolean; candidateOverview: CounterpartyCandidateOverview; error?: string }>('/chanjet/integration/counterparty-mapping-candidates'),
        request<{ success: boolean; currentState: CurrentStateOverview; error?: string }>('/chanjet/integration/current-state'),
      ]);
      if (!ov.success) throw new Error(ov.error || '总览加载失败');
      setOverview(ov.overview);
      setBooks(bookResp.books || []);
      setMappings(mapResp.mappings || []);
      setFields(fieldResp.fields || []);
      setJobs(jobResp.jobs || []);
      setDrafts(draftResp.drafts || []);
      setWritebackOutbox(outboxResp.outbox || []);
      setWritebackPreparation(writebackPreparationResp.preparation || null);
      setReconciliation(reconResp.results || []);
      setReadSnapshots(readResp.snapshots || []);
      setEntitySnapshots(entityResp.entities || []);
      setFieldMappings(fieldMapResp.mappings || []);
      setFinanceAdapter(financeAdapterResp.adapter || null);
      setFinanceCoverage(financeCoverageResp.coverage || null);
      setFinanceRuntimeRecon(financeRuntimeReconResp.reconciliation || null);
      setFinanceSemanticExtractors(financeSemanticExtractorResp.semanticExtractors || null);
      setFinanceReadModel(financeReadModelResp.readModel || null);
      setFinanceReadonlyReports(financeReadonlyReportResp.readonlyReport || null);
      setReceiptPaymentLocks(receiptPaymentLocksResp.receiptPaymentLocks || null);
      setReadonlyFieldAdapters(readonlyFieldAdaptersResp.readonlyFieldAdapters || null);
      setWmsAlignment(wmsAlignmentResp.alignment || null);
      setBaselineReadiness(baselineResp.baseline || null);
      setAccountBookGate(accountBookGateResp.gate || null);
      setCounterpartyCandidates(counterpartyCandidateResp.candidateOverview || null);
      setCurrentState(currentStateResp.currentState || null);
      setProductionReadiness(currentStateResp.currentState?.productionReadiness || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const kpis = useMemo(() => [
    { label: '账套缓存', value: overview?.accountBooks ?? 0, sub: `${overview?.enabledBooks ?? 0} 个启用`, icon: BookOpen },
    { label: '字段目录', value: overview?.fields ?? 0, sub: '脱敏字段样本', icon: Database },
    { label: '映射候选', value: overview?.mappings ?? 0, sub: `${overview?.pendingMappings ?? 0} 待审 / ${overview?.approvedMappings ?? 0} 已批`, icon: GitCompareArrows },
    { label: '凭证草稿', value: overview?.voucherDrafts ?? 0, sub: `${overview?.pushReadyDrafts ?? 0} 写回候选（外部写入关闭）`, icon: FileText },
    { label: '镜像实体', value: overview?.entitySnapshots ?? 0, sub: `${overview?.readSnapshots ?? 0} 个原始快照`, icon: Database },
    { label: '字段差异', value: overview?.fieldMappings ?? 0, sub: `${overview?.unmappedFields ?? 0} 个待归类字段`, icon: GitCompareArrows },
    { label: '开放差异', value: overview?.openReconciliationIssues ?? 0, sub: `${overview?.failedJobs ?? 0} 个失败作业`, icon: AlertTriangle },
  ], [overview]);

  async function runAction(label: string, action: () => Promise<unknown>) {
    if (!canEdit) return;
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const result = await action() as { success?: boolean; error?: string } | undefined;
      if (result?.success === false) throw new Error(result.error || `${label}未通过`);
      setMessage(`${label} 已完成`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function reviewMapping(id: string, reviewStatus: Mapping['reviewStatus']) {
    await runAction('映射审核', () => request(`/chanjet/integration/master-mappings/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ reviewStatus }),
    }));
  }

  async function runFullReadonlyAlignment() {
    if (!canEdit) return;
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const queued = await request<{
        success: boolean;
        accepted: boolean;
        reason?: string;
        run: ReadonlyAlignmentRunState;
      }>('/chanjet/integration/alignment/enqueue', {
        method: 'POST',
        body: JSON.stringify({
          scope: financeCoverage?.fullReadonlyScope?.map((item) => item.key) || [],
          maxAttempts: 3,
        }),
      });
      if (!queued.success) throw new Error(t('finance.chanjet.alignment_enqueue_failed'));
      setMessage(queued.accepted ? `只读对齐任务已受理：${queued.run.runId}` : '已有只读对齐任务运行中，正在跟踪现有任务');

      let run = queued.run;
      for (let attempt = 0; attempt < 180 && ['QUEUED', 'RUNNING'].includes(run.state); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const status = await request<{ success: boolean; run: ReadonlyAlignmentRunState }>('/chanjet/integration/alignment/status');
        run = status.run;
        setMessage(`只读对齐 ${run.state === 'QUEUED' ? '排队中' : '运行中'}：${run.runId || '—'}`);
      }
      if (run.state !== 'COMPLETED') {
        throw new Error(run.message || `完整只读闭环 ${run.state}`);
      }
      setLastAlignmentCycle(null);
      setMessage(`完整只读闭环 ${run.decision || '完成'}：${run.message || run.runId}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function updateDraftStatus(id: string, status: VoucherDraft['status']) {
    await runAction('凭证草稿审核', () => request(`/chanjet/integration/voucher-drafts/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }));
  }

  async function prepareDraftOutbox(id: string) {
    await runAction(t('finance.chanjet.prepare_outbox_action'), () => request(`/chanjet/integration/voucher-drafts/${id}/prepare-outbox`, {
      method: 'POST',
      body: JSON.stringify({}),
    }));
  }

  async function simulateOutbox(id: string, outcome: 'ACKNOWLEDGED' | 'RETRYABLE' | 'FAILED') {
    await runAction(t('finance.chanjet.run_outbox_simulator'), () => request(`/chanjet/integration/writeback-outbox/${id}/simulate`, {
      method: 'POST',
      body: JSON.stringify({ outcome }),
    }));
  }

  function parseDraftLines() {
    const parsed = JSON.parse(draftLines);
    if (!Array.isArray(parsed)) throw new Error('凭证分录必须为数组');
    return parsed as Array<Record<string, unknown>>;
  }

  async function validateDraft(lines?: Array<Record<string, unknown>>) {
    const voucherLines = lines || parseDraftLines();
    const result = await request<{ success: boolean; validation: VoucherDraftValidation; error?: string }>('/chanjet/integration/voucher-drafts/validate', {
      method: 'POST',
      body: JSON.stringify({
        sourceBizType: draftSourceType,
        sourceBizId: draftSourceId,
        title: draftTitle || '人工凭证草稿',
        voucherLines,
      }),
    });
    setDraftValidation(result.validation);
    if (!result.validation?.valid) {
      throw new Error(result.validation?.errors?.join('；') || result.error || t('finance.chanjet.voucher_validation_failed'));
    }
    return voucherLines;
  }

  async function createDraft() {
    let lines: Array<Record<string, unknown>>;
    try {
      if (!draftSourceId.trim()) throw new Error('来源单号/ID 必填，用于幂等防重');
      lines = await validateDraft();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    await runAction('凭证草稿创建', () => request('/chanjet/integration/voucher-drafts', {
      method: 'POST',
      body: JSON.stringify({
        sourceBizType: draftSourceType,
        sourceBizId: draftSourceId,
        title: draftTitle || '人工凭证草稿',
        voucherLines: lines,
      }),
    }));
    setDraftSourceId('');
    setDraftTitle('');
  }

  if (!canView) {
    return (
      <div style={{ padding: 32 }}>
        <PageHeader title="好业财中间层" subtitle={t('finance.chanjet_integration.admin_console_required', '管理员治理控制台，需 MENU_SETTINGS_CHANJET:V')} />
        <div style={{ color: 'var(--status-danger)' }}>无权限访问。</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1800 }}>
      <PageHeader
        title="好业财中间层"
        subtitle="管理员治理控制台 · 账套 · 字段目录 · 主数据映射 · 对账差异 · 凭证草稿"
        breadcrumb={['系统设置', '好业财中间层']}
        actions={(
          <>
            <Button variant="outline" onClick={load} disabled={loading}><RefreshCw size={16} />刷新</Button>
            <Button variant="outline" disabled={!canEdit || loading} onClick={() => runAction('账套刷新', () => request('/chanjet/integration/account-books/refresh', { method: 'POST' }))}>刷新账套</Button>
            <Button disabled={!canEdit || loading} onClick={runFullReadonlyAlignment}>运行完整只读闭环</Button>
            <Button variant="outline" disabled={!canEdit || loading} onClick={() => runAction('系统确认精确映射', () => request('/chanjet/integration/master-mappings/system-confirm-exact', { method: 'POST' }))}>确认精确映射</Button>
            <Button disabled={!canEdit || loading} onClick={() => runAction('字段探针', () => request('/chanjet/integration/probe', { method: 'POST', body: JSON.stringify({ scope: ['ACCOUNT_BOOKS', 'DEPARTMENT', 'CUSTOMER_SUPPLIER', 'SUBJECT', 'PROJECT', 'FIN_ACCOUNT'] }) }))}>运行探针</Button>
            <Button variant="outline" disabled={!canEdit || loading} onClick={() => runAction('字段差异分析', () => request('/chanjet/integration/field-mappings/analyze', { method: 'POST' }))}>字段分析</Button>
          </>
        )}
      />

      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, borderColor: '#bfdbfe', background: '#eff6ff' }}>
        <ShieldCheck size={18} color="#1d4ed8" />
        <div style={{ color: '#1e3a8a', fontSize: 13 }}>
          中间层边界：只读好业财、写 ERP 中间层；凭证草稿不自动推送；业务主数据仍以 ERP 为权威源。
        </div>
      </div>

      {(error || message) && (
        <div style={{ marginBottom: 14, color: error ? 'var(--status-danger)' : 'var(--status-success)', fontSize: 13 }}>
          {error || message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                {item.label}<Icon size={18} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 10, color: 'var(--text-primary)' }}>{item.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{item.sub}</div>
            </div>
          );
        })}
      </div>

      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>账套缓存</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
          {books.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>暂无账套缓存，请先刷新账套。</div>}
          {books.map((b) => (
            <div key={b.bookId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{b.bookName || b.bookId}</strong>
                <Badge tone={b.enabled ? 'green' : 'muted'}>{b.enabled ? '启用' : '未启用'}</Badge>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>{b.bookId}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{b.companyCode || '未映射公司'} {b.companyName ? `· ${b.companyName}` : ''}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          ['readiness', 'P0-P6 准备度'],
          ['governance', '治理 Gate'],
          ['adapter', 'P0 财务适配'],
          ['coverage', '覆盖率看板'],
          ['readonlyAdapters', '只读适配器'],
          ['wmsAlignment', t('ui.库存单据对齐', '库存单据对齐')],
          ['mirror', '只读镜像'],
          ['fieldGaps', '字段差异'],
          ['mappings', '主数据映射'],
          ['reconciliation', '对账差异'],
          ['semantic', '语义提取器'],
          ['readModel', '财务 Read Model'],
          ['statementReports', '科目/报表只读'],
          ['receiptPaymentLocks', '收付款日期状态锁'],
          ['drafts', '凭证草稿'],
          ['fields', '字段目录'],
          ['jobs', '作业审计'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as TabKey)}
            style={{
              border: 0,
              background: tab === key ? 'var(--brand)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--text-secondary)',
              padding: '9px 14px',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'readiness' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
            <div>
              <strong style={{ fontSize: 18 }}>好业财融合生产准备度</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>
                汇总全量镜像、主数据映射、标准 read model、财务卡片、差异对账、同步韧性和管理员边界。评分不替代 Gate，存在阻断时始终 HOLD。
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: productionReadiness?.decision === 'HOLD' ? 'var(--status-danger)' : 'var(--brand)' }}>
                {productionReadiness?.score ?? 0}<span style={{ fontSize: 14, marginLeft: 4 }}>/100 · {productionReadiness?.grade || '—'}</span>
              </div>
              <Badge tone={statusTone(productionReadiness?.decision || 'HOLD')}>{productionReadiness?.decision || '—'}</Badge>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 13, marginBottom: 14, borderColor: currentState?.decision === 'HOLD' ? '#fecaca' : '#bfdbfe', background: currentState?.decision === 'HOLD' ? '#fef2f2' : '#eff6ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <strong>{t('finance.chanjet.runtime_current_state')}</strong>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                  {currentState?.authoritativeEvidence || 'RUNTIME_CURRENT_STATE'} · {fmtDate(currentState?.generatedAt)}
                </div>
              </div>
              <Badge tone={statusTone(currentState?.decision || 'HOLD')}>{currentState?.decision || 'HOLD'}</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8, marginTop: 12 }}>
              {(currentState?.implementationOrder || []).map((phase) => (
                <div key={phase.phase} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{phase.phase} · {phase.title}</strong>
                    <Badge tone={statusTone(phase.status)}>{phase.score}</Badge>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 7 }}>{phase.evidence[0] || t('finance.chanjet.no_evidence')}</div>
                  <div style={{ color: 'var(--brand)', fontSize: 11, marginTop: 7, overflowWrap: 'anywhere' }}>{phase.nextAction}</div>
                </div>
              ))}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 10 }}>{currentState?.staleEvidencePolicy}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: 16 }}>
            {(productionReadiness?.phases || []).map((phase) => (
              <div key={phase.key} style={{ ...cardStyle, padding: 13, borderTop: `3px solid ${phase.status === 'READY' ? '#16a34a' : phase.status === 'HOLD' ? '#dc2626' : '#d97706'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <strong>{phase.key} · {phase.title}</strong>
                  <Badge tone={statusTone(phase.status)}>{phase.score}</Badge>
                </div>
                <div style={{ marginTop: 10, display: 'grid', gap: 4, color: 'var(--text-secondary)', fontSize: 12 }}>
                  {phase.evidence.map((item) => <div key={item}>• {item}</div>)}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--brand)' }}>{phase.nextAction}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              ['镜像新鲜度', productionReadiness?.summary.mirrorFreshRate],
              ['账套映射', productionReadiness?.summary.accountBookMappingRate],
              ['主数据批准覆盖', productionReadiness?.summary.masterDataApprovedRate],
              ['字段语义覆盖', productionReadiness?.summary.semanticCoverageRate],
              ['财务卡片权威覆盖', productionReadiness?.summary.authorityReadyRate],
              ['最近作业成功率', productionReadiness?.summary.recentJobSuccessRate],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 5 }}>{Number(value || 0)}%</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 12 }}>
            <div style={{ ...cardStyle, padding: 12, background: productionReadiness?.blockers.length ? '#fef2f2' : '#f0fdf4' }}>
              <div style={{ fontWeight: 700, color: productionReadiness?.blockers.length ? '#991b1b' : '#166534' }}>阻断项</div>
              <div style={{ marginTop: 8, fontSize: 13, display: 'grid', gap: 5 }}>
                {productionReadiness?.blockers.length ? productionReadiness.blockers.map((item) => <div key={item}>• {item}</div>) : <div>无硬阻断。</div>}
              </div>
            </div>
            <div style={{ ...cardStyle, padding: 12, background: '#fffbeb' }}>
              <div style={{ fontWeight: 700, color: '#92400e' }}>条件项</div>
              <div style={{ marginTop: 8, fontSize: 13, display: 'grid', gap: 5 }}>
                {productionReadiness?.conditions.length ? productionReadiness.conditions.map((item) => <div key={item}>• {item}</div>) : <div>无开放条件。</div>}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Badge tone={productionReadiness?.tokenHealth.configured ? 'green' : 'red'}>认证配置: {productionReadiness?.tokenHealth.configured ? 'READY' : 'HOLD'}</Badge>
            <Badge tone="green">好业财写入: 永久关闭</Badge>
            <Badge tone="green">普通用户可见: 否</Badge>
            <Badge tone={productionReadiness?.summary.exactSystemApprovalCandidates ? 'blue' : 'muted'}>可系统确认精确映射: {productionReadiness?.summary.exactSystemApprovalCandidates ?? 0}</Badge>
            <Badge tone={productionReadiness?.summary.manualMappingCandidates ? 'amber' : 'green'}>待人工映射: {productionReadiness?.summary.manualMappingCandidates ?? 0}</Badge>
          </div>
          {lastAlignmentCycle && (
            <div style={{ ...cardStyle, marginTop: 14, padding: 12, background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <strong>本次完整只读闭环</strong>
                <Badge tone={statusTone(lastAlignmentCycle.decision)}>{lastAlignmentCycle.decision}</Badge>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8, marginTop: 10, fontSize: 12 }}>
                <div>镜像目标：{lastAlignmentCycle.mirror.results.length} · 重试轮次：{lastAlignmentCycle.mirror.attempts}</div>
                <div>精确映射：{lastAlignmentCycle.exactMappings?.approved || 0}/{lastAlignmentCycle.exactMappings?.eligible || 0}</div>
                <div>{t('ui.只读源身份', '只读源身份')}：{lastAlignmentCycle.exactMappings?.sourceOnlyResolved || 0}</div>
                <div>{t('ui.待处理', '待处理')}：{lastAlignmentCycle.exactMappings?.remainingPending || 0} · {t('ui.冲突', '冲突')}：{lastAlignmentCycle.exactMappings?.remainingConflicts || 0}</div>
                <div>新增差异：{lastAlignmentCycle.reconciliation?.created || 0} · 保持：{lastAlignmentCycle.reconciliation?.unchanged || 0}</div>
                <div>自动结案：{lastAlignmentCycle.reconciliation?.autoResolved || 0}</div>
              </div>
              <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                {fmtDate(lastAlignmentCycle.startedAt)} 至 {fmtDate(lastAlignmentCycle.completedAt)} · 好业财写入：否 · ERP 业务表覆盖：否
              </div>
            </div>
          )}
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 10 }}>下一 Gate: {productionReadiness?.summary.nextGate || '—'} · 生成时间 {fmtDate(productionReadiness?.generatedAt)}</div>
        </section>
      )}

      {tab === 'governance' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div>
              <strong>好业财只读融合治理 Gate</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                检查镜像基线新鲜度、账套与公司唯一映射、客户/供应商候选。任何 HOLD 都会阻止财务权威口径提升。
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge tone={statusTone(baselineReadiness?.decision || 'HOLD')}>{baselineReadiness?.decision || '—'}</Badge>
              <Button
                variant="outline"
                disabled={!canEdit || loading}
                onClick={() => runAction('往来单位候选生成', () => request('/chanjet/integration/counterparty-mapping-candidates/generate', { method: 'POST' }))}
              >生成待审核候选</Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>镜像新鲜目标</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{baselineReadiness?.summary?.freshTargets ?? 0}/{baselineReadiness?.summary?.expectedTargets ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>阈值 {baselineReadiness?.freshnessHours ?? 24}h · 覆盖 {baselineReadiness?.summary?.endpointCoverageRate ?? 0}%</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>过期 / 缺失</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{baselineReadiness?.summary?.staleTargets ?? 0}/{baselineReadiness?.summary?.missingTargets ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>最近失败作业 {baselineReadiness?.summary?.failedRecentJobs ?? 0}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>有效账套映射</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{accountBookGate?.summary?.validMappings ?? 0}/{accountBookGate?.summary?.enabledMappings ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>阻断 {accountBookGate?.summary?.blockingIssues ?? 0} · 警告 {accountBookGate?.summary?.warnings ?? 0}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('ui.往来身份解析', '往来身份解析')}</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{(counterpartyCandidates?.summary?.matched ?? 0) + (counterpartyCandidates?.summary?.sourceOnly ?? 0)}/{counterpartyCandidates?.summary?.candidates ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('ui.精确', '精确')} {counterpartyCandidates?.summary?.matched ?? 0} · {t('ui.只读源', '只读源')} {counterpartyCandidates?.summary?.sourceOnly ?? 0} · {t('ui.待处理', '待处理')} {counterpartyCandidates?.summary?.pending ?? 0}</div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 12, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Badge tone="green">好业财写入: 否</Badge>
              <Badge tone="green">业务表覆盖: 否</Badge>
              <Badge tone="blue">系统确认: 精确主档或完整只读源身份</Badge>
              <Badge tone="green">模糊自动匹配: 否</Badge>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8 }}>下一 Gate: {baselineReadiness?.summary?.nextGate || '—'}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(520px,1fr))', gap: 14 }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>账套 ↔ 公司映射</div>
              <table style={{ ...tableStyle, minWidth: 620 }}>
                <thead><tr>{['账套', 'ERP 公司', '状态', '问题'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {(accountBookGate?.mappings || []).map((item) => (
                    <tr key={item.bookId}>
                      <td style={cellStyle}><strong>{item.bookName || item.bookId}</strong><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.bookId}</div></td>
                      <td style={cellStyle}>{item.companyName || item.companyCode}<div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.companyCode}</div></td>
                      <td style={cellStyle}><Badge tone={statusTone(item.status)}>{item.status}</Badge></td>
                      <td style={cellStyle}>{item.issues.join(' / ') || '—'}</td>
                    </tr>
                  ))}
                  {!accountBookGate?.mappings?.length && <tr><td style={cellStyle} colSpan={4}>暂无账套映射。</td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>往来单位候选（前 30 条）</div>
              <table style={{ ...tableStyle, minWidth: 720 }}>
                <thead><tr>{['好业财往来单位', '角色', 'ERP 候选', '状态', '置信度'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {(counterpartyCandidates?.candidates || []).slice(0, 30).map((item) => (
                    <tr key={item.candidateKey}>
                      <td style={cellStyle}><strong>{item.chanjetName || item.chanjetCode}</strong><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.chanjetCode || item.chanjetId}</div></td>
                      <td style={cellStyle}>{item.mappingType || item.roleCandidate}</td>
                      <td style={cellStyle}>{item.erpName || '待匹配'}<div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.erpCode || item.evidence.join(' / ')}</div></td>
                      <td style={cellStyle}><Badge tone={statusTone(item.matchStatus)}>{item.matchStatus}</Badge></td>
                      <td style={cellStyle}>{item.confidence}%</td>
                    </tr>
                  ))}
                  {!counterpartyCandidates?.candidates?.length && <tr><td style={cellStyle} colSpan={5}>暂无往来单位镜像候选。</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>16 scope 镜像基线</div>
            <table style={{ ...tableStyle, minWidth: 920 }}>
              <thead><tr>{['Scope', '账套', '新鲜度', '快照/实体', '最近拉取', '作业'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(baselineReadiness?.scopes || []).map((item) => (
                  <tr key={`${item.endpointKey}:${item.bookId}`}>
                    <td style={cellStyle}><strong>{item.label}</strong><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.endpointKey}</div></td>
                    <td style={cellStyle}>{item.bookId || '企业级'}</td>
                    <td style={cellStyle}><Badge tone={item.status === 'FRESH' ? 'green' : item.status === 'MISSING' ? 'red' : 'amber'}>{item.status}</Badge><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{item.ageHours === null ? '—' : `${item.ageHours}h`}</div></td>
                    <td style={cellStyle}>{item.rowCount} / {item.entityCount}</td>
                    <td style={cellStyle}>{fmtDate(item.latestPulledAt)}</td>
                    <td style={cellStyle}><Badge tone={statusTone(item.latestJobStatus)}>{item.latestJobStatus}</Badge>{item.latestJobError && <div style={{ fontSize: 12, color: 'var(--status-danger)', marginTop: 4 }}>{item.latestJobError}</div>}</td>
                  </tr>
                ))}
                {!baselineReadiness?.scopes?.length && <tr><td style={cellStyle} colSpan={6}>暂无镜像基线数据。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'adapter' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div>
              <strong>P0 财务只读适配层</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                将好业财只读镜像按凭证、往来、应收应付等财务语义重组成 ERP 可审查视图；不写好业财、不推凭证、不写 ERP 业务主表。
              </div>
            </div>
            <Badge tone={financeAdapter?.readiness?.pushEnabled ? 'red' : 'green'}>凭证推送关闭</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>P0 桶</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{financeAdapter?.readiness?.p0Total ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>READY {financeAdapter?.readiness?.p0Ready ?? 0} / 条件项 {financeAdapter?.readiness?.p0ReadyWithGaps ?? 0}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>待镜像同步</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{financeAdapter?.readiness?.p0WaitingMirrorSync ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>只读同步后才能进入适配审查</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>下一 Gate</div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 8 }}>{financeAdapter?.readiness?.allowedNextGate ?? '—'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>仍需人工字段复核</div>
            </div>
          </div>
          <div style={{ ...cardStyle, padding: 12, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>安全边界</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Badge tone="green">好业财写入: 否</Badge>
              <Badge tone="green">凭证推送: 否</Badge>
              <Badge tone="green">ERP 业务表写入: 否</Badge>
              <Badge tone="green">fin_ar_invoices 连接: 否</Badge>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8 }}>{financeAdapter?.guardrails?.note}</div>
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>{['适配桶', '镜像/实体', '字段风险', 'ERP 目标', '下一步'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {(financeAdapter?.buckets || []).map((bucket) => (
                <tr key={bucket.key}>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong>{bucket.title}</strong>
                      <Badge tone={bucket.priority === 'P0' ? 'blue' : 'muted'}>{bucket.priority}</Badge>
                      <Badge tone={statusTone(bucket.adapterStatus)}>{bucket.adapterStatus}</Badge>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>{bucket.endpointKeys.join(' / ')}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 3 }}>{bucket.adapterScope}</div>
                  </td>
                  <td style={cellStyle}>
                    快照 {bucket.snapshotCount}<br />
                    实体 {bucket.entityCount}<br />
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>最近: {fmtDate(bucket.latestPulledAt)}</span>
                  </td>
                  <td style={cellStyle}>
                    字段 {bucket.mappedFieldCount}<br />
                    高风险待审 {bucket.unresolvedHighRisk}
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                      HIGH {bucket.riskCounts.HIGH || 0} / CRITICAL {bucket.riskCounts.CRITICAL || 0}
                    </div>
                  </td>
                  <td style={cellStyle}>{bucket.erpTarget}</td>
                  <td style={cellStyle}>{bucket.nextAction}</td>
                </tr>
              ))}
              {!financeAdapter?.buckets?.length && <tr><td style={cellStyle} colSpan={5}>暂无 P0 适配数据，请先执行只读镜像同步和字段分析。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'coverage' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div>
              <strong>好业财全量只读同步覆盖率</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                P0 要求 ERP 能完整重现好业财财务侧数据，并标出财务卡片来源。覆盖率低于 90% 的项进入整改清单。
              </div>
            </div>
            <Badge tone={financeCoverage?.summary?.decision === 'GO' ? 'green' : 'amber'}>{financeCoverage?.summary?.decision || '—'}</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>接口覆盖率</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{pct(financeCoverage?.summary?.endpointCoverageRate)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{financeCoverage?.endpointCoverage?.filter((item) => item.covered).length || 0} / {financeCoverage?.endpointCoverage?.length || 0} 个 P0 接口已镜像</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>财务卡片覆盖率</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{pct(financeCoverage?.summary?.cardCoverageRate)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{financeCoverage?.cardCoverage?.filter((item) => item.covered).length || 0} / {financeCoverage?.cardCoverage?.length || 0} 张卡有好业财依据</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>字段覆盖率</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{pct(financeCoverage?.fieldCoverage?.coverageRate)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>缺字段 {financeCoverage?.fieldCoverage?.missingFields || 0} / 转换 {financeCoverage?.fieldCoverage?.transformRequired || 0}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>同步异常</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeCoverage?.summary?.failedLatestJobs?.length || 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>失败会写入系统告警中心</div>
            </div>
          </div>
          <div style={{ ...cardStyle, padding: 12, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>口径规则</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{financeCoverage?.guardrails?.rule || '好业财只读优先，ERP 明细辅助对账。'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Badge tone="green">好业财写入: 否</Badge>
              <Badge tone="green">ERP 业务表覆盖: 否</Badge>
              <Badge tone="green">凭证推送: 否</Badge>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>P0 接口清单</div>
              <table style={tableStyle}>
                <thead><tr>{['接口', '覆盖', '快照/实体', '最近作业'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {(financeCoverage?.endpointCoverage || []).map((item) => (
                    <tr key={item.key}>
                      <td style={cellStyle}><strong>{item.label}</strong><div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{item.key} · {item.entityType}</div></td>
                      <td style={cellStyle}><Badge tone={item.covered ? 'green' : 'amber'}>{item.covered ? '已覆盖' : '待同步'}</Badge></td>
                      <td style={cellStyle}>快照 {item.snapshotCount} / 行 {item.rowCount}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>实体 {item.entityCount}</div></td>
                      <td style={cellStyle}>
                        <Badge tone={statusTone(item.latestJobStatus)}>{item.latestJobStatus}</Badge>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{fmtDate(item.latestPulledAt)}</div>
                        {item.latestJobError && <div style={{ color: 'var(--status-danger)', fontSize: 12, marginTop: 4 }}>{item.latestJobError}</div>}
                      </td>
                    </tr>
                  ))}
                  {!financeCoverage?.endpointCoverage?.length && <tr><td style={cellStyle} colSpan={4}>暂无覆盖率数据。</td></tr>}
                </tbody>
              </table>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>财务卡片来源覆盖</div>
              <table style={tableStyle}>
                <thead><tr>{['卡片', '状态', '依赖接口', '规则'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {(financeCoverage?.cardCoverage || []).map((item) => (
                    <tr key={item.cardKey}>
                      <td style={cellStyle}><strong>{item.label}</strong><div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{item.cardKey}</div></td>
                      <td style={cellStyle}><Badge tone={item.covered ? 'green' : 'amber'}>{item.status}</Badge></td>
                      <td style={cellStyle}>{item.endpoints.join(' / ')}</td>
                      <td style={cellStyle}>{item.sourceRule}</td>
                    </tr>
                  ))}
                  {!financeCoverage?.cardCoverage?.length && <tr><td style={cellStyle} colSpan={4}>暂无卡片覆盖率数据。</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === 'readonlyAdapters' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div>
              <strong>好业财只读字段适配器</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                将好业财镜像中的凭证头、凭证明细、往来单位整理成 ERP 可消费合同。该页只服务管理员治理，不对普通用户暴露中间层。
              </div>
            </div>
            <Badge tone={readonlyFieldAdapters?.decision === 'GO' ? 'green' : readonlyFieldAdapters?.decision === 'HOLD' ? 'red' : 'amber'}>
              {readonlyFieldAdapters?.decision || '—'}
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>适配器</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{readonlyFieldAdapters?.summary?.ready ?? 0}/{readonlyFieldAdapters?.summary?.totalAdapters ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>READY / TOTAL</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>凭证头 / 明细</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{readonlyFieldAdapters?.summary?.voucherHeaderRows ?? 0}/{readonlyFieldAdapters?.summary?.voucherLineRows ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>只读样本行</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>往来单位</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{readonlyFieldAdapters?.summary?.counterpartyRows ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>需映射审核后业务使用</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>字段覆盖率</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{pct(readonlyFieldAdapters?.summary?.fieldCoverage ?? 0)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>缺字段自动进入整改清单</div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 12, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>安全边界</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{readonlyFieldAdapters?.guardrails?.rule || '只读适配器只消费 ERP 中间层快照。'}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>下一 Gate: {readonlyFieldAdapters?.summary?.nextGate ?? '—'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Badge tone="green">好业财写入: 否</Badge>
              <Badge tone="green">凭证推送: 否</Badge>
              <Badge tone="green">ERP 业务表覆盖: 否</Badge>
              <Badge tone="green">普通用户可见: 否</Badge>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {(readonlyFieldAdapters?.adapters || []).map((adapter) => (
              <div key={adapter.adapterKey} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <strong>{adapter.title}</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                      {adapter.adapterKey} · 样本 {adapter.sampleRows} · 最近同步 {fmtDate(adapter.latestPulledAt)}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                      {adapter.sourceEntityTypes.join(' / ')} · {adapter.endpointKeys.join(' / ')}
                    </div>
                  </div>
                  <Badge tone={statusTone(adapter.status)}>{adapter.status}</Badge>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: 12 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>已映射字段</div>
                    <div style={{ marginTop: 6, fontSize: 12 }}>{adapter.mappedFields.slice(0, 10).join(' / ') || '—'}</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>关键缺口</div>
                    <div style={{ marginTop: 6, color: adapter.missingCriticalFields.length ? 'var(--status-danger)' : 'var(--status-success)', fontSize: 12 }}>
                      {adapter.missingCriticalFields.join(' / ') || '无'}
                    </div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>下一步</div>
                    <div style={{ marginTop: 6, fontSize: 12 }}>{adapter.nextAction}</div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  {adapter.adapterKey === 'CHANJET_VOUCHER_HEADER' && (
                    <table style={{ ...tableStyle, minWidth: 980 }}>
                      <thead><tr>{['凭证号', '账套/期间', '日期', '状态', '摘要', '制单/审核'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {adapter.rows.slice(0, 30).map((row) => (
                          <tr key={row.rowId}>
                            <td style={cellStyle}><strong>{String(row.voucherNo || '—')}</strong><div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{String(row.voucherId || '—')}</div></td>
                            <td style={cellStyle}>{String(row.bookId || '—')}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{String(row.period || '—')}</div></td>
                            <td style={cellStyle}>{String(row.voucherDate || '—')}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>入账 {String(row.postingDate || '—')}</div></td>
                            <td style={cellStyle}><Badge tone={String(row.status || '') ? 'blue' : 'muted'}>{String(row.status || '—')}</Badge></td>
                            <td style={cellStyle}>{String(row.summary || '—')}</td>
                            <td style={cellStyle}>{String(row.maker || '—')}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>审核 {String(row.reviewer || '—')}</div></td>
                          </tr>
                        ))}
                        {!adapter.rows.length && <tr><td style={cellStyle} colSpan={6}>暂无凭证头样本，请先执行好业财只读同步。</td></tr>}
                      </tbody>
                    </table>
                  )}
                  {adapter.adapterKey === 'CHANJET_VOUCHER_LINE' && (
                    <table style={{ ...tableStyle, minWidth: 1120 }}>
                      <thead><tr>{['凭证/行', '科目', '摘要', '借方', '贷方', '辅助核算'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {adapter.rows.slice(0, 60).map((row) => (
                          <tr key={row.rowId}>
                            <td style={cellStyle}>{String(row.voucherNo || '—')}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>行 {String(row.lineNo || '—')}</div></td>
                            <td style={cellStyle}><strong>{String(row.subjectName || '—')}</strong><div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{String(row.subjectCode || '—')}</div></td>
                            <td style={cellStyle}>{String(row.summary || '—')}</td>
                            <td style={cellStyle}>{String(row.debitAmount || '0')} {String(row.currency || '')}</td>
                            <td style={cellStyle}>{String(row.creditAmount || '0')} {String(row.currency || '')}</td>
                            <td style={cellStyle}>
                              往来 {String(row.counterpartyName || '—')}
                              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>项目 {String(row.projectName || '—')} / 部门 {String(row.departmentName || '—')}</div>
                            </td>
                          </tr>
                        ))}
                        {!adapter.rows.length && <tr><td style={cellStyle} colSpan={6}>暂未从凭证样本中识别到分录数组，需补充样本或字段规则。</td></tr>}
                      </tbody>
                    </table>
                  )}
                  {adapter.adapterKey === 'CHANJET_COUNTERPARTY' && (
                    <table style={{ ...tableStyle, minWidth: 1040 }}>
                      <thead><tr>{['好业财往来', '类型候选', '状态', 'ERP 候选', '审核', '置信度'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {adapter.rows.slice(0, 80).map((row) => (
                          <tr key={row.rowId}>
                            <td style={cellStyle}><strong>{String(row.externalName || '—')}</strong><div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{String(row.externalCode || row.externalId || '—')}</div></td>
                            <td style={cellStyle}><Badge tone={String(row.roleCandidate) === 'UNKNOWN' ? 'amber' : 'blue'}>{String(row.roleCandidate || 'UNKNOWN')}</Badge></td>
                            <td style={cellStyle}>{String(row.status || '—')}</td>
                            <td style={cellStyle}>{String(row.erpCandidateName || '未匹配')}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{String(row.erpCandidateCode || '—')}</div></td>
                            <td style={cellStyle}><Badge tone={statusTone(String(row.mappingReviewStatus || 'PENDING'))}>{String(row.mappingReviewStatus || 'PENDING')}</Badge></td>
                            <td style={cellStyle}>{String(row.confidence || '0')}</td>
                          </tr>
                        ))}
                        {!adapter.rows.length && <tr><td style={cellStyle} colSpan={6}>暂无往来单位样本，请先执行 CUSTOMER_SUPPLIER 只读同步。</td></tr>}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ))}
            {!readonlyFieldAdapters?.adapters?.length && <div style={cardStyle}>暂无只读适配器数据。</div>}
          </div>
        </section>
      )}

      {tab === 'wmsAlignment' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
            <div>
              <strong>{t('ui.好业财入库销售出库只读对齐', '好业财入库 / 销售出库只读对齐')}</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                {t('ui.库存只读对齐说明', '官方账套接口逐页读取，原始字段无损保存在中间层；ERP 业务表只展示字段适配状态，本页不会写好业财或库存业务表。')}
              </div>
            </div>
            <Badge tone={statusTone(wmsAlignment?.decision || 'HOLD')}>{wmsAlignment?.decision || t('ui.未加载', '未加载')}</Badge>
          </div>
          {wmsAlignment ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
                {[
                  [t('ui.账套Scope', '账套 Scope'), `${wmsAlignment.summary.freshScopes}/${wmsAlignment.summary.expectedScopes}`],
                  [t('ui.好业财单据', '好业财单据'), wmsAlignment.summary.sourceDocuments],
                  [t('ui.单据明细', '单据明细'), wmsAlignment.summary.sourceLines],
                  [t('ui.官方字段', '官方字段'), wmsAlignment.summary.officialFieldCount],
                  [t('ui.ERP字段覆盖', 'ERP 字段覆盖'), `${wmsAlignment.summary.erpBusinessColumnCoverage}%`],
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 5 }}>{value}</div>
                  </div>
                ))}
              </div>
              {wmsAlignment.conditions.length > 0 && (
                <div style={{ border: '1px solid var(--warning-border)', background: 'var(--warning-bg)', borderRadius: 6, padding: 12, marginBottom: 16 }}>
                  <strong>{t('ui.条件项', '条件项')}</strong>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 5 }}>
                    {wmsAlignment.conditions.join('；')}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, marginBottom: 16 }}>
                {wmsAlignment.contracts.map((definition) => (
                  <div key={definition.key} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <strong>{definition.label}</strong>
                      <Badge tone="blue">{definition.fields.length} {t('ui.字段', '字段')}</Badge>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 8 }}>{definition.method} {definition.path}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>
                      {t('ui.状态', '状态')} {definition.statusValues.join(' / ')} · {t('ui.必填字段', '必填字段')} {definition.fields.filter((field) => field.required).length}
                    </div>
                    <a href={definition.reference} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>
                      {t('ui.查看官方接口契约', '查看官方接口契约')}
                    </a>
                  </div>
                ))}
              </div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('ui.字段覆盖与缺口', '字段覆盖与缺口')}</div>
              <table style={tableStyle}>
                <thead>
                  <tr>{[
                    t('ui.好业财字段', '好业财字段'),
                    t('ui.标准字段', '标准字段'),
                    t('ui.ERP落点', 'ERP 落点'),
                    t('ui.必填', '必填'),
                    t('ui.存储策略', '存储策略'),
                  ].map((heading) => (
                    <th key={heading} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{heading}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {wmsAlignment.contracts.flatMap((contract) => contract.fields.map((field) => (
                    <tr key={`${contract.key}:${field.sourcePath}:${field.canonicalField}`}>
                      <td style={cellStyle}>{contract.key}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{field.sourcePath}</div></td>
                      <td style={cellStyle}>{field.canonicalField}</td>
                      <td style={cellStyle}>{field.erpTarget}</td>
                      <td style={cellStyle}>{field.required ? <Badge tone="amber">{t('ui.必填', '必填')}</Badge> : '—'}</td>
                      <td style={cellStyle}><Badge tone={field.storage === 'BUSINESS_COLUMN' ? 'blue' : 'muted'}>{field.storage}</Badge></td>
                    </tr>
                  )))}
                </tbody>
              </table>
              {wmsAlignment.missingColumns.length > 0 && (
                <div style={{ marginTop: 12, color: 'var(--danger)' }}>
                  {t('ui.尚缺业务列', '尚缺业务列：')}{wmsAlignment.missingColumns.join('、')}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--text-secondary)' }}>{t('ui.对齐数据尚未加载', '对齐数据尚未加载。')}</div>
          )}
        </section>
      )}

      {tab === 'mirror' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div>
              <strong>好业财只读镜像</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                用于在 ERP 端重现好业财开放数据。这里不写好业财、不覆盖 ERP 业务主表。
              </div>
            </div>
            <Button size="sm" disabled={!canEdit || loading} onClick={() => runAction('只读镜像同步', () => request('/chanjet/integration/mirror/sync', { method: 'POST', body: JSON.stringify({}) }))}>
              <RefreshCw size={14} />同步镜像
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 14 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>标准化实体</div>
              <table style={tableStyle}>
                <thead><tr>{['类型', '编码 / 名称', '账套', '金额', '状态'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {entitySnapshots.slice(0, 80).map((e) => (
                    <tr key={e.id}>
                      <td style={cellStyle}>{e.entityType}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{e.endpointKey}</div></td>
                      <td style={cellStyle}>{e.externalName || '—'}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{e.externalCode || e.externalId}</div></td>
                      <td style={cellStyle}>{e.bookId || '全局'}</td>
                      <td style={cellStyle}>{Number(e.amount || 0).toLocaleString('zh-CN')} {e.currency || ''}</td>
                      <td style={cellStyle}><Badge tone={e.status ? 'blue' : 'muted'}>{e.status || '—'}</Badge></td>
                    </tr>
                  ))}
                  {entitySnapshots.length === 0 && <tr><td style={cellStyle} colSpan={5}>暂无镜像实体。点击“同步镜像”后生成。</td></tr>}
                </tbody>
              </table>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>原始快照审计</div>
              <table style={tableStyle}>
                <thead><tr>{['接口', '行数', '账套/期间', '时间'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {readSnapshots.slice(0, 60).map((s) => (
                    <tr key={s.id}>
                      <td style={cellStyle}>{s.endpointKey}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{s.method} {s.apiPath}</div></td>
                      <td style={cellStyle}>{s.rowCount}</td>
                      <td style={cellStyle}>{s.bookId || '全局'}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{s.period || '—'}</div></td>
                      <td style={cellStyle}>{fmtDate(s.pulledAt)}</td>
                    </tr>
                  ))}
                  {readSnapshots.length === 0 && <tr><td style={cellStyle} colSpan={4}>暂无原始快照。</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === 'fieldGaps' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div>
              <strong>好业财字段 ↔ ERP 字段差异</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>自动分析只生成候选；ERP schema / DTO / 页面改造必须另走实现 Gate。</div>
            </div>
            <Button size="sm" variant="outline" disabled={!canEdit || loading} onClick={() => runAction('字段差异分析', () => request('/chanjet/integration/field-mappings/analyze', { method: 'POST' }))}>
              <GitCompareArrows size={14} />重新分析
            </Button>
          </div>
          <table style={tableStyle}>
            <thead><tr>{['好业财字段', 'ERP 候选', '状态', '风险', '转换/说明'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {fieldMappings.slice(0, 160).map((m) => (
                <tr key={m.id}>
                  <td style={cellStyle}>{m.chanjetFieldPath}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.chanjetType} · {m.chanjetSampleMasked || '—'}</div><div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.chanjetEndpoint}</div></td>
                  <td style={cellStyle}>{m.erpDomain || '未分类'}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.erpTable || '—'} / {m.erpField || '—'} / {m.erpType || '—'}</div></td>
                  <td style={cellStyle}><Badge tone={statusTone(m.matchStatus)}>{m.matchStatus}</Badge><div style={{ marginTop: 4 }}><Badge tone={statusTone(m.decisionStatus)}>{m.decisionStatus}</Badge></div></td>
                  <td style={cellStyle}><Badge tone={statusTone(m.riskLevel)}>{m.riskLevel}</Badge></td>
                  <td style={cellStyle}>{m.transformRule || '—'}<div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{m.analysisNote || '—'}</div></td>
                </tr>
              ))}
              {fieldMappings.length === 0 && <tr><td style={cellStyle} colSpan={5}>暂无字段差异候选。先运行字段探针或只读镜像同步。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'mappings' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong>ERP ↔ 好业财主数据映射</strong>
            <Button size="sm" variant="outline" disabled={!canEdit || loading} onClick={() => runAction('映射对账', () => request('/chanjet/integration/reconciliation/run', { method: 'POST' }))}>
              <GitCompareArrows size={14} />生成映射对账
            </Button>
          </div>
          <table style={tableStyle}>
            <thead><tr>{['类型', 'ERP', '好业财', '匹配', '审核', '操作'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {mappings.slice(0, 80).map((m) => (
                <tr key={m.id}>
                  <td style={cellStyle}>{m.mappingType}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.bookId || '全局'}</div></td>
                  <td style={cellStyle}>{m.erpName || '—'}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.erpCode || '未绑定'}</div></td>
                  <td style={cellStyle}>{m.chanjetName || '—'}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.chanjetCode || m.chanjetId || '—'}</div></td>
                  <td style={cellStyle}><Badge tone={statusTone(m.matchStatus)}>{m.matchStatus}</Badge><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{m.confidence}%</div></td>
                  <td style={cellStyle}><Badge tone={statusTone(m.reviewStatus)}>{m.reviewStatus}</Badge></td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => reviewMapping(m.id, 'APPROVED')}>批准</Button>
                      <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => reviewMapping(m.id, 'REJECTED')}>拒绝</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {mappings.length === 0 && <tr><td style={cellStyle} colSpan={6}>暂无映射候选。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'reconciliation' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div>
              <strong>财务口径对账中心</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                对比好业财只读镜像与 ERP 财务辅助明细。状态为 NEED_MAPPING / NEED_MANUAL_REVIEW 时，只显示差异和下一步，不静默覆盖 ERP 卡片。
              </div>
            </div>
            <Badge tone={financeRuntimeRecon?.decision === 'GO' ? 'green' : financeRuntimeRecon?.decision === 'HOLD' ? 'red' : 'amber'}>
              {financeRuntimeRecon?.decision || '—'}
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>对账项</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeRuntimeRecon?.summary?.totalItems ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>P0 未闭环 {financeRuntimeRecon?.summary?.p0Open ?? 0}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>已对齐 / 轻微差异</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{(financeRuntimeRecon?.summary?.ok ?? 0) + (financeRuntimeRecon?.summary?.warn ?? 0)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>OK {financeRuntimeRecon?.summary?.ok ?? 0} / WARN {financeRuntimeRecon?.summary?.warn ?? 0}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>待字段映射</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeRuntimeRecon?.summary?.needMapping ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>禁止将未映射金额显示为真实 0</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>需人工确认</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeRuntimeRecon?.summary?.needManualReview ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>日期 / 审核状态口径待锁定</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>语义锁进度</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeRuntimeRecon?.summary?.semanticPartial ?? 0}/{financeRuntimeRecon?.summary?.totalItems ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                可作权威候选 {financeRuntimeRecon?.summary?.authorityEligible ?? 0} · 待锁 {financeRuntimeRecon?.summary?.semanticPending ?? 0}
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 12, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>只读边界</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{financeRuntimeRecon?.guardrails?.rule || '只读对账，不写好业财，不覆盖 ERP 业务表。'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Badge tone="green">好业财写入: 否</Badge>
              <Badge tone="green">凭证推送: 否</Badge>
              <Badge tone="green">ERP 业务覆盖: 否</Badge>
              <Badge tone="green">migration: 否</Badge>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: 1120 }}>
              <thead>
                <tr>{['口径', '状态', '语义锁', '好业财值', 'ERP 辅助值', '差异', '证据', '下一步'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(financeRuntimeRecon?.items || []).map((item) => (
                  <tr key={item.key}>
                    <td style={cellStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{item.label}</strong>
                        <Badge tone={item.priority === 'P0' ? 'blue' : 'muted'}>{item.priority}</Badge>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>{item.key}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 3 }}>{item.chanjetEndpointKeys.join(' / ')}</div>
                    </td>
                    <td style={cellStyle}><Badge tone={statusTone(item.status)}>{item.status}</Badge></td>
                    <td style={cellStyle}>
                      <Badge tone={statusTone(item.semanticLock?.status)}>{item.semanticLock?.status || 'PENDING'}</Badge>
                      <div style={{ marginTop: 6 }}>
                        <Badge tone={item.semanticLock?.authorityEligible ? 'green' : 'amber'}>
                          {item.semanticLock?.authorityEligible ? '可作权威候选' : '不可作权威值'}
                        </Badge>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>
                        待锁: {(item.semanticLock?.pendingFields || []).slice(0, 4).join(' / ') || '—'}
                      </div>
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 800 }}>{fmtMoney(item.chanjetValue)}</td>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 700 }}>{fmtMoney(item.erpValue)}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{item.erpSources.join(' / ')}</div>
                    </td>
                    <td style={{ ...cellStyle, color: item.diff == null ? 'var(--text-secondary)' : Math.abs(item.diff) > 0.01 ? 'var(--status-danger)' : 'var(--status-success)', fontWeight: 800 }}>
                      {fmtSignedMoney(item.diff)}
                      {item.diffRate != null && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{Math.round(item.diffRate * 10000) / 100}%</div>}
                    </td>
                    <td style={cellStyle}>
                      好业财行 {item.evidence.chanjetRows}
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>ERP 行 {item.evidence.erpRows ?? '—'}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>最近同步 {fmtDate(item.evidence.latestPulledAt)}</div>
                    </td>
                    <td style={cellStyle}>
                      <div>{item.recommendedAction}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>{item.reason}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>{item.semanticLock?.nextAction}</div>
                    </td>
                  </tr>
                ))}
                {!financeRuntimeRecon?.items?.length && <tr><td style={cellStyle} colSpan={8}>暂无运行时财务对账数据。</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ fontWeight: 700, margin: '20px 0 8px' }}>中间层对账差异流水</div>
          <table style={tableStyle}>
            <thead><tr>{['状态', '对象', '差异', '建议动作', '时间'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {reconciliation.map((r) => (
                <tr key={r.id}>
                  <td style={cellStyle}><Badge tone={statusTone(r.status)}>{r.status}</Badge><div style={{ marginTop: 4 }}><Badge tone={statusTone(r.severity)}>{r.severity}</Badge></div></td>
                  <td style={cellStyle}>{r.subjectType}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.subjectName || r.subjectKey}</div></td>
                  <td style={cellStyle}>{r.diffSummary || '—'}</td>
                  <td style={cellStyle}>{r.actionRequired || '—'}</td>
                  <td style={cellStyle}>{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
              {reconciliation.length === 0 && <tr><td style={cellStyle} colSpan={5}>暂无对账差异流水。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'semantic' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div>
              <strong>财务字段语义提取器</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                从好业财只读镜像 raw_data 中寻找金额、日期、状态、科目、报表行等字段候选。字段未锁定时，财务卡片不得把 0 或列表合计当真实口径。
              </div>
            </div>
            <Badge tone={financeSemanticExtractors?.decision === 'GO' ? 'green' : financeSemanticExtractors?.decision === 'HOLD' ? 'red' : 'amber'}>
              {financeSemanticExtractors?.decision || '—'}
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>提取器总数</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeSemanticExtractors?.summary?.totalExtractors ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>下一 Gate: {financeSemanticExtractors?.summary?.nextGate || '—'}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>READY / PARTIAL</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeSemanticExtractors?.summary?.ready ?? 0}/{financeSemanticExtractors?.summary?.partial ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>可权威候选 {financeSemanticExtractors?.summary?.authorityEligible ?? 0}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>缺少 P0 必需字段</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeSemanticExtractors?.summary?.p0MissingRequiredFields ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>缺口必须进入整改清单</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>缺样本 / 待提取</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{(financeSemanticExtractors?.summary?.waitingSample ?? 0) + (financeSemanticExtractors?.summary?.needExtraction ?? 0)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>先重跑只读同步或补字段规则</div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 12, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>安全边界</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{financeSemanticExtractors?.guardrails?.rule || '只读扫描中间层，不写好业财，不覆盖 ERP 业务表。'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Badge tone="green">好业财写入: 否</Badge>
              <Badge tone="green">业务表覆盖: 否</Badge>
              <Badge tone="green">凭证推送: 否</Badge>
              <Badge tone="green">migration: 否</Badge>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: 1120 }}>
              <thead>
                <tr>{['口径', '状态', '样本', '字段锁定', '候选路径', '下一步'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(financeSemanticExtractors?.extractors || []).map((item) => (
                  <tr key={item.key}>
                    <td style={cellStyle}>
                      <strong>{item.label}</strong>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>{item.key}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 3 }}>{item.sourceEntityTypes.join(' / ') || '—'}</div>
                    </td>
                    <td style={cellStyle}>
                      <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      <div style={{ marginTop: 6 }}>
                        <Badge tone={item.authorityEligible ? 'green' : 'amber'}>{item.authorityEligible ? '可作权威值' : '不可作权威值'}</Badge>
                      </div>
                    </td>
                    <td style={cellStyle}>
                      样本 {item.sampleRows}
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{fmtDate(item.latestPulledAt)}</div>
                    </td>
                    <td style={cellStyle}>
                      <div>{item.extractedFields} / {item.requiredFields}</div>
                      <div style={{ color: item.missingRequiredFields.length ? 'var(--status-danger)' : 'var(--status-success)', fontSize: 12, marginTop: 4 }}>
                        缺: {item.missingRequiredFields.slice(0, 5).join(' / ') || '无'}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      {item.fieldCandidates.slice(0, 4).map((field) => (
                        <div key={field.semanticField} style={{ marginBottom: 8 }}>
                          <Badge tone={statusTone(field.status)}>{field.semanticField}</Badge>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 3 }}>
                            {field.candidatePaths.slice(0, 3).map((candidate) => `${candidate.path}=${candidate.sampleValue || '—'}`).join('；') || '无候选'}
                          </div>
                        </div>
                      ))}
                    </td>
                    <td style={cellStyle}>
                      {item.nextAction}
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>{item.reason}</div>
                    </td>
                  </tr>
                ))}
                {!financeSemanticExtractors?.extractors?.length && <tr><td style={cellStyle} colSpan={6}>暂无语义提取数据。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'readModel' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <strong>好业财财务只读 Read Model</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                只把语义提取器 READY 的指标纳入展示候选；未锁定字段继续阻止进入财务首页主卡片。
              </div>
            </div>
            <Badge tone={financeReadModel?.decision === 'GO' ? 'green' : financeReadModel?.decision === 'HOLD' ? 'red' : 'amber'}>
              {financeReadModel?.decision || '—'}
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>指标总数</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeReadModel?.summary?.totalMetrics ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>下一 Gate: {financeReadModel?.summary?.nextGate || '—'}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>权威 / 只读</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeReadModel?.summary?.authorityReady ?? 0}/{financeReadModel?.summary?.readonlyReady ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>权威值仍需显示 ERP 辅助差异</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>P0 阻断</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeReadModel?.summary?.p0Blocked ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>不得进入财务首页主值</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>人工复核 / 缺样本</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{(financeReadModel?.summary?.needManualReview ?? 0) + (financeReadModel?.summary?.waitingSample ?? 0)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>日期、状态或样本不足</div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 12, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>只读边界</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{financeReadModel?.guardrails?.rule || '只读 read model 不写好业财，不覆盖 ERP 业务表。'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Badge tone="green">好业财写入: 否</Badge>
              <Badge tone="green">ERP 业务表覆盖: 否</Badge>
              <Badge tone="green">凭证推送: 否</Badge>
              <Badge tone="green">migration: 否</Badge>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: 1180 }}>
              <thead>
                <tr>{['指标', '状态', '显示值', 'ERP 辅助', '字段证据', '原因 / 下一步'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(financeReadModel?.metrics || []).map((item) => (
                  <tr key={item.key}>
                    <td style={cellStyle}>
                      <strong>{item.label}</strong>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>{item.key} · {item.priority}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 3 }}>{item.sourceEntityTypes.join(' / ') || '—'}</div>
                    </td>
                    <td style={cellStyle}>
                      <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      <div style={{ marginTop: 6 }}>
                        <Badge tone={item.authorityEligible ? 'green' : 'amber'}>{item.authorityEligible ? '权威候选' : '阻止权威使用'}</Badge>
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <strong>{fmtMoney(item.displayValue)}</strong>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{item.valueSource}</div>
                    </td>
                    <td style={cellStyle}>
                      {fmtMoney(item.erpAuxiliaryValue)}
                      <div style={{ color: item.diff ? 'var(--status-warning)' : 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>差异 {fmtSignedMoney(item.diff)}</div>
                    </td>
                    <td style={cellStyle}>
                      <div>样本 {item.sampleRows} · {fmtDate(item.latestPulledAt)}</div>
                      <div style={{ color: item.missingRequiredFields.length ? 'var(--status-danger)' : 'var(--status-success)', fontSize: 12, marginTop: 5 }}>
                        缺: {item.missingRequiredFields.slice(0, 5).join(' / ') || '无'}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>
                        {item.selectedValueFields.slice(0, 3).map((field) => `${field.semanticField}: ${field.candidatePath}`).join('；') || '暂无金额字段候选'}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      {item.nextAction}
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>{item.reason}</div>
                    </td>
                  </tr>
                ))}
                {!financeReadModel?.metrics?.length && <tr><td style={cellStyle} colSpan={6}>暂无财务 read model 数据。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'statementReports' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <strong>科目余额 / 资产负债 / 利润表只读报表行</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                只展示好业财中间层行级证据；不写好业财，不推凭证，不把报表数静默覆盖到 ERP 财务卡片。
              </div>
            </div>
            <Badge tone={financeReadonlyReports?.decision === 'GO' ? 'green' : financeReadonlyReports?.decision === 'HOLD' ? 'red' : 'amber'}>
              {financeReadonlyReports?.decision || '—'}
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>只读报表</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeReadonlyReports?.summary?.readonlyReady ?? 0}/{financeReadonlyReports?.summary?.totalReports ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>下一 Gate: {financeReadonlyReports?.summary?.nextGate || '—'}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>行级证据</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeReadonlyReports?.summary?.totalRows ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>来自 chanjet_entity_snapshots</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>字段阻断</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{financeReadonlyReports?.summary?.blockedMapping ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>缺字段时不能喂主卡片</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>缺样本 / HOLD</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{(financeReadonlyReports?.summary?.waitingSample ?? 0) + (financeReadonlyReports?.summary?.hold ?? 0)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>继续只读同步补证据</div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 12, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>只读边界</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{financeReadonlyReports?.guardrails?.rule || '本页只读 ERP 好业财中间层，不写好业财，不覆盖 ERP 业务表。'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Badge tone="green">好业财写入: 否</Badge>
              <Badge tone="green">凭证推送: 否</Badge>
              <Badge tone="green">ERP 业务表覆盖: 否</Badge>
              <Badge tone="green">主卡片切换: 否</Badge>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {(financeReadonlyReports?.reports || []).map((report) => (
              <div key={report.reportKey} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <strong>{report.reportLabel}</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                      {report.reportKey} · {report.entityType} · 样本 {report.sampleRows} · 最近拉取 {fmtDate(report.latestPulledAt)}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>{report.displayRule}</div>
                  </div>
                  <Badge tone={statusTone(report.status)}>{report.status}</Badge>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: 12 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>金额字段候选</div>
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      {report.selectedValueFields.slice(0, 4).map((field) => `${field.semanticField}: ${field.candidatePath}`).join('；') || '暂无'}
                    </div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>缺失字段</div>
                    <div style={{ marginTop: 6, color: report.missingRequiredFields.length ? 'var(--status-danger)' : 'var(--status-success)', fontSize: 12 }}>
                      {report.missingRequiredFields.join(' / ') || '无'}
                    </div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>阻断原因</div>
                    <div style={{ marginTop: 6, color: report.blockerReasons.length ? 'var(--status-warning)' : 'var(--status-success)', fontSize: 12 }}>
                      {report.blockerReasons.join(' / ') || '无'}
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ ...tableStyle, minWidth: 1120 }}>
                    <thead>
                      <tr>{['行键', '名称', '账套 / 期间', '金额', '状态', '证据摘录'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {report.rows.slice(0, 25).map((row) => (
                        <tr key={row.rowId}>
                          <td style={cellStyle}>
                            <strong>{row.rowKey}</strong>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>#{row.rowId}</div>
                          </td>
                          <td style={cellStyle}>{row.rowName || '—'}</td>
                          <td style={cellStyle}>
                            <div>{row.bookId || '—'}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{row.period || '—'}</div>
                          </td>
                          <td style={cellStyle}>
                            <strong>{fmtMoney(row.amount)}</strong>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{row.currency || '—'}</div>
                          </td>
                          <td style={cellStyle}>
                            <Badge tone={statusTone(row.status)}>{row.status || '—'}</Badge>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{fmtDate(row.latestPulledAt)}</div>
                          </td>
                          <td style={{ ...cellStyle, maxWidth: 420 }}>
                            <code style={{ whiteSpace: 'normal', color: 'var(--text-secondary)', fontSize: 12 }}>
                              {JSON.stringify(row.rawEvidenceExcerpt)}
                            </code>
                          </td>
                        </tr>
                      ))}
                      {report.rows.length === 0 && <tr><td style={cellStyle} colSpan={6}>暂无只读报表行，请先执行好业财只读同步。</td></tr>}
                    </tbody>
                  </table>
                </div>
                {report.rows.length > 25 && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8 }}>仅展示最近 25 行；完整数据请走只读镜像审计。</div>
                )}
              </div>
            ))}
            {!financeReadonlyReports?.reports?.length && (
              <div style={{ ...cardStyle, color: 'var(--text-secondary)' }}>暂无科目/报表只读报告。</div>
            )}
          </div>
        </section>
      )}

      {tab === 'receiptPaymentLocks' && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <strong>今日收款 / 今日付款语义锁</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                先锁定业务日期、入账日期、审核状态、作废状态、收付方向和金额字段，再允许进入财务首页卡片权威值切换。
              </div>
            </div>
            <Badge tone={receiptPaymentLocks?.decision === 'GO' ? 'green' : receiptPaymentLocks?.decision === 'HOLD' ? 'red' : 'amber'}>
              {receiptPaymentLocks?.decision || '—'}
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>锁定对象</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{receiptPaymentLocks?.summary?.locked ?? 0}/{receiptPaymentLocks?.summary?.totalLocks ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>下一 Gate: {receiptPaymentLocks?.summary?.nextGate || '—'}</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>可财务复核</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{receiptPaymentLocks?.summary?.readyForFinanceReview ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>字段候选已完整才可复核</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>可切主卡权威</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{receiptPaymentLocks?.summary?.readyForCardAuthority ?? 0}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>本 Gate 仍不自动切换</div>
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>缺样本 / HOLD</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{(receiptPaymentLocks?.summary?.waitingSample ?? 0) + (receiptPaymentLocks?.summary?.hold ?? 0)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>缺关键维度不得参与今日卡片</div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 12, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>执行边界</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{receiptPaymentLocks?.guardrails?.rule || '本页只锁定收/付款字段语义，不写好业财，不覆盖 ERP 业务表，不切换财务首页权威卡片。'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Badge tone="green">好业财写入: 否</Badge>
              <Badge tone="green">ERP 业务表覆盖: 否</Badge>
              <Badge tone="green">今日卡片切换: 否</Badge>
              <Badge tone="green">migration: 否</Badge>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: 1220 }}>
              <thead>
                <tr>{['口径', '状态', '样本', '维度锁定', '规则', '字段候选 / 下一步'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(receiptPaymentLocks?.locks || []).map((item) => (
                  <tr key={item.key}>
                    <td style={cellStyle}>
                      <strong>{item.label}</strong>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>{item.key}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 3 }}>{item.entityType}</div>
                    </td>
                    <td style={cellStyle}>
                      <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      <div style={{ marginTop: 6 }}>
                        <Badge tone={item.readyForFinanceReview ? 'green' : 'amber'}>{item.readyForFinanceReview ? '可财务复核' : '等待字段补齐'}</Badge>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <Badge tone={item.readyForCardAuthority ? 'green' : 'amber'}>{item.readyForCardAuthority ? '可切权威' : '禁止切权威'}</Badge>
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <div>样本 {item.sampleRows}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>最近拉取: {fmtDate(item.latestPulledAt)}</div>
                    </td>
                    <td style={cellStyle}>
                      <div style={{ color: 'var(--status-success)', fontSize: 12 }}>已锁: {item.lockedDimensions.join(' / ') || '无'}</div>
                      <div style={{ color: item.missingDimensions.length ? 'var(--status-danger)' : 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>
                        缺失: {item.missingDimensions.join(' / ') || '无'}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 5 }}>必需: {item.requiredDimensions.join(' / ')}</div>
                    </td>
                    <td style={cellStyle}>
                      <div><strong>日期</strong>: {item.dateRule}</div>
                      <div style={{ marginTop: 4 }}><strong>状态</strong>: {item.statusRule}</div>
                      <div style={{ marginTop: 4 }}><strong>方向</strong>: {item.directionRule}</div>
                      <div style={{ marginTop: 4 }}><strong>金额</strong>: {item.amountRule}</div>
                    </td>
                    <td style={cellStyle}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {item.fieldCandidates
                          .filter((field) => field.candidatePaths.length > 0)
                          .slice(0, 6)
                          .map((field) => `${field.semanticField}: ${field.candidatePaths[0]?.path}`)
                          .join('；') || '暂无字段候选'}
                      </div>
                      <div style={{ marginTop: 8 }}>{item.nextAction}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>{item.reason}</div>
                    </td>
                  </tr>
                ))}
                {!receiptPaymentLocks?.locks?.length && <tr><td style={cellStyle} colSpan={6}>暂无收付款语义锁数据。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'drafts' && (
        <section style={cardStyle}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 16,
            alignItems: 'center',
            padding: '12px 14px',
            marginBottom: 16,
            borderLeft: `4px solid ${writebackPreparation?.decision === 'HOLD' ? 'var(--status-danger)' : 'var(--status-warning)'}`,
            background: 'var(--bg-muted)',
          }}>
            <div>
              <strong>{t('finance.chanjet.wave7_gate_title')}</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                {t('finance.chanjet.wave7_gate_description')}
              </div>
              {writebackPreparation?.blockers?.length ? (
                <div style={{ color: 'var(--status-danger)', fontSize: 12, marginTop: 6 }}>
                  {writebackPreparation.blockers.join('；')}
                </div>
              ) : null}
            </div>
            <div style={{ textAlign: 'right' }}>
              <Badge tone={writebackPreparation?.decision === 'HOLD' ? 'red' : 'amber'}>
                {writebackPreparation?.nextGate || 'CHANJET_WAVE_7_EXTERNAL_MINIMAL_WRITE_APPROVAL'}
              </Badge>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>
                {t('finance.chanjet.wave7_external_transport_disabled')}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <strong>创建凭证草稿</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>只写中间层，不推送好业财。</div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <input value={draftSourceType} onChange={e => setDraftSourceType(e.target.value)} placeholder="来源类型，如 PROCUREMENT_PAYMENT" style={{ padding: 9, border: '1px solid var(--border)', borderRadius: 6 }} />
              <input value={draftSourceId} onChange={e => setDraftSourceId(e.target.value)} placeholder="来源单号/ID" style={{ padding: 9, border: '1px solid var(--border)', borderRadius: 6 }} />
              <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="凭证摘要" style={{ padding: 9, border: '1px solid var(--border)', borderRadius: 6 }} />
              <textarea value={draftLines} onChange={e => setDraftLines(e.target.value)} rows={4} style={{ padding: 9, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-mono, monospace)' }} />
              {draftValidation && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 9, color: draftValidation.valid ? 'var(--status-success)' : 'var(--status-danger)', fontSize: 12 }}>
                  {t('finance.chanjet.debit')} {draftValidation.debitTotal} / {t('finance.chanjet.credit')} {draftValidation.creditTotal} · {draftValidation.valid ? t('finance.chanjet.validation_passed') : draftValidation.errors.join('；')}
                  {draftValidation.warnings.length > 0 && <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{draftValidation.warnings.join('；')}</div>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="outline" disabled={!canEdit || loading} onClick={() => runAction(t('finance.chanjet.voucher_validation'), async () => {
                  await validateDraft();
                  return { success: true };
                })}>{t('finance.chanjet.validate_debit_credit_balance')}</Button>
                <Button disabled={!canEdit || loading} onClick={createDraft}><FileText size={16} />保存草稿</Button>
              </div>
            </div>
          </div>
          <table style={tableStyle}>
            <thead><tr>{['草稿', '来源', '状态', '分录', '操作'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td style={cellStyle}>{d.title || `草稿 #${d.id}`}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDate(d.createdAt)}</div></td>
                  <td style={cellStyle}>{d.sourceBizType}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{d.sourceBizId}</div></td>
                  <td style={cellStyle}><Badge tone={statusTone(d.status)}>{d.status}</Badge><div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>push: {d.pushAllowed ? '待另行 Gate' : '禁用'}</div></td>
                  <td style={cellStyle}>{d.voucherLines?.length ?? 0} 行</td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {d.status === 'DRAFT' && <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => updateDraftStatus(d.id, 'VALIDATED')}>{t('finance.chanjet.validate_and_queue')}</Button>}
                      {d.status === 'VALIDATED' && <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => updateDraftStatus(d.id, 'REVIEWED')}>复核</Button>}
                      {d.status === 'REVIEWED' && <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => updateDraftStatus(d.id, 'APPROVED')}>批准</Button>}
                      {d.status === 'APPROVED' && <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => updateDraftStatus(d.id, 'PUSH_READY')}>{t('finance.chanjet.mark_writeback_candidate')}</Button>}
                      {d.status === 'PUSH_READY' && <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => prepareDraftOutbox(d.id)}>{t('finance.chanjet.generate_outbox')}</Button>}
                      {!['REJECTED', 'CANCELLED'].includes(d.status) && <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => updateDraftStatus(d.id, 'REJECTED')}>拒绝</Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {drafts.length === 0 && <tr><td style={cellStyle} colSpan={5}>暂无凭证草稿。</td></tr>}
            </tbody>
          </table>
          <div style={{ marginTop: 20, fontWeight: 700 }}>{t('finance.chanjet.outbox_heading')}</div>
          <table style={{ ...tableStyle, marginTop: 10 }}>
            <thead><tr>{['Outbox', t('finance.chanjet.draft'), t('finance.chanjet.status'), t('finance.chanjet.attempts'), t('finance.chanjet.external_write'), t('finance.chanjet.simulation_actions')].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {writebackOutbox.map((item) => (
                <tr key={item.id}>
                  <td style={cellStyle}>#{item.id}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{item.idempotencyKey.slice(0, 16)}…</div></td>
                  <td style={cellStyle}>#{item.draftId}</td>
                  <td style={cellStyle}><Badge tone={statusTone(item.state)}>{item.state}</Badge>{item.errorMessage && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{item.errorMessage}</div>}</td>
                  <td style={cellStyle}>{item.attemptCount}/{item.maxAttempts}</td>
                  <td style={cellStyle}><Badge tone="muted">{t('finance.chanjet.permanently_disabled')}</Badge></td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['READY', 'RETRYABLE'].includes(item.state) && <>
                        <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => simulateOutbox(item.id, 'ACKNOWLEDGED')}>{t('finance.chanjet.simulate_success')}</Button>
                        <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => simulateOutbox(item.id, 'RETRYABLE')}>{t('finance.chanjet.simulate_retry')}</Button>
                        <Button size="xs" variant="outline" disabled={!canEdit} onClick={() => simulateOutbox(item.id, 'FAILED')}>{t('finance.chanjet.simulate_failure')}</Button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
              {writebackOutbox.length === 0 && <tr><td style={cellStyle} colSpan={6}>暂无 Outbox。必须完成校验、复核、批准、候选四道内部 Gate 后才能生成。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'fields' && (
        <section style={cardStyle}>
          <strong>好业财 API 字段目录</strong>
          <table style={{ ...tableStyle, marginTop: 10 }}>
            <thead><tr>{['接口', '字段', '类型', '脱敏样本', '次数'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.id}>
                  <td style={cellStyle}>{f.apiDomain}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{f.method} {f.apiPath}</div></td>
                  <td style={cellStyle}>{f.fieldPath}</td>
                  <td style={cellStyle}><Badge tone="blue">{f.sampleType}</Badge></td>
                  <td style={cellStyle}>{f.sampleValueMasked || '—'}</td>
                  <td style={cellStyle}>{f.observedCount}</td>
                </tr>
              ))}
              {fields.length === 0 && <tr><td style={cellStyle} colSpan={5}>暂无字段样本。运行探针后生成。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'jobs' && (
        <section style={cardStyle}>
          <strong>同步 / 探针 / 对账作业审计</strong>
          <table style={{ ...tableStyle, marginTop: 10 }}>
            <thead><tr>{['类型', '状态', '账套/期间', '错误', '时间'].map(h => <th key={h} style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td style={cellStyle}>{j.jobType}</td>
                  <td style={cellStyle}><Badge tone={statusTone(j.status)}>{j.status}</Badge></td>
                  <td style={cellStyle}>{j.bookId || '—'}<div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{j.period || '—'}</div></td>
                  <td style={cellStyle}>{j.errorMessage || '—'}</td>
                  <td style={cellStyle}>{fmtDate(j.createdAt)}</td>
                </tr>
              ))}
              {jobs.length === 0 && <tr><td style={cellStyle} colSpan={5}>暂无作业。</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12, marginTop: 16 }}>
        <CheckCircle2 size={14} />
        当前页面不执行好业财写入、不执行生产外发；后续推送凭证必须另走独立 Gate。
      </div>
    </div>
  );
}
