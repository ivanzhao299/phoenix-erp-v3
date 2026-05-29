/**
 * Phoenix ERP V3 — UAT 培训记录 Service
 * Phase E: UAT & Pilot Run Runtime
 *
 * 安全约束：不允许物理删除培训记录
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CreateTrainingDto {
  trainingType:     string;
  trainingTitle:    string;
  trainerName?:     string;
  participantCount?: number;
  trainingDate:     string;   // YYYY-MM-DD
  score?:           number;
  companyCode?:     string;
  remark?:          string;
}

@Injectable()
export class UatTrainingService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async list(params: {
    trainingType?: string;
    companyCode?:  string;
    page?:         number;
    limit?:        number;
  }) {
    const page   = Math.max(1, params.page  ?? 1);
    const limit  = Math.min(200, params.limit ?? 50);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.trainingType) { conditions.push(`training_type = $${idx++}`); values.push(params.trainingType); }
    if (params.companyCode)  { conditions.push(`company_code = $${idx++}`);  values.push(params.companyCode);  }

    const where = conditions.join(' AND ');
    const [rows, countRow] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT id, training_no, training_type, training_title, trainer_name,
                participant_count, training_date, score, company_code, remark, created_at
         FROM uat_training_records WHERE ${where}
         ORDER BY training_date DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      this.ds.query<any[]>(
        `SELECT COUNT(*) AS total FROM uat_training_records WHERE ${where}`,
        values,
      ),
    ]);

    return { items: rows, total: Number(countRow[0]?.total ?? 0), page, limit };
  }

  async create(dto: CreateTrainingDto) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seqRows = await this.ds.query<any[]>(`SELECT nextval('seq_uat_training_no') AS n`);
    const seq     = String(seqRows[0]?.n ?? 1).padStart(4, '0');
    const no      = `TR-${dateStr}-${seq}`;

    const rows = await this.ds.query<any[]>(
      `INSERT INTO uat_training_records
        (training_no, training_type, training_title, trainer_name,
         participant_count, training_date, score, company_code, remark)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, training_no`,
      [
        no,
        dto.trainingType,
        dto.trainingTitle,
        dto.trainerName ?? null,
        dto.participantCount ?? 0,
        dto.trainingDate,
        dto.score ?? null,
        dto.companyCode ?? null,
        dto.remark ?? null,
      ],
    );
    return rows[0];
  }

  /** 按培训类型汇总完成情况 */
  async getSummary(companyCode?: string) {
    const filter = companyCode ? `WHERE company_code = '${companyCode}'` : '';
    const rows = await this.ds.query<any[]>(
      `SELECT
         training_type,
         COUNT(*) AS session_count,
         SUM(participant_count) AS total_participants,
         ROUND(AVG(score), 1) AS avg_score
       FROM uat_training_records ${filter}
       GROUP BY training_type
       ORDER BY training_type`,
    );

    const totalRows = await this.ds.query<any[]>(
      `SELECT COUNT(*) AS total, SUM(participant_count) AS participants
       FROM uat_training_records ${filter}`,
    );

    return {
      byType:    rows,
      total:     Number(totalRows[0]?.total ?? 0),
      totalPart: Number(totalRows[0]?.participants ?? 0),
    };
  }
}
