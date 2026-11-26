import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataScopeContext } from '../org/services/data-scope.service';

type TraceEntry = 'batch' | 'sale' | 'customer';
export type TracePagination = { after?: string; limit?: string };

export async function readPosAllocationTrace(
  ds: Pick<DataSource, 'query'>,
  entry: TraceEntry,
  key: string,
  scope: DataScopeContext | undefined,
  query: TracePagination = {},
  descendantBatches?: string[],
) {
  if (!scope) throw new ForbiddenException('缺少追溯权限范围');
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!key?.trim() || key.length > 128 || !Number.isInteger(limit) || limit < 1 || limit > 200
    || (query.after !== undefined && (typeof query.after !== 'string' || !/^[1-9]\d{0,17}$/.test(query.after)))) {
    throw new BadRequestException('追溯查询参数无效');
  }

  const field = { batch: 'a.batch_no', sale: 's.sale_no', customer: 's.customer_code' }[entry];
  const [result] = await ds.query(`
    WITH facts AS (
      SELECT a.id, a.sale_item_id::text, a.batch_no, a.warehouse_code,
             s.sale_no, s.store_code, s.customer_code, s.company_code, s.status, s.completed_at,
             i.product_code, i.grade_code, i.sku_code, b.unit,
             a.allocated_qty::text AS qty, a.returned_qty::text AS returned_qty,
             (a.allocated_qty-a.returned_qty)::text AS outstanding_qty
        FROM store_sale_allocations a
        JOIN sal_store_sales s ON s.id=a.sale_id
        JOIN sal_store_sale_items i ON i.id=a.sale_item_id AND i.sale_id=s.id
        JOIN inv_batches b ON b.batch_no=a.batch_no AND b.company_code=s.company_code
       WHERE (${field}=$1 OR ($7::text[] IS NOT NULL AND a.batch_no=ANY($7))) AND s.status IN ('COMPLETED','RETURNED')
         AND ($2::boolean OR (s.company_code=ANY($3::text[]) AND a.warehouse_code=ANY($4::text[]) AND b.warehouse_code=ANY($4::text[])))
    ), page AS (
      SELECT * FROM facts WHERE ($5::bigint IS NULL OR id>$5::bigint) ORDER BY id LIMIT $6
    )
    SELECT (SELECT count(*)::int FROM facts) AS total,
           COALESCE((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('id',p.id::text) ORDER BY p.id) FROM page p),'[]'::jsonb) AS rows`,
    [key, scope.isGlobal === true, scope.allowedCompanyCodes, scope.allowedWarehouseCodes, query.after ?? null, limit + 1, entry === 'batch' ? descendantBatches ?? null : null],
  );
  const rows = result.rows.slice(0, limit);
  return {
    rows, total: result.total, nextCursor: result.rows.length > limit ? rows[rows.length - 1].id : null,
    completeness: 'VERIFIED_FACTS_ONLY' as const,
  };
}
