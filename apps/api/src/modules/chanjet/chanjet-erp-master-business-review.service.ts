import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';

export const CHANJET_ERP_MASTER_APPLY_TOKEN = 'APPROVE_CHANJET_ERP_MASTER_MAPPING';
export const CHANJET_ERP_MASTER_REVIEW_ACTION = 'CHANJET_ERP_MAP_APPLY';

export type ChanjetErpMasterReviewDecision = 'MAP_EXISTING' | 'CREATE_MASTER' | 'HOLD';

type SourceMappingRow = {
  id: string;
  mapping_type: string;
  book_id: string;
  company_code: string;
  company_name: string;
  chanjet_id: string;
  chanjet_code: string;
  chanjet_name: string;
  raw_data: Record<string, unknown> | null;
};

type ExistingMaster = {
  code: string;
  name: string;
  companyCode: string;
  currencyCode?: string;
  accountType?: string;
  bankName?: string;
  accountNo?: string;
  targetTable: string;
  targetEntityType?: string;
};

export type ChanjetErpMasterReviewCandidate = {
  mappingId: string;
  mappingType: string;
  bookId: string;
  companyCode: string;
  companyName: string;
  chanjetId: string;
  chanjetCode: string;
  chanjetName: string;
  decision: ChanjetErpMasterReviewDecision;
  targetTable: string;
  targetCode: string;
  targetName: string;
  targetEntityType: string;
  evidence: string[];
  blockers: string[];
  createPayload: Record<string, unknown> | null;
};

export type ChanjetErpMasterBusinessReviewPlan = {
  generatedAt: string;
  reviewHash: string;
  decision: 'READY_TO_APPLY' | 'HOLD';
  summary: {
    total: number;
    actionable: number;
    mapExisting: number;
    createMaster: number;
    hold: number;
    byMappingType: Record<string, Record<ChanjetErpMasterReviewDecision, number>>;
  };
  candidates: ChanjetErpMasterReviewCandidate[];
  guardrails: {
    systemBusinessReview: true;
    exactCompanyBoundary: true;
    fuzzyMapping: false;
    chanjetWrite: false;
    financialBalanceImport: false;
    inventoryFactImport: false;
    ambiguousRowsHeld: true;
  };
};

const REVIEWED_MAPPING_TYPES = [
  'CASH_ACCOUNT',
  'PROJECT',
  'WAREHOUSE',
  'DEPARTMENT',
  'PRODUCT',
  'UOM',
];

function normalized(value: unknown): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_/（）()·.，,]/g, '');
}

function compactAccountNo(value: unknown): string {
  return String(value || '').replace(/[^0-9a-z]/gi, '').toUpperCase();
}

