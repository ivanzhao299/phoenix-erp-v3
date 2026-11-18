import { BadRequestException } from '@nestjs/common';

/**
 * inv_batches 批次库存状态机（INV-301 步骤 3c）。
 *
 * ## 状态集合来源（2026-11-17 全库写入侧盘点）
 * - sys_dict `INV_STOCK_STATUS` 5 态（迁移 migrations/20260604_g4d_inventory_dict_seed.sql）：
 *   AVAILABLE / RESERVED / QUARANTINE / DAMAGED / FROZEN。
 * - `EXPIRED`：不在字典内，但代码实际写入——egg-inventory `markExpiredBatches`
 *   守卫 UPDATE `SET status='EXPIRED'`（INV-101，批次 1 重写），读侧
 *   sales-analytics / bff 预警 / wms 入库拦截（wms.service.ts:~782）均消费该值。
 *   纳入状态集，来源注释见下。
 * - 只读不写的遗留值 **不在** 状态集内（无写入路径 = 无迁移语义）：
 *   `LOCKED`（wms 入库累加拦截读侧判断）、`EXPIRY_WARN`（bff 门店预警读侧）。
 *   生产库可能存在历史行，读取方自行兼容；写入方一律视为非法值。
 *
 * ## 各状态的写入现状（INSERT 初始态 + UPDATE 迁移，全部来自代码盘点）
 * | 状态 | INSERT 初始态写入点 | UPDATE 迁移写入点 |
 * |---|---|---|
 * | AVAILABLE | wms 入库确认/采购收货/调拨目标批、egg createProductionBatch、POS/egg/wms 各类退货复检放行前……（无）、farm-medicine 入库、procurement 旧链路 | 见下方迁移表 |
 * | RESERVED | 无（预占用 qty_available 减量 + sal_order_item_batch_allocations 台账建模，不落批次状态） | 无 |
 * | QUARANTINE | egg processReturnInventory 退货批、POS returnSale 退货批、wms 缺陷处置调拨目标批 | 无（无复检放行代码路径） |
 * | DAMAGED | egg processReturnInventory 纯破损批 | 无（无处置终态代码路径） |
 * | FROZEN | 受限实物期初 | 已资格化正式库存过期冻结（保留实物，待实际处置） |
 * | EXPIRED | 无 | egg markExpiredBatches（唯一写入方） |
 *
 * ## 迁移白名单（只收录当前代码实际发生过的迁移，不凭空发明）
 * | from → to | 来源 |
 * |---|---|
 * | AVAILABLE → EXPIRED | egg-inventory `markExpiredBatches` 守卫 UPDATE（`WHERE status='AVAILABLE'` + `SET status='EXPIRED', qty_available=0`，INV-101；调度入口 egg-inventory-scheduler） |
 * | AVAILABLE → FROZEN | 已资格化正式库存过期只冻结待真实处置，保留实物数量和流水（markExpiredBatches）；旧 OFF 路径仍保持 EXPIRED |
 * | AVAILABLE → AVAILABLE | farm `medication-record.cancel` 撤销还入 `SET status='AVAILABLE'`（用药扣减侧守卫要求 AVAILABLE，正常流自环再断言）；farm-medicine 入库 upsert 冲突腿同样重申 AVAILABLE。两处 from 侧未 SELECT 校验（保持现状，见批次 3c 报告），正常流均为 AVAILABLE 自环 |
 *
 * 其余迁移对（如 QUARANTINE→AVAILABLE 复检放行、FROZEN→AVAILABLE 解冻、
 * →DAMAGED 破损、EXPIRED→AVAILABLE 复活）当前代码**没有**写入路径；
 * 新引擎路径需要时先在此登记来源，再在写入点接 assertStatusTransition——
 * 白名单是 fail-closed 的：未登记即非法。
 */

