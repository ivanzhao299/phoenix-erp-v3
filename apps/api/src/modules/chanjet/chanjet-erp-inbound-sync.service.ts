import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { ChanjetBookCompanyMapEntity } from './chanjet-book-company-map.entity';
import { ChanjetEntitySnapshotEntity } from './chanjet-entity-snapshot.entity';
import { ChanjetErpInboundSyncRunEntity } from './chanjet-erp-inbound-sync-run.entity';
import { ChanjetMasterMappingEntity } from './chanjet-master-mapping.entity';
import { ChanjetShareholderAccountingBalanceEntity } from './chanjet-shareholder-accounting-balance.entity';
import { matchChanjetShareholderName, ShareholderMatch } from './chanjet-shareholder-inbound-matcher';
import {
  endingBaseAmount, isPaidInCapitalSubject, roundMoney, shareholderSubjectCode,
  shareholderSubjectName,
} from '../shareholder/services/shareholder-accounting-reconciliation';

type ErpShareholderRow = {
  company_code: string;
  shareholder_code: string;
  shareholder_name: string;
  paid_in_amount: string;
};

export type ChanjetShareholderInboundPlanRow = {
  companyCode: string;
  bookId: string;
  period: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  currency: string;
  amountBase: number;
  shareholderCode: string;
  shareholderName: string;
  mappingStatus: 'APPROVED' | 'EXACT' | 'ALIAS' | 'SOURCE_ONLY' | 'CONFLICT';
  confidence: number;
  reason: string;
  sourceSnapshotId: string;
  sourceHash: string;
  sourceUpdatedAt: string;
};

export type ChanjetShareholderInboundPlan = {
  syncType: 'SHAREHOLDER_ACCOUNTING_BALANCE';
  decision: 'READY' | 'READY_WITH_CONDITIONS' | 'HOLD';
  period: string;
  planHash: string;
  sourceFreshnessHours: number;
  counts: { source: number; mapped: number; sourceOnly: number; conflicts: number };
  totals: { source: number; mapped: number; sourceOnly: number };
  companies: Array<{
    companyCode: string;
    bookId: string;
    period: string;
    parent4001Amount: number | null;
    childAmount: number;
    childParentDifference: number | null;
    parentReconciliation: 'MATCHED' | 'LEAF_ONLY' | 'LEAF_ONLY_PLACEHOLDER';
    mappedAmount: number;
    sourceOnlyAmount: number;
    blockers: string[];
    conditions: string[];
  }>;
  rows: ChanjetShareholderInboundPlanRow[];
  blockers: string[];
  conditions: string[];
  guardrails: {
    chanjetWrite: false;
    legalEquityOverwrite: false;
    erpAccountingMirrorWrite: true;
    conflictPolicy: 'HOLD';
  };
  generatedAt: string;
};

export function reconcile4001Parent(parentAmounts: number[], childAmount: number) {
  if (parentAmounts.length === 0) {
    return {
      parent4001Amount: null,
      childParentDifference: null,
      parentReconciliation: 'LEAF_ONLY' as const,
      blocker: '',
      condition: '好业财源快照仅返回4001叶子科目；父科目汇总不可用，以叶子明细合计作为本批次会计事实',
    };
  }
  if (parentAmounts.length > 1) {
    return {
      parent4001Amount: null,
      childParentDifference: null,
      parentReconciliation: 'LEAF_ONLY' as const,
      blocker: `4001父科目行数量异常: ${parentAmounts.length}`,
      condition: '',
    };
  }
  const parent4001Amount = roundMoney(parentAmounts[0]);
  if (parent4001Amount === 0 && Math.abs(childAmount) > 0.01) {
    return {
      parent4001Amount,
      childParentDifference: null,
      parentReconciliation: 'LEAF_ONLY_PLACEHOLDER' as const,
      blocker: '',
      condition: '好业财4001父科目为零值结构占位；以4001叶子科目明细合计作为本批次会计事实',
    };
  }
  const childParentDifference = roundMoney(childAmount - parent4001Amount);
  return {
    parent4001Amount,
    childParentDifference,
    parentReconciliation: 'MATCHED' as const,
    blocker: Math.abs(childParentDifference) > 0.01
      ? `4001父子科目合计差异 ${childParentDifference}`
      : '',
    condition: '',
  };
}

@Injectable()
export class ChanjetErpInboundSyncService {
  private readonly log = new Logger(ChanjetErpInboundSyncService.name);

