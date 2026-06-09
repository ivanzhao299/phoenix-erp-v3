import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { CodeGeneratorService } from './code-generator.service';
import { MasterDataAuditService } from './master-data-audit.service';
import { MasterDataReferencesService } from './master-data-references.service'; // G5.5-D
import { ApprovalEngineService } from '../approval-engine/approval-engine.service';
import { DataScopeService } from '../org/services/data-scope.service'; // G71 公司数据隔离

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
  companyCol?: string;       // G71：公司隔离列名（有则按 DataScope.allowedCompanyCodes 过滤）
}

const TYPES: Record<string, MdTypeConfig> = {
  customer: {
    table: 'sal_customers', codeCol: 'customer_no', nameCol: 'customer_name',
    prefix: 'CUS', objectType: 'CUSTOMER', companyCol: 'company_code',
    writableCols: ['customer_name','customer_type','contact_name','contact_phone','region_code','channel_code','company_code','company_name','credit_limit','payment_terms','delivery_address','remark','effective_date','expire_date'],
  },
  supplier: {
    table: 'prc2_suppliers', codeCol: 'supplier_code', nameCol: 'supplier_name',
    prefix: 'SUP', objectType: 'SUPPLIER',
    writableCols: ['supplier_name','supplier_name_en','supplier_type','country_code','contact_name','contact_phone','contact_email','tax_no','default_currency','payment_terms','credit_days','address','remark','effective_date','expire_date'],
  },
  project: {
    // FIX UAT-1 2026-06-04: 实际表名是 prc2_projects（早期错配为 shr_projects 表不存在）
    table: 'prc2_projects', codeCol: 'project_code', nameCol: 'project_name',
    prefix: 'PRJ', objectType: 'PROJECT', companyCol: 'company_code',
    writableCols: ['project_name','company_code','site_code','project_type','remark','effective_date','expire_date'],
  },
  'cash-account': {
    table: 'fin_cash_accounts', codeCol: 'account_code', nameCol: 'account_name',
    prefix: 'CASH', objectType: 'CASH_ACCOUNT', companyCol: 'company_code',  // G5.5-C: 统一自动生成（CASH-00001）
    writableCols: ['account_name','company_code','company_name','currency_code','account_type','bank_name','bank_account_no','bank_acc_code','holder_code','remark','effective_date','expire_date'],
  },
  // ════ G5.5-C 新增 9 类主数据（P0 + P1）════
  product: {
    // FIX 2026-06-05: 真实表名是 mst_products（不是 product_master，后者根本不存在 → HTTP 500）
    // writableCols 按 mst_products 实际列校正（无 product_name_en/uom/default_grade/effective_date/expire_date/remark）
    table: 'mst_products', codeCol: 'product_code', nameCol: 'product_name',
    prefix: 'PRD', objectType: 'PRODUCT',
    writableCols: ['product_name','product_name_zh','product_name_lo','category_code','unit_zh','unit_lo','shelf_life_days','price_retail','price_wholesale','has_grade','has_spec','image_url','specs'],
  },
  store: {
    table: 'mst_stores', codeCol: 'store_code', nameCol: 'store_name',
    prefix: 'STR', objectType: 'STORE', companyCol: 'company_code',
    writableCols: ['store_name','address','phone','company_code','manager','effective_date','expire_date','remark'],
  },
  'bank-account': {
    table: 'fin_bank_accounts', codeCol: 'bank_account_code', nameCol: 'bank_name',
    prefix: 'BANK', objectType: 'BANK_ACCOUNT', companyCol: 'company_code',
    writableCols: ['bank_name','bank_name_en','branch_name','account_no','account_holder','currency_code','country_code','swift_code','iban','company_code','effective_date','expire_date','remark'],
  },
  sku: {
    table: 'product_skus', codeCol: 'sku_code', nameCol: 'sku_name',
    prefix: 'SKU', objectType: 'SKU',
    writableCols: ['sku_name','product_code','product_name','grade_code','spec_code','barcode','effective_date','expire_date','remark'],
  },
  warehouse: {
    table: 'wms_warehouses', codeCol: 'warehouse_code', nameCol: 'warehouse_name',
    prefix: 'WH', objectType: 'WAREHOUSE', companyCol: 'company_code',
    writableCols: ['warehouse_name','warehouse_name_zh','type','company_code','manager','effective_date','expire_date','remark'],
  },
  grade: {
    // FIX UAT-1 2026-06-04: 表实际列含 grade_name_lo/is_saleable/is_storable；effective_date 由迁移补
    table: 'product_grades', codeCol: 'grade_code', nameCol: 'grade_name',
    prefix: 'GRD', objectType: 'GRADE',
    writableCols: ['grade_name','grade_name_lo','sort_order','is_saleable','is_storable','remark'],
  },
  spec: {
    // FIX UAT-1 2026-06-04: 实际列为 qty_per_unit/base_unit/display_unit（不是 unit_count/pack_type）
    table: 'packaging_specs', codeCol: 'spec_code', nameCol: 'spec_name',
    prefix: 'SPEC', objectType: 'SPEC',
    writableCols: ['spec_name','spec_name_lo','qty_per_unit','base_unit','display_unit','sort_order','remark'],
  },
  driver: {
    // FIX UAT-1 2026-06-04: PK 是 driver_code（不是 driver_name），且无 effective_date/expire_date 列
    table: 'sal_drivers', codeCol: 'driver_code', nameCol: 'driver_name',
    prefix: 'DRV', objectType: 'DRIVER', companyCol: 'company_code',
    writableCols: ['driver_name','phone','license_no','company_code','remark'],
  },
  vehicle: {
    // FIX UAT-1 2026-06-04: 无 effective_date/expire_date 列；vehicle_no 是 unique key 但不应在 writableCols
    table: 'sal_vehicles', codeCol: 'vehicle_no', nameCol: 'vehicle_no',
    objectType: 'VEHICLE', companyCol: 'company_code',
    writableCols: ['plate_no','vehicle_type','capacity','company_code','remark'],
  },
  // ════ G5.5-D 新增 3 类（治理收官）════
  organization: {
    table: 'sys_organizations', codeCol: 'org_code', nameCol: 'org_name',
    prefix: 'ORG', objectType: 'ORGANIZATION',
    writableCols: ['org_name','org_name_cn','org_short_name','parent_id','parent_code','org_type','level','company_code','project_code','warehouse_code','manager_user_id','manager_name','site_code','site_business_type','sort_order','effective_date','expire_date','remark'],
  },
  company: {
    // 公司是 sys_organizations 的子集（org_type='COMPANY'）— 用 view 模式
    table: 'sys_organizations', codeCol: 'org_code', nameCol: 'org_name',
    prefix: 'COMP', objectType: 'COMPANY',
    writableCols: ['org_name','org_name_cn','org_short_name','parent_id','parent_code','company_code','manager_user_id','manager_name','effective_date','expire_date','remark'],
  },
  dict: {
    table: 'sys_dict', codeCol: 'dict_code', nameCol: 'dict_label_zh',
    objectType: 'DICT',  // dict_code 业务约定不走自动编码
    writableCols: ['dict_code','dict_type','name','dict_label_zh','dict_label_lo','dict_label_en','dict_value','sort_no','config_json','effective_date','expire_date'],
  },
};

