import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { FinShareholderContributionEntity } from '../entities/fin-shareholder-contribution.entity';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import {
  CreateShareholderContributionDto,
  UpdateShareholderContributionDto,
  QueryShareholderContributionDto,
  ConfirmShareholderContributionDto,
  CancelShareholderContributionDto,
} from '../dto/shareholder.dto';

@Injectable()
export class ShareholderContributionsService {
  constructor(
    @InjectRepository(FinShareholderContributionEntity)
    private readonly repo: Repository<FinShareholderContributionEntity>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  // ── 内部辅助 ─────────────────────────────────────────────────────────────

  private currentUser(): any {
    return this.cls.get('user') as any;
  }

  private username(): string | null {
    const u = this.currentUser();
    return u?.username ?? u?.userId ?? null;
  }

  private assertOwnership(companyCode: string, user: any) {
    if (user?.dataScope?.scopeAll) return;
    const codes: string[] = user?.dataScope?.companyCodes ?? [];
    if (!codes.includes(companyCode)) {
      throw new ForbiddenException(`无权访问公司 ${companyCode} 的股东出资记录`);
    }
  }

  // 制单/审核分离（SoD）：禁止确认自己创建的记录——必须由他人复核确认。
  // 即使一人同时握有建单(:C)+确认(:E)权限，自己建的单也得换个人确认，杜绝自建自批。
  private assertNotSelfApproval(createdBy: string | null, action: string) {
    const me = this.username();
    if (me && createdBy && String(createdBy) === String(me)) {
      throw new ForbiddenException(
        `不能${action}自己创建的股东出资记录——制单与审核须分离，请由他人复核确认`,
      );
    }
  }

  private userCompanyCodes(user: any): string[] | null {
    if (user?.dataScope?.scopeAll) return null;
    return user?.dataScope?.companyCodes ?? [];
  }

  // ── 编号生成 ─────────────────────────────────────────────────────────────

  private async genContributionNo(qr: QueryRunner): Promise<string> {
    const now = new Date();
    const prefix = `SHC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    await qr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
    const row = await qr.query(
      `SELECT MAX(contribution_no) AS max FROM fin_shareholder_contributions WHERE contribution_no LIKE $1`,
      [`${prefix}%`],
    );
    let seq = 1;
    const max: string | null = row[0]?.max ?? null;
    if (max) {
      const last = parseInt(max.slice(prefix.length), 10);
      if (!isNaN(last)) seq = last + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ── 重算还款状态（必须在事务内） ──────────────────────────────────────────

  async recalcSettlementStatus(contributionId: string, qr: QueryRunner): Promise<void> {
    const rows = await qr.query(
      `SELECT amount_original, settled_amount_original
       FROM fin_shareholder_contributions WHERE id = $1`,
      [contributionId],
    );
    if (!rows.length) return;
    const total   = Number(rows[0].amount_original);
    const settled = Number(rows[0].settled_amount_original);

    let newStatus: string;
    if (settled <= 0) {
      newStatus = 'CONFIRMED';
    } else if (settled >= total) {
      newStatus = 'SETTLED';
    } else {
      newStatus = 'PARTIALLY_SETTLED';
    }

    await qr.query(
      `UPDATE fin_shareholder_contributions SET status = $1, updated_at = now() WHERE id = $2`,
      [newStatus, contributionId],
    );
  }

  // ── 列表 ─────────────────────────────────────────────────────────────────

  async list(dto: QueryShareholderContributionDto, user: any) {
    const page     = dto.page     ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const offset   = (page - 1) * pageSize;

    const companyCodes = this.userCompanyCodes(user);

    let sql = `
      SELECT id, contribution_no, shareholder_id, shareholder_code, shareholder_name,
             company_code, company_name, project_code, project_name,
             source_type, source_id, source_no,
             contribution_type, fund_nature,
             currency_code, amount_original, exchange_rate, amount_base, base_currency,
             settled_amount_original, settled_amount_base, balance_amount_original, balance_amount_base,
             contribution_date, expected_return_date, interest_rate,
             status, wf_instance_id, cash_account_id,
             remark, created_by, updated_by, created_at, updated_at
      FROM fin_shareholder_contributions WHERE 1=1
    `;
    const params: unknown[] = [];
    let idx = 1;

    if (companyCodes) {
      sql += ` AND company_code = ANY($${idx++})`;
      params.push(companyCodes);
    }
    if (dto.companyCode) {
      sql += ` AND company_code = $${idx++}`;
      params.push(dto.companyCode);
    }
    if (dto.shareholderCode) {
      sql += ` AND shareholder_code = $${idx++}`;
      params.push(dto.shareholderCode);
    }
    if (dto.contributionType) {
      sql += ` AND contribution_type = $${idx++}`;
      params.push(dto.contributionType);
    }
    if (dto.status) {
      if (dto.status === 'PENDING') {
        sql += ` AND status = ANY($${idx++})`;
        params.push(['DRAFT', 'PENDING_CONFIRM']);
      } else {
        sql += ` AND status = $${idx++}`;
        params.push(dto.status);
      }
    }
    if (dto.keyword) {
      sql += ` AND (shareholder_name ILIKE $${idx} OR contribution_no ILIKE $${idx} OR company_name ILIKE $${idx})`;
      params.push(`%${dto.keyword}%`);
      idx++;
    }
    if (dto.dateFrom) {
      sql += ` AND created_at >= $${idx++}`;
      params.push(dto.dateFrom);
    }
    if (dto.dateTo) {
      sql += ` AND created_at <= $${idx++}`;
      params.push(dto.dateTo);
    }

    const countSql = sql.replace(
      /SELECT[\s\S]+?FROM/,
      'SELECT COUNT(*) AS total FROM',
    );
    const [countRow, items] = await Promise.all([
      this.ds.query(countSql, params),
      this.ds.query(`${sql} ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx++}`, [
        ...params, pageSize, offset,
      ]),
    ]);

    return { items: this.snakeToCamel(items), total: Number(countRow[0]?.total ?? 0), page, pageSize };
  }

  // ── 单条详情（含 settlements） ────────────────────────────────────────────

  async findById(id: string, user: any) {
    const [row] = await this.ds.query(
      `SELECT c.*,
              COALESCE(json_agg(s ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '[]') AS settlements
       FROM fin_shareholder_contributions c
       LEFT JOIN fin_shareholder_settlements s ON s.contribution_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [id],
    );
    if (!row) throw new NotFoundException(`股东出资 ID=${id} 不存在`);
    this.assertOwnership(row.company_code, user);
    const [camel] = this.snakeToCamel([row]);
    if (Array.isArray(camel.settlements)) {
      camel.settlements = this.snakeToCamel(camel.settlements as Record<string, unknown>[]);
    }
    return camel;
  }

