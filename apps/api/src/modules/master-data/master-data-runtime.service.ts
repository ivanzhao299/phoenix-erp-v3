import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CodeGeneratorService } from './code-generator.service';
import { MasterDataAuditService } from './master-data-audit.service';

/**
 * MasterDataRuntimeService — 核心主数据运行体系（G3-A）
 * ════════════════════════════════════════════════════════════════════════
 * 配置驱动的通用主数据 Runtime：客户/供应商/项目/现金账户复用同一引擎。
 *   · 新增 → 自动生成编码（CodeGeneratorService）+ status=DRAFT + 审计
 *   · 编辑 → 列白名单更新 + 审计（before/after）
 *   · 生命周期 → submit/approve/reject/freeze/archive/restore + 审计
 *   · 引用治理 → listActive() 仅返回 ACTIVE 且在生效期内（供 Selector 用）
 *   · 禁止物理删除：归档（ARCHIVED）替代
 * 安全：列白名单防止任意列写入；值全部参数化。
 */

interface MdTypeConfig {
  table: string;
  codeCol: string;
  nameCol: string;
  prefix?: string;            // 自动编码前缀；无则需前端提供编码（如现金账户 CASH-CNY-001）
  objectType: string;        // 审计 object_type
  writableCols: string[];    // 可写列白名单
}

const TYPES: Record<string, MdTypeConfig> = {
  customer: {
    table: 'sal_customers', codeCol: 'customer_no', nameCol: 'customer_name',
    prefix: 'CUS', objectType: 'CUSTOMER',
    writableCols: ['customer_name','customer_type','contact_name','contact_phone','region_code','channel_code','company_code','company_name','credit_limit','payment_terms','delivery_address','remark','effective_date','expire_date'],
  },
  supplier: {
    table: 'prc2_suppliers', codeCol: 'supplier_code', nameCol: 'supplier_name',
    prefix: 'SUP', objectType: 'SUPPLIER',
    writableCols: ['supplier_name','supplier_name_en','supplier_type','country_code','contact_name','contact_phone','contact_email','tax_no','default_currency','payment_terms','credit_days','address','remark','effective_date','expire_date'],
  },
  project: {
    table: 'shr_projects', codeCol: 'project_code', nameCol: 'project_name',
    prefix: 'PRJ', objectType: 'PROJECT',
    writableCols: ['project_name','company_code','site_code','project_type','remark','effective_date','expire_date'],
  },
  'cash-account': {
    table: 'fin_cash_accounts', codeCol: 'account_code', nameCol: 'account_name',
    objectType: 'CASH_ACCOUNT', // 编码由前端提供（CASH-CNY-001 业务格式）
    writableCols: ['account_name','company_code','company_name','currency_code','account_type','bank_name','bank_account_no','bank_acc_code','holder_code','remark','effective_date','expire_date'],
  },
};

const VALID_STATUS = ['DRAFT','PENDING_APPROVAL','ACTIVE','FROZEN','ARCHIVED','REJECTED'];

