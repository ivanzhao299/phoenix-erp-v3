/**
 * Phoenix ERP V3 — UAT 问题反馈 Service
 * Phase E: UAT & Pilot Run Runtime
 *
 * 安全约束：
 *   - 不允许物理删除（REJECTED / CLOSED 为终态）
 *   - 支持 company_code DataScope
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CreateFeedbackDto {
  title:         string;
  description?:  string;
  moduleCode?:   string;
  companyCode?:  string;
  feedbackType?: string;
  severity?:     string;
  reporterId?:   number;
  reporterName?: string;
  screenshotUrls?: string[];
}

export interface UpdateFeedbackDto {
  title?:        string;
  description?:  string;
  feedbackType?: string;
  severity?:     string;
  status?:       string;
  assigneeId?:   number;
  assigneeName?: string;
  resolution?:   string;
}

const VALID_STATUSES = ['OPEN','IN_PROGRESS','RESOLVED','CLOSED','REJECTED'] as const;

@Injectable()
export class UatFeedbackService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** 分页查询问题反馈 */
  async list(params: {
    status?:      string;
    severity?:    string;
    moduleCode?:  string;
    companyCode?: string;
    page?:        number;
    limit?:       number;
  }) {
    const page   = Math.max(1, params.page  ?? 1);
    const limit  = Math.min(200, params.limit ?? 50);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.status)      { conditions.push(`status = $${idx++}`);       values.push(params.status);     }
    if (params.severity)    { conditions.push(`severity = $${idx++}`);     values.push(params.severity);   }
    if (params.moduleCode)  { conditions.push(`module_code = $${idx++}`);  values.push(params.moduleCode); }
    if (params.companyCode) { conditions.push(`company_code = $${idx++}`); values.push(params.companyCode);}

    const where = conditions.join(' AND ');
    const [rows, countRow] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT id, feedback_no, title, module_code, company_code,
                feedback_type, severity, status,
                reporter_id, reporter_name, assignee_name,
                created_at, updated_at
         FROM uat_feedbacks WHERE ${where}
         ORDER BY
           CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
           created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      this.ds.query<any[]>(
        `SELECT COUNT(*) AS total FROM uat_feedbacks WHERE ${where}`,
        values,
      ),
    ]);

    return { items: rows, total: Number(countRow[0]?.total ?? 0), page, limit };
  }

  /** 获取单条问题详情 */
  async getOne(id: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT * FROM uat_feedbacks WHERE id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException(`问题反馈 ${id} 不存在`);
    return rows[0];
  }

  /** 创建问题反馈 */
  async create(dto: CreateFeedbackDto, userId?: number, username?: string) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seqRows = await this.ds.query<any[]>(`SELECT nextval('seq_uat_feedback_no') AS n`);
    const seq     = String(seqRows[0]?.n ?? 1).padStart(6, '0');
    const no      = `FB-${dateStr}-${seq}`;

    const rows = await this.ds.query<any[]>(
      `INSERT INTO uat_feedbacks
        (feedback_no, title, description, module_code, company_code,
         feedback_type, severity, status, reporter_id, reporter_name, screenshot_urls)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',$8,$9,$10)
       RETURNING id, feedback_no`,
      [
        no,
        dto.title,
        dto.description ?? null,
        dto.moduleCode ?? null,
        dto.companyCode ?? null,
        dto.feedbackType ?? 'BUG',
        dto.severity ?? 'MEDIUM',
        dto.reporterId ?? userId ?? null,
        dto.reporterName ?? username ?? null,
        dto.screenshotUrls ? JSON.stringify(dto.screenshotUrls) : null,
      ],
    );
    return rows[0];
  }

  /** 更新问题反馈（状态流转/指派/解决） */
  async update(id: number, dto: UpdateFeedbackDto) {
    const existing = await this.getOne(id);
    if (['CLOSED','REJECTED'].includes(existing.status)) {
      throw new BadRequestException(`问题 ${existing.feedback_no} 已终结，不可修改`);
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let idx = 1;

    if (dto.title        !== undefined) { setClauses.push(`title = $${idx++}`);         values.push(dto.title); }
    if (dto.description  !== undefined) { setClauses.push(`description = $${idx++}`);   values.push(dto.description); }
    if (dto.feedbackType !== undefined) { setClauses.push(`feedback_type = $${idx++}`); values.push(dto.feedbackType); }
    if (dto.severity     !== undefined) { setClauses.push(`severity = $${idx++}`);      values.push(dto.severity); }
    if (dto.status       !== undefined) {
      if (!(VALID_STATUSES as readonly string[]).includes(dto.status)) {
        throw new BadRequestException(`无效状态: ${dto.status}`);
      }
      setClauses.push(`status = $${idx++}`);
      values.push(dto.status);
    }
    if (dto.assigneeId   !== undefined) { setClauses.push(`assignee_id = $${idx++}`);   values.push(dto.assigneeId); }
    if (dto.assigneeName !== undefined) { setClauses.push(`assignee_name = $${idx++}`); values.push(dto.assigneeName); }
    if (dto.resolution   !== undefined) { setClauses.push(`resolution = $${idx++}`);    values.push(dto.resolution); }

    values.push(id);
    await this.ds.query(
      `UPDATE uat_feedbacks SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values,
    );
    return this.getOne(id);
  }

  /** 统计摘要（用于 Dashboard） */
  async getSummary(companyCode?: string) {
    const filter = companyCode ? `AND company_code = '${companyCode}'` : '';
    const rows = await this.ds.query<any[]>(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','REJECTED','RESOLVED')) AS open_count,
         COUNT(*) FILTER (WHERE severity = 'CRITICAL' AND status NOT IN ('CLOSED','REJECTED','RESOLVED')) AS critical_count,
         COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved_count,
         COUNT(*) AS total
       FROM uat_feedbacks WHERE 1=1 ${filter}`,
    );
    return rows[0];
  }
}
