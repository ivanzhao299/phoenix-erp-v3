/**
 * inv_batches 守卫化批量更新统一入口（INV-301 步骤 3b）。
 *
 * ## 为什么需要它
 * 归一前 egg-inventory（allocateByFIFO / releaseInventory / confirmOutbound）与
 * store-pos（fifoDeductItems）各自手写同一形态的 CTE 守卫 UPDATE：
 *
 * ```sql
 * WITH changed AS (
 *   UPDATE inv_batches ... WHERE <守卫谓词> RETURNING batch_no
 * ) SELECT batch_no FROM changed
 * ```
 *
 * TypeORM/Postgres 的裸 UPDATE 返回 `[[rows], rowCount]` 双层元组，包成 SELECT
 * CTE 后返回稳定的纯行数组，调用方才能用 `changed === 1` 精确判定"恰好命中
 * 一行"并 fail-closed。五处手写副本一旦有一处漏守卫（或守卫谓词写错占位符）
 * 就是超卖/账实分离，因此把 SQL 形态收敛到本纯函数并用单测钉死。
 *
 * ## 守卫维度（spec 字段 → SQL 片段）
 * | spec 字段 | WHERE 谓词 | SET 片段 |
 * |---|---|---|
 * | batchNo（必填） | `batch_no = $1` | — |
 * | companyCode | `company_code = $n` | — |
 * | warehouseCode | `warehouse_code = $n` | — |
 * | requireStatus | `status='X'`（字面量，见下） | — |
 * | deltaQty < 0 | `qty >= $n`（防扣穿） | `qty = qty - $n` |
 * | deltaQty > 0 | —（增量无下界守卫） | `qty = qty + $n` |
 * | deltaAvailable < 0 | `qty_available >= $n`（防超卖） | `qty_available = qty_available - $n` |
 * | deltaAvailable > 0 | `qty_available + $n <= qty`（防还入超账面，来源 releaseInventory） | `qty_available = qty_available + $n` |
 * | expireGuard | `(expire_date IS NULL OR expire_date >= CURRENT_DATE)` | — |
 * | excludeLegacy | `legacy_source IS NULL` | — |
 * | extraWheres[] | 调用方特有谓词（如 inventory_class 条件），SQL 片段 + 可选参数 | — |
 *
 * `updated_at=NOW()` 恒定写入。占位符分配顺序固定：
 * `$1=batchNo, $2=companyCode?, $3=warehouseCode?, $4=deltaQty?, $5=deltaAvailable?,
 *  $6..=extraWheres 参数`，SQL 文本由该布局确定性生成（单测逐维度钉死）。
 *
 * ## status 用字面量而非绑定参数的原因
 * 各引擎现行 SQL 与 SQL-contract spec 均钉死 `status='AVAILABLE'` 字面量形态；
 * status 是封闭枚举（本文件先本地校验，301c 起改由 inventory-status-machine 的
 * 合法状态集校验），不是用户输入，字面量无注入面，且能与既有 contract
 * fixture 逐字对照。
 *
 * ## 返回值与 fail-closed 语义
 * 返回 changed 行数（0 或 1）。本函数**不抛冲突异常**——各引擎保留自己的
 * ConflictException 文案与重试/回滚语义，只把 `!== 1` 判定留在调用方。
 *
 * ## 不收口的形态（保持现状，见批次 3b 报告）
 * - wms.service.ts 四处 CTE 守卫（缺陷处置/通用出库/直发调拨/调拨发运）：
 *   SET 用 GREATEST 钳位 + qty_available NULL 保留 CASE + 出库路径在 SET 内
 *   归一 company_code，语义是"钳位吸收"而非"守卫失败"，与本函数的
 *   fail-closed 模型不同。
 * - egg markExpiredBatches 的 status 迁移 UPDATE（AVAILABLE→EXPIRED，
 *   SET qty_available=0 绝对值）：状态机断言在 301c 收口，不是数量守卫。
 * - sal_order_item_batch_allocations 两处 CTE：非 inv_batches 表。
 * - farm 引擎三处 UPDATE ... RETURNING：非 CTE 形态且 WHERE 动态拼装。
 */

/** 执行句柄：事务中的 EntityManager / QueryRunner 均可（与 inventory-ledger.writer 一致）。 */
export type GuardedUpdateExecutor = {
  query(sql: string, parameters?: unknown[]): Promise<any>;
};

/** requireStatus 合法值（301c 起以 inventory-status-machine 为唯一来源）。 */
const KNOWN_GUARD_STATUSES = [
  'AVAILABLE', 'RESERVED', 'QUARANTINE', 'DAMAGED', 'FROZEN', 'EXPIRED',
] as const;

