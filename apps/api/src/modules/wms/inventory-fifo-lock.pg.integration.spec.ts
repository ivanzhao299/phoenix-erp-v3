import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { EggInventoryService } from '../sales-v2/services/egg-inventory.service';
import { StorePosService } from '../store-pos/services/store-pos.service';
import { fifoLockKey, fifoItemKey } from './inventory-lock.util';

/**
 * INV-204 并发回归：egg FIFO 与 POS FIFO 共用统一 advisory lock 命名空间
 * `inv:fifo:{company}:{warehouse}:{itemKey}`，两路并发扣同一批次时串行化，
 * 断言总量守恒、不超卖。
 *
 * 门控模式仿 store-receiving-chain.pg.integration.spec.ts：仅当
 * PACKAGING_HISTORY_PG=1 且本地/staging PG 可用时运行，默认 skip。
 */
const describePg = process.env.PACKAGING_HISTORY_PG === '1' ? describe : describe.skip;

describePg('Unified FIFO lock namespace keeps concurrent egg/POS deductions conservative (INV-204)', () => {
  let ds: DataSource;
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  const companyCode = `I4-COMP-${suffix}`;
  const warehouse = `I4-WH-${suffix}`;
  const storeCode = `I4-STORE-${suffix}`;
  const productCode = `I4-P-${suffix}`;
  const gradeCode = `I4G${suffix}`;
  const specCode = `I4-S-${suffix}`;
  const skuCode = `I4-SKU-${suffix}`;
  const batchNo = `I4-BATCH-${suffix}`;
  const STOCK = 20;
  let storeId: string;
  let egg: EggInventoryService;
  let pos: StorePosService;

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER || 'phoenix_v3',
      password: process.env.DB_PASSWORD || 'phoenix_v3_pass',
      database: process.env.DB_NAME || 'phoenix_erp',
      entities: [],
      synchronize: false,
      logging: false,
    });
    await ds.initialize();
    // egg 引擎走 assertWriteCompanyScope：无 CLS dataScope 的系统流放行。
    egg = new EggInventoryService(ds, { get: () => undefined } as never);
    // fifoDeductItems 只依赖 ds + cls（currentUser）；storeScope/priceRuntime 不参与。
    pos = new StorePosService(ds, { get: (key: string) => key === 'user' ? { username: `i4-${suffix}` } : undefined } as never, {} as never, {} as never);

    const [store] = await ds.query(
      `INSERT INTO store_master (store_code,store_name,company_code,status)
       VALUES ($1,$2,$3,'ACTIVE') RETURNING id`,
      [storeCode, `I4 Store ${suffix}`, companyCode],
    );
    storeId = String(store.id);
    await ds.query(
      `INSERT INTO wms_warehouses
        (warehouse_code,warehouse_name,type,status,domain,company_code,owner_store_id,store_code)
       VALUES ($1,$2,'EGG_SALES','ACTIVE','OPERATIONAL',$3,NULL,'ALL')`,
      [warehouse, `I4 WH ${suffix}`, companyCode],
    );
    await ds.query(`INSERT INTO mst_products (product_code,product_name,product_name_zh,unit_zh,status) VALUES ($1,'I4 Product','I4 Product','EA','ACTIVE')`, [productCode]);
    await ds.query(`INSERT INTO product_grades (grade_code,grade_name,is_saleable,is_storable,status) VALUES ($1,'I4 Grade',true,true,'ACTIVE')`, [gradeCode]);
    await ds.query(`INSERT INTO packaging_specs (spec_code,spec_name,qty_per_unit,base_unit,display_unit,status) VALUES ($1,'I4 Spec',1,'EA','EA','ACTIVE')`, [specCode]);
    await ds.query(`INSERT INTO product_skus (sku_code,sku_name,product_code,product_name,grade_code,spec_code,status) VALUES ($1,'I4 SKU',$2,'I4 Product',$3,$4,'ACTIVE')`, [skuCode, productCode, gradeCode, specCode]);
    await ds.query(
      `INSERT INTO inv_batches
        (batch_no,product_code,sku_code,item_type,unit,qty,qty_available,status,inventory_class,
         warehouse_code,location_code,store_code,company_code,inbound_date)
       VALUES ($1,$2,'SKU','EA',$3,$3,'AVAILABLE','STANDARD',$4,'I4-DOCK','ALL',$5,CURRENT_DATE)`,
      [batchNo, productCode, STOCK, warehouse, companyCode],
    );
  }, 60000);

  afterAll(async () => {
    if (!ds?.isInitialized) return;
    await ds.transaction(async manager => {
      await manager.query(
        `DELETE FROM store_sale_allocations WHERE batch_no=$1`, [batchNo],
      );
      await manager.query(
        `DELETE FROM inv_ledger WHERE batch_no=$1 OR ref_no LIKE $2`,
        [batchNo, `I4-%-${suffix}%`],
      );
      await manager.query(
        `DELETE FROM sal_store_sale_items WHERE sale_id IN (SELECT id FROM sal_store_sales WHERE sale_no LIKE $1)`,
        [`I4-POS-%-${suffix}%`],
      );
      await manager.query(`DELETE FROM sal_store_sales WHERE sale_no LIKE $1`, [`I4-POS-%-${suffix}%`]);
      await manager.query(`DELETE FROM inv_batches WHERE batch_no=$1`, [batchNo]);
      await manager.query(`DELETE FROM product_skus WHERE sku_code=$1`, [skuCode]);
      await manager.query(`DELETE FROM packaging_specs WHERE spec_code=$1`, [specCode]);
      await manager.query(`DELETE FROM product_grades WHERE grade_code=$1`, [gradeCode]);
      await manager.query(`DELETE FROM mst_products WHERE product_code=$1`, [productCode]);
      await manager.query(`DELETE FROM wms_warehouses WHERE warehouse_code=$1`, [warehouse]);
      await manager.query(`DELETE FROM store_master WHERE id=$1`, [storeId]);
    });
    await ds.destroy();
  });

  it('derives one shared key for both engines and the documented shape', () => {
    const eggKey = fifoLockKey(companyCode, warehouse, fifoItemKey({ skuCode, productCode }));
    const posKey = fifoLockKey(companyCode, warehouse, fifoItemKey({ skuCode, productCode, gradeCode: null }));
    expect(eggKey).toBe(posKey);
    expect(eggKey).toBe(`inv:fifo:${companyCode}:${warehouse}:${skuCode}`);
    expect(fifoLockKey(companyCode, undefined, fifoItemKey({ productCode, gradeCode: 'A' })))
      .toBe(`inv:fifo:${companyCode}::p:${productCode}:g:A`);
  });

  it('serializes concurrent egg reservations and POS sales on the same batch without oversell', async () => {
    const runEgg = (i: number) => egg.allocateByFIFO({
      productCode, skuCode, companyCode, qty: 1,
      refNo: `I4-EGG-${suffix}-${i}`, note: 'inv204 egg fifo',
      fulfillmentWarehouseCode: warehouse, salesContext: 'FARM_SALES',
    });

    const runPos = async (i: number) => {
      const saleNo = `I4-POS-${suffix}-${i}`;
      return ds.transaction(async mgr => {
        const [sale] = await mgr.query(
          `INSERT INTO sal_store_sales
            (sale_no, store_code, store_name, company_code, sale_type, payment_method,
             subtotal, total_amount, payment_status, status, business_date)
           VALUES ($1,$2,$3,$4,'CASH','CASH',1,1,'UNPAID','OPEN',CURRENT_DATE)
           RETURNING id, sale_no`,
          [saleNo, storeCode, `I4 Store ${suffix}`, companyCode],
        );
        const [item] = await mgr.query(
          `INSERT INTO sal_store_sale_items
            (sale_id, product_code, product_name, qty, unit_price, amount, sort_order, sku_code)
           VALUES ($1,$2,'I4 Product',1,1,1,10,$3) RETURNING id`,
          [sale.id, productCode, skuCode],
        );
        const saleLike = {
          id: sale.id, sale_no: sale.sale_no, store_code: storeCode,
          company_code: companyCode, warehouseCodes: [warehouse],
          items: [{ id: item.id, product_code: productCode, sku_code: skuCode, qty: 1, quantity_snapshot: null }],
        };
        return (pos as unknown as { fifoDeductItems: (sale: unknown, mgr: unknown) => Promise<Array<{ qty: number }>> })
          .fifoDeductItems(saleLike, mgr);
      });
    };

    const ops: Array<Promise<{ engine: 'egg' | 'pos'; qty: number }>> = [
      ...Array.from({ length: STOCK / 2 }, (_, i) =>
        runEgg(i).then(allocs => ({ engine: 'egg' as const, qty: allocs.reduce((s, a) => s + a.allocatedQty, 0) }))),
      ...Array.from({ length: STOCK / 2 }, (_, i) =>
        runPos(i).then(allocs => ({ engine: 'pos' as const, qty: allocs.reduce((s, a) => s + a.qty, 0) }))),
    ];
    const results = await Promise.all(ops.map(p => p.then(r => r, (error: unknown) => ({ engine: 'failed' as const, error }))));

    // 统一 lock key 串行化 + 双侧守卫化 UPDATE：20 路并发全部成功，无一路失败。
    const failures = results.filter(r => r.engine === 'failed');
    expect(failures).toEqual([]);
    const deducted = results.reduce((s, r) => s + (r as { qty: number }).qty, 0);
    expect(deducted).toBe(STOCK);

    // 总量守恒：预占只减 qty_available（egg RESERVED），POS 真扣减 qty+qty_available。
    const [after] = await ds.query(`SELECT qty, qty_available FROM inv_batches WHERE batch_no=$1`, [batchNo]);
    expect(Number(after.qty_available)).toBe(0);
    expect(Number(after.qty)).toBe(STOCK / 2);
    const [ledger] = await ds.query(
      `SELECT COALESCE(SUM(qty_change),0) AS sum_change,
              COUNT(*) FILTER (WHERE change_type='RESERVED') AS reserved_rows,
              COUNT(*) FILTER (WHERE change_type='FIFO_OUT') AS fifo_rows
         FROM inv_ledger WHERE batch_no=$1`,
      [batchNo],
    );
    expect(Number(ledger.sum_change)).toBe(-STOCK);
    expect(Number(ledger.reserved_rows)).toBe(STOCK / 2);
    expect(Number(ledger.fifo_rows)).toBe(STOCK / 2);

    // 售罄后第 21 路必须失败（不超卖）。
    await expect(runEgg(STOCK)).rejects.toThrow('库存不足');
    await expect(runPos(STOCK)).rejects.toThrow('门店仓库存不足');
  });
});
