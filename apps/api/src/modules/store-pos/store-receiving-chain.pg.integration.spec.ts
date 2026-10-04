import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { WmsService } from '../wms/wms.service';
import { StoreReplenishmentService } from './services/store-replenishment.service';

type Scope = { isGlobal: boolean; allowedWarehouseCodes: string[] };

const describePg = process.env.RUN_STORE_RECEIVING_PG === '1' ? describe : describe.skip;

describePg('Store receiving canonical WMS chain PostgreSQL integration', () => {
  let ds: DataSource;
  let wms: WmsService;
  let replenishment: StoreReplenishmentService;
  let scope: Scope;
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  const sourceWarehouse = `B6-SRC-${suffix}`;
  const targetWarehouse = `B6-STORE-${suffix}`;
  const storeCode = `B6-STORE-${suffix}`;
  const companyCode = `B6-COMP-${suffix}`;
  const sourceBatch = `B6-BATCH-${suffix}`;
  const legacyReceivingNo = `B6-LEGACY-${suffix}`;
  let storeId: string;
  let requestId: number;
  let transferNo = '';

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
    scope = { isGlobal: false, allowedWarehouseCodes: [sourceWarehouse] };
    const cls = { get: (key: string) => key === 'dataScope' ? scope : undefined };
    wms = new WmsService(ds.manager, cls as any);

    const [store] = await ds.query(
      `INSERT INTO store_master (store_code,store_name,company_code,status)
       VALUES ($1,$2,$3,'ACTIVE') RETURNING id`,
      [storeCode, `B6 Store ${suffix}`, companyCode],
    );
    storeId = String(store.id);
    const storeScope = {
      listMembershipStores: async () => [{ storeCode }],
      resolveStoreContext: async () => ({
        storeId, storeCode, storeName: `B6 Store ${suffix}`, companyCode,
        role: 'STORE_MANAGER', roles: ['ROLE_STORE_MGR'], warehouseCodes: [targetWarehouse],
        timezone: 'Asia/Shanghai', businessDayCutoff: '00:00:00',
      }),
      resolve: async () => ({ storeId, storeCode, companyCode, warehouseCodes: [targetWarehouse] }),
    };
    const serviceCls = {
      get: (key: string) => key === 'dataScope' ? scope : key === 'user' ? { username: `b6-${suffix}`, roles: ['ROLE_STORE_MGR'] } : undefined,
    };
    replenishment = new StoreReplenishmentService(ds, serviceCls as any, storeScope as any, wms);
    await ds.query(
      `INSERT INTO wms_warehouses
        (warehouse_code,warehouse_name,type,status,domain,company_code,owner_store_id,store_code)
       VALUES ($1,$2,'EGG_SALES','ACTIVE','OPERATIONAL',$3,NULL,'ALL'),
              ($4,$5,'EGG_SALES','ACTIVE','OPERATIONAL',$3,$6,$7)`,
      [sourceWarehouse, `B6 Source ${suffix}`, companyCode, targetWarehouse, `B6 Target ${suffix}`, storeId, storeCode],
    );
    await ds.query(
      `INSERT INTO inv_batches
        (batch_no,product_code,sku_code,item_type,unit,qty,qty_available,status,
         warehouse_code,location_code,store_code,company_code,inbound_date)
       VALUES ($1,'B6-PRODUCT',$2,'SKU','EA',10,10,'AVAILABLE',$3,'B6-SOURCE',$4,$5,CURRENT_DATE)`,
      [sourceBatch, `B6-SKU-${suffix}`, sourceWarehouse, 'ALL', companyCode],
    );
    // The historical table is runtime-created by GenericCrudService in production;
    // create the legacy projection explicitly in this disposable PG16 fixture so
    // the bypass reproduction remains independent of bootstrap ordering.
    await ds.query(`
      CREATE TABLE IF NOT EXISTS store_receiving (
        id BIGSERIAL PRIMARY KEY,
        receiving_no VARCHAR(50) UNIQUE,
        store_code VARCHAR(30),
        wave_no VARCHAR(50),
        receive_date DATE,
        status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }, 60000);

  afterAll(async () => {
    if (!ds?.isInitialized) return;
    await ds.transaction(async manager => {
      await manager.query(`DELETE FROM store_receiving WHERE receiving_no=$1`, [legacyReceivingNo]);
      if (requestId) await manager.query(`DELETE FROM store_replenishment_requests WHERE id=$1`, [requestId]);
      if (transferNo) {
        await manager.query(`DELETE FROM wms_transfer_discrepancies WHERE transfer_no=$1`, [transferNo]);
        await manager.query(`DELETE FROM wms_transfer_items WHERE transfer_no=$1`, [transferNo]);
        await manager.query(`DELETE FROM wms_transfer WHERE transfer_no=$1`, [transferNo]);
        await manager.query(`DELETE FROM inv_ledger WHERE ref_no=$1`, [transferNo]);
      }
      await manager.query(`DELETE FROM inv_batches WHERE batch_no=$1 OR batch_no LIKE $2`, [sourceBatch, `${sourceBatch}-T-%`]);
      await manager.query(`DELETE FROM wms_warehouses WHERE warehouse_code IN ($1,$2)`, [sourceWarehouse, targetWarehouse]);
      await manager.query(`DELETE FROM store_master WHERE id=$1`, [storeId]);
    });
    await ds.destroy();
  });

  it('reproduces the legacy false acceptance without inventory movement', async () => {
    await ds.query(
      `INSERT INTO store_receiving (receiving_no,store_code,status)
       VALUES ($1,$2,'PENDING')`,
      [legacyReceivingNo, storeCode],
    );
    const [before] = await ds.query(`SELECT qty,qty_available FROM inv_batches WHERE batch_no=$1`, [sourceBatch]);
    await ds.query(`UPDATE store_receiving SET status='ACCEPTED' WHERE receiving_no=$1`, [legacyReceivingNo]);
    const [legacy] = await ds.query(`SELECT status FROM store_receiving WHERE receiving_no=$1`, [legacyReceivingNo]);
    const [after] = await ds.query(`SELECT qty,qty_available FROM inv_batches WHERE batch_no=$1`, [sourceBatch]);

    expect(legacy.status).toBe('ACCEPTED');
    expect(after).toEqual(before);
    await expect(ds.query(`SELECT 1 FROM inv_ledger WHERE ref_no=$1`, [legacyReceivingNo])).resolves.toEqual([]);
  });

  it('moves an authorized replenishment through dispatch and receive, denies wrong scope, and rejects duplicate receive', async () => {
    const created = await replenishment.create({
      storeCode,
      sourceWarehouseCode: sourceWarehouse,
      reason: `B6 test ${suffix}`,
      lines: [{ skuCode: `B6-SKU-${suffix}`, skuName: 'B6 SKU', qty: 4 }],
    });
    requestId = Number(created.id);
    expect(created.status).toBe('DRAFT');
    await replenishment.submit(requestId);
    await replenishment.approve(requestId, { sourceWarehouseCode: sourceWarehouse }, { username: `b6-${suffix}` });
    const [approved] = await ds.query(`SELECT status,transfer_no FROM store_replenishment_requests WHERE id=$1`, [requestId]);
    transferNo = approved.transfer_no;
    expect(approved.status).toBe('APPROVED');

    await expect(replenishment.receive(requestId, { receive_all: true }, { username: `b6-${suffix}` }))
      .rejects.toThrow('仅已发运申请可签收');
    await replenishment.dispatch(requestId, { username: `b6-${suffix}` });

    scope = { isGlobal: false, allowedWarehouseCodes: [sourceWarehouse] };
    await expect(replenishment.receive(requestId, { receive_all: true }, { username: `b6-${suffix}` }))
      .rejects.toThrow('目标仓库（仓库范围不匹配）');

    scope = { isGlobal: false, allowedWarehouseCodes: [targetWarehouse] };
    const received = await replenishment.receive(requestId, { receive_all: true }, { username: `b6-${suffix}` });
    expect(received).toMatchObject({ status: 'COMPLETED', received_qty: 4, difference_qty: 0 });
    const [request] = await ds.query(`SELECT status FROM store_replenishment_requests WHERE id=$1`, [requestId]);
    expect(request.status).toBe('CLOSED');

    const [source] = await ds.query(`SELECT qty,qty_available FROM inv_batches WHERE batch_no=$1`, [sourceBatch]);
    const targetRows = await ds.query(
      `SELECT qty,qty_available,status,warehouse_code FROM inv_batches WHERE batch_no LIKE $1`,
      [`${sourceBatch}-T-%`],
    );
    expect(source).toMatchObject({ qty: 6, qty_available: 6 });
    expect(targetRows).toHaveLength(1);
    expect(targetRows[0]).toMatchObject({ qty: 4, qty_available: 4, status: 'AVAILABLE', warehouse_code: targetWarehouse });
    const ledger = await ds.query(`SELECT qty_change,warehouse_code,ref_no FROM inv_ledger WHERE ref_no=$1 ORDER BY id`, [transferNo]);
    expect(ledger).toHaveLength(2);
    expect(ledger.map((row: any) => Number(row.qty_change))).toEqual([-4, 4]);

    await expect(replenishment.receive(requestId, { receive_all: true }, { username: `b6-${suffix}` }))
      .rejects.toThrow('仅已发运申请可签收');
    const [targetCount] = await ds.query(
      `SELECT COALESCE(SUM(qty),0) AS qty FROM inv_batches WHERE batch_no LIKE $1`,
      [`${sourceBatch}-T-%`],
    );
    expect(Number(targetCount.qty)).toBe(4);
  });
});
