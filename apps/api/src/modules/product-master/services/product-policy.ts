import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { MasterDataAuditService } from '../../master-data/master-data-audit.service';

/** Fixed internal bootstrap identity; callers cannot supply arbitrary product fields or status. */
export class ProductPolicy {
  static async ensureRawEggProduct(manager: Pick<EntityManager, 'query'>, operator?: string): Promise<void> {
    const code = 'PRD-EGG-RAW';
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('mst_products.internal'), hashtext($1))`, [code]);
    const rows = await manager.query('SELECT * FROM mst_products WHERE product_code=$1 FOR SHARE', [code]);
    if (rows.length) {
      // Never silently revive, rename or replace an existing governed master.
      if (rows.length !== 1 || rows[0].status !== 'ACTIVE') throw new ConflictException('鲜蛋原料主档重复或未启用，请在主数据中心维护');
      const unit = rows[0].unit_zh || rows[0].unit;
      if (unit && unit !== '枚') throw new ConflictException('鲜蛋原料主档基础单位必须为枚，请在主数据中心核对');
      return;
    }
    const raw = await manager.query(
      `INSERT INTO mst_products (product_code, product_name, product_name_zh, product_name_lo,
        unit_zh, unit_lo, shelf_life_days, price_retail, price_wholesale, status)
       VALUES ($1,$2,$2,$3,'枚','ໜ່ວຍ',7,0,0,'ACTIVE') RETURNING *`,
      [code, '鲜蛋原料（未分级）', 'ໄຂ່ສົດດິບ'],
    );
    const [saved] = Array.isArray(raw?.[0]) && typeof raw?.[1] === 'number' ? raw[0] : raw;
    await MasterDataAuditService.writeInTransaction(manager, { objectType: 'PRODUCT', objectCode: code, action: 'CREATE', after: saved, operator: operator ?? 'AUTO', reason: '包装集蛋固定原料主档初始化；随班次事务提交' });
  }
}
