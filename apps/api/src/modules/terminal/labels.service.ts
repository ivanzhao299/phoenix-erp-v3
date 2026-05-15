import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * LabelsService — V3 标签模块业务服务
 * 写入 lbl_records 标签打印审计表（V2 历史结构，DDL 08 仅做幂等补列）
 * 关键列：operator(text 用户名) + printed_by(BIGINT FK) 二者并存
 */
@Injectable()
export class LabelsService {
  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
  ) {}

  // ─── 写入打印审计 ───────────────────────────────────────────
  async recordPrint(body: any, userId: number) {
    try {
      const row = await this.em.query(
        `INSERT INTO lbl_records (
           code, label_type, grade_code, grade_name, pack_name, batch_no,
           produce_date, expiry_date, price,
           show_price, show_expiry, qty_printed,
           label_w, label_h, desc_text, operator, printed_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id, created_at`,
        [
          body.code || null,
          body.label_type || 'pkg',
          body.grade_code || null,
          body.grade_name || null,
          body.pack_name || null,
          body.batch_no || null,
          body.produce_date || null,
          body.expiry_date || null,
          body.price ?? null,
          body.show_price ? 1 : 0,
          body.show_expiry === 0 ? 0 : 1,
          Math.max(1, Number(body.qty_printed) || 1),
          body.label_w ? Number(body.label_w) : null,
          body.label_h ? Number(body.label_h) : null,
          body.desc_text || null,
          body.operator || null,
          userId || null,
        ],
      );
      return { code: 200, data: row[0], msg: 'label record saved' };
    } catch (e: any) {
      return { code: 500, msg: e?.message || 'record failed' };
    }
  }

  // ─── 按批次查打印历史 ──────────────────────────────────────
  async listByBatch(batchNo: string) {
    const rows = await this.em.query(
      `SELECT r.id, r.code, r.label_type, r.grade_code, r.grade_name,
              r.pack_name, r.batch_no, r.produce_date, r.expiry_date,
              r.price, r.qty_printed, r.label_w, r.label_h,
              r.desc_text, r.operator, r.printed_by, r.created_at,
              u.real_name AS printed_by_name
       FROM lbl_records r
       LEFT JOIN sys_user u ON u.user_id = r.printed_by
       WHERE r.batch_no = $1
       ORDER BY r.created_at DESC
       LIMIT 200`,
      [batchNo],
    );
    return { code: 200, data: rows };
  }
}