@Injectable()
export class MasterDataRuntimeService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly codeGen: CodeGeneratorService,
    private readonly audit: MasterDataAuditService,
  ) {}

  private cfg(type: string): MdTypeConfig {
    const c = TYPES[type];
    if (!c) throw new BadRequestException(`未知主数据类型：${type}`);
    return c;
  }

  /** 列表（管理用，可按状态/关键词筛选） */
  async list(type: string, opts: { status?: string; keyword?: string; limit?: number } = {}): Promise<any[]> {
    const c = this.cfg(type);
    const where: string[] = []; const params: any[] = [];
    if (opts.status) { params.push(opts.status); where.push(`status = $${params.length}`); }
    if (opts.keyword) { params.push(`%${opts.keyword}%`); where.push(`(${c.codeCol} ILIKE $${params.length} OR ${c.nameCol} ILIKE $${params.length})`); }
    const sql = `SELECT * FROM ${c.table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC NULLS LAST LIMIT ${Math.min(opts.limit ?? 200, 1000)}`;
    return this.ds.query(sql, params);
  }

  /** 引用治理：仅 ACTIVE 且在生效期内（供前端 Selector 调用） */
  async listActive(type: string): Promise<any[]> {
    const c = this.cfg(type);
    return this.ds.query(
      `SELECT ${c.codeCol} AS code, ${c.nameCol} AS name FROM ${c.table}
        WHERE status = 'ACTIVE'
          AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
          AND (expire_date    IS NULL OR expire_date    >= CURRENT_DATE)
        ORDER BY ${c.nameCol}`,
    );
  }

  async get(type: string, code: string): Promise<any> {
    const c = this.cfg(type);
    const [row] = await this.ds.query(`SELECT * FROM ${c.table} WHERE ${c.codeCol} = $1 LIMIT 1`, [code]);
    if (!row) throw new NotFoundException(`主数据不存在：${type}/${code}`);
    return row;
  }

  /** 新增：自动编码 + DRAFT + 审计 */
  async create(type: string, dto: Record<string, any>, operator?: string): Promise<{ code: string }> {
    const c = this.cfg(type);
    const code = c.prefix ? await this.codeGen.next(c.prefix) : String(dto[c.codeCol] || '').trim();
    if (!code) throw new BadRequestException('编码不能为空');

    const cols = [c.codeCol, 'status']; const vals: any[] = [code, 'DRAFT'];
    for (const col of c.writableCols) {
      if (dto[col] !== undefined) { cols.push(col); vals.push(dto[col]); }
    }
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
    await this.ds.query(`INSERT INTO ${c.table} (${cols.join(',')}) VALUES (${placeholders})`, vals);

    await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'CREATE', after: dto, operator });
    return { code };
  }

  /** 编辑：列白名单更新 + 审计 */
  async update(type: string, code: string, dto: Record<string, any>, operator?: string): Promise<{ code: string }> {
    const c = this.cfg(type);
    const before = await this.get(type, code);

    const sets: string[] = []; const params: any[] = [];
    for (const col of c.writableCols) {
      if (dto[col] !== undefined) { params.push(dto[col]); sets.push(`${col} = $${params.length}`); }
    }
    if (sets.length === 0) return { code };
    sets.push(`updated_at = NOW()`);
    params.push(code);
    await this.ds.query(`UPDATE ${c.table} SET ${sets.join(', ')} WHERE ${c.codeCol} = $${params.length}`, params);

    await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'UPDATE', before, after: dto, operator });
    return { code };
  }

  /** 生命周期流转：submit/approve/reject/freeze/archive/restore */
  async transition(type: string, code: string, action: string, operator?: string, reason?: string): Promise<{ status: string }> {
    const c = this.cfg(type);
    const before = await this.get(type, code);
    const cur = before.status;

    const MAP: Record<string, { from: string[]; to: string; audit: any }> = {
      submit:  { from: ['DRAFT','REJECTED'],     to: 'PENDING_APPROVAL', audit: 'UPDATE' },
      approve: { from: ['PENDING_APPROVAL'],     to: 'ACTIVE',           audit: 'UPDATE' },
      reject:  { from: ['PENDING_APPROVAL'],     to: 'REJECTED',         audit: 'UPDATE' },
      freeze:  { from: ['ACTIVE'],               to: 'FROZEN',           audit: 'FREEZE' },
      archive: { from: ['DRAFT','REJECTED','ACTIVE','FROZEN'], to: 'ARCHIVED', audit: 'ARCHIVE' },
      restore: { from: ['FROZEN','ARCHIVED'],    to: 'ACTIVE',           audit: 'RESTORE' },
    };
    const rule = MAP[action];
    if (!rule) throw new BadRequestException(`未知生命周期动作：${action}`);
    if (!rule.from.includes(cur)) throw new BadRequestException(`当前状态 ${cur} 不允许执行 ${action}`);
    if (!VALID_STATUS.includes(rule.to)) throw new BadRequestException('非法目标状态');

    await this.ds.query(`UPDATE ${c.table} SET status = $1, updated_at = NOW() WHERE ${c.codeCol} = $2`, [rule.to, code]);
    await this.audit.log({ objectType: c.objectType, objectCode: code, action: rule.audit, before: { status: cur }, after: { status: rule.to }, operator, reason });
    return { status: rule.to };
  }
}
