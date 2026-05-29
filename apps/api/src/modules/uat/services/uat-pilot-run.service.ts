/**
 * Phoenix ERP V3 — UAT 试运行记录 Service
 * Phase E: UAT & Pilot Run Runtime
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CreatePilotRunDto {
  companyCode?:   string;
  siteName:       string;
  runStartDate:   string;   // YYYY-MM-DD
  runEndDate?:    string;
  remark?:        string;
}

export interface UpdatePilotRunDto {
  status?:        string;
  runEndDate?:    string;
  orderCount?:    number;
  deliveryCount?: number;
  receiptCount?:  number;
  returnCount?:   number;
  issueCount?:    number;
  remark?:        string;
}

const VALID_STATUSES = ['PLANNED','RUNNING','COMPLETED','FAILED'] as const;

@Injectable()
export class UatPilotRunService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async list(params: {
    status?:      string;
    companyCode?: string;
    page?:        number;
    limit?:       number;
  }) {
    const page   = Math.max(1, params.page  ?? 1);
    const limit  = Math.min(100, params.limit ?? 20);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.status)      { conditions.push(`status = $${idx++}`);       values.push(params.status);      }
    if (params.companyCode) { conditions.push(`company_code = $${idx++}`); values.push(params.companyCode); }

    const where = conditions.join(' AND ');
    const [rows, countRow] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT id, run_no, company_code, site_name,
                run_start_date, run_end_date, status,
                order_count, delivery_count, receipt_count,
                return_count, issue_count, remark, created_at
         FROM uat_pilot_runs WHERE ${where}
         ORDER BY run_start_date DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      this.ds.query<any[]>(
        `SELECT COUNT(*) AS total FROM uat_pilot_runs WHERE ${where}`,
        values,
      ),
    ]);

    return { items: rows, total: Number(countRow[0]?.total ?? 0), page, limit };
  }

  async getOne(id: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT * FROM uat_pilot_runs WHERE id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException(`试运行 ${id} 不存在`);
    return rows[0];
  }

  async create(dto: CreatePilotRunDto) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seqRows = await this.ds.query<any[]>(`SELECT nextval('seq_uat_pilot_no') AS n`);
    const seq     = String(seqRows[0]?.n ?? 1).padStart(4, '0');
    const no      = `PR-${dateStr}-${seq}`;

    const rows = await this.ds.query<any[]>(
      `INSERT INTO uat_pilot_runs
        (run_no, company_code, site_name, run_start_date, run_end_date, status, remark)
       VALUES ($1,$2,$3,$4,$5,'PLANNED',$6)
       RETURNING id, run_no`,
      [
        no,
        dto.companyCode ?? null,
        dto.siteName,
        dto.runStartDate,
        dto.runEndDate ?? null,
        dto.remark ?? null,
      ],
    );
    return rows[0];
  }

  async update(id: number, dto: UpdatePilotRunDto) {
    await this.getOne(id);

    if (dto.status && !(VALID_STATUSES as readonly string[]).includes(dto.status)) {
      throw new BadRequestException(`无效状态: ${dto.status}`);
    }

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.status        !== undefined) { setClauses.push(`status = $${idx++}`);         values.push(dto.status);        }
    if (dto.runEndDate    !== undefined) { setClauses.push(`run_end_date = $${idx++}`);    values.push(dto.runEndDate);    }
    if (dto.orderCount    !== undefined) { setClauses.push(`order_count = $${idx++}`);     values.push(dto.orderCount);    }
    if (dto.deliveryCount !== undefined) { setClauses.push(`delivery_count = $${idx++}`);  values.push(dto.deliveryCount); }
    if (dto.receiptCount  !== undefined) { setClauses.push(`receipt_count = $${idx++}`);   values.push(dto.receiptCount);  }
    if (dto.returnCount   !== undefined) { setClauses.push(`return_count = $${idx++}`);    values.push(dto.returnCount);   }
    if (dto.issueCount    !== undefined) { setClauses.push(`issue_count = $${idx++}`);     values.push(dto.issueCount);    }
    if (dto.remark        !== undefined) { setClauses.push(`remark = $${idx++}`);          values.push(dto.remark);        }

    if (!setClauses.length) return this.getOne(id);

    values.push(id);
    await this.ds.query(
      `UPDATE uat_pilot_runs SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values,
    );
    return this.getOne(id);
  }

  /** 试运行汇总统计（用于 Dashboard） */
  async getSummary() {
    const rows = await this.ds.query<any[]>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'RUNNING')   AS running_count,
         COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
         COUNT(*) FILTER (WHERE status = 'PLANNED')   AS planned_count,
         COUNT(*) FILTER (WHERE status = 'FAILED')    AS failed_count,
         SUM(order_count)    AS total_orders,
         SUM(delivery_count) AS total_deliveries,
         SUM(issue_count)    AS total_issues
       FROM uat_pilot_runs`,
    );
    return rows[0];
  }
}