  constructor(
    private readonly ds: DataSource,
    @InjectRepository(ChanjetBookCompanyMapEntity)
    private readonly bookMapRepo: Repository<ChanjetBookCompanyMapEntity>,
    @InjectRepository(ChanjetEntitySnapshotEntity)
    private readonly snapshotRepo: Repository<ChanjetEntitySnapshotEntity>,
    @InjectRepository(ChanjetMasterMappingEntity)
    private readonly mappingRepo: Repository<ChanjetMasterMappingEntity>,
    @InjectRepository(ChanjetShareholderAccountingBalanceEntity)
    private readonly balanceRepo: Repository<ChanjetShareholderAccountingBalanceEntity>,
    @InjectRepository(ChanjetErpInboundSyncRunEntity)
    private readonly runRepo: Repository<ChanjetErpInboundSyncRunEntity>,
  ) {}

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async erpShareholders(): Promise<ErpShareholderRow[]> {
    return this.ds.query(`
      SELECT p.company_code, s.shareholder_code, s.shareholder_name,
             SUM(COALESCE(e.paid_in_capital, 0))::numeric AS paid_in_amount
        FROM shr_project_equity e
        JOIN shr_projects p ON p.project_code = e.project_code
        JOIN shr_shareholders s ON s.shareholder_code = e.shareholder_code
       WHERE COALESCE(p.company_code, '') <> ''
       GROUP BY p.company_code, s.shareholder_code, s.shareholder_name
       ORDER BY p.company_code, s.shareholder_code
    `);
  }

  private matchApproved(
    approved: ChanjetMasterMappingEntity[],
    candidates: ErpShareholderRow[],
  ): ShareholderMatch | null {
    if (approved.length === 0) return null;
    if (approved.length > 1) {
      return { status: 'CONFLICT', confidence: 0, shareholderCode: '', shareholderName: '', reason: '同一好业财科目存在多个已批准 ERP 股东映射' };
    }
    const mapped = candidates.find((candidate) => candidate.shareholder_code === approved[0].erpCode);
    if (!mapped) {
      return { status: 'CONFLICT', confidence: 0, shareholderCode: '', shareholderName: '', reason: '已批准映射指向当前公司不存在的 ERP 股东' };
    }
    return {
      status: 'EXACT', confidence: 100,
      shareholderCode: mapped.shareholder_code,
      shareholderName: mapped.shareholder_name,
      reason: '沿用已批准的股东科目映射',
    };
  }

