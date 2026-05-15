// ============================================================
// Phoenix ERP V3 — 核心 TypeScript 类型定义
// ============================================================

// ── 用户与认证 ──────────────────────────────────────────────
// 匹配 NestJS auth.service.ts login() 返回的 user_info 对象
export interface AuthUser {
  userId: number;
  username: string;
  realNameZh: string;        // 概居中文姓名
  name: string;              // 前端显示用别名，占位符
  role: string;              // 主角色代码如 ROLE_ADMIN
  permissions: string[];     // [‘*’] 表示超管
  storeCode?: string;
  store_code?: string;
  locale?: string;
  token: string;             // JWT Bearer token
}

// ── Generic CRUD API ────────────────────────────────────────
export interface CrudListResponse<T = Record<string, unknown>> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CrudResponse<T = Record<string, unknown>> {
  data: T;
  message?: string;
}

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

// ── 数据字典 ────────────────────────────────────────────────
export interface DictEntry {
  id: number;
  dict_code: string;
  dict_type: string;
  dict_name: string;
  dict_value: string;
  sort_order?: number;
  is_active?: boolean;
  remark?: string;
}

// ── 分页参数 ────────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  [key: string]: string | number | boolean | undefined;
}

// ── 表单状态 ────────────────────────────────────────────────
export type FormMode = "create" | "edit" | "view";

// ── 用户管理 ────────────────────────────────────────────────
export interface SysUser {
  id: number;
  username: string;
  name: string;
  role: string;
  phone?: string;
  email?: string;
  store_code?: string;
  is_active: boolean;
  created_at?: string;
}

// ── 角色权限 ────────────────────────────────────────────────
export interface SysRole {
  id: number;
  role_code: string;
  role_name: string;
  permissions: string[];
  description?: string;
}

// ── 主数据 ────────────────────────────────────────────────
export interface MstProduct {
  id: number;
  product_code: string;
  product_name: string;
  category: string;
  unit: string;
  price?: number;
  is_active: boolean;
}

export interface MstStore {
  id: number;
  store_code: string;
  store_name: string;
  store_type: string;
  region?: string;
  address?: string;
  phone?: string;
  manager_name?: string;
  is_active: boolean;
}

// ── 养殖生产 ────────────────────────────────────────────────
export interface BrdFarm {
  id: number;
  farm_code: string;
  farm_name: string;
  location?: string;
  capacity?: number;
  status?: string;
}

export interface BrdHouse {
  id: number;
  house_code: string;
  house_name: string;
  farm_code?: string;
  capacity?: number;
  current_birds?: number;
  status?: string;
}

export interface BrdFlock {
  id: number;
  flock_code: string;
  house_code?: string;
  batch_no?: string;
  breed?: string;
  quantity?: number;
  entry_date?: string;
  status?: string;
}