  // ── 采购股东代付自动入账（G85-B：付款执行时同事务调用） ─────────────────────
  //   付款单已走采购审批链（审核人→总裁），故直接 CONFIRMED，不重复走出资审批。
  //   幂等：同一付款（source_type='PAYMENT' + source_id）只入一条。

  async createFromPayment(qr: QueryRunner, p: {
    paymentId: string; payNo: string;
    shareholderId?: string | null; shareholderName: string;
    companyCode: string; companyName?: string | null;
    projectCode?: string | null; projectName?: string | null;
    fundNature?: string | null;
    currencyCode: string; amountOriginal: number; exchangeRate?: number; amountBase?: number;
    baseCurrency?: string; remark?: string | null; createdBy?: string | null;
  }): Promise<{ contributionNo: string } | { skipped: true }> {
    const existing = await qr.query(
      `SELECT id FROM fin_shareholder_contributions WHERE source_type = 'PAYMENT' AND source_id = $1`,
      [p.paymentId],
    );
    if (existing.length > 0) return { skipped: true };
    const rate = Number(p.exchangeRate ?? 1);
    const amtOrig = Number(p.amountOriginal);
    const amtBase = Number(p.amountBase ?? amtOrig * rate);
    const contributionNo = await this.genContributionNo(qr);
    await qr.query(
      `INSERT INTO fin_shareholder_contributions
         (contribution_no, shareholder_id, shareholder_name,
          company_code, company_name, project_code, project_name,
          source_type, source_id, source_no,
          contribution_type, fund_nature,
          currency_code, amount_original, exchange_rate, amount_base, base_currency,
          settled_amount_original, settled_amount_base,
          balance_amount_original, balance_amount_base,
          status, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PAYMENT',$8,$9,'PAYMENT_ON_BEHALF',$10,$11,$12,$13,$14,$15,0,0,$12,$14,'CONFIRMED',$16,$17)`,
      [
        contributionNo, p.shareholderId ?? null, p.shareholderName,
        p.companyCode, p.companyName ?? null, p.projectCode ?? null, p.projectName ?? null,
        p.paymentId, p.payNo,
        p.fundNature ?? 'ADVANCE',
        p.currencyCode, amtOrig, rate, amtBase, p.baseCurrency ?? 'CNY',
        p.remark ?? null, p.createdBy ?? null,
      ],
    );
    return { contributionNo };
  }