function safeCodePart(value: unknown, fallback: string): string {
  const safe = String(value || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return safe || fallback;
}

function companyAlias(companyCode: string): string {
  if (companyCode.endsWith('-AGRI')) return 'AGRI';
  if (companyCode.endsWith('-XINGCHI')) return 'XINGCHI';
  if (companyCode.endsWith('-FOOD')) return 'FOOD';
  return safeCodePart(companyCode, 'COMP').slice(-16);
}

function rawRecord(rawData: Record<string, unknown> | null): Record<string, unknown> {
  return rawData && typeof rawData === 'object' ? rawData : {};
}

function proposalGapClass(rawData: Record<string, unknown> | null): string {
  const proposal = rawRecord(rawData).erpMasterGapProposal;
  if (!proposal || typeof proposal !== 'object') return '';
  return String((proposal as Record<string, unknown>).gapClass || '');
}

function inferCashAccountType(name: string, rawData: Record<string, unknown>): string {
  if (/微信|支付宝/.test(name)) return 'VIRTUAL';
  if (/现金|备用金/.test(name)) return 'CASH';
  const accountNo = compactAccountNo(rawData.accountNo);
  const bankName = String(rawData.openingBank || '').trim();
  if (accountNo && accountNo !== '0' && bankName && bankName !== '--') return 'BANK';
  if (/银行|账户|LDB|BCEL/i.test(name) && bankName && bankName !== '--') return 'BANK';
  return '';
}

function inferWarehouseType(name: string): string {
  if (/冷库/.test(name)) return 'COLD_STORAGE';
  if (/粮仓/.test(name)) return 'RAW_MATERIAL';
  return 'GENERAL';
}

function reviewHash(candidates: ChanjetErpMasterReviewCandidate[]): string {
  const canonical = candidates
    .map((candidate) => ({
      mappingId: candidate.mappingId,
      mappingType: candidate.mappingType,
      bookId: candidate.bookId,
      chanjetId: candidate.chanjetId,
      companyCode: candidate.companyCode,
      decision: candidate.decision,
      targetTable: candidate.targetTable,
      targetCode: candidate.targetCode,
      createPayload: candidate.createPayload,
      blockers: candidate.blockers,
    }))
    .sort((left, right) => left.mappingId.localeCompare(right.mappingId));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function findExactMaster(
  source: SourceMappingRow,
  masters: ExistingMaster[],
  options: { currencyCode?: string; accountNo?: string } = {},
): { master?: ExistingMaster; ambiguous: boolean; evidence: string[] } {
  const sameCompany = masters.filter((master) => master.companyCode === source.company_code);
  const sourceName = normalized(source.chanjet_name);
  const sourceAccountNo = compactAccountNo(options.accountNo);
  const matches = sameCompany.filter((master) => {
    if (options.currencyCode && master.currencyCode !== options.currencyCode) return false;
    const targetAccountNo = compactAccountNo(master.accountNo);
    if (sourceAccountNo && targetAccountNo && sourceAccountNo === targetAccountNo) return true;
    return sourceName !== '' && normalized(master.name) === sourceName;
  });
  return {
    master: matches.length === 1 ? matches[0] : undefined,
    ambiguous: matches.length > 1,
    evidence: matches.length === 1
      ? [
          sourceAccountNo && compactAccountNo(matches[0].accountNo) === sourceAccountNo
            ? 'same company + currency + exact account number'
            : 'same company + exact normalized name',
        ]
      : [],
  };
}

function holdCandidate(source: SourceMappingRow, blockers: string[], evidence: string[] = []): ChanjetErpMasterReviewCandidate {
  return {
    mappingId: source.id,
    mappingType: source.mapping_type,
    bookId: source.book_id,
    companyCode: source.company_code,
    companyName: source.company_name,
    chanjetId: source.chanjet_id,
    chanjetCode: source.chanjet_code,
    chanjetName: source.chanjet_name,
    decision: 'HOLD',
    targetTable: '',
    targetCode: '',
    targetName: '',
    targetEntityType: '',
    evidence,
    blockers,
    createPayload: null,
  };
}

@Injectable()
export class ChanjetErpMasterBusinessReviewService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async plan(): Promise<ChanjetErpMasterBusinessReviewPlan> {
    const [
      sources,
      cashAccounts,
      projects,
      warehouses,
      companyOrganizations,
      stores,
      houses,
    ] = await Promise.all([
      this.loadSourceMappings(),
      this.loadCashAccounts(),
      this.loadProjects(),
      this.loadWarehouses(),
      this.loadCompanyOrganizations(),
      this.loadStores(),
      this.loadHouses(),
    ]);

    const genericWarehouseNamesByCompany = new Map<string, number>();
    for (const source of sources.filter((item) => item.mapping_type === 'WAREHOUSE')) {
      if (proposalGapClass(source.raw_data) !== 'WAREHOUSE_MASTER_CANDIDATE') continue;
      if (/^(总仓|总库)$/.test(source.chanjet_name.trim())) {
        genericWarehouseNamesByCompany.set(
          source.company_code,
          (genericWarehouseNamesByCompany.get(source.company_code) || 0) + 1,
        );
      }
    }

    const candidates = sources.map((source) => this.reviewSource(
      source,
      {
        cashAccounts,
        projects,
        warehouses,
        companyOrganizations,
        stores,
        houses,
        genericWarehouseNamesByCompany,
      },
    ));
    const byMappingType: Record<string, Record<ChanjetErpMasterReviewDecision, number>> = {};
    for (const candidate of candidates) {
      byMappingType[candidate.mappingType] ||= {
        MAP_EXISTING: 0,
        CREATE_MASTER: 0,
        HOLD: 0,
      };
      byMappingType[candidate.mappingType][candidate.decision] += 1;
    }
    const mapExisting = candidates.filter((item) => item.decision === 'MAP_EXISTING').length;
    const createMaster = candidates.filter((item) => item.decision === 'CREATE_MASTER').length;
    const hold = candidates.filter((item) => item.decision === 'HOLD').length;
    return {
      generatedAt: new Date().toISOString(),
      reviewHash: reviewHash(candidates),
      decision: mapExisting + createMaster > 0 ? 'READY_TO_APPLY' : 'HOLD',
      summary: {
        total: candidates.length,
        actionable: mapExisting + createMaster,
        mapExisting,
        createMaster,
        hold,
        byMappingType,
      },
      candidates,
      guardrails: {
        systemBusinessReview: true,
        exactCompanyBoundary: true,
        fuzzyMapping: false,
        chanjetWrite: false,
        financialBalanceImport: false,
        inventoryFactImport: false,
        ambiguousRowsHeld: true,
      },
    };
  }

  async apply(input: {
    reviewHash: string;
    approvalToken: string;
    actor: string;
  }) {
    if (input.approvalToken !== CHANJET_ERP_MASTER_APPLY_TOKEN) {
      throw new Error('CHANJET_ERP_MASTER_MAPPING_APPROVAL_TOKEN_INVALID');
    }
    const plan = await this.plan();
    if (!input.reviewHash || input.reviewHash !== plan.reviewHash) {
      throw new Error('CHANJET_ERP_MASTER_MAPPING_PLAN_STALE');
    }
    const actionable = plan.candidates.filter((candidate) => candidate.decision !== 'HOLD');
    if (!actionable.length) {
      return {
        appliedAt: new Date().toISOString(),
        reviewHash: plan.reviewHash,
        created: 0,
        mappedExisting: 0,
        skipped: 0,
        hold: plan.summary.hold,
        results: [],
        writeChanjet: false,
        financialBalanceImport: false,
        inventoryFactImport: false,
      };
    }

    const runner = this.ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const results: Array<Record<string, unknown>> = [];
      let created = 0;
      let mappedExisting = 0;
      let skipped = 0;
      for (const candidate of actionable) {
        const result = await this.applyCandidate(runner, candidate, input.actor);
        results.push(result);
        if (result.status === 'CREATED') created += 1;
        else if (result.status === 'MAPPED_EXISTING') mappedExisting += 1;
        else skipped += 1;
      }
      await this.writeAudit(runner, input.actor, plan, {
        created,
        mappedExisting,
        skipped,
      });
      await runner.commitTransaction();
      return {
        appliedAt: new Date().toISOString(),
        reviewHash: plan.reviewHash,
        created,
        mappedExisting,
        skipped,
        hold: plan.summary.hold,
        results,
        writeChanjet: false,
        financialBalanceImport: false,
        inventoryFactImport: false,
      };
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  private async loadSourceMappings(): Promise<SourceMappingRow[]> {
    return this.ds.query(
      `SELECT m.id::text,
              m.mapping_type,
              m.book_id,
              b.company_code,
              b.company_name,
              m.chanjet_id,
              m.chanjet_code,
              m.chanjet_name,
              m.raw_data
         FROM chanjet_master_mapping m
         JOIN chanjet_book_company_map b
           ON b.bookid = m.book_id
          AND b.sync_enabled = TRUE
        WHERE m.mapping_type = ANY($1::varchar[])
          AND m.match_status = 'SOURCE_ONLY'
          AND m.review_status = 'APPROVED'
        ORDER BY m.mapping_type, m.book_id, m.chanjet_id`,
      [REVIEWED_MAPPING_TYPES],
    );
  }

  private async loadCashAccounts(): Promise<ExistingMaster[]> {
    const rows = await this.ds.query(
      `SELECT account_code AS code,
              account_name AS name,
              company_code AS "companyCode",
              currency_code AS "currencyCode",
              account_type AS "accountType",
              COALESCE(bank_name, '') AS "bankName",
              COALESCE(bank_account_no, '') AS "accountNo"
         FROM fin_cash_accounts
        WHERE status <> 'CLOSED'`,
    );
    return rows.map((row: ExistingMaster) => ({ ...row, targetTable: 'fin_cash_accounts' }));
  }

  private async loadProjects(): Promise<ExistingMaster[]> {
    const rows = await this.ds.query(
      `SELECT project_code AS code,
              project_name AS name,
              company_code AS "companyCode"
         FROM biz_projects
        WHERE deleted_at IS NULL`,
    );
    return rows.map((row: ExistingMaster) => ({ ...row, targetTable: 'biz_projects' }));
  }

  private async loadWarehouses(): Promise<ExistingMaster[]> {
    const rows = await this.ds.query(
      `SELECT warehouse_code AS code,
              COALESCE(warehouse_name_zh, warehouse_name, '') AS name,
              COALESCE(company_code, '') AS "companyCode"
         FROM wms_warehouses
        WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'`,
    );
    return rows.map((row: ExistingMaster) => ({ ...row, targetTable: 'wms_warehouses' }));
  }

  private async loadCompanyOrganizations(): Promise<ExistingMaster[]> {
    const rows = await this.ds.query(
      `SELECT org_code AS code,
              org_name AS name,
              company_code AS "companyCode"
         FROM sys_organizations
        WHERE status = 'ACTIVE'
          AND company_code <> ''
          AND org_code = company_code`,
    );
    return rows.map((row: ExistingMaster) => ({
      ...row,
      targetTable: 'sys_organizations',
      targetEntityType: 'COMPANY',
    }));
  }

  private async loadStores(): Promise<ExistingMaster[]> {
    const rows = await this.ds.query(
      `SELECT store_code AS code,
              store_name AS name,
              company_code AS "companyCode"
         FROM mst_stores
        WHERE status = 'ACTIVE'`,
    );
    return rows.map((row: ExistingMaster) => ({
      ...row,
      targetTable: 'mst_stores',
      targetEntityType: 'STORE',
    }));
  }

  private async loadHouses(): Promise<ExistingMaster[]> {
    const rows = await this.ds.query(
      `SELECT house_code AS code,
              house_name AS name,
              company_code AS "companyCode"
         FROM brd_houses
        WHERE status = 'ACTIVE'
          AND company_code <> ''`,
    );
    return rows.map((row: ExistingMaster) => ({
      ...row,
      targetTable: 'brd_houses',
      targetEntityType: 'HOUSE',
    }));
  }

  private reviewSource(
    source: SourceMappingRow,
    context: {
      cashAccounts: ExistingMaster[];
      projects: ExistingMaster[];
      warehouses: ExistingMaster[];
      companyOrganizations: ExistingMaster[];
      stores: ExistingMaster[];
      houses: ExistingMaster[];
      genericWarehouseNamesByCompany: Map<string, number>;
    },
  ): ChanjetErpMasterReviewCandidate {
    if (!source.company_code || !source.chanjet_id || !source.chanjet_name.trim()) {
      return holdCandidate(source, ['SOURCE_IDENTITY_OR_COMPANY_INCOMPLETE']);
    }
    if (source.mapping_type === 'CASH_ACCOUNT') {
      return this.reviewCashAccount(source, context.cashAccounts);
    }
    if (source.mapping_type === 'PROJECT') {
      return this.reviewProject(source, context.projects);
    }
    if (source.mapping_type === 'WAREHOUSE') {
      return this.reviewWarehouse(
        source,
        context.warehouses,
        context.genericWarehouseNamesByCompany,
      );
    }
    if (source.mapping_type === 'DEPARTMENT') {
      return this.reviewDepartment(source, context);
    }
    if (source.mapping_type === 'PRODUCT') {
      return holdCandidate(source, [
        proposalGapClass(source.raw_data) || 'PRODUCT_DOMAIN_CLASSIFICATION_REQUIRED',
        'PRODUCT_GRADE_SPEC_UOM_EVIDENCE_INCOMPLETE',
      ]);
    }
    if (source.mapping_type === 'UOM') {
      return holdCandidate(source, [
        proposalGapClass(source.raw_data) || 'UOM_POLICY_REQUIRED',
        'CONVERSION_FACTOR_AND_CONTEXT_REQUIRED',
      ]);
    }
    return holdCandidate(source, ['UNSUPPORTED_MAPPING_TYPE']);
  }

  private reviewDepartment(
    source: SourceMappingRow,
    context: {
      companyOrganizations: ExistingMaster[];
      stores: ExistingMaster[];
      houses: ExistingMaster[];
    },
  ): ChanjetErpMasterReviewCandidate {
    const name = source.chanjet_name.trim();
    if (/^(总部|总\s*部|公司总部|总公司)$/.test(name)) {
      const targets = context.companyOrganizations.filter(
        (master) => master.companyCode === source.company_code,
      );
      if (targets.length !== 1) {
        return holdCandidate(source, [
          targets.length > 1
            ? 'MULTIPLE_ERP_COMPANY_ORGANIZATION_TARGETS'
            : 'ERP_COMPANY_ORGANIZATION_TARGET_MISSING',
        ]);
      }
      return this.departmentMappingCandidate(source, targets[0], [
        'source department is a deterministic headquarters/company alias',
        'one enabled company organization exists inside the account-book company boundary',
      ]);
    }

    if (/直营店$|合作店$/.test(name)) {
      const exact = findExactMaster(source, context.stores);
      if (exact.ambiguous) return holdCandidate(source, ['MULTIPLE_ERP_STORE_TARGETS']);
      if (exact.master) {
        return this.departmentMappingCandidate(source, exact.master, [
          ...exact.evidence,
          'source department has store semantics',
        ]);
      }
      return holdCandidate(source, [
        'ERP_STORE_EXACT_IDENTITY_MISSING',
        'STORE_ALIAS_OR_BUSINESS_TYPE_REQUIRES_EXPLICIT_POLICY',
      ]);
    }

    if (/^(?:\d+号鸡舍|公鸡舍|育雏舍?)$/.test(name)) {
      const exact = findExactMaster(source, context.houses);
      if (exact.ambiguous) return holdCandidate(source, ['MULTIPLE_ERP_HOUSE_TARGETS']);
      if (exact.master) {
        return this.departmentMappingCandidate(source, exact.master, [
          ...exact.evidence,
          'source department has breeding-house semantics',
        ]);
      }
      return holdCandidate(source, [
        'ERP_HOUSE_EXACT_IDENTITY_MISSING',
        'HOUSE_MASTER_AND_SITE_OWNERSHIP_REQUIRED',
      ]);
    }

    if (/车间$/.test(name)) {
      return holdCandidate(source, [
        'WORKSHOP_OPERATIONAL_ENTITY_REQUIRES_SITE_AND_PROCESS_OWNERSHIP',
      ]);
    }
    if (/^(鸡舍|直营店)$/.test(name)) {
      return holdCandidate(source, [
        'ACCOUNTING_DIMENSION_GROUP_NODE_MUST_NOT_MAP_TO_TRANSACTIONAL_MASTER',
      ]);
    }
    return holdCandidate(source, [
      'ACCOUNTING_ONLY_DEPARTMENT_DIMENSION',
      'NO_SAFE_ERP_TRANSACTIONAL_MASTER_TARGET',
    ]);
  }

  private departmentMappingCandidate(
    source: SourceMappingRow,
    master: ExistingMaster,
    evidence: string[],
  ): ChanjetErpMasterReviewCandidate {
    return {
      ...holdCandidate(source, [], [
        ...evidence,
        'same account-book company boundary',
        'existing active ERP master only; no master or business fact created',
      ]),
      decision: 'MAP_EXISTING',
      targetTable: master.targetTable,
      targetCode: master.code,
      targetName: master.name,
      targetEntityType: master.targetEntityType || '',
    };
  }

  private reviewCashAccount(
    source: SourceMappingRow,
    masters: ExistingMaster[],
  ): ChanjetErpMasterReviewCandidate {
    const raw = rawRecord(source.raw_data);
    const currencyCode = String(raw.currencyCode || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      return holdCandidate(source, ['CURRENCY_CODE_INVALID_OR_MISSING']);
    }
    const exact = findExactMaster(source, masters, {
      currencyCode,
      accountNo: String(raw.accountNo || ''),
    });
    if (exact.ambiguous) {
      return holdCandidate(source, ['MULTIPLE_ERP_CASH_ACCOUNT_CANDIDATES']);
    }
    if (exact.master) {
      return {
        ...holdCandidate(source, [], exact.evidence),
        decision: 'MAP_EXISTING',
        targetTable: exact.master.targetTable,
        targetCode: exact.master.code,
        targetName: exact.master.name,
        evidence: [
          ...exact.evidence,
          'same account-book company boundary',
          'same currency',
        ],
      };
    }
    const accountType = inferCashAccountType(source.chanjet_name, raw);
    if (!accountType) {
      return holdCandidate(source, [
        'CASH_ACCOUNT_TYPE_NOT_DETERMINISTIC',
        /银行转账/.test(source.chanjet_name)
          ? 'PAYMENT_METHOD_IS_NOT_A_CASH_ACCOUNT'
          : 'BANK_OR_WALLET_IDENTITY_EVIDENCE_INCOMPLETE',
      ]);
    }
    const code = `CJ-CA-${companyAlias(source.company_code)}-${safeCodePart(
      source.chanjet_code,
      source.chanjet_id.slice(-8),
    )}`.slice(0, 60);
    const bankName = accountType === 'BANK'
      ? String(raw.openingBank || '').trim().replace(/^--$/, '') || null
      : null;
    const rawAccountNo = accountType === 'BANK' ? String(raw.accountNo || '').trim() : '';
    const bankAccountNo = rawAccountNo && compactAccountNo(rawAccountNo) !== '0'
      ? rawAccountNo
      : null;
    return {
      ...holdCandidate(source, [], [
        'enabled one-to-one account-book company mapping',
        `source currency ${currencyCode}`,
        `deterministic account type ${accountType}`,
        'master identity only; opening/current balance forced to zero',
      ]),
      decision: 'CREATE_MASTER',
      targetTable: 'fin_cash_accounts',
      targetCode: code,
      targetName: source.chanjet_name.trim(),
      createPayload: {
        accountCode: code,
        accountName: source.chanjet_name.trim(),
        companyCode: source.company_code,
        companyName: source.company_name,
        currencyCode,
        accountType,
        openingBalance: 0,
        currentBalance: 0,
        bankName,
        bankAccountNo,
      },
    };
  }

  private reviewProject(
    source: SourceMappingRow,
    masters: ExistingMaster[],
  ): ChanjetErpMasterReviewCandidate {
    const exact = findExactMaster(source, masters);
    if (exact.ambiguous) return holdCandidate(source, ['MULTIPLE_ERP_PROJECT_CANDIDATES']);
    if (exact.master) {
      return {
        ...holdCandidate(source, [], [...exact.evidence, 'same account-book company boundary']),
        decision: 'MAP_EXISTING',
        targetTable: exact.master.targetTable,
        targetCode: exact.master.code,
        targetName: exact.master.name,
      };
    }
    const raw = rawRecord(source.raw_data);
    const bizType = raw.bizType && typeof raw.bizType === 'object'
      ? String((raw.bizType as Record<string, unknown>).name || '')
      : '';
    const status = raw.statusEnum && typeof raw.statusEnum === 'object'
      ? String((raw.statusEnum as Record<string, unknown>).value || '')
      : '';
    if (bizType !== '项目' || status !== 'A') {
      return holdCandidate(source, ['SOURCE_PROJECT_NOT_ACTIVE_OR_NOT_PROJECT_TYPE']);
    }
    const code = `CJ-PRJ-${companyAlias(source.company_code)}-${safeCodePart(
      source.chanjet_code,
      source.chanjet_id.slice(-8),
    )}`.slice(0, 80);
    return {
      ...holdCandidate(source, [], [
        'source business type is project',
        'source status is enabled',
        'enabled one-to-one account-book company mapping',
        'project master only; no budget or accounting facts imported',
      ]),
      decision: 'CREATE_MASTER',
      targetTable: 'biz_projects',
      targetCode: code,
      targetName: source.chanjet_name.trim(),
      createPayload: {
        projectCode: code,
        projectName: source.chanjet_name.trim(),
        projectType: 'OPERATION',
        companyCode: source.company_code,
        status: 'ACTIVE',
      },
    };
  }

  private reviewWarehouse(
    source: SourceMappingRow,
    masters: ExistingMaster[],
    genericWarehouseNamesByCompany: Map<string, number>,
  ): ChanjetErpMasterReviewCandidate {
    const gapClass = proposalGapClass(source.raw_data);
    if (gapClass !== 'WAREHOUSE_MASTER_CANDIDATE') {
      return holdCandidate(source, [
        gapClass || 'WAREHOUSE_DOMAIN_CLASSIFICATION_REQUIRED',
        'NON_WAREHOUSE_IDENTITY_MUST_NOT_CREATE_WMS_WAREHOUSE',
      ]);
    }
    const exact = findExactMaster(source, masters);
    if (exact.ambiguous) return holdCandidate(source, ['MULTIPLE_ERP_WAREHOUSE_CANDIDATES']);
    if (exact.master) {
      return {
        ...holdCandidate(source, [], [...exact.evidence, 'same account-book company boundary']),
        decision: 'MAP_EXISTING',
        targetTable: exact.master.targetTable,
        targetCode: exact.master.code,
        targetName: exact.master.name,
        targetEntityType: 'WAREHOUSE',
      };
    }
    const name = source.chanjet_name.trim();
    if (/鸡舍|育雏|车间/.test(name)) {
      return holdCandidate(source, ['NON_WAREHOUSE_OPERATIONAL_ENTITY']);
    }
    if (/^(总仓|总库)$/.test(name) && (genericWarehouseNamesByCompany.get(source.company_code) || 0) > 1) {
      return holdCandidate(source, [
        'MULTIPLE_GENERIC_WAREHOUSE_IDENTITIES_IN_SAME_COMPANY',
        'WAREHOUSE_PURPOSE_OR_LOCATION_REQUIRED',
      ]);
    }
    if (!/仓|库/.test(name)) {
      return holdCandidate(source, ['WAREHOUSE_SEMANTICS_NOT_PROVEN']);
    }
    const warehouseType = inferWarehouseType(name);
    const code = `CJ-WH-${companyAlias(source.company_code)}-${safeCodePart(
      source.chanjet_code,
      source.chanjet_id.slice(-8),
    )}`.slice(0, 50);
    return {
      ...holdCandidate(source, [], [
        'source classified as WAREHOUSE_MASTER_CANDIDATE',
        'source name has warehouse semantics',
        'enabled one-to-one account-book company mapping',
        `deterministic warehouse type ${warehouseType}`,
      ]),
      decision: 'CREATE_MASTER',
      targetTable: 'wms_warehouses',
      targetCode: code,
      targetName: name,
      targetEntityType: 'WAREHOUSE',
      createPayload: {
        warehouseCode: code,
        warehouseName: name,
        warehouseType,
        companyCode: source.company_code,
        status: 'ACTIVE',
      },
    };
  }

  private async applyCandidate(
    runner: QueryRunner,
    candidate: ChanjetErpMasterReviewCandidate,
    actor: string,
  ): Promise<Record<string, unknown>> {
    const rows = await runner.query(
      `SELECT id::text, match_status, review_status
         FROM chanjet_master_mapping
        WHERE id = $1
        FOR UPDATE`,
      [candidate.mappingId],
    );
    if (!rows.length) throw new Error(`mapping ${candidate.mappingId} no longer exists`);
    if (rows[0].match_status !== 'SOURCE_ONLY' || rows[0].review_status !== 'APPROVED') {
      return {
        mappingId: candidate.mappingId,
        status: 'SKIPPED_ALREADY_RESOLVED',
        targetCode: candidate.targetCode,
      };
    }

    let status = 'MAPPED_EXISTING';
    if (candidate.decision === 'CREATE_MASTER') {
      await this.createMaster(runner, candidate, actor);
      status = 'CREATED';
    }
    await this.assertTarget(runner, candidate);
    const reviewEvidence = {
      decision: candidate.decision,
      targetTable: candidate.targetTable,
      targetCode: candidate.targetCode,
      targetName: candidate.targetName,
      evidence: candidate.evidence,
      blockers: [],
      reviewedBy: actor,
      reviewedAt: new Date().toISOString(),
      writeChanjet: false,
      financialBalanceImport: false,
      inventoryFactImport: false,
    };
    await runner.query(
      `UPDATE chanjet_master_mapping
          SET erp_code = $2,
              erp_name = $3,
              erp_entity_type = $4,
              match_status = 'MANUAL',
              confidence = 100,
              review_status = 'APPROVED',
              reviewed_by = $5,
              reviewed_at = NOW(),
              raw_data = COALESCE(raw_data, '{}'::jsonb)
                || jsonb_build_object('businessReview', $6::jsonb),
              updated_at = NOW()
        WHERE id = $1`,
      [
        candidate.mappingId,
        candidate.targetCode,
        candidate.targetName,
        candidate.targetEntityType,
        actor,
        JSON.stringify(reviewEvidence),
      ],
    );
    return {
      mappingId: candidate.mappingId,
      mappingType: candidate.mappingType,
      status,
      targetTable: candidate.targetTable,
      targetCode: candidate.targetCode,
      targetName: candidate.targetName,
    };
  }

  private async createMaster(
    runner: QueryRunner,
    candidate: ChanjetErpMasterReviewCandidate,
    actor: string,
  ): Promise<void> {
    const payload = candidate.createPayload || {};
    const remark = `好业财只读主档映射 ${candidate.bookId}:${candidate.chanjetCode}; system business review; no balance/fact import`;
    if (candidate.targetTable === 'fin_cash_accounts') {
      await runner.query(
        `INSERT INTO fin_cash_accounts
          (account_code, account_name, company_code, company_name, currency_code,
           account_type, opening_balance, current_balance, bank_name,
           bank_account_no, status, remark, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,0,0,$7,$8,'ACTIVE',$9,$10,$10)
         ON CONFLICT (account_code) DO NOTHING`,
        [
          payload.accountCode,
          payload.accountName,
          payload.companyCode,
          payload.companyName,
          payload.currencyCode,
          payload.accountType,
          payload.bankName,
          payload.bankAccountNo,
          remark,
          actor,
        ],
      );
      return;
    }
    if (candidate.targetTable === 'biz_projects') {
      await runner.query(
        `INSERT INTO biz_projects
          (project_code, project_name, project_type, company_code, status,
           sort_order, remark, created_by)
         VALUES ($1,$2,$3,$4,'ACTIVE',0,$5,$6)
         ON CONFLICT (project_code) WHERE deleted_at IS NULL DO NOTHING`,
        [
          payload.projectCode,
          payload.projectName,
          payload.projectType,
          payload.companyCode,
          remark,
          actor,
        ],
      );
      return;
    }
    if (candidate.targetTable === 'wms_warehouses') {
      await runner.query(
        `INSERT INTO wms_warehouses
          (warehouse_code, warehouse_name, warehouse_name_zh, type,
           status, company_code, remark)
         VALUES ($1,$2,$2,$3,'ACTIVE',$4,$5)
         ON CONFLICT (warehouse_code) DO NOTHING`,
        [
          payload.warehouseCode,
          payload.warehouseName,
          payload.warehouseType,
          payload.companyCode,
          remark,
        ],
      );
      return;
    }
    throw new Error(`target table ${candidate.targetTable} is not approved for automatic creation`);
  }

  private async assertTarget(
    runner: QueryRunner,
    candidate: ChanjetErpMasterReviewCandidate,
  ): Promise<void> {
    const contracts: Record<string, string> = {
      fin_cash_accounts:
        `SELECT account_code AS code, account_name AS name, company_code AS company
           FROM fin_cash_accounts WHERE account_code = $1`,
      biz_projects:
        `SELECT project_code AS code, project_name AS name, company_code AS company
           FROM biz_projects WHERE project_code = $1 AND deleted_at IS NULL`,
      wms_warehouses:
        `SELECT warehouse_code AS code,
                COALESCE(warehouse_name_zh, warehouse_name) AS name,
                company_code AS company
           FROM wms_warehouses WHERE warehouse_code = $1`,
      sys_organizations:
        `SELECT org_code AS code, org_name AS name, company_code AS company
           FROM sys_organizations
          WHERE org_code = $1 AND status = 'ACTIVE'`,
      mst_stores:
        `SELECT store_code AS code, store_name AS name, company_code AS company
           FROM mst_stores
          WHERE store_code = $1 AND status = 'ACTIVE'`,
      brd_houses:
        `SELECT house_code AS code, house_name AS name, company_code AS company
           FROM brd_houses
          WHERE house_code = $1 AND status = 'ACTIVE'`,
    };
    const sql = contracts[candidate.targetTable];
    if (!sql) throw new Error(`unsupported target table ${candidate.targetTable}`);
    const rows = await runner.query(sql, [candidate.targetCode]);
    if (
      rows.length !== 1
      || rows[0].company !== candidate.companyCode
      || normalized(rows[0].name) !== normalized(candidate.targetName)
    ) {
      throw new Error(
        `target verification failed for ${candidate.targetTable}:${candidate.targetCode}`,
      );
    }
  }

  private async writeAudit(
    runner: QueryRunner,
    actor: string,
    plan: ChanjetErpMasterBusinessReviewPlan,
    result: { created: number; mappedExisting: number; skipped: number },
  ): Promise<void> {
    await runner.query(
      `INSERT INTO sys_operation_logs
        (username, module_code, action_code, biz_type, biz_no,
         after_data, result_status)
       VALUES ($1,'MENU_SETTINGS_CHANJET',$2,
               'CHANJET',$3,$4::jsonb,'SUCCESS')`,
      [
        actor,
        CHANJET_ERP_MASTER_REVIEW_ACTION,
        plan.reviewHash.slice(0, 80),
        JSON.stringify({
          reviewHash: plan.reviewHash,
          summary: plan.summary,
          result,
          writeChanjet: false,
          financialBalanceImport: false,
          inventoryFactImport: false,
        }),
      ],
    );
  }
}
