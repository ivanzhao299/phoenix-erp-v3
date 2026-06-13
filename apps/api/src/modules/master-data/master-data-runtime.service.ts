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
  // ════ G92 主数据治理分层（2026-06-13，用户拍板）════
  /**
   * 类型级分流：新增是否走审批。
   *   true（默认/省略）= 财务·法人类主数据 → 新建为 DRAFT，需提交审批才 ACTIVE。
   *   false             = 运营类主数据（物料/SKU/等级/规格/司机/车辆）→ 新建直接 ACTIVE，免审批快建。
   */
  approvalOnCreate?: boolean;
  /**
   * 字段级分流：哪些「关键字段」的编辑需走审批（仅对 approvalOnCreate≠false 的类型生效）。
   *   · 在 keyFields 内的字段被改 → 不直接落库，生成 md_change_requests + 启动 MD_FIELD_CHANGE 审批，
   *     审批通过后才应用；原值在通过前保持生效（记录仍 ACTIVE 可被引用）。
   *   · 不在 keyFields 内的「扩展字段」（联系人/电话/地址/备注等）→ 直接落库，免审批。
   *   · 未配置（undefined）→ 该类型所有字段编辑均直接落库（保持旧行为）。
   *   · 仅当记录已是 ACTIVE/FROZEN（已生效）时才门控；DRAFT/PENDING_APPROVAL（建档中）一律直接改。
   */
  keyFields?: string[];
}

