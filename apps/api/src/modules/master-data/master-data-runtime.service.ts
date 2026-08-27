import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
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
  /**
   * G127：该类型的物理表**没有** effective_date / expire_date 生效期列（如 mst_materials /
   *   mst_products / biz_projects 这类运营类主数据）。置 true 时 listActive() 跳过生效期过滤，
   *   避免 SQL 引用不存在的列报错（表现为 /:type/active 返回 400，Selector 加载失败）。
   *   Why：物料/规格/项目作为 Selector 数据源不需要按生效期窗口过滤，仅 status='ACTIVE' 即可。
   */
  noValidityPeriod?: boolean;
}

// 主数据运行时 DataScope 的菜单上下文必须与类型级权限一致。
// Controller 已由 MasterDataTypeGuard 按 :type 做原子门禁；这里同步使用同一原子码，
// 避免公司范围解析/缓存/审计继续落在粗粒度 MENU_MASTER_DATA 上。
const OBJECT_TYPE_TO_MENU: Record<string, string> = {
  CUSTOMER: 'MENU_MD_CUSTOMER',
  SUPPLIER: 'MENU_MD_SUPPLIER',
  PROJECT: 'MENU_MD_PROJECT',
  MATERIAL: 'MENU_MD_MATERIAL',
  CASH_ACCOUNT: 'MENU_MD_CASH_ACCOUNT',
  PRODUCT: 'MENU_MD_PRODUCT',
  STORE: 'MENU_MD_STORE',
  BANK_ACCOUNT: 'MENU_MD_BANK_ACCOUNT',
  SKU: 'MENU_MD_SKU',
  WAREHOUSE: 'MENU_MD_WAREHOUSE',
  GRADE: 'MENU_MD_GRADE',
  SPEC: 'MENU_MD_PACKAGING',
  DRIVER: 'MENU_MD_DRIVER',
  VEHICLE: 'MENU_MD_VEHICLE',
  ORGANIZATION: 'MENU_MD_ORG',
  COMPANY: 'MENU_MD_COMPANY',
  DICT: 'MENU_MD_DICT',
};

