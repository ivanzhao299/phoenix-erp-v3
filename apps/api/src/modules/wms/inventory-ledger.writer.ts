import { EntityManager, QueryRunner } from 'typeorm';
import { InvLedgerChangeType } from './inv-ledger-change-types';

/**
 * inv_ledger 统一写入器（INV-301 步骤 3a）。
 *
 * ## 为什么是纯函数而不是 Nest service
 * 五个写引擎（wms / egg-inventory / store-pos / farm 日报 / farm 兽药）分属不同
 * Nest 模块，且各自持有事务句柄（EntityManager 或 QueryRunner）。做成无状态纯
 * 函数可直接接收调用方已有的事务句柄，不引入任何模块依赖图变动（无
 * module provider 注册、无 forwardRef），也不改变各引擎的事务边界。
 *
 * ## 解决什么问题（INV-104 类列错位）
 * 历史上各引擎手写 `INSERT INTO inv_ledger (...) VALUES ($1, $11, $2::numeric, ...)`
 * 这类乱序占位符 SQL —— store_code 位一旦被误传公司码（INV-104 实案），门店
 * 归因与 store JOIN 全线失效。本写入器用单一有序数组同时生成列清单与参数
 * 数组，列与值在结构上不可能错位；核心七列固定为
 * `batch_no, change_type, qty_change, operator, store_code, ref_no, note`，
 * 因此占位符 `$5` 恒为 store_code。
 *
 * ## 列语义与超集来源（2026-11-17 全库写入侧盘点）
 * - 核心七列：所有引擎共有（v3_schema_complete.sql 基线）。
 * - batch_expire_date / quality_grade / company_code / sku_code / log_date /
 *   warehouse_code / location_code：egg-inventory 引擎既有 14 列形态
 *   （20260527_sales_v2_phase7_egg_inventory.sql + H4 sku 迁移 + 维度迁移），
 *   顺序保持与 egg 现状一致以维持既有 spec 钉死的参数位。
 * - material_code / business_type / unit / destination_type / destination_code /
 *   project_code / department_code：wms 引擎（入库确认/采购收货/出库/调拨/
 *   盘点/损耗，1785200000000-AddWmsIssueOutboundGovernance.ts 加列）。
 * - business_type 同时被 farm 兽药/疫苗引擎使用（FARM_MEDICATION /
 *   FARM_IMMUNIZATION）。
 * - house_code：farm 特有（medication-record / farm-medicine 动态列写入）。
 *   仓库迁移链中无任何 `inv_ledger.house_code` 加列语句，读侧
 *   （farm-egg.service.ts `l.house_code`）未加门控说明生产库存在该列，
 *   但为防列缺失的旧环境，仅当传入非空值时才写入该列。
 *
 * ## 参数与列的对应规则
 * - 核心七列恒定写入（与基线 DDL 默认值一致语义：store_code 显式传值或 null）。
 * - 可选列：参数为 `undefined` → 该列不出现在 INSERT（沿用列的 DB 默认值，
 *   等价于旧引擎"省略列"的写法）；参数为 `null` 或有值 → 该列出现并按值写入
 *   （等价于旧引擎"显式写 NULL/值"的写法）。迁移各引擎时按其旧 SQL 的列集合
 *   逐一对齐，行为不变。
 * - created_at 一律不写：仅 POS 引擎旧写法带 `NOW()`，与列默认
 *   `CURRENT_TIMESTAMP` 同为事务开始时间，语义等价。
 *
 * ## store_code 铁律（INV-104）
 * store_code 只允许三种值：真实门店码（如 POS 的 sale.store_code）、
 * 引擎既有的占位约定字面量（wms 'ALL' / farm 日报 'FACTORY' / farm 兽药
 * 场站码）、或 null。**严禁把公司码（company_code）写进 store_code**；
 * 公司归属一律走 companyCode 参数。无门店上下文的引擎传 null（或既有占位
 * 约定值），mst_stores LEFT JOIN 对 NULL 自然短路。
 *
 * ## 返回值
 * `INSERT ... RETURNING id` 的主键，`Number()` 化；SQL-contract 单测的 mock
 * query 可能不返回行，此时返回 0（与 egg-inventory writeLedger 现状一致，
 * 真实 PG 必返回 id，FK 关联缺真实 id 时 fail-closed）。
 */

/** writer 接受的执行句柄：事务中的 EntityManager / QueryRunner 均可 */
export type InvLedgerExecutor = Pick<EntityManager, 'query'> | Pick<QueryRunner, 'query'>;