  // ── 手工创建 ─────────────────────────────────────────────────────────────

  async createManual(dto: CreateShareholderContributionDto, user: any): Promise<FinShareholderContributionEntity> {
    this.assertOwnership(dto.companyCode, user);

    return this.ds.transaction(async mgr => {
      const qr = mgr.queryRunner!;
      const contributionNo = await this.genContributionNo(qr);
      const rate     = Number(dto.exchangeRate ?? 1);
      const amtOrig  = Number(dto.amountOriginal);
      const amtBase  = dto.amountBase != null ? Number(dto.amountBase) : amtOrig * rate;

      await qr.query(
        `INSERT INTO fin_shareholder_contributions
           (contribution_no, shareholder_code, shareholder_name,
            company_code, company_name, project_code, project_name,
            source_type, contribution_type, fund_nature,
            currency_code, amount_original, exchange_rate, amount_base, base_currency,
            settled_amount_original, settled_amount_base,
            balance_amount_original, balance_amount_base,
            contribution_date, expected_return_date, interest_rate,
            status, cash_account_id, remark, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
        [
          contributionNo,
          dto.shareholderCode ?? null,
          dto.shareholderName,
          dto.companyCode,
          dto.companyName ?? null,
          dto.projectCode ?? null,
          dto.projectName ?? null,
          'MANUAL',
          dto.contributionType,
          dto.fundNature ?? null,
          dto.currencyCode,
          amtOrig, rate, amtBase, 'CNY',
          0, 0,
          amtOrig, amtBase,
          dto.contributionDate ?? null,
          dto.expectedReturnDate ?? null,
          dto.interestRate ?? null,
          'DRAFT',
          dto.cashAccountId ?? null,
          dto.remark ?? null,
          this.username(),
        ],
      );

      const created = await mgr.findOne(FinShareholderContributionEntity, {
        where: { contributionNo },
      });
      return created!;
    });
  }

  // ── 编辑（仅 DRAFT） ──────────────────────────────────────────────────────

  async update(id: string, dto: UpdateShareholderContributionDto, user: any): Promise<FinShareholderContributionEntity> {
    return this.ds.transaction(async mgr => {
      const qr = mgr.queryRunner!;
      const row = await mgr.findOne(FinShareholderContributionEntity, { where: { id } });
      if (!row) throw new NotFoundException(`股东出资 ID=${id} 不存在`);
      this.assertOwnership(row.companyCode, user);
      if (row.status !== 'DRAFT') {
        throw new ConflictException(`只有草稿状态才可编辑（当前：${row.status}）`);
      }

      const fields: string[] = [];
      const vals: unknown[]  = [];
      let pidx = 1;

      const set = (col: string, val: unknown) => {
        fields.push(`${col} = $${pidx++}`);
        vals.push(val);
      };

      if (dto.shareholderCode  !== undefined) set('shareholder_code',   dto.shareholderCode);
      if (dto.shareholderName  !== undefined) set('shareholder_name',    dto.shareholderName);
      if (dto.companyCode      !== undefined) set('company_code',        dto.companyCode);
      if (dto.companyName      !== undefined) set('company_name',        dto.companyName);
      if (dto.projectCode      !== undefined) set('project_code',        dto.projectCode);
      if (dto.projectName      !== undefined) set('project_name',        dto.projectName);
      if (dto.contributionType !== undefined) set('contribution_type',   dto.contributionType);
      if (dto.fundNature       !== undefined) set('fund_nature',         dto.fundNature);
      if (dto.currencyCode     !== undefined) set('currency_code',       dto.currencyCode);
      if (dto.contributionDate !== undefined) set('contribution_date', dto.contributionDate);
      if (dto.expectedReturnDate !== undefined) set('expected_return_date', dto.expectedReturnDate);
      if (dto.interestRate     !== undefined) set('interest_rate',       dto.interestRate);
      if (dto.cashAccountId    !== undefined) set('cash_account_id',     dto.cashAccountId);
      if (dto.remark           !== undefined) set('remark',              dto.remark);

      // 如果金额字段变更，重算 balance
      if (dto.amountOriginal !== undefined) {
        const rate    = Number(dto.exchangeRate ?? row.exchangeRate ?? 1);
        const amtOrig = Number(dto.amountOriginal);
        const amtBase = dto.amountBase != null ? Number(dto.amountBase) : amtOrig * rate;
        set('amount_original',        amtOrig);
        set('exchange_rate',          rate);
        set('amount_base',            amtBase);
        set('balance_amount_original', amtOrig - Number(row.settledAmountOriginal));
        set('balance_amount_base',     amtBase - Number(row.settledAmountBase));
      } else if (dto.exchangeRate !== undefined || dto.amountBase !== undefined) {
        const rate    = Number(dto.exchangeRate ?? row.exchangeRate ?? 1);
        const amtBase = dto.amountBase != null ? Number(dto.amountBase) : Number(row.amountOriginal) * rate;
        set('exchange_rate', rate);
        set('amount_base',   amtBase);
      }

      set('updated_by', this.username());

      // updated_at 用 SQL 字面量 now()（不占参数位）；WHERE id 用下一个参数位 $pidx。
      // 原实现 set('updated_at','now()') 让 pidx 多自增 1、又 pop 掉值却不回退 pidx，
      // 导致 WHERE id 的 $pidx 越界 → UPDATE 必失败（"保存失败"根因）。
      await qr.query(
        `UPDATE fin_shareholder_contributions SET ${fields.join(', ')}, updated_at = now() WHERE id = $${pidx}`,
        [...vals, id],
      );

      const updated = await mgr.findOne(FinShareholderContributionEntity, { where: { id } });
      return updated!;
    });
  }

  // ── 提交审批（DRAFT→PENDING_CONFIRM） ─────────────────────────────────────

  async submitConfirm(id: string, user: any, pickedApproverId?: string): Promise<FinShareholderContributionEntity> {
    return this.ds.transaction(async mgr => {
      const qr = mgr.queryRunner!;
      const row = await mgr.findOne(FinShareholderContributionEntity, { where: { id } });
      if (!row) throw new NotFoundException(`股东出资 ID=${id} 不存在`);
      this.assertOwnership(row.companyCode, user);
      // 提交审批=创建者把自己的草稿"交出去"，是创建者本就该做的动作，不拦自审；
      // 真正拦自审的是"确认入账"confirmDirect（自己批自己）。
      if (row.status !== 'DRAFT') {
        throw new ConflictException(`只有草稿状态才可提交（当前：${row.status}）`);
      }

      await qr.query(
        `UPDATE fin_shareholder_contributions SET status = 'PENDING_CONFIRM', updated_by = $1, updated_at = now() WHERE id = $2`,
        [this.username(), id],
      );

      // 调用审批引擎（如果无规则则自动 CONFIRMED）
      try {
        await this.approvalEngine.startApproval({
          moduleCode:   'MENU_FIN2_SHAREHOLDER',
          bizType:      'SHAREHOLDER_CONTRIBUTION',
          bizId:        id,
          bizNo:        row.contributionNo,
          amount:       Number(row.amountBase ?? row.amountOriginal ?? 0),
          currencyCode: row.currencyCode,
          companyCode:  row.companyCode,
          companyName:  row.companyName ?? undefined,
          projectCode:  row.projectCode ?? undefined,
          projectName:  row.projectName ?? undefined,
          subject:      `${row.shareholderName} · ${row.contributionType}`,
          pickedApproverId,
        }, mgr);
      } catch (e) {
        // 指定了审批人却失败（如所选人无权/不在数据域）→ 抛出让发起人改选；
        // 未指定审批人的"无审批规则" → 停在 PENDING_CONFIRM 等他人确认（制单/审核分离，
        // 不再自动入账），由另一持 MENU_FIN2_SHAREHOLDER:E 的非创建者在台账「确认」完成。
        if (pickedApproverId) throw e;
      }

      const updated = await mgr.findOne(FinShareholderContributionEntity, { where: { id } });
      return updated!;
    });
  }

  // ── 直接确认（不走审批） ─────────────────────────────────────────────────

  async confirmDirect(id: string, dto: ConfirmShareholderContributionDto, user: any): Promise<FinShareholderContributionEntity> {
    return this.ds.transaction(async mgr => {
      const row = await mgr.findOne(FinShareholderContributionEntity, { where: { id } });
      if (!row) throw new NotFoundException(`股东出资 ID=${id} 不存在`);
      this.assertOwnership(row.companyCode, user);
      this.assertNotSelfApproval(row.createdBy, '确认');
      if (!['DRAFT', 'PENDING_CONFIRM'].includes(row.status)) {
        throw new ConflictException(`当前状态 ${row.status} 不允许直接确认`);
      }

      await mgr.queryRunner!.query(
        `UPDATE fin_shareholder_contributions
         SET status = 'CONFIRMED', remark = COALESCE($1, remark),
             updated_by = $2, updated_at = now()
         WHERE id = $3`,
        [dto.remark ?? null, this.username(), id],
      );

      const updated = await mgr.findOne(FinShareholderContributionEntity, { where: { id } });
      return updated!;
    });
  }

  // ── 取消 ─────────────────────────────────────────────────────────────────

  async cancel(id: string, dto: CancelShareholderContributionDto, user: any): Promise<void> {
    return this.ds.transaction(async mgr => {
      const row = await mgr.findOne(FinShareholderContributionEntity, { where: { id } });
      if (!row) throw new NotFoundException(`股东出资 ID=${id} 不存在`);
      this.assertOwnership(row.companyCode, user);
      if (!['DRAFT', 'PENDING_CONFIRM'].includes(row.status)) {
        throw new ConflictException(`当前状态 ${row.status} 不允许取消`);
      }

      await mgr.queryRunner!.query(
        `UPDATE fin_shareholder_contributions
         SET status = 'CANCELLED',
             remark = COALESCE($1, remark),
             updated_by = $2, updated_at = now()
         WHERE id = $3`,
        [dto.reason ?? null, this.username(), id],
      );
    });
  }

  // ── 从 prc2 幂等导入 ──────────────────────────────────────────────────────

  async importFromPrc2(user: any): Promise<{ imported: number; skipped: number }> {
    const rows = await this.ds.query(`
      SELECT id, fund_no, shareholder_id, shareholder_name,
             company_code, company_name, project_code, project_name,
             fund_nature, currency_code,
             amount_original, exchange_rate, amount_base, base_currency,
             occurred_date, remark
      FROM prc2_shareholder_funds
      WHERE status IN ('CONFIRMED', 'ACTIVE')
      ORDER BY id
    `);

    let imported = 0;
    let skipped  = 0;

    for (const r of rows) {
      // 幂等检查
      const existing = await this.ds.query(
        `SELECT id FROM fin_shareholder_contributions WHERE source_type = 'IMPORT' AND source_id = $1`,
        [r.id],
      );
      if (existing.length > 0) { skipped++; continue; }

      const typeMap: Record<string, string> = {
        INVESTMENT: 'INVESTMENT',
        LOAN:       'LOAN',
        ADVANCE:    'ADVANCE',
      };
      const contribType = typeMap[r.fund_nature] ?? 'PAYMENT_ON_BEHALF';
      const amtOrig  = Number(r.amount_original);
      const rate     = Number(r.exchange_rate ?? 1);
      const amtBase  = Number(r.amount_base ?? amtOrig * rate);

      await this.ds.transaction(async mgr => {
        const qr = mgr.queryRunner!;
        const contributionNo = await this.genContributionNo(qr);
        await qr.query(
          `INSERT INTO fin_shareholder_contributions
             (contribution_no, shareholder_id, shareholder_code, shareholder_name,
              company_code, company_name, project_code, project_name,
              source_type, source_id, source_no,
              contribution_type, fund_nature,
              currency_code, amount_original, exchange_rate, amount_base, base_currency,
              settled_amount_original, settled_amount_base,
              balance_amount_original, balance_amount_base,
              status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
          [
            contributionNo,
            r.shareholder_id ?? null,
            null,
            r.shareholder_name,
            r.company_code ?? 'UNKNOWN',
            r.company_name ?? null,
            r.project_code ?? null,
            r.project_name ?? null,
            'IMPORT',
            r.id,
            r.fund_no ?? null,
            contribType,
            r.fund_nature ?? null,
            r.currency_code,
            amtOrig, rate, amtBase, r.base_currency ?? 'CNY',
            0, 0,
            amtOrig, amtBase,
            'CONFIRMED',
            this.username(),
          ],
        );
      });
      imported++;
    }

    return { imported, skipped };
  }

