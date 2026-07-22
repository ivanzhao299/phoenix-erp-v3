import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource, Repository } from 'typeorm';

import { ChanjetBookCompanyMapEntity } from '../../chanjet/chanjet-book-company-map.entity';
import { ChanjetEntitySnapshotEntity } from '../../chanjet/chanjet-entity-snapshot.entity';
import { ChanjetIntegrationService } from '../../chanjet/chanjet-integration.service';
import { ChanjetMasterMappingEntity } from '../../chanjet/chanjet-master-mapping.entity';
import { ChanjetReconciliationResultEntity } from '../../chanjet/chanjet-reconciliation-result.entity';
import { ChanjetShareholderClosePeriodEntity } from '../../chanjet/chanjet-shareholder-close-period.entity';
import { ChanjetShareholderVoucherLinkEntity } from '../../chanjet/chanjet-shareholder-voucher-link.entity';
import { ChanjetShareholderAccountingBalanceEntity } from '../../chanjet/chanjet-shareholder-accounting-balance.entity';
import { DataScopeContext } from '../../org/services/data-scope.service';
import {
  classifyCapitalSource, endingBaseAmount, isPaidInCapitalSubject, namesLikelyMatch,
  pickPath, roundMoney, scoreVoucherCandidate, shareholderSubjectCode,
  shareholderSubjectName, toAmount,
} from './shareholder-accounting-reconciliation';

type UserContext = { userId: string; roles: string[] };

interface EquityRow {
  project_code: string;
  project_name: string;
  company_code: string;
  shareholder_code: string;
  shareholder_name: string;
  paid_in_capital: string;
  subscribed_capital: string | null;
}

interface ConfirmShareholderMappingBody {
  confirmationToken?: string;
  companyCode?: string;
  bookId?: string;
  subjectId?: string;
  shareholderCode?: string;
}

interface ConfirmVoucherLinkBody {
  confirmationToken?: string;
  contributionId?: string;
  voucherId?: string;
  voucherLineId?: string;
}

interface ClosePeriodBody {
  confirmationToken?: string;
  period?: string;
  companyCodes?: unknown;
  note?: string;
}

export interface VoucherCandidate {
  voucherId: string;
  voucherNo: string;
  voucherLineId: string;
  voucherDate: string | null;
  subjectCode: string;
  subjectName: string;
  currency: string;
  amountOriginal: number;
  amountBase: number;
  confidence: number;
  reasons: string[];
}

export interface ContributionRow {
  id: string;
  contribution_no: string;
  project_code: string;
  project_name: string;
  company_code: string;
  shareholder_code: string;
  shareholder_name: string;
  amount: string;
  currency: string;
  contribution_date: string | null;
  source_type: string;
  source_reference: string | null;
  bank_account: string | null;
  status: string;
}