const VALID_STATUS = ['DRAFT','PENDING_APPROVAL','ACTIVE','FROZEN','ARCHIVED','REJECTED'];

// type → Workflow bizType（G3-B 主数据审批接入；G5.5-C 扩展 9 类）
const BIZ_TYPE: Record<string, string> = {
  customer:        'MD_CUSTOMER_CREATE',
  supplier:        'MD_SUPPLIER_CREATE',
  project:         'MD_PROJECT_CREATE',
  'cash-account':  'MD_CASH_ACCOUNT_CREATE',
  // G5.5-C 新增
  product:         'MD_PRODUCT_CREATE',
  store:           'MD_STORE_CREATE',
  'bank-account':  'MD_BANK_ACCOUNT_CREATE',
  sku:             'MD_SKU_CREATE',
  warehouse:       'MD_WAREHOUSE_CREATE',
  grade:           'MD_GRADE_CREATE',
  spec:            'MD_SPEC_CREATE',
  driver:          'MD_DRIVER_CREATE',
  vehicle:         'MD_VEHICLE_CREATE',
  // G5.5-D 新增
  organization:    'MD_ORGANIZATION_CREATE',
  company:         'MD_COMPANY_CREATE',
  dict:            'MD_DICT_CREATE',
};

@Injectable()
export class MasterDataRuntimeService {
  private readonly logger = new Logger(MasterDataRuntimeService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly codeGen: CodeGeneratorService,
    private readonly audit: MasterDataAuditService,
    private readonly approval: ApprovalEngineService,
    private readonly refs: MasterDataReferencesService, // G5.5-D 引用治理
    private readonly cls: ClsService,                   // G71 公司数据隔离
    private readonly dataScope: DataScopeService,       // G71 公司数据隔离
  ) {}

