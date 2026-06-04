import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * CodeGeneratorService — 统一主数据编码生成（G1 主数据中心）
 * ════════════════════════════════════════════════════════════════════════
 * 依据：docs/master-data-governance-phase-g0-blueprint.md 第 4 章编码规则
 *
 * 原则：
 *   · 编码终身不变，名称可变
 *   · 编码不含可变业务语义（人名拼音/地名/等级/规格）
 *   · 序号用 DB 行级锁原子自增，杜绝时间戳替代序号导致的并发重号
 *
 * 编码格式：{prefix}-{补零序号}
 *   客户 CUS-00001 / 供应商 SUP-00001 / 股东 SHR-001 / 项目 PRJ-001 / 场站 FRM-01 / SKU SKU-0001
 */
@Injectable()
export class CodeGeneratorService {
  private readonly logger = new Logger(CodeGeneratorService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * 生成下一个编码（原子）。使用 UPDATE ... RETURNING 行级锁保证并发安全。
   * @param prefix 编码前缀（须已在 mst_code_seq 注册）
   */
  /**
   * FIX UAT-P0-Phase1 2026-06-04:
   * TypeORM 0.3.x 对 UPDATE/INSERT/DELETE...RETURNING 返回 [rows, affectedCount] 二元组（不是单纯 rows[]）
   * 之前 rows[0] 解出的是 [{...}] 内部数组 → current_no/pad_len 永远 undefined → 编码恒为 "PREFIX-undefined"
   */
  private extractRows(raw: any): any[] {
    if (!raw) return [];
    // [rows, count] 形式
    if (Array.isArray(raw) && raw.length === 2 && Array.isArray(raw[0]) && typeof raw[1] === 'number') {
      return raw[0];
    }
    // 单纯 rows[]
    if (Array.isArray(raw)) return raw;
    return [];
  }

  async next(prefix: string): Promise<string> {
    const p = String(prefix || '').toUpperCase().trim();
    if (!p) throw new Error('编码前缀不能为空');

    // 原子自增：UPDATE...RETURNING 在单条 SQL 内完成读改写，行级锁防并发重号
    const raw = await this.ds.query(
      `UPDATE mst_code_seq
          SET current_no = current_no + 1, updated_at = NOW()
        WHERE prefix = $1
        RETURNING current_no, pad_len`,
      [p],
    );
    const rows = this.extractRows(raw);
    if (rows.length === 0) {
      throw new Error(`编码前缀未注册：${p}（请先在 mst_code_seq 配置）`);
    }
    const { current_no, pad_len } = rows[0];
    const seq = String(current_no).padStart(Number(pad_len) || 5, '0');
    return `${p}-${seq}`;
  }

  /** 批量生成 n 个连续编码（原子） */
  async nextBatch(prefix: string, n: number): Promise<string[]> {
    const p = String(prefix || '').toUpperCase().trim();
    const count = Math.max(1, Math.floor(n));
    const raw = await this.ds.query(
      `UPDATE mst_code_seq
          SET current_no = current_no + $2, updated_at = NOW()
        WHERE prefix = $1
        RETURNING current_no, pad_len`,
      [p, count],
    );
    const rows = this.extractRows(raw);
    if (rows.length === 0) throw new Error(`编码前缀未注册：${p}`);
    const end = Number(rows[0].current_no);
    const padLen = Number(rows[0].pad_len) || 5;
    const out: string[] = [];
    for (let i = end - count + 1; i <= end; i++) {
      out.push(`${p}-${String(i).padStart(padLen, '0')}`);
    }
    return out;
  }
}
