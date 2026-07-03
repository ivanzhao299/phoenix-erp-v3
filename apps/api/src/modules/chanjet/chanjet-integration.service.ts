import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
