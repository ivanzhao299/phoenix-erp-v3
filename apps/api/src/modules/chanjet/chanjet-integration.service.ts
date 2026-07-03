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
  },
  {
    key: 'DEPARTMENT',
    label: '部门列表',
    apiDomain: 'master-data',
    method: 'GET',
    path: '/accounting/openapi/cc/department/list/{bookid}',
    requiresBook: true,
    mappingType: 'DEPARTMENT',
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
  },
  {
    key: 'SUBJECT',
    label: '科目列表',
    apiDomain: 'accounting',
    method: 'GET',
    path: '/accounting/openapi/cc/subject/list/{bookid}',
    requiresBook: true,
    mappingType: 'SUBJECT',
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
  },
  {
    key: 'PAYABLE_STATISTICS',
    label: '应付统计',
    apiDomain: 'ap',
    method: 'GET',
    path: '/accounting/gl/statistics/pay/{bookid}',
    query: { period: new Date().toISOString().slice(0, 7).replace('-', '') },
    requiresBook: true,
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
  ) {}

  listProbeEndpoints() {
    return PROBE_ENDPOINTS.map(({ key, label, apiDomain, method, path, requiresBook }) => ({
      key,
      label,
      apiDomain,
      method,
      path,
      requiresBook: !!requiresBook,
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