  // ── 汇总统计 ─────────────────────────────────────────────────────────────

  async getSummary(user: any) {
    const companyCodes = this.userCompanyCodes(user);
    let where = '1=1';
    const params: unknown[] = [];
    if (companyCodes) {
      where += ` AND company_code = ANY($1)`;
      params.push(companyCodes);
    }

    const [totals, byType, byStatus] = await Promise.all([
      this.ds.query(
        `SELECT COUNT(*) total_count,
                SUM(amount_original) total_amount_original,
                SUM(settled_amount_original) total_settled,
                SUM(balance_amount_original) total_balance
         FROM fin_shareholder_contributions WHERE ${where}`,
        params,
      ),
      this.ds.query(
        `SELECT contribution_type,
                COUNT(*) cnt,
                SUM(amount_original) amount,
                SUM(balance_amount_original) balance
         FROM fin_shareholder_contributions WHERE ${where}
         GROUP BY contribution_type ORDER BY contribution_type`,
        params,
      ),
      this.ds.query(
        `SELECT status, COUNT(*) cnt, SUM(amount_original) amount
         FROM fin_shareholder_contributions WHERE ${where}
         GROUP BY status ORDER BY status`,
        params,
      ),
    ]);

    return {
      totals: totals[0],
      byType,
      byStatus,
    };
  }

  // raw SQL 返回 snake_case 列名，前端期望 camelCase → 统一转换
  private snakeToCamel(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map(r => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        o[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
      }
      return o;
    });
  }
}