const TYPES: Record<string, MdTypeConfig> = {
  customer: {
    table: 'sal_customers', codeCol: 'customer_no', nameCol: 'customer_name',
    prefix: 'CUS', objectType: 'CUSTOMER', companyCol: 'company_code',
    writableCols: ['customer_name','customer_type','contact_name','contact_phone','region_code','channel_code','company_code','company_name','credit_limit','payment_terms','delivery_address','remark','effective_date','expire_date'],
    // G92：法人/信用类 → 审批；关键字段=名称/类型/归属公司/信用额度/账期，扩展=联系人/电话/区域/渠道/地址/备注
    keyFields: ['customer_name','customer_type','company_code','credit_limit','payment_terms'],
  },
  supplier: {
    table: 'prc2_suppliers', codeCol: 'supplier_code', nameCol: 'supplier_name',
    prefix: 'SUP', objectType: 'SUPPLIER',
    writableCols: ['supplier_name','supplier_name_en','supplier_type','country_code','contact_name','contact_phone','contact_email','tax_no','default_currency','payment_terms','credit_days','address','remark','effective_date','expire_date'],
    // G92：关键字段=名称/类型/税号/币种/账期/账期天数，扩展=联系人/邮箱/电话/地址/国家/备注
    keyFields: ['supplier_name','supplier_type','tax_no','default_currency','payment_terms','credit_days'],
  },
  project: {
    // G86 2026-06-12：切换到统一项目主表 biz_projects（MDM-1 已于 06-05 在生产建表；
    //   prc2_projects 为被取代的空表，前端 procurement2/projects 已重定向主数据中心）
    table: 'biz_projects', codeCol: 'project_code', nameCol: 'project_name',
    prefix: 'PRJ', objectType: 'PROJECT', companyCol: 'company_code',
    writableCols: ['project_name','project_short_name','company_code','project_type',
                   'budget_amount','budget_currency','start_date','end_date','manager_name','remark'],
    // G92：关键字段=名称/归属公司/预算金额/预算币种，扩展=简称/类型/起止日期/负责人/备注
    keyFields: ['project_name','company_code','budget_amount','budget_currency'],
  },
  material: {
    // G86 采购物料主数据（饲料/兽药/包材/配件/建材——采购的物品来源，区别于自家产品 SKU）
    table: 'mst_materials', codeCol: 'material_code', nameCol: 'material_name',
    prefix: 'MAT', objectType: 'MATERIAL',
    writableCols: ['material_name','material_type','spec','unit','default_currency','remark'],
    approvalOnCreate: false,   // G92：运营类 → 免审批快建（业务员选物料找不到可就地新增）
  },
  'cash-account': {
    table: 'fin_cash_accounts', codeCol: 'account_code', nameCol: 'account_name',
    prefix: 'CASH', objectType: 'CASH_ACCOUNT', companyCol: 'company_code',  // G5.5-C: 统一自动生成（CASH-00001）
    writableCols: ['account_name','company_code','company_name','currency_code','account_type','bank_name','bank_account_no','bank_acc_code','holder_code','remark','effective_date','expire_date'],
    // G92：资金账户 → 审批；关键字段=账户名/归属公司/币种/账户类型/银行账号/持有人，扩展=开户行名/备注
    keyFields: ['account_name','company_code','currency_code','account_type','bank_account_no','holder_code'],
  },
  // ════ G5.5-C 新增 9 类主数据（P0 + P1）════
  product: {
    // FIX 2026-06-05: 真实表名是 mst_products（不是 product_master，后者根本不存在 → HTTP 500）
    // writableCols 按 mst_products 实际列校正（无 product_name_en/uom/default_grade/effective_date/expire_date/remark）
    table: 'mst_products', codeCol: 'product_code', nameCol: 'product_name',
    prefix: 'PRD', objectType: 'PRODUCT',
    writableCols: ['product_name','product_name_zh','product_name_lo','category_code','unit_zh','unit_lo','shelf_life_days','price_retail','price_wholesale','has_grade','has_spec','image_url','specs'],
    // G92：产品含零售/批发价 → 审批；关键字段=名称/类目/价格/分级开关，扩展=多语名/单位/保质期/图片/规格
    keyFields: ['product_name','category_code','price_retail','price_wholesale','has_grade','has_spec'],
  },
  store: {
    table: 'mst_stores', codeCol: 'store_code', nameCol: 'store_name',
    prefix: 'STR', objectType: 'STORE', companyCol: 'company_code',
    writableCols: ['store_name','address','phone','company_code','manager','effective_date','expire_date','remark'],
    // G92：门店为经营实体 → 审批；关键字段=名称/归属公司/店长，扩展=地址/电话/备注
    keyFields: ['store_name','company_code','manager'],
  },
  'bank-account': {
    table: 'fin_bank_accounts', codeCol: 'bank_account_code', nameCol: 'bank_name',
    prefix: 'BANK', objectType: 'BANK_ACCOUNT', companyCol: 'company_code',
    writableCols: ['bank_name','bank_name_en','branch_name','account_no','account_holder','currency_code','country_code','swift_code','iban','company_code','effective_date','expire_date','remark'],
    // G92：银行账户最敏感 → 审批；关键字段=行名/账号/户名/币种/归属公司/SWIFT/IBAN，扩展=支行/国家/备注
    keyFields: ['bank_name','account_no','account_holder','currency_code','company_code','swift_code','iban'],
  },
  sku: {
    table: 'product_skus', codeCol: 'sku_code', nameCol: 'sku_name',
    prefix: 'SKU', objectType: 'SKU',
    writableCols: ['sku_name','product_code','product_name','grade_code','spec_code','barcode','effective_date','expire_date','remark'],
    approvalOnCreate: false,   // G92：运营类 → 免审批快建
  },
  warehouse: {
    table: 'wms_warehouses', codeCol: 'warehouse_code', nameCol: 'warehouse_name',
    prefix: 'WH', objectType: 'WAREHOUSE', companyCol: 'company_code',
    writableCols: ['warehouse_name','warehouse_name_zh','type','company_code','manager','effective_date','expire_date','remark'],
    // G92：仓库为基础设施实体 → 审批；关键字段=名称/类型/归属公司/管理员，扩展=中文名/备注
    keyFields: ['warehouse_name','type','company_code','manager'],
  },
  grade: {
    // FIX UAT-1 2026-06-04: 表实际列含 grade_name_lo/is_saleable/is_storable；effective_date 由迁移补
    table: 'product_grades', codeCol: 'grade_code', nameCol: 'grade_name',
    prefix: 'GRD', objectType: 'GRADE',
    writableCols: ['grade_name','grade_name_lo','sort_order','is_saleable','is_storable','remark'],
    approvalOnCreate: false,   // G92：运营类 → 免审批快建
  },
  spec: {
    // FIX UAT-1 2026-06-04: 实际列为 qty_per_unit/base_unit/display_unit（不是 unit_count/pack_type）
    table: 'packaging_specs', codeCol: 'spec_code', nameCol: 'spec_name',
    prefix: 'SPEC', objectType: 'SPEC',
    writableCols: ['spec_name','spec_name_lo','qty_per_unit','base_unit','display_unit','sort_order','remark'],
    approvalOnCreate: false,   // G92：运营类 → 免审批快建
  },
  driver: {
    // FIX UAT-1 2026-06-04: PK 是 driver_code（不是 driver_name），且无 effective_date/expire_date 列
    table: 'sal_drivers', codeCol: 'driver_code', nameCol: 'driver_name',
    prefix: 'DRV', objectType: 'DRIVER', companyCol: 'company_code',
    writableCols: ['driver_name','phone','license_no','company_code','remark'],
    approvalOnCreate: false,   // G92：运营类 → 免审批快建
  },
  vehicle: {
    // FIX UAT-1 2026-06-04: 无 effective_date/expire_date 列；vehicle_no 是 unique key 但不应在 writableCols
    table: 'sal_vehicles', codeCol: 'vehicle_no', nameCol: 'vehicle_no',
    objectType: 'VEHICLE', companyCol: 'company_code',
    writableCols: ['plate_no','vehicle_type','capacity','company_code','remark'],
    approvalOnCreate: false,   // G92：运营类 → 免审批快建
  },
  // ════ G5.5-D 新增 3 类（治理收官）════
  organization: {
    table: 'sys_organizations', codeCol: 'org_code', nameCol: 'org_name',
    prefix: 'ORG', objectType: 'ORGANIZATION',
    writableCols: ['org_name','org_name_cn','org_short_name','parent_id','parent_code','org_type','level','company_code','project_code','warehouse_code','manager_user_id','manager_name','site_code','site_business_type','sort_order','effective_date','expire_date','remark'],
    // G92：组织架构 → 审批；关键字段=名称/上级/类型/归属公司·项目·仓库/负责人/站点，扩展=简称/层级/排序/备注
    keyFields: ['org_name','org_name_cn','parent_code','parent_id','org_type','company_code','project_code','warehouse_code','manager_user_id','site_code','site_business_type'],
  },
  company: {
    // 公司是 sys_organizations 的子集（org_type='COMPANY'）— 用 view 模式
    table: 'sys_organizations', codeCol: 'org_code', nameCol: 'org_name',
    prefix: 'COMP', objectType: 'COMPANY',
    writableCols: ['org_name','org_name_cn','org_short_name','parent_id','parent_code','company_code','manager_user_id','manager_name','effective_date','expire_date','remark'],
    // G92：法人主体 → 审批；关键字段=名称/上级/法人代表，扩展=简称/备注
    keyFields: ['org_name','org_name_cn','parent_code','parent_id','manager_user_id'],
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

// G92：字段级变更审批统一 bizType（所有类型的关键字段编辑共用一条审批链；
//   承载在独立 md_change_requests 表，审批通过后由 onApproved 应用变更回主表，
//   原记录在通过前保持 ACTIVE 可被引用——不像「主表自身 status 转 PENDING」会临时下线）
const FIELD_CHANGE_BIZ = 'MD_FIELD_CHANGE';

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

  /**
   * 新增：自动编码 + 审计。
   *   G92 类型级分流：approvalOnCreate≠false（财务/法人类）→ 初始 DRAFT（需提交审批才 ACTIVE）；
   *                   approvalOnCreate===false（运营类）→ 初始 ACTIVE（免审批，建档即可用）。
   */
  async create(type: string, dto: Record<string, any>, operator?: string): Promise<{ code: string; status: string }> {
    const c = this.cfg(type);
    const code = c.prefix ? await this.codeGen.next(c.prefix) : String(dto[c.codeCol] || '').trim();
    if (!code) throw new BadRequestException('编码不能为空');

    const initStatus = c.approvalOnCreate === false ? 'ACTIVE' : 'DRAFT';
    const cols = [c.codeCol, 'status']; const vals: any[] = [code, initStatus];
    for (const col of c.writableCols) {
      if (dto[col] !== undefined) { cols.push(col); vals.push(dto[col]); }
    }
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
    await this.ds.query(`INSERT INTO ${c.table} (${cols.join(',')}) VALUES (${placeholders})`, vals);

    await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'CREATE', after: { ...dto, status: initStatus }, operator });
    return { code, status: initStatus };
  }

  /**
   * G91 就地快速新建（直接 ACTIVE，立即可用）——供「采购选物料时找不到→立即建档」等场景。
   *   与 create() 同结构，仅状态 DRAFT→ACTIVE（跳审批，operational 主数据的便捷新增；
   *   主数据中心仍可后续冻结/归档清理）。审计 action=CREATE_QUICK 留痕。
   */
  async createQuick(type: string, dto: Record<string, any>, operator?: string): Promise<{ code: string; name: string }> {
    const c = this.cfg(type);
    const code = c.prefix ? await this.codeGen.next(c.prefix) : String(dto[c.codeCol] || '').trim();
    if (!code) throw new BadRequestException('编码不能为空');
    const name = String(dto[c.nameCol] ?? '').trim();
    if (!name) throw new BadRequestException('名称不能为空');

    const cols = [c.codeCol, 'status']; const vals: any[] = [code, 'ACTIVE'];
    for (const col of c.writableCols) {
      if (dto[col] !== undefined) { cols.push(col); vals.push(dto[col]); }
    }
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
    await this.ds.query(`INSERT INTO ${c.table} (${cols.join(',')}) VALUES (${placeholders})`, vals);

    await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'CREATE', after: { ...dto, status: 'ACTIVE', _quick: true }, operator });
    return { code, name };
  }

  /** 值规范化比较：null/'' 视同空；两侧均为非空数值则按数值比；否则按 trim 字符串（Date 取日期）比 */
  private eqVal(oldV: any, newV: any): boolean {
    const a = oldV == null ? '' : oldV;
    const b = newV == null ? '' : newV;
    const sa = (a instanceof Date ? a.toISOString().slice(0, 10) : String(a)).trim();
    const sb = (b instanceof Date ? b.toISOString().slice(0, 10) : String(b)).trim();
    if (sa !== '' && sb !== '') {
      const fa = Number(sa), fb = Number(sb);
      if (!Number.isNaN(fa) && !Number.isNaN(fb)) return fa === fb;
    }
    return sa === sb;
  }

  private pick(obj: Record<string, any>, keys: string[]): Record<string, any> {
    const o: Record<string, any> = {};
    for (const k of keys) o[k] = obj[k];
    return o;
  }

  /** 直接落库一组列变更（内部复用：扩展字段 / 降级路径） */
  private async applyCols(c: MdTypeConfig, code: string, changes: Record<string, any>): Promise<void> {
    const cols = Object.keys(changes);
    if (!cols.length) return;
    const sets: string[] = []; const params: any[] = [];
    for (const col of cols) { params.push(changes[col]); sets.push(`${col} = $${params.length}`); }
    sets.push(`updated_at = NOW()`);
    params.push(code);
    await this.ds.query(`UPDATE ${c.table} SET ${sets.join(', ')} WHERE ${c.codeCol} = $${params.length}`, params);
  }

  /**
   * 编辑：列白名单更新 + 审计（G92 字段级分流）。
   *   · 扩展字段（不在 keyFields）→ 立即落库，免审批。
   *   · 关键字段（在 keyFields，且类型 governed、记录已 ACTIVE/FROZEN）→ 生成变更请求 +
   *     启动 MD_FIELD_CHANGE 审批，不直接落库；审批通过后由 onApproved 应用，原值在通过前保持生效。
   *   · 运营类（approvalOnCreate=false）/未配 keyFields / DRAFT·PENDING 态 → 全部直接落库（旧行为）。
   *   返回 pendingChange=true 时附 changeRequestId/pendingFields/message，供前端提示。
   */
  async update(
    type: string, code: string, dto: Record<string, any>, operator?: string,
  ): Promise<{ code: string; pendingChange: boolean; changeRequestId?: number; pendingFields?: string[]; message?: string }> {
    const c = this.cfg(type);
    const before = await this.get(type, code);

    const keyFields = c.keyFields ?? [];
    const governed = c.approvalOnCreate !== false && keyFields.length > 0;
    const live = ['ACTIVE', 'FROZEN'].includes(String(before.status));

    const keyChanges: Record<string, any> = {};
    const extChanges: Record<string, any> = {};
    for (const col of c.writableCols) {
      if (dto[col] === undefined) continue;
      if (this.eqVal(before[col], dto[col])) continue;           // 未变化跳过
      if (governed && live && keyFields.includes(col)) keyChanges[col] = dto[col];
      else extChanges[col] = dto[col];
    }

    // 1) 扩展字段（及运营类/草稿态的一切变化）→ 立即落库
    if (Object.keys(extChanges).length) {
      await this.applyCols(c, code, extChanges);
      await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'UPDATE', before: this.pick(before, Object.keys(extChanges)), after: extChanges, operator });
    }

    // 2) 关键字段变化 → 走变更审批
    const keyCols = Object.keys(keyChanges);
    if (!keyCols.length) return { code, pendingChange: false };

    try {
      let crId = 0;
      await this.ds.transaction(async (mgr) => {
        const [cr] = await mgr.query(
          `INSERT INTO md_change_requests
             (md_type, object_type, object_code, target_table, code_col, changes, before_snapshot, status, requested_by)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'PENDING',$8)
           RETURNING id`,
          [type, c.objectType, code, c.table, c.codeCol,
           JSON.stringify(keyChanges), JSON.stringify(this.pick(before, keyCols)), operator ?? null],
        );
        crId = Number(cr.id);
        // 启动审批（引擎建实例 + 派审批人；通过后回写 md_change_requests.status + 触发 onApproved 应用变更）
        await this.approval.startApproval({
          bizType: FIELD_CHANGE_BIZ, bizId: String(crId), bizNo: `${c.objectType}/${code}`, amount: 0,
          companyCode: before.company_code ?? undefined,
          subject: `主数据变更审批：${before[c.nameCol] ?? code}（${keyCols.join('、')}）`,
        }, mgr);
      });
      await this.audit.log({
        objectType: c.objectType, objectCode: code, action: 'UPDATE',
        before: this.pick(before, keyCols), after: { ...keyChanges, _pendingApproval: true, _changeRequestId: crId },
        operator, reason: `关键字段变更提交审批：${keyCols.join('、')}`,
      });
      return {
        code, pendingChange: true, changeRequestId: crId, pendingFields: keyCols,
        message: `关键字段（${keyCols.join('、')}）变更已提交审批，通过后生效；原值在通过前保持有效。`,
      };
    } catch (e: any) {
      // 降级：审批链未配置/启动失败 → 直接落库不丢失编辑，审计标注（事务已回滚，变更请求未残留）
      this.logger.warn(`[MdRuntime] ${FIELD_CHANGE_BIZ} 启动失败，降级直接落库：${e?.message}`);
      await this.applyCols(c, code, keyChanges);
      await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'UPDATE', before: this.pick(before, keyCols), after: { ...keyChanges, _degraded: true }, operator, reason: '关键字段变更（降级·审批不可用直接生效）' });
      return { code, pendingChange: false };
    }
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