  async buildShareholderPlan(requestedPeriod?: string): Promise<ChanjetShareholderInboundPlan> {
    const [books, snapshots, erpRows, mappings] = await Promise.all([
      this.bookMapRepo.find({ where: { syncEnabled: true }, order: { companyCode: 'ASC' } }),
      this.snapshotRepo.find({ where: { entityType: 'GL_BALANCE' }, take: 20000 }),
      this.erpShareholders(),
      this.mappingRepo.find({ where: { mappingType: 'SHAREHOLDER', reviewStatus: 'APPROVED' }, take: 10000 }),
    ]);
    const normalizedPeriod = String(requestedPeriod || '').replace(/-/g, '');
    const latestPeriodByBook = new Map<string, string>();
    for (const snapshot of snapshots) {
      if (normalizedPeriod && snapshot.period !== normalizedPeriod) continue;
      const current = latestPeriodByBook.get(snapshot.bookId) || '';
      if (snapshot.period > current) latestPeriodByBook.set(snapshot.bookId, snapshot.period);
    }
    const planPeriod = normalizedPeriod || [...latestPeriodByBook.values()].sort().slice(-1)[0] || '';
    const rows: ChanjetShareholderInboundPlanRow[] = [];
    const blockers: string[] = [];
    const conditions: string[] = [];
    const companies: ChanjetShareholderInboundPlan['companies'] = [];
    let newestSourceMs = 0;

    for (const book of books) {
      const targetPeriod = normalizedPeriod || latestPeriodByBook.get(book.bookid) || '';
      const bookRows = snapshots.filter((snapshot) =>
        snapshot.bookId === book.bookid && snapshot.period === targetPeriod &&
        isPaidInCapitalSubject({ ...snapshot.rawData, code: snapshot.externalCode, name: snapshot.externalName }));
      const parentRows = bookRows.filter((snapshot) => shareholderSubjectCode({
        ...snapshot.rawData, code: snapshot.externalCode,
      }).replace(/\D/g, '') === '4001');
      const childRows = bookRows.filter((snapshot) => shareholderSubjectCode({
        ...snapshot.rawData, code: snapshot.externalCode,
      }).replace(/\D/g, '') !== '4001');
      const companyCandidates = erpRows.filter((row) => row.company_code === book.companyCode);
      const companyBlockers: string[] = [];
      const companyConditions: string[] = [];
      if (!targetPeriod) companyBlockers.push('该账套没有可用会计期间');
      if (childRows.length === 0) companyBlockers.push('没有4001子科目明细，禁止按名称推断股东');

      for (const snapshot of childRows) {
        const subjectCode = shareholderSubjectCode({ ...snapshot.rawData, code: snapshot.externalCode });
        const subjectName = shareholderSubjectName({ ...snapshot.rawData, name: snapshot.externalName });
        const amountBase = roundMoney(endingBaseAmount(snapshot.rawData, snapshot.amount));
        const approved = mappings.filter((mapping) =>
          mapping.bookId === book.bookid && mapping.chanjetId === snapshot.externalId);
        const approvedMatch = this.matchApproved(approved, companyCandidates);
        const inferred = approvedMatch || matchChanjetShareholderName(
          subjectName,
          companyCandidates.map((candidate) => ({
            shareholderCode: candidate.shareholder_code,
            shareholderName: candidate.shareholder_name,
            paidInAmount: Number(candidate.paid_in_amount || 0),
          })),
          amountBase,
        );
        const mappingStatus = approvedMatch && approvedMatch.status !== 'CONFLICT'
          ? 'APPROVED'
          : inferred.status;
        const sourceHash = this.hash({
          bookId: snapshot.bookId, period: snapshot.period, subjectId: snapshot.externalId,
          subjectCode, subjectName, currency: snapshot.currency, amountBase,
        });
        const sourceUpdatedAt = (snapshot.updatedAt || snapshot.lastSeenAt || snapshot.createdAt || new Date(0)).toISOString();
        newestSourceMs = Math.max(newestSourceMs, Date.parse(sourceUpdatedAt) || 0);
        rows.push({
          companyCode: book.companyCode,
          bookId: book.bookid,
          period: targetPeriod,
          subjectId: snapshot.externalId,
          subjectCode,
          subjectName,
          currency: snapshot.currency || '',
          amountBase,
          shareholderCode: inferred.shareholderCode,
          shareholderName: inferred.shareholderName,
          mappingStatus,
          confidence: inferred.confidence,
          reason: inferred.reason,
          sourceSnapshotId: snapshot.id,
          sourceHash,
          sourceUpdatedAt,
        });
      }

      const companyRows = rows.filter((row) => row.bookId === book.bookid && row.period === targetPeriod);
      const childAmount = roundMoney(companyRows.reduce((sum, row) => sum + row.amountBase, 0));
      const parentCheck = reconcile4001Parent(
        parentRows.map((row) => endingBaseAmount(row.rawData, row.amount)),
        childAmount,
      );
      if (parentCheck.blocker) companyBlockers.push(parentCheck.blocker);
      if (parentCheck.condition) companyConditions.push(parentCheck.condition);
      const mappedAmount = roundMoney(companyRows
        .filter((row) => !['SOURCE_ONLY', 'CONFLICT'].includes(row.mappingStatus))
        .reduce((sum, row) => sum + row.amountBase, 0));
      const sourceOnlyAmount = roundMoney(companyRows
        .filter((row) => row.mappingStatus === 'SOURCE_ONLY')
        .reduce((sum, row) => sum + row.amountBase, 0));
      if (companyRows.some((row) => row.mappingStatus === 'CONFLICT')) companyBlockers.push('存在冲突映射');
      blockers.push(...companyBlockers.map((blocker) => `${book.companyCode}: ${blocker}`));
      conditions.push(...companyConditions.map((condition) => `${book.companyCode}: ${condition}`));
      companies.push({
        companyCode: book.companyCode,
        bookId: book.bookid,
        period: targetPeriod,
        parent4001Amount: parentCheck.parent4001Amount,
        childAmount,
        childParentDifference: parentCheck.childParentDifference,
        parentReconciliation: parentCheck.parentReconciliation,
        mappedAmount,
        sourceOnlyAmount,
        blockers: companyBlockers,
        conditions: companyConditions,
      });
    }

    rows.sort((a, b) => `${a.bookId}:${a.subjectCode}:${a.subjectId}`.localeCompare(`${b.bookId}:${b.subjectCode}:${b.subjectId}`));
    const conflicts = rows.filter((row) => row.mappingStatus === 'CONFLICT').length;
    const sourceOnly = rows.filter((row) => row.mappingStatus === 'SOURCE_ONLY').length;
    const mapped = rows.length - sourceOnly - conflicts;
    const sourceTotal = roundMoney(rows.reduce((sum, row) => sum + row.amountBase, 0));
    const mappedTotal = roundMoney(rows.filter((row) => !['SOURCE_ONLY', 'CONFLICT'].includes(row.mappingStatus))
      .reduce((sum, row) => sum + row.amountBase, 0));
    const sourceOnlyTotal = roundMoney(rows.filter((row) => row.mappingStatus === 'SOURCE_ONLY')
      .reduce((sum, row) => sum + row.amountBase, 0));
    const hashInput = { syncType: 'SHAREHOLDER_ACCOUNTING_BALANCE', period: planPeriod, companies, rows };
    const sourceFreshnessHours = newestSourceMs
      ? Math.round(((Date.now() - newestSourceMs) / 36e5) * 100) / 100
      : Number.POSITIVE_INFINITY;
    if (sourceFreshnessHours > 8) blockers.push(`好业财4001镜像已超过8小时未更新: ${sourceFreshnessHours}h`);
    const hardHold = rows.length === 0 || conflicts > 0 || blockers.some((item) =>
      item.includes('没有可用') || item.includes('父科目行数量异常') || item.includes('没有4001子科目') ||
      item.includes('父子科目合计差异') || item.includes('超过8小时') || item.includes('冲突映射'));
    return {
      syncType: 'SHAREHOLDER_ACCOUNTING_BALANCE',
      decision: hardHold ? 'HOLD' : sourceOnly > 0 || conditions.length > 0 ? 'READY_WITH_CONDITIONS' : 'READY',
      period: planPeriod,
      planHash: this.hash(hashInput),
      sourceFreshnessHours,
      counts: { source: rows.length, mapped, sourceOnly, conflicts },
      totals: { source: sourceTotal, mapped: mappedTotal, sourceOnly: sourceOnlyTotal },
      companies,
      rows,
      blockers,
      conditions,
      guardrails: {
        chanjetWrite: false,
        legalEquityOverwrite: false,
        erpAccountingMirrorWrite: true,
        conflictPolicy: 'HOLD',
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async applyShareholderPlan(
    period: string | undefined,
    expectedPlanHash: string | undefined,
    requestedBy: string,
    confirmationToken?: string,
    trustedScheduler = false,
  ) {
    if (!trustedScheduler && confirmationToken !== 'SYNC_CHANJET_ACCOUNTING_FACTS_TO_ERP') {
      throw new ForbiddenException('缺少 ERP 会计镜像同步确认口令');
    }
    const plan = await this.buildShareholderPlan(period);
    if (plan.decision === 'HOLD') throw new BadRequestException(`好业财入站同步计划 HOLD: ${plan.blockers.join('；')}`);
    if (!expectedPlanHash || expectedPlanHash !== plan.planHash) {
      throw new BadRequestException('同步计划已变化，请重新预检并使用最新 planHash');
    }
    const existingRun = await this.runRepo.findOne({ where: { planHash: plan.planHash } });
    if (existingRun?.status === 'COMPLETED') {
      return { idempotent: true, run: existingRun, plan, chanjetWrite: false, legalEquityOverwrite: false };
    }

    const result = await this.ds.transaction(async (manager) => {
      const runRepo = manager.getRepository(ChanjetErpInboundSyncRunEntity);
      const balanceRepo = manager.getRepository(ChanjetShareholderAccountingBalanceEntity);
      const mappingRepo = manager.getRepository(ChanjetMasterMappingEntity);
      let run = existingRun || runRepo.create({
        syncType: plan.syncType,
        period: plan.period,
        planHash: plan.planHash,
        status: 'RUNNING',
        sourceCount: plan.counts.source,
        mappedCount: plan.counts.mapped,
        holdCount: plan.counts.sourceOnly,
        insertedCount: 0,
        updatedCount: 0,
        sourceTotal: String(plan.totals.source),
        mappedTotal: String(plan.totals.mapped),
        details: {
          decision: plan.decision,
          blockers: plan.blockers,
          conditions: plan.conditions,
          companies: plan.companies,
        },
        requestedBy,
        completedAt: null,
      });
      run.status = 'RUNNING';
      run = await runRepo.save(run);

      const bookPeriods = plan.companies.map((company) => ({ bookId: company.bookId, period: company.period }));
      for (const target of bookPeriods) {
        await balanceRepo.update({ bookId: target.bookId, period: target.period, active: true }, { active: false });
      }
      const existing = await balanceRepo.find({
        where: { bookId: In(plan.companies.map((company) => company.bookId)), period: plan.period },
      });
      const existingKeys = new Set(existing.map((row) => `${row.bookId}:${row.period}:${row.subjectId}`));
      let inserted = 0;
      let updated = 0;
      const now = new Date();
      for (const row of plan.rows) {
        const key = `${row.bookId}:${row.period}:${row.subjectId}`;
        if (existingKeys.has(key)) updated += 1;
        else inserted += 1;
        await balanceRepo.upsert({
          companyCode: row.companyCode,
          bookId: row.bookId,
          period: row.period,
          subjectId: row.subjectId,
          subjectCode: row.subjectCode,
          subjectName: row.subjectName,
          shareholderCode: row.shareholderCode,
          shareholderName: row.shareholderName,
          currency: row.currency,
          endingAmountBase: String(row.amountBase),
          mappingStatus: row.mappingStatus,
          matchConfidence: String(row.confidence),
          matchBasis: { reason: row.reason, authority: 'CHANJET_POSTED_ACCOUNTING' },
          sourceSnapshotId: row.sourceSnapshotId,
          sourceHash: row.sourceHash,
          syncRunId: run.id,
          active: true,
          sourceUpdatedAt: new Date(row.sourceUpdatedAt),
          syncedBy: requestedBy,
          syncedAt: now,
        }, { conflictPaths: ['bookId', 'period', 'subjectId'] });

        if (['EXACT', 'ALIAS'].includes(row.mappingStatus) && row.shareholderCode) {
          await mappingRepo.upsert({
            mappingType: 'SHAREHOLDER',
            bookId: row.bookId,
            erpCode: row.shareholderCode,
            erpName: row.shareholderName,
            chanjetId: row.subjectId,
            chanjetCode: row.subjectCode,
            chanjetName: row.subjectName,
            matchStatus: 'MATCHED',
            confidence: String(row.confidence),
            reviewStatus: 'APPROVED',
            reviewedBy: requestedBy,
            reviewedAt: now,
            rawData: {
              companyCode: row.companyCode,
              currency: row.currency,
              source: 'CHANJET_ERP_INBOUND_DETERMINISTIC_MATCH',
              matchBasis: row.reason,
            },
          }, { conflictPaths: ['mappingType', 'bookId', 'erpCode', 'chanjetId'] });
        }
      }

      run.status = 'COMPLETED';
      run.insertedCount = inserted;
      run.updatedCount = updated;
      run.completedAt = now;
      run.details = {
        ...run.details,
        sourceOnlyRows: plan.rows.filter((row) => row.mappingStatus === 'SOURCE_ONLY')
          .map((row) => ({ subjectCode: row.subjectCode, subjectName: row.subjectName, amountBase: row.amountBase, reason: row.reason })),
        legalEquityOverwrite: false,
        chanjetWrite: false,
      };
      return runRepo.save(run);
    });

    this.log.log(`Chanjet shareholder accounting inbound completed run=${result.id} period=${plan.period} source=${plan.counts.source} mapped=${plan.counts.mapped} sourceOnly=${plan.counts.sourceOnly}`);
    return { idempotent: false, run: result, plan, chanjetWrite: false, legalEquityOverwrite: false };
  }

  async syncScheduledShareholderBalances(period: string, requestedBy: string) {
    const plan = await this.buildShareholderPlan(period);
    if (plan.decision === 'HOLD') {
      return {
        decision: 'HOLD' as const,
        applied: false,
        plan,
        reason: plan.blockers.join('；') || '入站计划未通过核对',
      };
    }
    const applied = await this.applyShareholderPlan(period, plan.planHash, requestedBy, undefined, true);
    return { decision: plan.decision, applied: true, ...applied };
  }

  async latestShareholderSync() {
    const [run, balances] = await Promise.all([
      this.runRepo.findOne({ where: { syncType: 'SHAREHOLDER_ACCOUNTING_BALANCE' }, order: { createdAt: 'DESC' } }),
      this.balanceRepo.find({ where: { active: true }, order: { companyCode: 'ASC', subjectCode: 'ASC' }, take: 1000 }),
    ]);
    return {
      run,
      count: balances.length,
      mappedCount: balances.filter((row) => !!row.shareholderCode).length,
      sourceOnlyCount: balances.filter((row) => !row.shareholderCode).length,
      total: roundMoney(balances.reduce((sum, row) => sum + Number(row.endingAmountBase || 0), 0)),
      balances,
      chanjetWrite: false,
      legalEquityOverwrite: false,
    };
  }
}
