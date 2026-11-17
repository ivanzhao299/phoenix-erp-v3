/**
 * FIFO 分配 advisory lock 命名空间（INV-204 统一）。
 *
 * 背景：此前 egg 引擎用 `fifo:{co}:{product}`、POS 用 `fifo:{co}:{wh}:{product}`，
 * 两套命名空间互不相干——egg FIFO 与 POS FIFO 同时扣同一批次时只靠行锁兜底，
 * 冲突窗口大且锁粒度口径不一致。统一为：
 *
 *   inv:fifo:{company}:{warehouse}:{itemKey}
 *
 * - itemKey：SKU 路径为 skuCode；旧 product+grade 路径为 `p:{product}:g:{grade}`
 *   （grade 缺省为空串，与 warehouse 缺省同理——调用方没有该维度时不参与分段）。
 * - warehouse：egg 传 fulfillmentWarehouseCode（可空）；POS 传
 *   warehouseCodes.join(',')（多仓集合视为一个池）。
 * - 快照池锁（quantity-contract 的 physical-stock-v1|...）**刻意不走本命名空间**：
 *   它锁的是"数量快照池"（company+warehouse+product+grade+baseUnit 的池语义），
 *   与 FIFO 行级分配锁的粒度/生命周期不同，保持不动。
 */
export function fifoLockKey(
  company: string,
  warehouse: string | null | undefined,
  itemKey: string,
): string {
  return `inv:fifo:${company}:${warehouse ?? ''}:${itemKey}`;
}

/** FIFO 锁的 itemKey 分段：SKU 优先，否则 product+grade。 */
export function fifoItemKey(params: {
  skuCode?:   string | null;
  productCode: string;
  gradeCode?:  string | null;
}): string {
  if (params.skuCode) return params.skuCode;
  return `p:${params.productCode}:g:${params.gradeCode ?? ''}`;
}
