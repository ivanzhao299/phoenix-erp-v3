/**
 * Phoenix ERP V3 — Store POS Shift Service
 * Sales V2 Phase 9: 门店日结 / 交班
 *
 * 约束：
 *   - 日结后不可修改（status=CLOSED 后销售单不可关联）
 *   - 每个门店同时只能有一个 OPEN 班次
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { StoreScopePolicy } from './store-scope-policy.service';

export interface OpenShiftDto {
  storeCode:    string;
  companyCode:  string;
  openingCash:  number;
}

export interface CloseShiftDto {
  closingCash:  number;
  remark?:      string;
}

@Injectable()
export class StorePosShiftService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly storeScope: StoreScopePolicy,
  ) {}

  private get currentUser() {
    try { return this.cls.get('user') as any ?? {}; } catch { return {}; }
  }

  private async genClosingNo(queryable: Pick<DataSource, 'query'> = this.ds): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [r] = await queryable.query(`SELECT nextval('seq_store_closing_no') AS n`);
    return `SHIFT-${dateStr}-${String(r.n).padStart(4, '0')}`;
  }

  /** 开班 */
  async openShift(dto: OpenShiftDto) {
    const context = await this.storeScope.resolve(dto.storeCode, 'SALES');
    if (dto.companyCode && dto.companyCode !== context.companyCode) throw new BadRequestException('门店与公司不匹配');
    dto = { ...dto, storeCode: context.storeCode, companyCode: context.companyCode };
    const user = this.currentUser;
    try {
      return await this.ds.transaction(async mgr => {
        await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`store-shift:${dto.storeCode}`]);
        const [existing] = await mgr.query(
          `SELECT id FROM sal_store_shift_closings WHERE store_code=$1 AND status='OPEN' FOR UPDATE`,
          [dto.storeCode],
        );
        if (existing) throw new BadRequestException(`门店 ${dto.storeCode} 已有未关班的班次，请先完成交班`);
        const closingNo = await this.genClosingNo(mgr);
        const [row] = await mgr.query(
          `INSERT INTO sal_store_shift_closings
            (closing_no, store_code, company_code, opening_cash, status, operator_id, operator_name)
           VALUES ($1,$2,$3,$4,'OPEN',$5,$6) RETURNING id, closing_no`,
          [closingNo,dto.storeCode,dto.companyCode,dto.openingCash,
           user?.userId ?? user?.id ?? null,user?.name ?? user?.username ?? null],
        );
        return row;
      });
    } catch (error: any) {
      if (error?.code === '23505') throw new BadRequestException(`门店 ${dto.storeCode} 已有未关班的班次，请先完成交班`);
      throw error;
    }
  }

  /** 获取当前班次（OPEN）*/
  async getCurrentShift(storeCode: string) {
    const context = await this.storeScope.resolve(storeCode, 'SALES');
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM sal_store_shift_closings WHERE store_code=$1 AND company_code=$2 AND status='OPEN' ORDER BY opened_at DESC LIMIT 1`,
      [context.storeCode, context.companyCode],
    );
    return row ?? null;
  }

  /** 交班/日结 */
  async closeShift(storeCode: string, dto: CloseShiftDto) {
    const context = await this.storeScope.resolve(storeCode, 'SALES');
    const shift = await this.getCurrentShift(context.storeCode);
    if (!shift) {
      throw new BadRequestException(`门店 ${storeCode} 当前无开放班次`);
    }

    // 统计本班销售数据
    const [stats] = await this.ds.query<any[]>(
      `SELECT
         COUNT(*) FILTER (WHERE status='COMPLETED') AS sale_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status='COMPLETED'),0) AS total_sales,
         COALESCE(SUM(paid_amount) FILTER (WHERE status='COMPLETED' AND sale_type IN ('CASH','MIXED')),0) AS cash_sales,
         COALESCE(SUM(total_amount) FILTER (WHERE status='COMPLETED' AND sale_type='CREDIT'),0) AS credit_sales
       FROM sal_store_sales
       WHERE store_code=$1
         AND created_at >= $2
         AND status != 'VOID'`,
      [context.storeCode, shift.opened_at],
    );

    const systemCash = Number(shift.opening_cash) + Number(stats.cash_sales);
    const diff       = dto.closingCash - systemCash;

    await this.ds.query(
      `UPDATE sal_store_shift_closings
       SET status = 'CLOSED',
           closed_at = NOW(),
           closing_cash = $2,
           system_cash = $3,
           difference_amount = $4,
           total_sales = $5,
           cash_sales = $6,
           credit_sales = $7,
           sale_count = $8,
           remark = $9
       WHERE id = $1`,
      [
        shift.id,
        dto.closingCash,
        systemCash,
        diff,
        stats.total_sales,
        stats.cash_sales,
        stats.credit_sales,
        stats.sale_count,
        dto.remark ?? null,
      ],
    );

    // 将本班销售单关联到班次
    await this.ds.query(
      `UPDATE sal_store_sales
       SET shift_closing_id = $1
       WHERE store_code=$2 AND created_at >= $3 AND status != 'VOID'`,
      [shift.id, context.storeCode, shift.opened_at],
    );

    const [closed] = await this.ds.query<any[]>(
      `SELECT * FROM sal_store_shift_closings WHERE id=$1`,
      [shift.id],
    );

    return closed;
  }

  /** 历史班次列表 */
  async listShifts(params: {
    storeCode?:   string;
    companyCode?: string;
    status?:      string;
    page?:        number;
    limit?:       number;
  }) {
    const context = await this.storeScope.resolve(params.storeCode, 'SALES');
    params.storeCode = context.storeCode;
    if (params.companyCode && params.companyCode !== context.companyCode) throw new BadRequestException('门店与公司不匹配');
    params.companyCode = context.companyCode;
    const page   = Math.max(1, params.page  ?? 1);
    const limit  = Math.min(100, params.limit ?? 20);
    const offset = (page - 1) * limit;

    const conds: string[] = ['1=1'];
    const vals:  any[]    = [];
    let idx = 1;

    if (params.storeCode)   { conds.push(`store_code = $${idx++}`);   vals.push(params.storeCode);   }
    if (params.companyCode) { conds.push(`company_code = $${idx++}`); vals.push(params.companyCode); }
    if (params.status)      { conds.push(`status = $${idx++}`);       vals.push(params.status);      }

    const where = conds.join(' AND ');
    const [rows, countRow] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT * FROM sal_store_shift_closings WHERE ${where}
         ORDER BY opened_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...vals, limit, offset],
      ),
      this.ds.query<any[]>(
        `SELECT COUNT(*) AS total FROM sal_store_shift_closings WHERE ${where}`,
        vals,
      ),
    ]);

    return { items: rows, total: Number(countRow[0]?.total ?? 0), page, limit };
  }
}
