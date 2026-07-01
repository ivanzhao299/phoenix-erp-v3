/**
 * Phoenix ERP V3 — UAT 验收清单 Service
 * Phase E: UAT & Pilot Run Runtime
 *
 * 安全约束：验收记录保留历史（状态可更新，不可删除）
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface UpdateChecklistDto {
  status:     'NOT_STARTED' | 'PASSED' | 'FAILED' | 'BLOCKED';
  testerId?:  number;
  testerName?: string;
  remark?:   string;
}

@Injectable()
export class UatChecklistService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** 按模块分组返回验收清单 */
  async listGrouped(companyCode?: string) {
    const filter = companyCode ? `AND company_code = $1` : '';
    const values = companyCode ? [companyCode] : [];

    const rows = await this.ds.query<any[]>(
      `SELECT id, module_code, item_name, item_description,
              status, tester_name, tested_at, remark, sort_order
       FROM uat_checklists
       WHERE 1=1 ${filter}
       ORDER BY module_code, sort_order`,
      values,
    );

    // 按模块分组
    const grouped: Record<string, any[]> = {};
    for (const row of rows) {
      if (!grouped[row.module_code]) grouped[row.module_code] = [];
      grouped[row.module_code].push(row);
    }

    // 每组统计
    return Object.entries(grouped).map(([moduleCode, items]) => ({
      moduleCode,
      items,
      total:      items.length,
      passed:     items.filter(i => i.status === 'PASSED').length,
      failed:     items.filter(i => i.status === 'FAILED').length,
      blocked:    items.filter(i => i.status === 'BLOCKED').length,
      notStarted: items.filter(i => i.status === 'NOT_STARTED').length,
      passPct:    items.length > 0
        ? Math.round(items.filter(i => i.status === 'PASSED').length / items.length * 100)
        : 0,
    }));
  }

  /** 平铺列表（用于过滤/搜索） */
  async list(params: {
    moduleCode?:  string;
    status?:      string;
    companyCode?: string;
    page?:        number;
    limit?:       number;
  }) {
    const page   = Math.max(1, params.page  ?? 1);
    const limit  = Math.min(200, params.limit ?? 100);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.moduleCode)  { conditions.push(`module_code = $${idx++}`);  values.push(params.moduleCode);  }
    if (params.status)      { conditions.push(`status = $${idx++}`);       values.push(params.status);      }
    if (params.companyCode) { conditions.push(`company_code = $${idx++}`); values.push(params.companyCode); }

    const where = conditions.join(' AND ');
    const [rows, countRow] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT id, module_code, item_name, item_description,
                status, tester_name, tested_at, remark, sort_order
         FROM uat_checklists WHERE ${where}
         ORDER BY module_code, sort_order
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      this.ds.query<any[]>(
        `SELECT COUNT(*) AS total FROM uat_checklists WHERE ${where}`,
        values,
      ),
    ]);

    return { items: rows, total: Number(countRow[0]?.total ?? 0), page, limit };
  }

  /** 更新单项验收结果 */
  async update(id: number, dto: UpdateChecklistDto) {
    const checklistId = Number(id);
    if (!Number.isSafeInteger(checklistId) || checklistId <= 0) {
      throw new BadRequestException(`无效验收项 ID: ${id}`);
    }

    const rows = await this.ds.query<any[]>(
      `SELECT id FROM uat_checklists WHERE id = $1::bigint`,
      [checklistId],
    );
    if (!rows.length) throw new NotFoundException(`验收项 ${id} 不存在`);

    const valid = ['NOT_STARTED', 'PASSED', 'FAILED', 'BLOCKED'];
    if (!valid.includes(dto.status)) {
      throw new BadRequestException(`无效状态: ${dto.status}`);
    }

    const testerId = Number(dto.testerId);
    const safeTesterId = Number.isSafeInteger(testerId) && testerId > 0 ? testerId : null;
    const testerName = String(dto.testerName ?? '').trim() || null;
    const remark = String(dto.remark ?? '').trim() || null;

    await this.ds.query(
      `WITH payload AS (
         SELECT
           $1::bigint AS checklist_id,
           $2::varchar AS next_status,
           $3::bigint AS tester_id,
           $4::varchar AS tester_name,
           $5::text AS remark
       )
       UPDATE uat_checklists AS c
       SET status      = p.next_status,
           tester_id   = p.tester_id,
           tester_name = p.tester_name,
           tested_at   = CASE
             WHEN p.next_status IN ('PASSED','FAILED','BLOCKED') THEN NOW()
             WHEN p.next_status = 'NOT_STARTED' THEN NULL
             ELSE c.tested_at
           END,
           remark      = p.remark
       FROM payload AS p
       WHERE c.id = p.checklist_id`,
      [checklistId, dto.status, safeTesterId, testerName, remark],
    );
    return this.ds.query<any[]>(`SELECT * FROM uat_checklists WHERE id = $1::bigint`, [checklistId]).then(r => r[0]);
  }

  /** 整体验收进度统计（按模块） */
  async getProgress(companyCode?: string) {
    const filter = companyCode ? `WHERE company_code = $1` : '';
    const values = companyCode ? [companyCode] : [];

    const rows = await this.ds.query<any[]>(
      `SELECT
         module_code,
         COUNT(*)                                          AS total,
         COUNT(*) FILTER (WHERE status = 'PASSED')        AS passed,
         COUNT(*) FILTER (WHERE status = 'FAILED')        AS failed,
         COUNT(*) FILTER (WHERE status = 'BLOCKED')       AS blocked,
         COUNT(*) FILTER (WHERE status = 'NOT_STARTED')   AS not_started
       FROM uat_checklists ${filter}
       GROUP BY module_code
       ORDER BY module_code`,
      values,
    );

    return rows.map(r => ({
      ...r,
      total:      Number(r.total),
      passed:     Number(r.passed),
      failed:     Number(r.failed),
      blocked:    Number(r.blocked),
      notStarted: Number(r.not_started),
      passPct:    Number(r.total) > 0
        ? Math.round(Number(r.passed) / Number(r.total) * 100)
        : 0,
    }));
  }
}
