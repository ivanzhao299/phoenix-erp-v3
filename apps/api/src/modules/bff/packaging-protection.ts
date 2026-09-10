import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** Explicit opt-in plus server-verified RBAC; names and client body flags carry no authority. */
export function packagingTestMode(req?: any): boolean {
  const mode = req?.headers?.['x-packaging-mode'];
  if (mode === undefined || mode === 'real') return false;
  if (mode !== 'test') throw new BadRequestException('无效的包装运行模式');
  const user = req?.user;
  if (user?.role !== 'ROLE_ADMIN' && !user?.roles?.includes('ROLE_ADMIN')) {
    throw new ForbiddenException('包装测试模式仅允许管理员显式调用');
  }
  return true;
}

export function assertPackagingMode(row: any, isTest: boolean): void {
  if (!row || row.is_test !== isTest) throw new ConflictException('记录不存在或不属于当前包装运行模式');
}

/** All terminal packing writers use this transaction lock, including VOID and inventory replay. */
export async function lockPacking(manager: EntityManager, code: string): Promise<void> {
  await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`terminal-packing:${code}`]);
}

export async function assertPackingCanEnterInventory(manager: Pick<EntityManager, 'query'>, code: string): Promise<any> {
  const [row] = await manager.query(`SELECT p.*, ws.is_test AS shift_is_test
    FROM pkg_packing_records p LEFT JOIN pkg_work_shifts ws ON ws.id=p.shift_id WHERE p.code=$1`, [code]);
  if (!row || row.status !== 'ACTIVE' || row.is_test !== false || row.shift_is_test === true) {
    throw new ConflictException('测试或作废包装禁止交接及库存消费');
  }
  return row;
}

export async function assertNoPackingDownstream(manager: EntityManager, code: string): Promise<void> {
  const [r] = await manager.query(`SELECT
    EXISTS(SELECT 1 FROM pkg_handover_records WHERE packing_code=$1) AS handover,
    EXISTS(SELECT 1 FROM inv_batches WHERE packaging_batch_ref=$1 OR source_no=$1) AS inventory,
    EXISTS(SELECT 1 FROM inv_ledger WHERE ref_no=$1 OR batch_no=$1 OR batch_no IN
      (SELECT batch_no FROM inv_batches WHERE packaging_batch_ref=$1 OR source_no=$1)) AS ledger,
    (EXISTS(SELECT 1 FROM sal_order_item_batch_allocations WHERE batch_no=$1)
      OR EXISTS(SELECT 1 FROM store_sale_allocations WHERE batch_no=$1)
      OR EXISTS(SELECT 1 FROM sal_store_sale_items WHERE batch_no=$1)
      OR EXISTS(SELECT 1 FROM sal_order_items i CROSS JOIN LATERAL regexp_split_to_table(COALESCE(i.allocated_batch_no,''),'\\s*,\\s*') b WHERE b=$1)) AS sales`, [code]);
  if (!r || r.handover || r.inventory || r.ledger || r.sales) {
    throw new ConflictException('包装已有交接或库存/流水依赖，必须先经逆向业务处理');
  }
}