  private cfg(type: string): MdTypeConfig {
    const c = TYPES[type];
    if (!c) throw new BadRequestException(`未知主数据类型：${type}`);
    return c;
  }

  /**
   * G71：解析当前用户对该实体的公司可见范围。
   *   返回 'ALL'（无 company 维度 / 全局 / 内部调用 / 解析失败兜底）
   *      | 'DENY'（有公司维度但无任何可见公司 → 应返回空）
   *      | string[]（可见公司编码，用于 company_code = ANY(...)）
   */
  private async allowedCompanies(c: MdTypeConfig): Promise<'ALL' | 'DENY' | string[]> {
    if (!c.companyCol) return 'ALL';                          // 无公司维度（全局共享主数据）
    const user = this.cls.get('user') as Record<string, any> | undefined;
    if (!user) return 'ALL';                                  // 内部调用无用户上下文，不收窄
    const userId = String(user.userId ?? user.id ?? user.sub ?? '');
    if (!userId) return 'ALL';
    const roles: string[] = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    try {
      const scope = await this.dataScope.resolve(userId, roles, 'MENU_MASTER_DATA');
      if (scope.isGlobal) return 'ALL';
      if (!scope.allowedCompanyCodes.length) return 'DENY';   // 无可见公司 → 拒绝全部
      return scope.allowedCompanyCodes;
    } catch (e: any) {
      this.logger.warn(`[MdRuntime] DataScope 解析失败，降级放行：${e?.message}`);
      return 'ALL';                                           // 解析异常不阻断（与现有 helper 一致）
    }
  }

  /** 列表（管理用，可按状态/关键词筛选） */
  async list(type: string, opts: { status?: string; keyword?: string; limit?: number } = {}): Promise<any[]> {
    const c = this.cfg(type);
    const where: string[] = []; const params: any[] = [];
    // G71：公司数据隔离（有 company 维度的实体按 DataScope 过滤）
    const allowed = await this.allowedCompanies(c);
    if (allowed === 'DENY') return [];
    if (allowed !== 'ALL') { params.push(allowed); where.push(`${c.companyCol} = ANY($${params.length})`); }
    if (opts.status) { params.push(opts.status); where.push(`status = $${params.length}`); }
    if (opts.keyword) { params.push(`%${opts.keyword}%`); where.push(`(${c.codeCol} ILIKE $${params.length} OR ${c.nameCol} ILIKE $${params.length})`); }
    const sql = `SELECT * FROM ${c.table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC NULLS LAST LIMIT ${Math.min(opts.limit ?? 200, 1000)}`;
    return this.ds.query(sql, params);
  }

  /** 引用治理：仅 ACTIVE 且在生效期内（供前端 Selector 调用） */
  async listActive(type: string): Promise<any[]> {
    const c = this.cfg(type);
    // G71：Selector 引用也按公司隔离（避免选到他公司主数据）
    const params: any[] = [];
    let companyClause = '';
    const allowed = await this.allowedCompanies(c);
    if (allowed === 'DENY') return [];
    if (allowed !== 'ALL') { params.push(allowed); companyClause = ` AND ${c.companyCol} = ANY($${params.length})`; }
    return this.ds.query(
      `SELECT ${c.codeCol} AS code, ${c.nameCol} AS name FROM ${c.table}
        WHERE status = 'ACTIVE'
          AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
          AND (expire_date    IS NULL OR expire_date    >= CURRENT_DATE)${companyClause}
        ORDER BY ${c.nameCol}`,
      params,
    );
  }