const TYPES: Record<string, MdTypeConfig> = {
  customer: {
    table: 'sal_customers', codeCol: 'customer_no', nameCol: 'customer_name',
    prefix: 'CUS', objectType: 'CUSTOMER', companyCol: 'company_code',
    writableCols: ['customer_name','customer_name_en','customer_name_lo','customer_type','contact_name','contact_phone','region_code','channel_code','company_code','company_name','credit_limit','payment_terms','delivery_address','remark','effective_date','expire_date'],
    // G92：法人/信用类 → 审批；关键字段=名称/类型/归属公司/信用额度/账期，扩展=联系人/电话/区域/渠道/地址/备注
    keyFields: ['customer_name','customer_type','company_code','credit_limit','payment_terms'],
  },
  supplier: {
    table: 'prc2_suppliers', codeCol: 'supplier_code', nameCol: 'supplier_name',
    prefix: 'SUP', objectType: 'SUPPLIER',
    writableCols: ['supplier_name','supplier_name_en','supplier_name_lo','supplier_type','country_code','contact_name','contact_phone','contact_email','tax_no','default_currency','payment_terms','credit_days','address','remark','effective_date','expire_date'],
    // G92：关键字段=名称/类型/税号/币种/账期/账期天数，扩展=联系人/邮箱/电话/地址/国家/备注
    keyFields: ['supplier_name','supplier_type','tax_no','default_currency','payment_terms','credit_days'],
  },
  project: {
    // G86 2026-06-12：切换到统一项目主表 biz_projects（MDM-1 已于 06-05 在生产建表；
    //   历史采购项目表为被取代的空表，前端 procurement2/projects 已重定向主数据中心）
    table: 'biz_projects', codeCol: 'project_code', nameCol: 'project_name', noValidityPeriod: true,  // G127：biz_projects 无生效期列
    prefix: 'PRJ', objectType: 'PROJECT', companyCol: 'company_code',
    writableCols: ['project_name','project_name_en','project_name_lo','project_short_name','company_code','project_type',
                   'budget_amount','budget_currency','start_date','end_date','manager_name','remark'],
    // G92：关键字段=名称/归属公司/预算金额/预算币种，扩展=简称/类型/起止日期/负责人/备注
    keyFields: ['project_name','company_code','budget_amount','budget_currency'],
  },
  material: {
    // G86 采购物料主数据（饲料/兽药/包材/配件/建材——采购的物品来源，区别于自家产品 SKU）
    table: 'mst_materials', codeCol: 'material_code', nameCol: 'material_name',
    prefix: 'MAT', objectType: 'MATERIAL', noValidityPeriod: true,  // G127：mst_materials 无生效期列
    writableCols: ['material_name','material_name_en','material_name_lo','material_type','spec','unit','default_currency','remark'],
    approvalOnCreate: false,   // G92：运营类 → 免审批快建（业务员选物料找不到可就地新增）
  },
  'cash-account': {
    table: 'fin_cash_accounts', codeCol: 'account_code', nameCol: 'account_name',
    prefix: 'CASH', objectType: 'CASH_ACCOUNT', companyCol: 'company_code',  // G5.5-C: 统一自动生成（CASH-00001）
    writableCols: ['account_name','account_name_en','account_name_lo','company_code','company_name','currency_code','account_type','bank_name','bank_account_no','bank_acc_code','holder_code','remark','effective_date','expire_date'],
    // G92：资金账户 → 审批；关键字段=账户名/归属公司/币种/账户类型/银行账号/持有人，扩展=开户行名/备注
    keyFields: ['account_name','company_code','currency_code','account_type','bank_account_no','holder_code'],
  },
  // ════ G5.5-C 新增 9 类主数据（P0 + P1）════
  product: {
    // FIX 2026-06-05: 真实表名是 mst_products（不是 product_master，后者根本不存在 → HTTP 500）
    // writableCols 按 mst_products 实际列校正（无 product_name_en/uom/default_grade/effective_date/expire_date/remark）
    table: 'mst_products', codeCol: 'product_code', nameCol: 'product_name',
    prefix: 'PRD', objectType: 'PRODUCT', noValidityPeriod: true,  // G127：mst_products 无生效期列（见上行 FIX 注释）
    writableCols: ['product_name','product_name_zh','product_name_en','product_name_lo','category_code','unit_zh','unit_lo','shelf_life_days','price_retail','price_wholesale','has_grade','has_spec','image_url','specs'],
    // G92：产品含零售/批发价 → 审批；关键字段=名称/类目/价格/分级开关，扩展=多语名/单位/保质期/图片/规格
    keyFields: ['product_name','category_code','price_retail','price_wholesale','has_grade','has_spec'],
  },
  store: {
    table: 'mst_stores', codeCol: 'store_code', nameCol: 'store_name',
    prefix: 'STR', objectType: 'STORE', companyCol: 'company_code',
    // G113：加 operation_type(经营类型,字典 STORE_OP_TYPE) + contact(联系人)
    writableCols: ['store_name','store_name_en','store_name_lo','address','phone','company_code','manager','contact','operation_type','effective_date','expire_date','remark'],
    // G92：门店为经营实体 → 审批；关键字段=名称/归属公司/店长，扩展=地址/电话/备注
    keyFields: ['store_name','company_code','manager'],
  },
  'bank-account': {
    table: 'fin_bank_accounts', codeCol: 'bank_account_code', nameCol: 'bank_name',
    prefix: 'BANK', objectType: 'BANK_ACCOUNT', companyCol: 'company_code',
    writableCols: ['bank_name','bank_name_en','bank_name_lo','branch_name','account_no','account_holder','currency_code','country_code','swift_code','iban','company_code','effective_date','expire_date','remark'],
    // G92：银行账户最敏感 → 审批；关键字段=行名/账号/户名/币种/归属公司/SWIFT/IBAN，扩展=支行/国家/备注
    keyFields: ['bank_name','account_no','account_holder','currency_code','company_code','swift_code','iban'],
  },
  sku: {
    table: 'product_skus', codeCol: 'sku_code', nameCol: 'sku_name',
    prefix: 'SKU', objectType: 'SKU',
    writableCols: ['sku_name','sku_name_en','sku_name_lo','product_code','product_name','grade_code','spec_code','barcode','effective_date','expire_date','remark'],
    approvalOnCreate: false,   // G92：运营类 → 免审批快建
  },
  warehouse: {
    table: 'wms_warehouses', codeCol: 'warehouse_code', nameCol: 'warehouse_name',
    prefix: 'WH', objectType: 'WAREHOUSE', companyCol: 'company_code',
    writableCols: ['warehouse_name','warehouse_name_zh','warehouse_name_en','warehouse_name_lo','type','company_code','owner_store_id','manager','effective_date','expire_date','remark'],
    // G92：仓库为基础设施实体 → 审批；关键字段=名称/类型/归属公司/管理员，扩展=中文名/备注
    keyFields: ['warehouse_name','type','company_code','manager'],
  },
  grade: {
    // FIX UAT-1 2026-06-04: 表实际列含 grade_name_lo/is_saleable/is_storable；effective_date 由迁移补
    table: 'product_grades', codeCol: 'grade_code', nameCol: 'grade_name',
    prefix: 'GRD', objectType: 'GRADE',
    writableCols: ['grade_name','grade_name_en','grade_name_lo','sort_order','is_saleable','is_storable','remark'],
    approvalOnCreate: false,   // G92：运营类 → 免审批快建
  },
  spec: {
    // FIX UAT-1 2026-06-04: 实际列为 qty_per_unit/base_unit/display_unit（不是 unit_count/pack_type）
    table: 'packaging_specs', codeCol: 'spec_code', nameCol: 'spec_name',
    prefix: 'SPEC', objectType: 'SPEC',
    writableCols: ['spec_name','spec_name_en','spec_name_lo','qty_per_unit','base_unit','display_unit','sort_order','remark'],
    approvalOnCreate: false,   // G92：运营类 → 免审批快建
  },
  driver: {
    // FIX UAT-1 2026-06-04: PK 是 driver_code（不是 driver_name），且无 effective_date/expire_date 列
    table: 'sal_drivers', codeCol: 'driver_code', nameCol: 'driver_name',
    prefix: 'DRV', objectType: 'DRIVER', companyCol: 'company_code',
    writableCols: ['driver_name','driver_name_en','driver_name_lo','phone','license_no','company_code','remark'],
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
    noValidityPeriod: true,  // sys_dict 无 effective_date/expire_date 列：listActive 跳过生效期过滤,否则 /dict/active 报 42703 → 400
    writableCols: ['dict_code','dict_type','name','dict_label_zh','dict_label_lo','dict_label_en','dict_value','sort_no','config_json'],
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

// G92：字段级变更审批统一 bizType（独立 md_change_requests 表承载）。
//   G93 起默认走「规则自动审批网关」；G126 起对下方「财务敏感字段白名单」重新启用人工复核通道。
const FIELD_CHANGE_BIZ = 'MD_FIELD_CHANGE';

// G126：财务敏感字段白名单——这些字段被改时**不**走 G93 自动落库，而转人工审批（复用 G92 通道）。
//   Why：授信额度/账期/账期天数直接影响资金风险敞口，养殖/食品行业须财务复核签核后方可生效。
//   其余字段仍走 G93 自动校验网关即时生效。仅对 live(ACTIVE/FROZEN) 记录生效；草稿态编辑不拦。
const SENSITIVE_APPROVAL_FIELDS: Record<string, string[]> = {
  customer: ['credit_limit', 'payment_terms'],
  supplier: ['credit_days', 'payment_terms'],
};

// ════════════════════════════════════════════════════════════════════════
// G93 主数据自动审批网关（2026-06-13，用户拍板：全自动无例外 / 名称+唯一键查重 / 当场退回列原因）
// ────────────────────────────────────────────────────────────────────────
// 提交即跑规则校验：①必填完备 ②查重（名称+关键唯一键）③格式规范 ④值域合法 ⑤引用存在。
//   全过 → 自动通过、直接 ACTIVE（operator 标 AUTO）；任一不过 → 抛错列出全部原因，当场退回。
//   新建时校验全字段；编辑时只校验「本次改动的字段」（容忍历史脏数据，不因未触碰的旧字段卡死编辑）。
// ════════════════════════════════════════════════════════════════════════

interface UniqueKey {
  fields: string[];            // 组成唯一键的列（多列=组合唯一）
  scopeByCompany?: boolean;    // 是否限定在同 company_code 范围内查重
  skipEmpty?: boolean;         // 任一列为空则跳过该键（如税号/条码非必填）
  label: string;               // 中文名（用于错误提示）
}
interface ValidationCfg {
  required?: string[];         // 必填列（默认 [nameCol]）
  unique?: UniqueKey[];        // 查重键
}

const VALIDATION: Record<string, ValidationCfg> = {
  customer: {
    required: ['customer_name', 'customer_type', 'company_code'],
    unique: [{ fields: ['customer_name'], scopeByCompany: true, label: '客户名称' }],
  },
  supplier: {
    required: ['supplier_name', 'supplier_type'],
    unique: [
      { fields: ['supplier_name'], label: '供应商名称' },
      { fields: ['tax_no'], skipEmpty: true, label: '税号' },
    ],
  },
  project: {
    required: ['project_name', 'company_code'],
    unique: [{ fields: ['project_name'], scopeByCompany: true, label: '项目名称' }],
  },
  material: {
    required: ['material_name', 'material_type'],
    unique: [{ fields: ['material_name'], label: '物料名称' }],
  },
  'cash-account': {
    required: ['account_name', 'company_code', 'currency_code'],
    unique: [
      { fields: ['account_name'], scopeByCompany: true, label: '账户名称' },
      { fields: ['bank_account_no'], skipEmpty: true, label: '银行账号' },
    ],
  },
  'bank-account': {
    required: ['bank_name', 'account_no', 'account_holder', 'currency_code'],
    unique: [{ fields: ['account_no'], label: '银行账号' }],
  },
  product: {
    required: ['product_name'],
    unique: [{ fields: ['product_name'], label: '产品名称' }],
  },
  store: {
    required: ['store_name', 'company_code'],
    unique: [{ fields: ['store_name'], scopeByCompany: true, label: '门店名称' }],
  },
  warehouse: {
    required: ['warehouse_name', 'company_code'],
    unique: [{ fields: ['warehouse_name'], scopeByCompany: true, label: '仓库名称' }],
  },
  sku: {
    required: ['sku_name'],
    unique: [
      { fields: ['sku_name'], label: 'SKU 名称' },
      { fields: ['barcode'], skipEmpty: true, label: '条码' },
    ],
  },
  grade: { required: ['grade_name'], unique: [{ fields: ['grade_name'], label: '等级名称' }] },
  spec: { required: ['spec_name'], unique: [{ fields: ['spec_name'], label: '规格名称' }] },
  driver: {
    required: ['driver_name'],
    unique: [
      { fields: ['driver_name'], scopeByCompany: true, label: '司机姓名' },
      { fields: ['phone'], skipEmpty: true, label: '司机电话' },
    ],
  },
  vehicle: { required: ['plate_no'], unique: [{ fields: ['plate_no'], label: '车牌号' }] },
  // organization/company：同名在不同上级下合法（财务部×N），不做名称查重，只校必填+格式
  organization: { required: ['org_name', 'org_type'], unique: [] },
  company: { required: ['org_name'], unique: [] },
  // dict：另有 sys_dict DML 授权门槛，自动审批不介入查重
  dict: { required: ['dict_label_zh'], unique: [] },
};

/** 列名 → 中文（错误提示用，保证前端全中文）；未命中回退列名 */
const FIELD_LABELS: Record<string, string> = {
  customer_name: '客户名称', customer_type: '客户类型', company_code: '归属公司', company_name: '公司名称',
  contact_name: '联系人', contact_phone: '联系电话', contact_email: '联系邮箱', credit_limit: '信用额度',
  payment_terms: '账期', supplier_name: '供应商名称', supplier_type: '供应商类型', tax_no: '税号',
  default_currency: '默认币种', currency_code: '币种', budget_currency: '预算币种', credit_days: '账期天数',
  project_name: '项目名称', budget_amount: '预算金额', material_name: '物料名称', material_type: '物料类型',
  account_name: '账户名称', account_type: '账户类型', bank_account_no: '银行账号', account_no: '银行账号',
  holder_code: '持有人', bank_name: '开户行', account_holder: '账户持有人', swift_code: 'SWIFT',
  product_name: '产品名称', category_code: '类目', store_name: '门店名称', warehouse_name: '仓库名称',
  sku_name: 'SKU 名称', barcode: '条码', grade_name: '等级名称', spec_name: '规格名称',
  driver_name: '司机姓名', phone: '电话', plate_no: '车牌号', org_name: '组织名称', org_type: '组织类型',
  dict_label_zh: '字典名称', manager: '负责人', manager_name: '负责人', manager_user_id: '负责人',
};
const zhField = (f: string) => FIELD_LABELS[f] ?? f;

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

  private async nextCode(c: MdTypeConfig): Promise<string> {
    if (!c.prefix) return '';
    try {
      return await this.codeGen.next(c.prefix);
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '');
      if (msg.includes('编码前缀未注册')) {
        throw new BadRequestException(`${msg}；请先执行主数据编码前缀初始化`);
      }
      throw e;
    }
  }

  /** 校验某字典类型下是否存在该值（容错：查询异常一律放行，不阻断业务） */
  private async isDictValue(dictType: string, val: string): Promise<boolean> {
    try {
      const [r] = await this.ds.query(
        `SELECT 1 FROM sys_dict WHERE dict_type=$1 AND (dict_value=$2 OR dict_code=$2) LIMIT 1`,
        [dictType, val],
      );
      return !!r;
    } catch { return true; }
  }

  /**
   * G93 自动审批校验网关。返回中文错误清单（空数组=全过=可自动通过）。
   *   @param scope  仅校验这些列（编辑时=本次改动列，容忍历史脏数据）；undefined=校验全部（新建）。
   *   @param selfCode  查重时排除自身编码（编辑场景）。
   */
  private async validate(
    type: string, c: MdTypeConfig, record: Record<string, any>,
    selfCode?: string, scope?: Set<string>,
  ): Promise<string[]> {
    const errors: string[] = [];
    const v = VALIDATION[type];
    const inScope = (f: string) => !scope || scope.has(f);
    const nonEmpty = (x: any) => x != null && String(x).trim() !== '';

    // ① 必填完备
    const required = v?.required ?? [c.nameCol];
    for (const f of required) {
      if (!inScope(f)) continue;                         // 编辑未触碰则不强制
      if (!nonEmpty(record[f])) errors.push(`必填项「${zhField(f)}」不能为空`);
    }

    // ② 查重（名称 + 关键唯一键）
    for (const u of (v?.unique ?? [])) {
      if (!u.fields.some(inScope)) continue;             // 该键涉及的列都没改 → 跳过
      const vals = u.fields.map((f) => record[f]);
      if (u.skipEmpty && vals.some((x) => !nonEmpty(x))) continue;
      if (vals.every((x) => !nonEmpty(x))) continue;
      const where: string[] = [`status <> 'ARCHIVED'`]; const params: any[] = [];
      params.push(selfCode ?? '__none__'); where.push(`${c.codeCol} <> $${params.length}`);
      for (const f of u.fields) { params.push(record[f]); where.push(`${f} = $${params.length}`); }
      if (u.scopeByCompany && c.companyCol && nonEmpty(record[c.companyCol])) {
        params.push(record[c.companyCol]); where.push(`${c.companyCol} = $${params.length}`);
      }
      try {
        const [dup] = await this.ds.query(
          `SELECT ${c.codeCol} AS code FROM ${c.table} WHERE ${where.join(' AND ')} LIMIT 1`, params);
        if (dup) errors.push(`${u.label}「${u.fields.map((f) => record[f]).join('/')}」已存在（编码 ${dup.code}），不可重复`);
      } catch { /* 查重失败不阻断 */ }
    }

    // ③ 格式规范（按列名启发式，仅校验范围内的非空值）
    for (const f of Object.keys(record)) {
      if (!inScope(f) || !nonEmpty(record[f])) continue;
      const s = String(record[f]).trim();
      if (f.includes('phone') && !/^[0-9+\-\s()]{6,20}$/.test(s)) errors.push(`「${zhField(f)}」格式不规范（应为 6~20 位电话）：${s}`);
      if (f.includes('email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) errors.push(`「${zhField(f)}」邮箱格式不规范：${s}`);
      if (f === 'swift_code' && !/^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/.test(s)) errors.push(`SWIFT 格式不规范（应 8 或 11 位字母数字）：${s}`);
    }

    // 生效期是所有引用链的共同边界；禁止保存反向区间，避免档案 ACTIVE
    // 但永远无法被 Selector / 业务校验引用的隐性脏数据。
    if (!c.noValidityPeriod
        && (inScope('effective_date') || inScope('expire_date'))
        && nonEmpty(record.effective_date) && nonEmpty(record.expire_date)) {
      const effective = String(record.effective_date).slice(0, 10);
      const expire = String(record.expire_date).slice(0, 10);
      if (effective > expire) errors.push('生效日期不能晚于失效日期');
    }

    // ④ 值域合法（币种走字典）
    for (const f of ['currency_code', 'default_currency', 'budget_currency']) {
      if (!inScope(f) || !nonEmpty(record[f])) continue;
      const s = String(record[f]).trim();
      if (!(await this.isDictValue('SYS_CURRENCY', s))) errors.push(`「${zhField(f)}」不在币种字典中：${s}`);
    }

    // ⑤ 引用存在（归属公司必须存在且 ACTIVE；组织/公司自身表跳过避免自指）
    if (c.companyCol && c.table !== 'sys_organizations' && inScope(c.companyCol) && nonEmpty(record[c.companyCol])) {
      const cc = String(record[c.companyCol]).trim();
      try {
        const [org] = await this.ds.query(
          `SELECT 1 FROM sys_organizations WHERE org_code=$1 AND status='ACTIVE' LIMIT 1`, [cc]);
        if (!org) errors.push(`归属公司「${cc}」不存在或未生效`);
      } catch { /* 引用校验失败不阻断 */ }
    }

    if (type === 'warehouse' && inScope('owner_store_id') && nonEmpty(record.owner_store_id)) {
      try {
        const [store] = await this.ds.query(
          `SELECT store_code,company_code,status FROM store_master WHERE id=$1 LIMIT 1`,
          [record.owner_store_id],
        );
        if (!store || store.status !== 'ACTIVE') {
          errors.push('owner_store_id 必须指向 ACTIVE 门店');
        } else if (String(record.company_code || '') !== store.company_code) {
          errors.push('门店自有仓与 owner store 必须属于同一公司');
        } else if (nonEmpty(record.warehouse_code)) {
          const companyShort = store.company_code.replace(/^COMP-/, '').replace(/[^A-Z0-9]+/gi, '_').toUpperCase();
          const storeShort = store.store_code.replace(/^STORE-/, '').replace(/[^A-Z0-9]+/gi, '_').toUpperCase();
          const expected = `ST_${companyShort}_${storeShort}_SALES`;
          if (String(record.warehouse_code) !== expected) errors.push(`门店自有仓编码必须为 ${expected}`);
        }
      } catch {
        errors.push('无法校验 owner_store_id，请稍后重试');
      }
    }

    return errors;
  }

  /**
   * G71：解析当前用户对该实体的公司可见范围。
   *   返回 'ALL'（无 company 维度 / 全局 / 内部调用）
   *      | 'DENY'（有公司维度但无任何可见公司，或登录用户的 scope 无法可靠解析）
   *      | string[]（可见公司编码，用于 company_code = ANY(...)）
   *
   * 安全边界：
   *   - 无 user 的内部调用保持不收窄，避免后台治理任务被误伤。
   *   - 已登录用户的 userId 缺失或 DataScope 解析异常必须 fail-closed。
   *     否则 Selector/Runtime 在异常态会退化为全集团主数据可见。
   */
  private async allowedCompanies(c: MdTypeConfig): Promise<'ALL' | 'DENY' | string[]> {
    if (!c.companyCol) return 'ALL';                          // 无公司维度（全局共享主数据）
    const user = this.cls.get('user') as Record<string, any> | undefined;
    if (!user) return 'ALL';                                  // 内部调用无用户上下文，不收窄
    const userId = String(user.userId ?? user.id ?? user.sub ?? '');
    if (!userId) {
      this.logger.warn('[MdRuntime] 已登录用户缺少 userId，拒绝公司维度主数据可见范围');
      return 'DENY';
    }
    const roles: string[] = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    try {
      const scopeMenu = OBJECT_TYPE_TO_MENU[c.objectType] ?? 'MENU_MD_CENTER';
      const scope = await this.dataScope.resolve(userId, roles, scopeMenu);
      if (scope.isGlobal) return 'ALL';
      if (!scope.allowedCompanyCodes.length) return 'DENY';   // 无可见公司 → 拒绝全部
      return scope.allowedCompanyCodes;
    } catch (e: any) {
      this.logger.warn(`[MdRuntime] DataScope 解析失败，拒绝公司维度主数据可见范围：${e?.message}`);
      return 'DENY';
    }
  }

  /**
   * 公司维度主数据写保护：
   *   - 读路径由 allowedCompanies/list/get 收窄。
   *   - 写路径也必须校验目标 company_code，否则用户可能在创建或编辑时把主数据挂到不可见公司。
   */
  private async assertWritableCompanyScope(c: MdTypeConfig, record: Record<string, any>): Promise<void> {
    if (!c.companyCol) return;
    const allowed = await this.allowedCompanies(c);
    if (allowed === 'ALL') return;
    const companyCode = String(record[c.companyCol] ?? '').trim();
    if (allowed === 'DENY' || !companyCode || !allowed.includes(companyCode)) {
      throw new ForbiddenException('DATA_SCOPE_DENIED');
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
    // G127：表无生效期列的类型（material/spec/project）跳过 effective_date/expire_date 过滤，
    //   否则 SQL 引用不存在的列报错 → /:type/active 返 400 → Selector 加载失败。
    const validityClause = c.noValidityPeriod
      ? ''
      : ` AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
          AND (expire_date    IS NULL OR expire_date    >= CURRENT_DATE)`;
    return this.ds.query(
      `SELECT ${c.codeCol} AS code, ${c.nameCol} AS name FROM ${c.table}
        WHERE status = 'ACTIVE'${validityClause}${companyClause}
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
   * 新增（G93 自动审批）：自动编码 → 规则校验网关 → 全过即 ACTIVE，不过抛错列原因当场退回。
   *   不再有 DRAFT/人工审批环节：建档即校验即生效，「随时新建、自动进名单」。
   */
  async create(type: string, dto: Record<string, any>, operator?: string): Promise<{ code: string; status: string }> {
    const c = this.cfg(type);
    const code = type === 'warehouse' && dto.owner_store_id
      ? String(dto[c.codeCol] || '').trim()
      : c.prefix ? await this.nextCode(c) : String(dto[c.codeCol] || '').trim();
    if (!code) throw new BadRequestException('编码不能为空');

    // 自动审批校验（新建校验全字段）
    const errors = await this.validate(type, c, { ...dto, [c.codeCol]: code }, code);
    if (errors.length) throw new BadRequestException(`自动审批未通过：${errors.join('；')}`);
    await this.assertWritableCompanyScope(c, dto);

    const cols = [c.codeCol, 'status']; const vals: any[] = [code, 'ACTIVE'];
    for (const col of c.writableCols) {
      if (dto[col] !== undefined) { cols.push(col); vals.push(dto[col]); }
    }
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
    await this.ds.query(`INSERT INTO ${c.table} (${cols.join(',')}) VALUES (${placeholders})`, vals);

    await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'CREATE', after: { ...dto, status: 'ACTIVE', _autoApproved: true }, operator: operator ?? 'AUTO' });
    return { code, status: 'ACTIVE' };
  }

  /**
   * G91 就地快速新建（直接 ACTIVE，立即可用）——供「采购选物料时找不到→立即建档」等场景。
   *   与 create() 同结构，仅状态 DRAFT→ACTIVE（跳审批，operational 主数据的便捷新增；
   *   主数据中心仍可后续冻结/归档清理）。审计 action=CREATE_QUICK 留痕。
   */
  async createQuick(type: string, dto: Record<string, any>, operator?: string): Promise<{ code: string; name: string }> {
    const c = this.cfg(type);
    const code = type === 'warehouse' && dto.owner_store_id
      ? String(dto[c.codeCol] || '').trim()
      : c.prefix ? await this.nextCode(c) : String(dto[c.codeCol] || '').trim();
    if (!code) throw new BadRequestException('编码不能为空');
    const name = String(dto[c.nameCol] ?? '').trim();
    if (!name) throw new BadRequestException('名称不能为空');

    // G93：就地快建也走自动审批校验（查重/必填/格式），不过当场退回
    const errors = await this.validate(type, c, { ...dto, [c.codeCol]: code }, code);
    if (errors.length) throw new BadRequestException(`自动审批未通过：${errors.join('；')}`);
    await this.assertWritableCompanyScope(c, dto);

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
   * 编辑（G93 自动审批）：对本次改动的字段跑校验网关（查重/必填/格式/值域/引用），
   *   全过 → 立即落库生效；不过 → 抛错列原因当场退回。只校验改动列，容忍历史脏数据。
   *   （返回 pendingChange 字段保留以兼容前端；自动审批下恒为 false。）
   */
  async update(
    type: string, code: string, dto: Record<string, any>, operator?: string,
  ): Promise<{ code: string; pendingChange: boolean; changeRequestId?: number; pendingFields?: string[]; message?: string }> {
    const c = this.cfg(type);
    const before = await this.get(type, code);

    // 计算真正变化的列
    const changes: Record<string, any> = {};
    for (const col of c.writableCols) {
      if (dto[col] === undefined) continue;
      if (this.eqVal(before[col], dto[col])) continue;
      changes[col] = dto[col];
    }
    const changedCols = Object.keys(changes);
    if (!changedCols.length) return { code, pendingChange: false };

    // 自动审批校验：以「改动后整体记录」为输入、只校验改动列、查重排除自身
    //   （含敏感字段，保证转审批前格式/值域已正确，避免脏请求进审批队列）
    const merged = { ...before, ...changes };
    const errors = await this.validate(type, c, merged, code, new Set(changedCols));
    if (errors.length) throw new BadRequestException(`自动审批未通过：${errors.join('；')}`);
    await this.assertWritableCompanyScope(c, merged);

    // G126：拆分「财务敏感字段」与「普通字段」。敏感字段仅对 live(ACTIVE/FROZEN) 记录拦截转审批。
    const sensitive = SENSITIVE_APPROVAL_FIELDS[type] ?? [];
    const live = ['ACTIVE', 'FROZEN'].includes(String(before.status));
    const sensitiveChanges: Record<string, any> = {};
    const normalChanges: Record<string, any> = {};
    for (const col of changedCols) {
      if (sensitive.includes(col) && live) sensitiveChanges[col] = changes[col];
      else normalChanges[col] = changes[col];
    }

    // 1) 普通字段（及草稿态一切）→ G93 自动通过立即落库
    if (Object.keys(normalChanges).length) {
      await this.applyCols(c, code, normalChanges);
      await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'UPDATE', before: this.pick(before, Object.keys(normalChanges)), after: { ...normalChanges, _autoApproved: true }, operator: operator ?? 'AUTO' });
    }

    // 2) 财务敏感字段 → 走人工审批（复用 G92 md_change_requests + MD_FIELD_CHANGE 通道）
    const sensCols = Object.keys(sensitiveChanges);
    if (!sensCols.length) return { code, pendingChange: false };
    const sensLabel = sensCols.map((k) => FIELD_LABELS[k] ?? k).join('、');

    try {
      let crId = 0;
      await this.ds.transaction(async (mgr) => {
        const [cr] = await mgr.query(
          `INSERT INTO md_change_requests
             (md_type, object_type, object_code, target_table, code_col, changes, before_snapshot, status, requested_by)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'PENDING',$8)
           RETURNING id`,
          [type, c.objectType, code, c.table, c.codeCol,
            JSON.stringify(sensitiveChanges), JSON.stringify(this.pick(before, sensCols)), operator ?? null],
        );
        crId = Number(cr.id);
        // 启动审批（引擎建实例 + 派审批人；通过后回写 status + 触发 onApproved 把变更应用回主表）
        await this.approval.startApproval({
          bizType: FIELD_CHANGE_BIZ, bizId: String(crId), bizNo: `${c.objectType}/${code}`, amount: 0,
          companyCode: before.company_code ?? undefined,
          subject: `财务敏感字段变更审批：${before[c.nameCol] ?? code}（${sensLabel}）`,
        }, mgr);
      });
      await this.audit.log({
        objectType: c.objectType, objectCode: code, action: 'UPDATE',
        before: this.pick(before, sensCols), after: { ...sensitiveChanges, _pendingApproval: true, _changeRequestId: crId },
        operator, reason: `财务敏感字段变更提交审批：${sensLabel}`,
      });
      return {
        code, pendingChange: true, changeRequestId: crId, pendingFields: sensCols,
        message: `财务敏感字段（${sensLabel}）变更已提交审批，通过后生效；原值在通过前保持有效。`,
      };
    } catch (e: any) {
      // 降级：审批链未配置/启动失败 → 直接落库不丢编辑，审计标注（事务已回滚，变更请求未残留）
      this.logger.warn(`[MdRuntime] ${FIELD_CHANGE_BIZ} 启动失败，降级直接落库：${e?.message}`);
      await this.applyCols(c, code, sensitiveChanges);
      await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'UPDATE', before: this.pick(before, sensCols), after: { ...sensitiveChanges, _degraded: true }, operator, reason: '财务敏感字段变更（降级·审批不可用直接生效）' });
      return { code, pendingChange: false };
    }
  }

  /** 生命周期流转：submit/approve/reject/freeze/archive/restore */
  async transition(type: string, code: string, action: string, operator?: string, reason?: string): Promise<{ status: string }> {
    const c = this.cfg(type);
    const before = await this.get(type, code);
    const cur = before.status;

    // ── G93：submit 改为「自动审批」——跑校验网关，全过即 ACTIVE，不过抛错退回 ──────────
    //   （取代 G3-B 的人工 Workflow 审批；遗留 DRAFT/REJECTED 记录提交时同样走自动审批）
    if (action === 'submit') {
      if (!['DRAFT', 'REJECTED'].includes(cur)) {
        throw new BadRequestException(`当前状态 ${cur} 不允许提交`);
      }
      const errors = await this.validate(type, c, before, code);
      if (errors.length) throw new BadRequestException(`自动审批未通过：${errors.join('；')}`);
      await this.ds.query(`UPDATE ${c.table} SET status = 'ACTIVE', updated_at = NOW() WHERE ${c.codeCol} = $1`, [code]);
      await this.audit.log({ objectType: c.objectType, objectCode: code, action: 'UPDATE', before: { status: cur }, after: { status: 'ACTIVE', _autoApproved: true }, operator: operator ?? 'AUTO', reason: '自动审批通过' });
      return { status: 'ACTIVE' };
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