/** 合法状态全集（5 态字典 + 代码实际写入的 EXPIRED；单一来源，guarded-update util 复用） */
export const INV_BATCH_STATUSES = [
  'AVAILABLE', 'RESERVED', 'QUARANTINE', 'DAMAGED', 'FROZEN', 'EXPIRED',
] as const;

export type InvBatchStatus = (typeof INV_BATCH_STATUSES)[number];

/**
 * 合法迁移白名单：`TRANSITIONS[from]` 含所有合法 `to`。
 * 空数组 = 该状态当前没有任何出边（终态或无代码路径）。
 * 每条的来源注释见文件头迁移白名单表。
 */
export const INV_BATCH_STATUS_TRANSITIONS: Readonly<Record<InvBatchStatus, readonly InvBatchStatus[]>> = {
  // Legacy expiry, qualified physical expiry hold, and medication/inbound self-loop.
  AVAILABLE: ['AVAILABLE', 'EXPIRED', 'FROZEN'],
  RESERVED: [],      // 字典态；预占建模不走批次状态，无出边
  QUARANTINE: [],    // 退货/缺陷隔离入口态；复检放行路径尚未存在（INV-301 报告"保持现状"）
  DAMAGED: [],       // 破损终态；处置路径尚未存在
  FROZEN: [],        // 受限期初/正式过期冻结；未提供通用解冻出边
  EXPIRED: [],       // 过期核销终态，禁止复活（重新入库须走新批次号）
};

/**
 * 断言一次批次状态迁移合法，非法迁移抛 BadRequestException（fail-closed）。
 *
 * @param from 迁移前状态（通常来自守卫 UPDATE 的 requireStatus 或行锁 SELECT）
 * @param to   迁移后状态（UPDATE SET 的目标值）
 * @param context 可选调用方标识（引擎/路径名），仅用于报错定位
 * @throws BadRequestException from/to 不是合法状态、或迁移对不在白名单时。
 *   报错信息含迁移对与白名单登记指引（来源提示）。
 *
 * 用法（与 INV-301b guardedBatchUpdate 搭配的典型形态——断言在前，
 * 守卫 UPDATE 的 requireStatus 与 from 一致）：
 * ```ts
 * assertStatusTransition('AVAILABLE', 'EXPIRED', 'egg markExpiredBatches');
 * const changed = await guardedBatchUpdate(em, { batchNo, requireStatus: 'AVAILABLE', ... });
 * ```
 * INSERT 新批次（初始态）不需要断言——初始态合法性由建批路径的业务校验负责。
 */
export function assertStatusTransition(from: string, to: string, context?: string): void {
  const where = context ? `（${context}）` : '';
  if (!(INV_BATCH_STATUSES as readonly string[]).includes(from)) {
    throw new BadRequestException(
      `非法库存批次状态迁移 ${from}→${to}${where}：from 不是合法状态`
      + `（合法状态：${INV_BATCH_STATUSES.join('/')}；读侧遗留值 LOCKED/EXPIRY_WARN 无写入路径，禁止写入）`,
    );
  }
  if (!(INV_BATCH_STATUSES as readonly string[]).includes(to)) {
    throw new BadRequestException(
      `非法库存批次状态迁移 ${from}→${to}${where}：to 不是合法状态`
      + `（合法状态：${INV_BATCH_STATUSES.join('/')}；读侧遗留值 LOCKED/EXPIRY_WARN 无写入路径，禁止写入）`,
    );
  }
  const allowed = INV_BATCH_STATUS_TRANSITIONS[from as InvBatchStatus];
  if (!allowed.includes(to as InvBatchStatus)) {
    throw new BadRequestException(
      `非法库存批次状态迁移 ${from}→${to}${where}`
      + `：不在白名单（${from} 仅允许 →${allowed.length ? allowed.join('/') : '（无出边）'}）。`
      + '新路径需先在 wms/inventory-status-machine.ts 迁移白名单登记来源，再接入断言',
    );
  }
}
