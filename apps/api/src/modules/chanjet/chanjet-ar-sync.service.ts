import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetArSnapshotEntity } from './chanjet-ar-snapshot.entity';

interface ChanjetArRow {
  assistantAccount?: number;
  assistantCustomer?: number;
  assistantCustomerCode?: string;
  assistantId?: number;
  assistantProvider?: number;
  currentPeriodDfBalance?: number;
  currentPeriodJfBalance?: number;
  endbalance?: number;
  id?: number;
  initBalance?: number;
  isentry?: string | boolean;
  spanDay?: number;
  subjectId?: number;
  subjectName?: string;
  tempFlag?: boolean;
  yearDfAccumulate?: number;
  yearJfAccumulate?: number;
  [k: string]: unknown;
}

/**
 * 好业财应收统计表同步 — 铁律:只读好业财(HTTP GET),写 PG chanjet_ar_snapshot
 */
@Injectable()
export class ChanjetArSyncService {
  private readonly log = new Logger('ChanjetArSync');

  constructor(
    private readonly chanjet: ChanjetAuthService,
    @InjectRepository(ChanjetArSnapshotEntity)
    private readonly arRepo: Repository<ChanjetArSnapshotEntity>,
  ) {}

  /**
   * 同步指定账套+期间的应收统计表到 PG。
   * @param bookid YYYYMM 账套 ID(tenant.id)
   * @param period YYYYMM 期间
   * @param currency 币种,默认 LAK(好业财老挝账套基础币种)
   */
  async syncArStatistics(bookid: string, period: string, currency = 'LAK'): Promise<{
    bookid: string;
    period: string;
    fetched: number;
    saved: number;
    totalEndbalance: number;
    sampleRows: Array<{ name: string | null; code: string | null; endbalance: number }>;
  }> {
    this.log.log(`同步开始 bookid=${bookid} period=${period}`);

    // 只读好业财
    const resp = await this.chanjet.callApi(`/accounting/gl/statistics/receive/${bookid}`, {
      method: 'GET',
      query: { period },
    }) as unknown;

    const rows = Array.isArray(resp) ? (resp as ChanjetArRow[]) : [];
    if (!rows.length) {
      const err = resp as Record<string, unknown> | undefined;
      this.log.warn(`好业财返回空或错误: ${JSON.stringify(err).slice(0, 200)}`);
      return { bookid, period, fetched: 0, saved: 0, totalEndbalance: 0, sampleRows: [] };
    }

    // 写 PG(upsert by uq_chanjet_ar)
    let saved = 0;
    for (const r of rows) {
      const entity: Partial<ChanjetArSnapshotEntity> = {
        bookid,
        period,
        assistantCustomerCode: r.assistantCustomerCode ?? null,
        assistantCustomerId: r.assistantCustomer ? String(r.assistantCustomer) : null,
        subjectId: r.subjectId ? String(r.subjectId) : null,
        subjectName: r.subjectName ?? null,
        initBalance: String(r.initBalance ?? 0),
        currentPeriodJf: String(r.currentPeriodJfBalance ?? 0),
        currentPeriodDf: String(r.currentPeriodDfBalance ?? 0),
        endbalance: String(r.endbalance ?? 0),
        yearJfAccumulate: String(r.yearJfAccumulate ?? 0),
        yearDfAccumulate: String(r.yearDfAccumulate ?? 0),
        currency,
        rawData: r as Record<string, unknown>,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.arRepo.upsert(entity as any, {
        conflictPaths: ['bookid', 'period', 'assistantCustomerCode', 'subjectId'],
        skipUpdateIfNoValuesChanged: false,
      });
      saved++;
    }

    const totalEndbalance = rows.reduce((s, r) => s + Number(r.endbalance ?? 0), 0);
    const sampleRows = rows.slice(0, 5).map(r => ({
      name: r.subjectName ?? null,
      code: r.assistantCustomerCode ?? null,
      endbalance: Number(r.endbalance ?? 0),
    }));

    this.log.log(`同步完成 fetched=${rows.length} saved=${saved} total=${totalEndbalance.toFixed(2)} ${currency}`);
    return { bookid, period, fetched: rows.length, saved, totalEndbalance, sampleRows };
  }

  /** 查 PG 快照(只读) */
  async queryArSnapshot(bookid: string, period: string): Promise<ChanjetArSnapshotEntity[]> {
    return this.arRepo.find({
      where: { bookid, period },
      order: { endbalance: 'DESC' },
    });
  }
}
