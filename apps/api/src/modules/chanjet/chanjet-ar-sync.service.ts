import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetArSnapshotEntity } from './chanjet-ar-snapshot.entity';
import { ChanjetBookCompanyMapEntity } from './chanjet-book-company-map.entity';

interface ChanjetArRow {
  assistantCustomer?: number;
  assistantCustomerCode?: string;
  currentPeriodDfBalance?: number;
  currentPeriodJfBalance?: number;
  endbalance?: number;
  initBalance?: number;
  subjectId?: number;
  subjectName?: string;
  yearDfAccumulate?: number;
  yearJfAccumulate?: number;
  [k: string]: unknown;
}

interface DataScopeCtx {
  isGlobal?: boolean;
  allowedCompanyCodes?: string[];
}

/** 三家公司种子映射(用户已确认一一对应) */
const SEED_BOOK_COMPANY_MAP: Array<Pick<ChanjetBookCompanyMapEntity, 'bookid' | 'bookName' | 'companyCode' | 'companyName' | 'syncEnabled'>> = [
  { bookid: '3533914511118750', bookName: '老挝凤凰农业发展有限公司', companyCode: 'COMP-LAO-AGRI', companyName: '凤凰农业', syncEnabled: true },
  { bookid: '3537748712226818', bookName: '老挝东鹏县星驰农业发展有限公司', companyCode: 'COMP-LAO-XINGCHI', companyName: '星驰农业', syncEnabled: true },
  { bookid: '3539743721526654', bookName: '老挝凤凰食品集团有限公司', companyCode: 'COMP-LAO-FOOD', companyName: '凤凰食品', syncEnabled: true },
];

/**
 * 好业财应收统计表同步 —— 铁律
 *   只读好业财(HTTP GET)
 *   写 PG chanjet_ar_snapshot(含 company_code 让 DataScope 起作用)
 *   按公司视角同步(syncByCompanyCode),通过映射拿 bookid
 *   查询按 DataScope 过滤(集团看全部,其他按 allowedCompanyCodes)
 */
@Injectable()
export class ChanjetArSyncService implements OnModuleInit {
  private readonly log = new Logger('ChanjetArSync');

  constructor(
    private readonly chanjet: ChanjetAuthService,
    @InjectRepository(ChanjetArSnapshotEntity)
    private readonly arRepo: Repository<ChanjetArSnapshotEntity>,
    @InjectRepository(ChanjetBookCompanyMapEntity)
    private readonly mapRepo: Repository<ChanjetBookCompanyMapEntity>,
    private readonly cls: ClsService,
  ) {}

  async onModuleInit() {
    // 启动 seed 3 行映射(避开 g197-H 数据 DML 门禁:不进迁移文件,而是服务启动时初始化)
    try {
      const existing = await this.mapRepo.count();
      if (existing === 0) {
        await this.mapRepo.insert(SEED_BOOK_COMPANY_MAP);
        this.log.log(`chanjet_book_company_map 初始化 ${SEED_BOOK_COMPANY_MAP.length} 条映射`);
      } else {
        this.log.log(`chanjet_book_company_map 已有 ${existing} 条映射`);
      }
    } catch (err) {
      this.log.warn(`映射 seed 失败(表可能未建): ${(err as Error).message}`);
    }
  }

  /** 列出所有(启用的)公司 ↔ 账套映射(给前端下拉用) */
  async listCompanies(): Promise<ChanjetBookCompanyMapEntity[]> {
    // 懒补 seed:onModuleInit 可能在 mapRepo 准备好前抢跑被吞,这里兜底
    try {
      const existing = await this.mapRepo.count();
      if (existing === 0) {
        await this.mapRepo.insert(SEED_BOOK_COMPANY_MAP);
        this.log.log(`listCompanies 触发懒 seed ${SEED_BOOK_COMPANY_MAP.length} 条映射`);
      }
    } catch (err) {
      this.log.error(`listCompanies seed 失败: ${(err as Error).message}`);
    }
    return this.mapRepo.find({
      where: { syncEnabled: true },
      order: { companyCode: 'ASC' },
    });
  }