export interface WriteInvLedgerParams {
  /** 批次号（inv_batches.batch_no，必填） */
  batchNo: string;
  /** 变动类型，一律取 INV_LEDGER_CHANGE_TYPE 常量（INV-202） */
  changeType: InvLedgerChangeType;
  /** 数量变动，带符号（出库为负） */
  qtyChange: number;
  /** 操作人 */
  operator: string;
  /**
   * 门店归因码。INV-104 铁律：只写真门店码或既有占位约定（'ALL'/'FACTORY'/
   * 场站码），无门店上下文传 null，禁止回退传公司码。
   */
  storeCode?: string | null;
  /** 来源单号（可追溯） */
  refNo: string;
  /** 备注 */
  note: string;
  /** 批次到期日（egg 引擎记录历史） */
  batchExpireDate?: string | null;
  /** 变动时点质量等级 */
  qualityGrade?: string | null;
  /** 公司码（公司归属权威列；不传则省略列走 DB 默认 'ALL'） */
  companyCode?: string | null;
  /** SKU 码（Phase H4 追溯） */
  skuCode?: string | null;
  /** 业务日期（farm 日报/兽药、egg 生产入库使用） */
  logDate?: string | null;
  /** 仓库码 */
  warehouseCode?: string | null;
  /** 库位码 */
  locationCode?: string | null;
  /** 物料码（wms 引擎） */
  materialCode?: string | null;
  /** 业务类型（wms 策略 businessType / farm 'FARM_MEDICATION'、'FARM_IMMUNIZATION'） */
  businessType?: string | null;
  /** 计量单位（wms 引擎） */
  unit?: string | null;
  /** 出库去向类型（wms 出库策略） */
  destinationType?: string | null;
  /** 出库去向编码（wms 出库策略） */
  destinationCode?: string | null;
  /** 项目编码（wms 出库策略） */
  projectCode?: string | null;
  /** 部门编码（wms 出库策略） */
  departmentCode?: string | null;
  /**
   * 鸡舍码（farm 特有）。inv_ledger.house_code 不在迁移链内、部分环境可能
   * 缺列，因此仅在非空时写入（null 时省略列，DB 结果同为 NULL）。
   */
  houseCode?: string | null;
}

/** 可选列的固定追加顺序（egg 14 列形态在前，wms/farm 扩展列在后） */
const OPTIONAL_COLUMNS: Array<{ column: string; key: keyof WriteInvLedgerParams; houseOnlyWhenValue?: boolean }> = [
  { column: 'batch_expire_date', key: 'batchExpireDate' },
  { column: 'quality_grade', key: 'qualityGrade' },
  { column: 'company_code', key: 'companyCode' },
  { column: 'sku_code', key: 'skuCode' },
  { column: 'log_date', key: 'logDate' },
  { column: 'warehouse_code', key: 'warehouseCode' },
  { column: 'location_code', key: 'locationCode' },
  { column: 'material_code', key: 'materialCode' },
  { column: 'business_type', key: 'businessType' },
  { column: 'unit', key: 'unit' },
  { column: 'destination_type', key: 'destinationType' },
  { column: 'destination_code', key: 'destinationCode' },
  { column: 'project_code', key: 'projectCode' },
  { column: 'department_code', key: 'departmentCode' },
  { column: 'house_code', key: 'houseCode', houseOnlyWhenValue: true },
];

/**
 * 统一写一条 inv_ledger 流水并返回新行 id（number）。
 * 列序钉死：核心七列 + 按固定顺序追加的可选列；$5 恒为 store_code。
 */
export async function writeInvLedger(
  em: InvLedgerExecutor,
  params: WriteInvLedgerParams,
): Promise<number> {
  const columns: string[] = [
    'batch_no', 'change_type', 'qty_change', 'operator', 'store_code', 'ref_no', 'note',
  ];
  const values: unknown[] = [
    params.batchNo,
    params.changeType,
    params.qtyChange,
    params.operator,
    params.storeCode ?? null,
    params.refNo,
    params.note,
  ];
  for (const { column, key, houseOnlyWhenValue } of OPTIONAL_COLUMNS) {
    const value = params[key];
    if (value === undefined) continue; // 旧引擎省略该列 → 沿用 DB 默认
    if (houseOnlyWhenValue && value == null) continue; // house_code：缺列环境兜底
    columns.push(column);
    values.push(value ?? null);
  }
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const rows = await em.query(
    `INSERT INTO inv_ledger (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING id`,
    values,
  );
  const first = Array.isArray(rows) ? rows[0] : undefined;
  return Number((first as { id?: number | string } | undefined)?.id ?? 0);
}
