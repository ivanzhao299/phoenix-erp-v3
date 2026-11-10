import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export const SKU_IDENTITY_FIELDS = ['product_code', 'grade_code', 'spec_code'] as const;

/** Shared SKU rules. Call locking methods only inside the caller's transaction. */
export class SkuPolicy {
  static async requireUsable(manager: EntityManager, skuCode: unknown) {
    if (typeof skuCode !== 'string' || !skuCode.trim()) {
      throw new BadRequestException('skuCode 必须为非空 SKU 编码；历史兼容请省略该字段');
    }
    const [sku] = await manager.query(
      `SELECT sku_code, product_code, product_name, grade_code, spec_code, status,
              effective_date::text, expire_date::text, CURRENT_DATE::text AS today
         FROM product_skus WHERE sku_code=$1 FOR SHARE`, [skuCode],
    );
    if (!sku || sku.status !== 'ACTIVE'
        || (sku.effective_date && sku.effective_date > sku.today)
        || (sku.expire_date && sku.expire_date < sku.today)) throw new BadRequestException(`SKU ${skuCode} 不存在、未启用或不在生效期内`);
    return sku;
  }

  static async lockForUpdate(manager: EntityManager, skuCode: string) {
    try {
      const [sku] = await manager.query('SELECT * FROM product_skus WHERE sku_code=$1 FOR UPDATE NOWAIT', [skuCode]);
      if (!sku) throw new NotFoundException(`SKU ${skuCode} not found`);
      return sku;
    } catch (error) {
      if ((error as { code?: string }).code === '55P03') {
        throw new ConflictException('SKU 正在被业务使用，修改未保存，请稍后重试');
      }
      throw error;
    }
  }

  static async assertIdentityChange(manager: EntityManager, before: Record<string, unknown>, changes: Record<string, unknown>) {
    if (changes.sku_code !== undefined && changes.sku_code !== before.sku_code) {
      throw new BadRequestException('SKU 编码不可修改');
    }
    const changed = SKU_IDENTITY_FIELDS.filter(key => changes[key] !== undefined && changes[key] !== before[key]);
    if (!changed.length) return;
    for (const key of changed) {
      if (typeof changes[key] !== 'string' || !(changes[key] as string).trim()) {
        throw new BadRequestException(`${key} 必须为非空编码`);
      }
    }

    await this.assertUnreferenced(manager, before);
  }

  static async assertUnreferenced(manager: EntityManager, before: Record<string, unknown>) {
    await manager.query(`SET LOCAL statement_timeout = '2s'`);

    // Discover actual base-table columns, including legacy item_code aliases and packaging JSON.
    // Unlike the UI reference summary, any metadata/lock/probe failure aborts the edit.
    const columns: Array<{ table_name: string; column_name: string; data_type: string }> = await manager.query(`
      SELECT c.table_name, c.column_name, c.data_type
        FROM information_schema.columns c
        JOIN information_schema.tables t USING (table_catalog, table_schema, table_name)
       WHERE c.table_schema=current_schema() AND t.table_type='BASE TABLE'
         AND c.table_name <> 'product_skus'
         AND (c.column_name IN ('sku_code','item_code')
           OR (LEFT(c.table_name,4)='wms_' AND c.column_name='item')
           OR (LEFT(c.table_name,4)='pkg_' AND c.data_type IN ('json','jsonb')))
       ORDER BY c.table_name,c.column_name`);
    for (const required of ['sal_order_items', 'sal_price_items', 'inv_batches', 'inv_ledger']) {
      if (!columns.some(c => c.table_name === required && c.column_name === 'sku_code')) {
        throw new ConflictException(`无法完整核验 SKU 引用：缺少 ${required}.sku_code`);
      }
    }
    const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
    const tables = [...new Set(columns.map(c => c.table_name))];
    const probe = async (deadline?: number) => {
      for (const table of tables) {
        if (deadline !== undefined && Date.now() > deadline) {
          throw new ConflictException('SKU 引用核验超时，身份变更未保存，请稍后重试');
        }
        const predicates = columns.filter(c => c.table_name === table).map(c => {
          const column = quote(c.column_name);
          return ['json', 'jsonb'].includes(c.data_type)
            ? `jsonb_path_exists(${column}::jsonb, '$.**.skuCode ? (@ == $sku)', jsonb_build_object('sku',to_jsonb($1::text)))
               OR jsonb_path_exists(${column}::jsonb, '$.**.sku_code ? (@ == $sku)', jsonb_build_object('sku',to_jsonb($1::text)))`
            : `${column}::text=$1`;
        });
        const rows = await manager.query(`SELECT 1 FROM ${quote(table)} WHERE ${predicates.join(' OR ')} LIMIT 1`, [before.sku_code]);
        if (rows.length) throw new ConflictException(`SKU ${before.sku_code} 已被 ${table} 引用，不可修改产品、等级或规格；请新建 SKU`);
      }
    };
    // The usual referenced case needs no business-table locks. Only an unreferenced
    // identity edit takes short-lived locks and probes again to close the insert race.
    await probe();
    try {
      await manager.query(`LOCK TABLE ${tables.map(quote).join(',')} IN SHARE MODE NOWAIT`);
    } catch (error) {
      if ((error as { code?: string }).code === '55P03') {
        throw new ConflictException('SKU 引用表正在处理业务，身份变更未保存，请稍后重试');
      }
      throw error;
    }
    await probe(Date.now() + 2000);
  }
}
