import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

/**
 * Farm Egg — 集蛋记录（只读）
 * ────────────────────────────────────────────────────────────────────────
 * R1（删除重复库存体系）：Farm Egg 不再作为库存系统。
 *   · 已删除：onModuleInit 创建 EGG-STOCK-* 批次、inbound/outbound/writeOff 写库存逻辑。
 *   · 仅保留：getStock / getLedger 只读查询（历史集蛋记录/流水，供台账查看）。
 *   · 库存来源唯一由 InventorySourceMode 控制：TEMP_PRODUCTION_INBOUND / PACKAGING_INBOUND。
 *   · 销售扣减统一走 Sales V2 Inventory Runtime（EggInventoryService FIFO）/ Store POS。
 * 依据：docs/production-runtime-rebuild-phase-r1-delete-duplicate-inventory.md
 */

export interface EggStockRow {
  grade: string;
  name: string;
  qty: number;        // 当前库存（枚）
  trays: number;      // 提数（÷180）
}

export interface EggLedgerEntry {
  id: number;
  log_date: string;
  change_type: string;
  grade: string;
  qty_change: number;
  house_code: string | null;
  customer_no: string | null;
  note: string | null;
  operator: string;
  created_at: string;
}

@Injectable()
export class FarmEggService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private get companyScope(): { global: boolean; codes: string[] } {
    const scope = this.cls.get('dataScope') as { isGlobal?: boolean; allowedCompanyCodes?: string[] } | undefined;
    return { global: !!scope?.isGlobal, codes: scope?.allowedCompanyCodes ?? [] };
  }

  /** 当前库存快照：读取 Sales V2 / WMS 唯一库存台账 inv_batches。 */
  async getStock(): Promise<EggStockRow[]> {
    const scope = this.companyScope;
    const rows = await this.ds.query<any[]>(
      `SELECT g.grade_code AS grade, g.grade_name AS name,
              COALESCE(SUM(CASE WHEN b.status = 'AVAILABLE' THEN b.qty_available ELSE 0 END), 0)::numeric AS qty
         FROM product_grades g
         LEFT JOIN inv_batches b
          ON COALESCE(b.grade_code_std, b.quality_grade) = g.grade_code
          AND b.product_code LIKE 'PRD-EGG-%'
          AND ($1::boolean OR b.company_code = ANY($2::text[]))
        WHERE g.status = 'ACTIVE'
        GROUP BY g.grade_code, g.grade_name, g.sort_order
        ORDER BY g.sort_order, g.grade_code`,
      [scope.global, scope.codes],
    );
    return rows.map(r => {
      const qty = Number(r.qty || 0);
      return { grade: r.grade, name: r.name || r.grade, qty, trays: Math.floor(qty / 180) };
    });
  }

  /** 按日期范围查询统一鸡蛋库存流水。 */
  async getLedger(startDate: string, endDate: string): Promise<EggLedgerEntry[]> {
    const scope = this.companyScope;
    return this.ds.query<EggLedgerEntry[]>(
      `SELECT l.id, COALESCE(l.log_date, l.created_at::date)::text AS log_date,
              l.change_type, COALESCE(b.grade_code_std, b.quality_grade, l.quality_grade) AS grade,
              l.qty_change, l.house_code, h.house_name,
              g.grade_name, g.grade_name_en, g.grade_name_lo,
              l.customer_no, l.note, l.operator,
              l.created_at::text
       FROM inv_ledger l
       JOIN inv_batches b ON b.batch_no = l.batch_no
       LEFT JOIN brd_houses h ON h.house_code = l.house_code
       LEFT JOIN product_grades g
         ON g.grade_code = COALESCE(b.grade_code_std, b.quality_grade, l.quality_grade)
       WHERE b.product_code LIKE 'PRD-EGG-%'
         AND COALESCE(l.log_date, b.egg_date, l.created_at::date) BETWEEN $1 AND $2
         AND ($3::boolean OR b.company_code = ANY($4::text[]))
       ORDER BY l.created_at DESC, l.id DESC`,
      [startDate, endDate, scope.global, scope.codes],
    );
  }
}