export interface GuardedBatchUpdateSpec {
  /** 目标批次号（inv_batches.batch_no，必填） */
  batchNo: string;
  /** 公司归属守卫（company_code = $n） */
  companyCode?: string;
  /** 仓库归属守卫（warehouse_code = $n） */
  warehouseCode?: string;
  /**
   * qty 增量。负数 = 扣减（自动加 `qty >= $n` 防扣穿守卫）；
   * 正数 = 增加（无下界守卫）。0 视为未提供。
   */
  deltaQty?: number;
  /**
   * qty_available 增量。负数 = 预占/扣减（自动加 `qty_available >= $n` 防超卖
   * 守卫）；正数 = 释放/还入（自动加 `qty_available + $n <= qty` 防超账面守卫）。
   */
  deltaAvailable?: number;
  /** 状态守卫：单值生成 `status='X'`，多值生成 `status IN ('X','Y')`（字面量，封闭枚举校验） */
  requireStatus?: string | readonly string[];
  /** 到期守卫：(expire_date IS NULL OR expire_date >= CURRENT_DATE) */
  expireGuard?: boolean;
  /** 排除 legacy 库存：legacy_source IS NULL */
  excludeLegacy?: boolean;
  /** 调用方特有谓词（inventory_class 条件等），SQL 片段可引用 inv_batches 别名；参数按序追加在 $6 起 */
  extraWheres?: ReadonlyArray<{ sql: string; params?: readonly unknown[] }>;
}

/**
 * 执行守卫化 inv_batches UPDATE，返回 changed 行数（0/1）。
 *
 * @throws Error spec 非法（无 SET 维度 / status 非封闭枚举值）时立即抛出——
 *         这类错误意味着调用方代码写错，必须在测试期暴露而非运行期静默。
 */
export async function guardedBatchUpdate(
  em: GuardedUpdateExecutor,
  spec: GuardedBatchUpdateSpec,
): Promise<number> {
  if (!spec.batchNo) throw new Error('guardedBatchUpdate: batchNo is required');

  const setClauses: string[] = [];
  const whereClauses: string[] = [];
  const params: unknown[] = [spec.batchNo];

  if (spec.companyCode !== undefined) {
    params.push(spec.companyCode);
    whereClauses.push(`company_code = $${params.length}`);
  }
  if (spec.warehouseCode !== undefined) {
    params.push(spec.warehouseCode);
    whereClauses.push(`warehouse_code = $${params.length}`);
  }

  // requireStatus：字面量（封闭枚举校验），形态与各引擎现行 SQL 逐字一致
  if (spec.requireStatus !== undefined) {
    const statuses = Array.isArray(spec.requireStatus) ? spec.requireStatus : [spec.requireStatus];
    if (!statuses.length) throw new Error('guardedBatchUpdate: requireStatus must not be empty');
    for (const status of statuses) {
      if (!(KNOWN_GUARD_STATUSES as readonly string[]).includes(status)) {
        throw new Error(`guardedBatchUpdate: unknown status guard '${status}' (known: ${KNOWN_GUARD_STATUSES.join('/')})`);
      }
    }
    whereClauses.push(statuses.length === 1
      ? `status='${statuses[0]}'`
      : `status IN (${statuses.map(s => `'${s}'`).join(',')})`);
  }

  // 数量守卫：占位符分配顺序固定 qty 在前、available 在后（$4/$5 布局的确定性来源）
  if (spec.deltaQty !== undefined && spec.deltaQty !== 0) {
    params.push(spec.deltaQty);
    const placeholder = `$${params.length}`;
    setClauses.push(spec.deltaQty < 0 ? `qty = qty - ${placeholder}` : `qty = qty + ${placeholder}`);
    if (spec.deltaQty < 0) whereClauses.push(`qty >= ${placeholder}`);
  }
  if (spec.deltaAvailable !== undefined && spec.deltaAvailable !== 0) {
    params.push(spec.deltaAvailable);
    const placeholder = `$${params.length}`;
    setClauses.push(spec.deltaAvailable < 0
      ? `qty_available = qty_available - ${placeholder}`
      : `qty_available = qty_available + ${placeholder}`);
    whereClauses.push(spec.deltaAvailable < 0
      ? `qty_available >= ${placeholder}`
      : `qty_available + ${placeholder} <= qty`);
  }

  if (spec.expireGuard) {
    whereClauses.push(`(expire_date IS NULL OR expire_date >= CURRENT_DATE)`);
  }
  if (spec.excludeLegacy) {
    whereClauses.push(`legacy_source IS NULL`);
  }
  for (const extra of spec.extraWheres ?? []) {
    whereClauses.push(`(${extra.sql})`);
    if (extra.params?.length) params.push(...extra.params);
  }

  if (!setClauses.length) {
    throw new Error('guardedBatchUpdate: spec must set at least one of deltaQty/deltaAvailable');
  }
  setClauses.push(`updated_at=NOW()`);

  // WHERE 以 batch_no 打头（$1 恒为 batchNo），与归一前各引擎形态一致
  const sql = `WITH changed AS (
           UPDATE inv_batches AS inv_batches
              SET ${setClauses.join(', ')}
            WHERE batch_no = $1${whereClauses.length ? `\n              AND ${whereClauses.join('\n              AND ')}` : ''}
            RETURNING batch_no
         ) SELECT batch_no FROM changed`;

  const rows = await em.query(sql, params);
  return Array.isArray(rows) ? rows.length : 0;
}