@Injectable()
export class ShareholderAccountingReconciliationService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(ChanjetBookCompanyMapEntity)
    private readonly bookMapRepo: Repository<ChanjetBookCompanyMapEntity>,
    @InjectRepository(ChanjetEntitySnapshotEntity)
    private readonly snapshotRepo: Repository<ChanjetEntitySnapshotEntity>,
    @InjectRepository(ChanjetMasterMappingEntity)
    private readonly mappingRepo: Repository<ChanjetMasterMappingEntity>,
    @InjectRepository(ChanjetShareholderVoucherLinkEntity)
    private readonly linkRepo: Repository<ChanjetShareholderVoucherLinkEntity>,
    @InjectRepository(ChanjetShareholderClosePeriodEntity)
    private readonly closeRepo: Repository<ChanjetShareholderClosePeriodEntity>,
    @InjectRepository(ChanjetReconciliationResultEntity)
    private readonly reconciliationRepo: Repository<ChanjetReconciliationResultEntity>,
    @InjectRepository(ChanjetShareholderAccountingBalanceEntity)
    private readonly accountingBalanceRepo: Repository<ChanjetShareholderAccountingBalanceEntity>,
    private readonly chanjet: ChanjetIntegrationService,
    private readonly cls: ClsService,
  ) {}

  private allowedCompanies(): string[] | null {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (!scope || scope.isGlobal) return null;
    return [...new Set((scope.allowedCompanyCodes || []).map(String).filter(Boolean))];
  }

  private assertCompany(companyCode: string) {
    const allowed = this.allowedCompanies();
    if (allowed !== null && !allowed.includes(companyCode)) {
      throw new ForbiddenException('当前用户无权访问该公司的股东财务对账');
    }
  }

  private companyFilter<T extends { companyCode: string }>(rows: T[]): T[] {
    const allowed = this.allowedCompanies();
    return allowed === null ? rows : rows.filter((row) => allowed.includes(row.companyCode));
  }

  private async loadEquityRows(): Promise<EquityRow[]> {
    const allowed = this.allowedCompanies();
    if (allowed?.length === 0) return [];
    return this.ds.query(
      `SELECT p.project_code, p.project_name, COALESCE(p.company_code, '') AS company_code,
              e.shareholder_code, s.shareholder_name,
              e.paid_in_capital::text, e.subscribed_capital::text
         FROM shr_project_equity e
         JOIN shr_projects p ON p.project_code = e.project_code
         JOIN shr_shareholders s ON s.shareholder_code = e.shareholder_code
        WHERE ($1::text[] IS NULL OR p.company_code = ANY($1::text[]))
        ORDER BY p.company_code, p.project_code, s.shareholder_name`,
      [allowed],
    );
  }

  private async loadContributionRows(): Promise<ContributionRow[]> {
    const allowed = this.allowedCompanies();
    if (allowed?.length === 0) return [];
    return this.ds.query(
      `SELECT c.id::text, c.contribution_no, c.project_code, p.project_name,
              COALESCE(p.company_code, '') AS company_code,
              c.shareholder_code, s.shareholder_name, c.amount::text, c.currency,
              c.contribution_date::text, c.source_type, c.source_reference,
              c.bank_account, c.status
         FROM shr_capital_contributions c
         JOIN shr_projects p ON p.project_code = c.project_code
         JOIN shr_shareholders s ON s.shareholder_code = c.shareholder_code
        WHERE ($1::text[] IS NULL OR p.company_code = ANY($1::text[]))
        ORDER BY c.contribution_date DESC NULLS LAST, c.id DESC`,
      [allowed],
    );
  }

  private latestEquityGlRows(snapshots: ChanjetEntitySnapshotEntity[]) {
    const latest = new Map<string, string>();
    for (const row of snapshots) {
      const period = String(row.period || pickPath(row.rawData, 'period', 'accountPeriod', 'yearPeriod') || '');
      if (!latest.has(row.bookId) || period > (latest.get(row.bookId) || '')) latest.set(row.bookId, period);
    }
    return snapshots.filter((row) => {
      const period = String(row.period || pickPath(row.rawData, 'period', 'accountPeriod', 'yearPeriod') || '');
      return period === latest.get(row.bookId) && isPaidInCapitalSubject({
        ...row.rawData,
        code: row.externalCode,
        name: row.externalName,
      });
    });
  }

  private chanjetBookTotal(rows: ChanjetEntitySnapshotEntity[]): number {
    const parent = rows.find((row) => shareholderSubjectCode({
      ...row.rawData, code: row.externalCode,
    }).replace(/\D/g, '') === '4001');
    if (parent) return roundMoney(endingBaseAmount(parent.rawData, parent.amount));
    return roundMoney(rows.reduce((sum, row) => sum + endingBaseAmount(row.rawData, row.amount), 0));
  }

  async overview(period?: string) {
    const [equityRows, contributionRows, bookMapsAll, snapshotsAll, shareholderMappings, links, accountingBalancesAll] = await Promise.all([
      this.loadEquityRows(),
      this.loadContributionRows(),
      this.bookMapRepo.find({ where: { syncEnabled: true }, order: { companyCode: 'ASC' } }),
      this.snapshotRepo.find({ where: { entityType: 'GL_BALANCE' }, take: 10000 }),
      this.mappingRepo.find({ where: { mappingType: 'SHAREHOLDER' }, take: 5000 }),
      this.linkRepo.find({ where: { matchStatus: 'MATCHED' }, take: 10000 }),
      this.accountingBalanceRepo.find({ where: { active: true }, take: 20000 }),
    ]);
    const bookMaps = this.companyFilter(bookMapsAll.map((row) => ({ ...row, companyCode: row.companyCode })));
    const allowedBookIds = new Set(bookMaps.map((row) => row.bookid));
    const scopedSnapshots = snapshotsAll.filter((row) => allowedBookIds.has(row.bookId));
    const periodSnapshots = period
      ? scopedSnapshots.filter((row) => String(
        row.period || pickPath(row.rawData, 'period', 'accountPeriod', 'yearPeriod') || '',
      ) === period)
      : scopedSnapshots;
    const equityGlRows = this.latestEquityGlRows(periodSnapshots);
    const scopedAccountingBalances = accountingBalancesAll.filter((row) => allowedBookIds.has(row.bookId));
    const latestAccountingPeriodByBook = new Map<string, string>();
    for (const row of scopedAccountingBalances) {
      if (!latestAccountingPeriodByBook.has(row.bookId) || row.period > (latestAccountingPeriodByBook.get(row.bookId) || '')) {
        latestAccountingPeriodByBook.set(row.bookId, row.period);
      }
    }
    const accountingBalances = scopedAccountingBalances.filter((row) =>
      period ? row.period === period : row.period === latestAccountingPeriodByBook.get(row.bookId));

    const companyRows = bookMaps.map((book) => {
      const erpEquity = equityRows.filter((row) => row.company_code === book.companyCode);
      const erpContributions = contributionRows.filter((row) => {
        if (row.company_code !== book.companyCode || row.status !== 'CONFIRMED') return false;
        if (!period || !row.contribution_date) return true;
        return row.contribution_date.slice(0, 7).replace('-', '') <= period;
      });
      const glRows = equityGlRows.filter((row) => row.bookId === book.bookid);
      const mirrorRows = accountingBalances.filter((row) => row.bookId === book.bookid);
      const mapped = shareholderMappings.filter((row) => row.bookId === book.bookid && row.reviewStatus === 'APPROVED');
      const equityHolderKeys = new Set(erpEquity.map((row) => row.shareholder_code));
      const mappedHolderKeys = new Set(mapped.map((row) => row.erpCode));
      const eligible = erpContributions.filter((row) => classifyCapitalSource(row.source_type) === 'EQUITY');
      const debt = erpContributions.filter((row) => classifyCapitalSource(row.source_type) === 'DEBT_OR_ADVANCE');
      const review = erpContributions.filter((row) => classifyCapitalSource(row.source_type) === 'MANUAL_REVIEW');
      const erpPaidIn = roundMoney(erpEquity.reduce((sum, row) => sum + toAmount(row.paid_in_capital), 0));
      const eligibleContributionTotal = roundMoney(eligible.reduce((sum, row) => sum + toAmount(row.amount), 0));
      const chanjetPaidIn = mirrorRows.length
        ? roundMoney(mirrorRows.reduce((sum, row) => sum + Number(row.endingAmountBase || 0), 0))
        : this.chanjetBookTotal(glRows);
      const difference = roundMoney(chanjetPaidIn - erpPaidIn);
      const internalDifference = roundMoney(erpPaidIn - eligibleContributionTotal);
      const companyLinks = links.filter((row) => row.bookId === book.bookid);
      const linkedContributionKeys = new Set(companyLinks.map((row) => row.contributionNo));
      return {
        companyCode: book.companyCode,
        companyName: book.companyName,
        bookId: book.bookid,
        bookName: book.bookName,
        period: mirrorRows.map((row) => row.period).sort().slice(-1)[0] || glRows.map((row) => row.period).sort().slice(-1)[0] || '',
        erpPaidIn,
        chanjetPaidIn,
        difference,
        reconciliationStatus: Math.abs(difference) <= 0.01 ? 'OK' : 'MISMATCH',
        eligibleContributionTotal,
        internalDifference,
        debtOrAdvanceTotal: roundMoney(debt.reduce((sum, row) => sum + toAmount(row.amount), 0)),
        manualReviewTotal: roundMoney(review.reduce((sum, row) => sum + toAmount(row.amount), 0)),
        shareholderCount: equityHolderKeys.size,
        approvedMappingCount: [...equityHolderKeys].filter((key) => mappedHolderKeys.has(key)).length,
        mappingCoverage: equityHolderKeys.size
          ? roundMoney(([...equityHolderKeys].filter((key) => mappedHolderKeys.has(key)).length / equityHolderKeys.size) * 100)
          : 100,
        eligibleContributionCount: eligible.length,
        undatedEligibleContributionCount: eligible.filter((row) => !row.contribution_date).length,
        matchedContributionCount: eligible.filter((row) => linkedContributionKeys.has(row.contribution_no)).length,
        accountingSource: mirrorRows.length ? 'ERP_CHANJET_ACCOUNTING_MIRROR' : 'CHANJET_READONLY_SNAPSHOT_FALLBACK',
        equitySubjectRows: mirrorRows.length
          ? mirrorRows.map((row) => ({
            externalId: row.subjectId,
            code: row.subjectCode,
            name: row.subjectName,
            amount: Number(row.endingAmountBase || 0),
            currency: row.currency,
            shareholderCode: row.shareholderCode,
            mappingStatus: row.mappingStatus,
          }))
          : glRows.map((row) => ({
            externalId: row.externalId,
            code: shareholderSubjectCode({ ...row.rawData, code: row.externalCode }),
            name: shareholderSubjectName({ ...row.rawData, name: row.externalName }),
            amount: endingBaseAmount(row.rawData, row.amount),
            currency: row.currency || String(pickPath(row.rawData, 'currencyCode', 'currency.name') || ''),
          })),
      };
    });

    const shareholders = equityRows.map((row) => {
      const book = bookMaps.find((item) => item.companyCode === row.company_code);
      const approved = shareholderMappings.filter((item) =>
        item.bookId === book?.bookid && item.erpCode === row.shareholder_code && item.reviewStatus === 'APPROVED');
      const sourceRows = equityGlRows.filter((item) => item.bookId === book?.bookid &&
        namesLikelyMatch(row.shareholder_name, shareholderSubjectName({ ...item.rawData, name: item.externalName })));
      return {
        projectCode: row.project_code,
        projectName: row.project_name,
        companyCode: row.company_code,
        shareholderCode: row.shareholder_code,
        shareholderName: row.shareholder_name,
        erpPaidIn: toAmount(row.paid_in_capital),
        subscribedCapital: toAmount(row.subscribed_capital),
        mappingStatus: approved.length ? 'APPROVED' : sourceRows.length === 1 ? 'CANDIDATE' : sourceRows.length > 1 ? 'NEED_REVIEW' : 'UNMAPPED',
        approvedMappings: approved.map((item) => ({
          subjectId: item.chanjetId, subjectCode: item.chanjetCode,
          subjectName: item.chanjetName, currency: item.rawData?.currency || '',
        })),
        candidates: sourceRows.map((item) => ({
          subjectId: item.externalId,
          subjectCode: shareholderSubjectCode({ ...item.rawData, code: item.externalCode }),
          subjectName: shareholderSubjectName({ ...item.rawData, name: item.externalName }),
          amount: endingBaseAmount(item.rawData, item.amount),
          currency: item.currency,
        })),
      };
    });

    const totals = companyRows.reduce((acc, row) => ({
      erpPaidIn: roundMoney(acc.erpPaidIn + row.erpPaidIn),
      chanjetPaidIn: roundMoney(acc.chanjetPaidIn + row.chanjetPaidIn),
      difference: roundMoney(acc.difference + row.difference),
      debtOrAdvance: roundMoney(acc.debtOrAdvance + row.debtOrAdvanceTotal),
    }), { erpPaidIn: 0, chanjetPaidIn: 0, difference: 0, debtOrAdvance: 0 });

    return {
      decision: companyRows.length && companyRows.every((row) => row.reconciliationStatus === 'OK')
        ? 'GO_WITH_CONDITIONS' : 'HOLD',
      authority: {
        legalEquity: 'ERP shr_project_equity',
        operationalContribution: 'ERP shr_capital_contributions (equity-class only)',
        loansAndAdvances: 'ERP fin_shareholder_contributions / debt-class only',
        postedAccounting: 'ERP chanjet_shareholder_accounting_balances (sourced from Chanjet GL_BALANCE 4001)',
        overwritePolicy: 'NEVER_SILENT_OVERWRITE',
      },
      safeguards: {
        chanjetReadOnly: true,
        externalWriteEnabled: false,
        automaticPostingEnabled: false,
        debtIncludedInPaidInCapital: false,
        erpAccountingMirrorEnabled: true,
      },
      totals,
      companies: companyRows,
      shareholders,
      contributionClassification: contributionRows.map((row) => ({
        id: row.id,
        contributionNo: row.contribution_no,
        companyCode: row.company_code,
        projectCode: row.project_code,
        shareholderCode: row.shareholder_code,
        shareholderName: row.shareholder_name,
        amount: toAmount(row.amount),
        currency: row.currency,
        contributionDate: row.contribution_date,
        sourceType: row.source_type,
        accountingClass: classifyCapitalSource(row.source_type),
        status: row.status,
        matched: links.some((link) => link.contributionNo === row.contribution_no),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  private voucherDetails(rawData: Record<string, unknown>): Array<Record<string, unknown>> {
    const details = pickPath(rawData, 'details', 'data.details', 'voucher.details', 'data.voucher.details');
    return Array.isArray(details) ? details.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
  }

  async voucherCandidates(contributionId: string) {
    const rows = await this.loadContributionRows();
    const contribution = rows.find((row) => row.id === String(contributionId));
    if (!contribution) throw new NotFoundException(`资本流不存在: ${contributionId}`);
    this.assertCompany(contribution.company_code);
    if (classifyCapitalSource(contribution.source_type) !== 'EQUITY') {
      return { contribution, decision: 'HOLD', reason: '该记录属于借款/垫资或待复核类型，不得勾稽到实收资本4001', candidates: [] };
    }
    const book = await this.bookMapRepo.findOne({ where: { companyCode: contribution.company_code, syncEnabled: true } });
    if (!book) return { contribution, decision: 'HOLD', reason: '公司尚未映射好业财账套', candidates: [] };
    const vouchers = await this.snapshotRepo.find({ where: { entityType: 'VOUCHER', bookId: book.bookid }, take: 5000 });
    const candidates = vouchers.flatMap((voucher) => this.voucherDetails(voucher.rawData).map((line, index): VoucherCandidate | null => {
      if (!isPaidInCapitalSubject(line)) return null;
      const lineAmount = Math.max(
        toAmount(pickPath(line, 'basePostedCr', 'creditBase', 'creditAmount', 'credit')),
        toAmount(pickPath(line, 'basePostedDr', 'debitBase', 'debitAmount', 'debit')),
      );
      const voucherDate = String(pickPath(voucher.rawData, 'voucherDate', 'date', 'bizDate', 'accountingDate') || '').slice(0, 10) || null;
      const scored = scoreVoucherCandidate({
        contributionAmount: toAmount(contribution.amount),
        contributionDate: contribution.contribution_date,
        shareholderName: contribution.shareholder_name,
        lineAmount,
        voucherDate,
        subjectName: shareholderSubjectName(line),
      });
      if (scored.score < 30) return null;
      return {
        voucherId: voucher.externalId,
        voucherNo: voucher.externalCode || String(pickPath(voucher.rawData, 'voucherNo', 'code') || ''),
        voucherLineId: String(pickPath(line, 'id', 'lineId', 'detailId') || `${voucher.externalId}:${index}`),
        voucherDate,
        subjectCode: shareholderSubjectCode(line),
        subjectName: shareholderSubjectName(line),
        currency: String(pickPath(line, 'currencyCode', 'currency.name', 'currencyId') || voucher.currency || contribution.currency),
        amountOriginal: Math.max(toAmount(pickPath(line, 'postedCr', 'creditOriginal', 'postedDr', 'debitOriginal')), lineAmount),
        amountBase: lineAmount,
        confidence: scored.score,
        reasons: scored.reasons,
      };
    }).filter((item): item is VoucherCandidate => item !== null))
      .sort((a, b) => b.confidence - a.confidence);
    return {
      contribution,
      book: { bookId: book.bookid, bookName: book.bookName },
      decision: candidates.some((candidate) => candidate && candidate.confidence >= 85) ? 'CANDIDATE_READY' : 'NEED_REVIEW',
      candidates: candidates.slice(0, 20),
      autoMatchPerformed: false,
    };
  }

  async monthCloseReadiness(period?: string) {
    const targetPeriod = String(period || new Date().toISOString().slice(0, 7).replace('-', ''));
    const overview = await this.overview(targetPeriod);
    const companies = overview.companies.map((row) => {
      const blockers: string[] = [];
      if (row.mappingCoverage < 100) blockers.push('股东到4001子科目映射未达到100%');
      if (Math.abs(row.difference) > 0.01) blockers.push(`ERP与好业财实收资本差异 ${row.difference}`);
      if (Math.abs(row.internalDifference) > 0.01) blockers.push(`ERP股权与逐笔出资内部差异 ${row.internalDifference}`);
      if (row.undatedEligibleContributionCount > 0) blockers.push(`存在 ${row.undatedEligibleContributionCount} 笔无日期股权出资，无法归属会计期间`);
      if (row.matchedContributionCount < row.eligibleContributionCount) blockers.push('存在未完成凭证逐笔勾稽的实收资本记录');
      return { ...row, blockers, closeReady: blockers.length === 0 };
    });
    return {
      period: targetPeriod,
      decision: companies.length > 0 && companies.every((row) => row.closeReady) ? 'READY' : 'HOLD',
      companies,
      externalWriteEnabled: false,
    };
  }

  async voucherDraftPreview(contributionId: string) {
    const rows = await this.loadContributionRows();
    const contribution = rows.find((row) => row.id === String(contributionId));
    if (!contribution) throw new NotFoundException(`资本流不存在: ${contributionId}`);
    this.assertCompany(contribution.company_code);
    if (classifyCapitalSource(contribution.source_type) !== 'EQUITY') {
      return { decision: 'HOLD', blockers: ['借款、垫资、代付或待复核记录不得生成实收资本凭证草稿'] };
    }
    const book = await this.bookMapRepo.findOne({ where: { companyCode: contribution.company_code, syncEnabled: true } });
    if (!book) return { decision: 'HOLD', blockers: ['缺少公司到账套映射'] };
    const [shareholderMapping, cashMappings] = await Promise.all([
      this.mappingRepo.findOne({ where: {
        mappingType: 'SHAREHOLDER', bookId: book.bookid,
        erpCode: contribution.shareholder_code, reviewStatus: 'APPROVED',
      } }),
      this.mappingRepo.find({ where: {
        mappingType: 'CASH_ACCOUNT', bookId: book.bookid, reviewStatus: 'APPROVED',
      }, take: 100 }),
    ]);
    const cashMapping = cashMappings.find((item) =>
      contribution.bank_account && [item.erpCode, item.erpName, item.chanjetName].some((value) =>
        String(value || '').includes(String(contribution.bank_account)))) || null;
    const blockers: string[] = [];
    if (!shareholderMapping) blockers.push('缺少已批准的股东到4001子科目映射');
    if (!cashMapping) blockers.push('缺少该收款账户到好业财现金/银行科目的已批准映射');
    if (blockers.length) return { decision: 'HOLD', blockers, externalWriteEnabled: false };
    const amount = roundMoney(toAmount(contribution.amount));
    return {
      decision: 'ERP_DRAFT_READY',
      externalWriteEnabled: false,
      draft: {
        sourceBizType: 'SHAREHOLDER_CAPITAL_CONTRIBUTION',
        sourceBizId: contribution.contribution_no,
        companyCode: contribution.company_code,
        bookId: book.bookid,
        period: String(contribution.contribution_date || '').slice(0, 7).replace('-', ''),
        title: `股东出资 ${contribution.contribution_no}`,
        voucherLines: [
          { direction: 'DEBIT', accountId: cashMapping!.chanjetId, accountCode: cashMapping!.chanjetCode, accountName: cashMapping!.chanjetName, debit: amount, credit: 0, currency: contribution.currency },
          { direction: 'CREDIT', accountId: shareholderMapping!.chanjetId, accountCode: shareholderMapping!.chanjetCode, accountName: shareholderMapping!.chanjetName, debit: 0, credit: amount, currency: contribution.currency },
        ],
        rawData: { contributionId: contribution.id, generatedFrom: 'ERP_READONLY_RECONCILIATION', externalWriteEnabled: false },
      },
    };
  }

  private requireToken(actual: string | undefined, expected: string) {
    if (actual !== expected) throw new ForbiddenException(`需要显式确认令牌: ${expected}`);
  }

  async confirmShareholderMapping(body: ConfirmShareholderMappingBody, user: UserContext) {
    this.requireToken(body?.confirmationToken, 'CONFIRM_SHAREHOLDER_ACCOUNT_MAPPING');
    this.assertCompany(String(body.companyCode || ''));
    const book = await this.bookMapRepo.findOne({ where: { bookid: String(body.bookId), companyCode: String(body.companyCode), syncEnabled: true } });
    if (!book) throw new BadRequestException('账套与公司映射不一致');
    const subject = await this.snapshotRepo.findOne({ where: { bookId: book.bookid, entityType: 'GL_BALANCE', externalId: String(body.subjectId) } });
    if (!subject || !isPaidInCapitalSubject({ ...subject.rawData, code: subject.externalCode, name: subject.externalName })) {
      throw new BadRequestException('目标不是当前账套的实收资本4001科目');
    }
    const shareholder = await this.ds.query(`SELECT shareholder_name FROM shr_shareholders WHERE shareholder_code = $1 LIMIT 1`, [String(body.shareholderCode)]);
    if (!shareholder.length) throw new BadRequestException('ERP股东不存在');
    const entity = this.mappingRepo.create({
      mappingType: 'SHAREHOLDER', bookId: book.bookid,
      erpCode: String(body.shareholderCode), erpName: String(shareholder[0].shareholder_name),
      chanjetId: subject.externalId,
      chanjetCode: shareholderSubjectCode({ ...subject.rawData, code: subject.externalCode }),
      chanjetName: shareholderSubjectName({ ...subject.rawData, name: subject.externalName }),
      matchStatus: 'MANUAL', confidence: '100', reviewStatus: 'APPROVED',
      reviewedBy: user.userId, reviewedAt: new Date(),
      rawData: { companyCode: book.companyCode, currency: subject.currency, source: 'SHAREHOLDER_RECONCILIATION' },
    });
    // TypeORM's QueryDeepPartialEntity is too narrow for jsonb Record values.
    await this.mappingRepo.upsert(entity as never, { conflictPaths: ['mappingType', 'bookId', 'erpCode', 'chanjetId'] });
    await this.recordAudit('SHAREHOLDER_EQUITY', book.companyCode, book.bookid, '', String(body.shareholderCode), '股东会计科目映射已确认', user.userId);
    return { saved: true, externalWriteEnabled: false };
  }

  async confirmVoucherLink(body: ConfirmVoucherLinkBody, user: UserContext) {
    this.requireToken(body?.confirmationToken, 'CONFIRM_SHAREHOLDER_VOUCHER_LINK');
    const result = await this.voucherCandidates(String(body.contributionId));
    const candidate = result.candidates.find((item) =>
      item.voucherId === String(body.voucherId) && item.voucherLineId === String(body.voucherLineId));
    if (!candidate || candidate.confidence < 85) throw new BadRequestException('只能确认服务端重新计算后置信度不低于85的候选');
    const contribution = result.contribution as ContributionRow;
    const book = result.book!;
    const row = this.linkRepo.create({
      companyCode: contribution.company_code, bookId: book.bookId,
      contributionId: contribution.id, contributionNo: contribution.contribution_no,
      shareholderCode: contribution.shareholder_code,
      voucherId: candidate.voucherId, voucherNo: candidate.voucherNo,
      voucherLineId: candidate.voucherLineId, voucherDate: candidate.voucherDate,
      subjectCode: candidate.subjectCode, subjectName: candidate.subjectName,
      currency: candidate.currency, amountOriginal: String(candidate.amountOriginal),
      amountBase: String(candidate.amountBase), matchStatus: 'MATCHED',
      confidence: String(candidate.confidence), matchBasis: { reasons: candidate.reasons },
      reviewedBy: user.userId, reviewedAt: new Date(),
    });
    // TypeORM's QueryDeepPartialEntity is too narrow for jsonb Record values.
    await this.linkRepo.upsert(row as never, { conflictPaths: ['bookId', 'contributionNo', 'voucherLineId'] });
    await this.recordAudit('SHAREHOLDER_CONTRIBUTION', contribution.company_code, book.bookId, '', contribution.contribution_no, '股东出资与凭证行已勾稽', user.userId);
    return { saved: true, confidence: candidate.confidence, externalWriteEnabled: false };
  }

  async createErpVoucherDraft(contributionId: string, confirmationToken: string | undefined, user: UserContext) {
    this.requireToken(confirmationToken, 'CREATE_ERP_ONLY_SHAREHOLDER_VOUCHER_DRAFT');
    const preview = await this.voucherDraftPreview(contributionId);
    if (preview.decision !== 'ERP_DRAFT_READY' || !preview.draft) throw new BadRequestException(`凭证草稿未就绪: ${(preview.blockers || []).join('；')}`);
    const draft = await this.chanjet.createVoucherDraft(preview.draft, user.userId);
    return { draft, externalWriteEnabled: false, pushAllowed: false };
  }

  async closePeriod(body: ClosePeriodBody, user: UserContext) {
    this.requireToken(body?.confirmationToken, 'CONFIRM_SHAREHOLDER_PERIOD_CLOSE');
    const readiness = await this.monthCloseReadiness(String(body?.period || ''));
    if (readiness.decision !== 'READY') throw new BadRequestException('月结条件未满足，禁止关账');
    const requested = new Set((Array.isArray(body.companyCodes) ? body.companyCodes : []).map(String));
    const rows = readiness.companies.filter((item) => requested.size === 0 || requested.has(item.companyCode));
    for (const item of rows) {
      this.assertCompany(item.companyCode);
      await this.closeRepo.upsert({
        companyCode: item.companyCode, bookId: item.bookId, period: readiness.period,
        status: 'CLOSED', erpPaidIn: String(item.erpPaidIn), chanjetPaidIn: String(item.chanjetPaidIn),
        differenceAmount: String(item.difference), evidence: { readiness: item },
        closedBy: user.userId, closedAt: new Date(), note: String(body?.note || ''),
      }, { conflictPaths: ['companyCode', 'bookId', 'period'] });
      await this.recordAudit('SHAREHOLDER_EQUITY', item.companyCode, item.bookId, readiness.period, 'PERIOD_CLOSE', '股东权益月结已完成', user.userId);
    }
    return { closed: rows.length, period: readiness.period, externalWriteEnabled: false };
  }

  private async recordAudit(type: ChanjetReconciliationResultEntity['reconciliationType'], companyCode: string, bookId: string, period: string, subjectKey: string, summary: string, userId: string) {
    await this.reconciliationRepo.save(this.reconciliationRepo.create({
      reconciliationType: type, companyCode, bookId, period,
      status: 'OK', severity: 'LOW', subjectType: 'SHAREHOLDER_ACCOUNTING',
      subjectKey: String(subjectKey), subjectName: '', erpValue: { operator: userId },
      chanjetValue: null, diffSummary: summary, actionRequired: '',
      resolved: true, resolvedBy: userId, resolvedAt: new Date(),
    }));
  }
}