  async get(type: string, code: string): Promise<any> {
    const c = this.cfg(type);
    const [row] = await this.ds.query(`SELECT * FROM ${c.table} WHERE ${c.codeCol} = $1 LIMIT 1`, [code]);
    if (!row) throw new NotFoundException(`主数据不存在：${type}/${code}`);
    // G71：公司越权读保护（同时护住 update/transition——二者内部调 get）。
    //   他公司记录(company 已设且不在可见范围) → 视同不存在，防止按 code 读/改他公司主数据。
    if (c.companyCol) {
      const allowed = await this.allowedCompanies(c);
      const rowCompany = row[c.companyCol];
      if (allowed === 'DENY' || (Array.isArray(allowed) && rowCompany && !allowed.includes(rowCompany))) {
        throw new NotFoundException(`主数据不存在：${type}/${code}`);
      }
    }
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

    // ── G3-B：submit 接入 Workflow 2.0 审批引擎 ──────────────────────────────
    if (action === 'submit') {
      if (!['DRAFT', 'REJECTED'].includes(cur)) {
        throw new BadRequestException(`当前状态 ${cur} 不允许提交审批`);
      }
      const bizType = BIZ_TYPE[type];
      if (bizType) {
        try {
          // 在事务内启动审批：引擎查规则 → 建实例 → 置 PENDING_APPROVAL + 分派审批人
          // FIX UAT-P0-Phase1 2026-06-04: startApproval 只建审批实例，业务表 status 必须由本服务同步 UPDATE
          await this.ds.transaction(async (mgr) => {
            await this.approval.startApproval({
              bizType, bizId: String(before.id), bizNo: code, amount: 0,
              companyCode: before.company_code ?? undefined,
              subject: `主数据新增审批：${before[c.nameCol] ?? code}`,
            }, mgr);
            await mgr.query(`UPDATE ${c.table} SET status = 'PENDING_APPROVAL', updated_at = NOW() WHERE ${c.codeCol} = $1`, [code]);
          });
          await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'UPDATE', before: { status: cur }, after: { status: 'PENDING_APPROVAL' }, operator, reason: '提交审批（Workflow）' });
          return { status: 'PENDING_APPROVAL' };
        } catch (e: any) {
          // 优雅降级：审批规则未配置时直接置 PENDING_APPROVAL，由主数据审批页人工审批，不阻断提交
          this.logger.warn(`[MdRuntime] ${bizType} 启动 Workflow 失败，降级为直接待审批：${e?.message}`);
          await this.ds.query(`UPDATE ${c.table} SET status = 'PENDING_APPROVAL', updated_at = NOW() WHERE ${c.codeCol} = $1`, [code]);
          await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'UPDATE', before: { status: cur }, after: { status: 'PENDING_APPROVAL' }, operator, reason: '提交审批（降级·无审批规则）' });
          return { status: 'PENDING_APPROVAL' };
        }
      }
    }

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

    // ── G5.5-D：归档阻断 — 被引用的主数据不允许归档 ─────────────────────────
    if (action === 'archive') {
      const report = await this.refs.compute(c.objectType, code);
      if (report.isReferenced) {
        // 记录治理事件 + 抛出业务错误
        await this.ds.query(
          `INSERT INTO md_governance_events (event_type, object_type, object_code, severity, payload, message)
           VALUES ('ARCHIVE_BLOCKED', $1, $2, 'HIGH', $3::jsonb, $4)`,
          [c.objectType, code, JSON.stringify({ refs: report.references }),
            `归档被阻断：${c.objectType}/${code} 被 ${report.totalReferences} 处业务单据引用`],
        ).catch(() => {/* 治理日志失败不阻断主流程 */});
        throw new BadRequestException(
          `归档被阻断：${code} 仍被 ${report.totalReferences} 处业务单据引用（${
            report.references.map(r => `${r.refDocType}×${r.refCount}`).join('、')
          }），请先撤回引用再归档`,
        );
      }
    }

    // ── G5.5-D：冻结风险提示 — 冻结时若有引用，记录治理事件（不阻断）─────────
    if (action === 'freeze') {
      const report = await this.refs.compute(c.objectType, code).catch(() => null);
      if (report?.isReferenced) {
        await this.ds.query(
          `INSERT INTO md_governance_events (event_type, object_type, object_code, severity, payload, message)
           VALUES ('FROZEN_REFERENCED', $1, $2, 'MEDIUM', $3::jsonb, $4)`,
          [c.objectType, code, JSON.stringify({ refs: report.references }),
            `冻结风险：${c.objectType}/${code} 被 ${report.totalReferences} 处业务单据引用；冻结后引用方将无法新建相关单据`],
        ).catch(() => {});
      }
    }

    await this.ds.query(`UPDATE ${c.table} SET status = $1, updated_at = NOW() WHERE ${c.codeCol} = $2`, [rule.to, code]);
    await this.audit.log({ objectType: c.objectType, objectCode: code, action: rule.audit, before: { status: cur }, after: { status: rule.to }, operator, reason });
    return { status: rule.to };
  }
}
