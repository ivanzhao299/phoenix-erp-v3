// ============================================================
// Phoenix ERP — 前端共享类型定义
// 所有实体接口字段与后端 DB 列名严格对齐，勿随意添加不存在的字段
// ============================================================

// ── 认证 ────────────────────────────────────────────────────
export interface AuthUser {
  userId: number;
  username: string;
  realNameZh: string;
  name: string;
  role: string;
  permissions: string[];
  storeCode?: string;
  store_code?: string;
  locale?: string;
  token: string;
}

// ── API 响应包装 ─────────────────────────────────────────────
export interface ApiListResponse<T = Record<string, unknown>> {
  code: number;
  data: T[];
  total?: number;
  message?: string;
}

export interface ApiItemResponse<T = Record<string, unknown>> {
  code: number;
  data: T;
  message?: string;
}

// 兼容旧名称（不要新增引用，逐步迁移到 ApiListResponse）
export type CrudListResponse<T = Record<string, unknown>> = ApiListResponse<T>;
export type CrudResponse<T = Record<string, unknown>> = ApiItemResponse<T>;

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

// ── 通用 ─────────────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  [key: string]: string | number | boolean | undefined;
}

export type FormMode = 'create' | 'edit' | 'view';

// ── 数据字典 sys_dict ────────────────────────────────────────
export interface DictRow {
  id: number;
  dict_code: string;
  dict_type: string;
  dict_label_zh: string;
  dict_label_lo?: string;
  dict_label_en?: string;
  sort_no: number;
  status: string;
  config_json?: string;
}

// ── 用户 sys_user ────────────────────────────────────────────
export interface UserRecord {
  id: number;
  username: string;
  real_name_zh: string;
  real_name_lo?: string;
  role?: string;
  role_name_zh?: string;
  store_code?: string;
  status: string;
  locale?: string;
  phone?: string;
  user_type?: string;
  roles_detail?: UserRole[];
  created_at?: string;
}

export interface UserRole {
  role_code: string;
  role_name_zh: string;
  role_type: string;
  is_primary?: boolean;
}

// ── 角色 sys_role ────────────────────────────────────────────
export interface RoleRow {
  role_id: number;
  role_code: string;
  role_name_zh: string;
  role_name_lo?: string;
  role_type: string;
  approval_level?: number;
  description?: string;
  created_at?: string;
}

// ── 菜单权限 sys_menu ────────────────────────────────────────
export interface MenuRow {
  menu_id: number;
  menu_code: string;
  menu_name_zh: string;
  menu_name_lo?: string;
  domain?: string;
  parent_code?: string;
  sort_order?: number;
  icon?: string;
  route?: string;
}

// ── 组织 sys_organizations（新版，已废弃 sys_orgs）──────────────
export interface OrgRow {
  id:            number;
  orgCode:       string;
  orgName:       string;
  orgType:       'GROUP' | 'COMPANY' | 'FACTORY' | 'PROJECT' | 'WAREHOUSE' | 'STORE' | 'DEPARTMENT';
  parentId:      number | null;
  level:         number;
  path:          string | null;
  status:        string;
  companyCode:   string | null;
  projectCode:   string | null;
  warehouseCode: string | null;
  remark:        string | null;
  managerUserId: number | null;
  managerName:   string | null;
}

// ── 审计日志 sys_audit_log ───────────────────────────────────
export interface AuditLogRow {
  id: number;
  action: string;
  table_name?: string;
  record_id?: string;
  flow_no?: string;
  module?: string;
  submitter?: string;
  status?: string;
  old_data?: string;
  new_data?: string;
  operator?: string;
  ip?: string;
  created_at: string;
}

// ── 养殖场 brd_farms ─────────────────────────────────────────
export interface FarmRow {
  farm_code: string;
  farm_name: string;
  location?: string;
  houses?: number;
  capacity?: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

// ── 鸡舍 brd_houses ──────────────────────────────────────────
export interface HouseRow {
  id?: number;
  house_code: string;
  house_name: string;
  farm_code: string;
  farm_name?: string;
  house_type?: string;
  capacity?: number;
  current_birds?: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

// ── 鸡群 brd_flocks ──────────────────────────────────────────
export interface FlockRow {
  id: number;
  flock_code?: string;
  house_code: string;
  farm_code?: string;
  farm_name?: string;
  breed_type?: string;
  start_date?: string;
  current_qty?: number;
  target_weeks?: number;
  status: string;
  created_at?: string;
}

// ── 订单 ord_orders ──────────────────────────────────────────
export interface OrderRow {
  order_id: number;
  order_no: string;
  customer_id?: number;
  customer_name?: string;
  total_amount?: number;
  currency_code?: string;
  status: string;
  store_code?: string;
  note?: string;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

// ── 客户 ord_customers ───────────────────────────────────────
export interface CustomerRow {
  id: number;
  customer_code: string;
  customer_name: string;
  tier?: string;
  phone?: string;
  address?: string;
  credit_limit?: number;
  status?: string;
}

// ── 采购单 prc_purchase_orders ───────────────────────────────
export interface PurchaseOrderRow {
  id: string;
  po_no: string;
  supplier_code?: string;
  supplier_name?: string;
  subject?: string;
  total_amount?: number;
  currency_code?: string;
  status: string;
  plan_qty?: number;
  received_qty?: number;
  store_code?: string;
  expected_date?: string;
  remark?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// ── 仓库 wms_warehouses ──────────────────────────────────────
export interface WarehouseRow {
  warehouse_code: string;
  warehouse_name: string;
  zone_code?: string;
  status: string;
  store_code?: string;
}

// ── 库位 wms_locations ───────────────────────────────────────
export interface LocationRow {
  location_code: string;
  warehouse_code: string;
  zone_code?: string;
  location_name?: string;
  capacity_qty?: number;
  status: string;
  store_code?: string;
  created_at?: string;
}

// ── 库存余额 wms_stock_balance ───────────────────────────────
export interface StockBalanceRow {
  id: string;
  warehouse_code: string;
  location_code?: string;
  spec_code: string;
  batch_no?: string;
  qty: number;
  locked_qty?: number;
  store_code?: string;
  version?: number;
  updated_at?: string;
}

// ── 资金流水 biz_cash_flow ───────────────────────────────────
export interface CashFlowRow {
  id: number;
  flow_type: string;
  category?: string;
  amount: number;
  currency_code?: string;
  payer?: string;
  payee?: string;
  remark?: string;
  status: string;
  ref_doc_id?: number;
  store_code?: string;
  created_at?: string;
}

// ── 产品 sys_products ────────────────────────────────────────
export interface ProductRow {
  id?: number | string;
  code?: string;
  product_code?: string;
  name_zh: string;
  name_lo?: string;
  product_name_zh?: string;
  product_name_lo?: string;
  category_code?: string;
  unit?: string;
  specs?: string;
  shelfLife?: string | number;
  shelf_life_days?: number;
  price?: number;
  status?: string;
  image_url?: string;
}