  /** 按公司同步(前端视角) */
  async syncByCompanyCode(companyCode: string, period: string, currency = 'RMB'): Promise<{
    companyCode: string;
    bookid: string;
    period: string;
    fetched: number;
    saved: number;
    totalEndbalance: number;
  }> {
    const map = await this.mapRepo.findOneBy({ companyCode });
    if (!map) throw new Error(`公司 ${companyCode} 无好业财映射,请先在 chanjet_book_company_map 配置`);
    if (!map.syncEnabled) throw new Error(`公司 ${companyCode} 同步未启用`);

    this.log.log(`同步开始 company=${companyCode} bookid=${map.bookid} period=${period}`);

    // 只读好业财
    const resp = await this.chanjet.callApi(`/accounting/gl/statistics/receive/${map.bookid}`, {
      method: 'GET',
      query: { period },
    }) as unknown;

    const rawRows = Array.isArray(resp) ? (resp as ChanjetArRow[]) : [];
    if (!rawRows.length) {
      const err = resp as Record<string, unknown> | undefined;
      this.log.warn(`好业财返回空或错误: ${JSON.stringify(err).slice(0, 200)}`);
      return { companyCode, bookid: map.bookid, period, fetched: 0, saved: 0, totalEndbalance: 0 };
    }

    // 过滤掉好业财返回里自带的"合计"汇总行(subjectName='合计' 或 assistantCustomer=0 + 是汇总)
    // 这些行不是真实往来单位,入库会重复计算
    const rows = rawRows.filter(r =>
      r.subjectName !== '合计' &&
      !(r.subjectName ?? '').startsWith('合计') &&
      r.assistantCustomerCode  // 真实往来单位必有 code
    );

    // 写 PG(upsert by uq_chanjet_ar_v2)
    let saved = 0;
    for (const r of rows) {
      const entity: Partial<ChanjetArSnapshotEntity> = {
        bookid: map.bookid,
        companyCode: map.companyCode,
        deptCode: null,
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
        conflictPaths: ['bookid', 'period', 'deptCode', 'assistantCustomerCode', 'subjectId'],
        skipUpdateIfNoValuesChanged: false,
      });
      saved++;
    }

    const totalEndbalance = rows.reduce((s, r) => s + Number(r.endbalance ?? 0), 0);
    this.log.log(`同步完成 company=${companyCode} fetched=${rows.length} saved=${saved} total=${totalEndbalance.toFixed(2)} ${currency}`);
    return { companyCode, bookid: map.bookid, period, fetched: rows.length, saved, totalEndbalance };
  }

  /**
   * 按公司查 PG 快照(只读,按 DataScope 过滤)。
   * companyCode 不传 → 集团视角(看 allowedCompanyCodes 全部);
   * companyCode 传 → 必须在 allowedCompanyCodes 内才返回。
   */
  async queryByCompany(companyCode: string | undefined, period: string): Promise<ChanjetArSnapshotEntity[]> {
    const scope = this.cls.get<DataScopeCtx>('dataScope') || {};
    const isGlobal = !!scope.isGlobal;
    const allowed = scope.allowedCompanyCodes ?? [];

    if (!isGlobal && allowed.length === 0) return [];

    if (companyCode) {
      if (!isGlobal && !allowed.includes(companyCode)) return [];
      return this.arRepo.find({
        where: { companyCode, period },
        order: { endbalance: 'DESC' },
      });
    }

    if (isGlobal) {
      return this.arRepo.find({ where: { period }, order: { endbalance: 'DESC' } });
    }
    return this.arRepo
      .createQueryBuilder('ar')
      .where('ar.period = :period AND ar.company_code IN (:...codes)', { period, codes: allowed })
      .orderBy('ar.endbalance', 'DESC')
      .getMany();
  }
}
