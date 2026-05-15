/**
 * Phoenix ERP V3 — 生产就绪数据库完整性审计
 * 用法: node migrations/db_audit_final.js
 */
const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'mac',
  database: process.env.DB_NAME || 'phoenix_erp',
  password: process.env.DB_PASSWORD || '',
});

// V3 全量表清单及必须存在的核心字段
const REQUIRED = [
  // 系统
  { table: 'sys_users',         cols: ['id','username','password_hash','role','status','store_code'] },
  { table: 'sys_roles',         cols: ['role_code','role_name_zh'] },
  { table: 'sys_dict',          cols: ['id','dict_type','dict_code'] },
  { table: 'sys_orgs',          cols: ['id','org_name'] },
  { table: 'sys_approval_log',  cols: ['id'] },
  // 采购
  { table: 'prc_purchase_orders', cols: ['id','po_no','supplier_code','total_amount','currency_code','status','store_code','created_at'] },
  { table: 'prc_suppliers',       cols: ['id','supplier_code','supplier_name','status'] },
  { table: 'prc_purchase_items',  cols: ['id'] },
  // 财务
  { table: 'fin_transactions',  cols: ['id','type','amount','status','due_date','account_code','description','currency_code','paid_amount','ref_no','transaction_no'] },
  { table: 'fin_accounts',      cols: ['id'] },
  { table: 'fin_payments',      cols: ['id'] },
  { table: 'fin_store_settlements', cols: ['id'] },
  // 仓储
  { table: 'wms_inbound',       cols: ['id','task_no','source_po_no','status','total_amount','store_code'] },
  { table: 'wms_inbound_items', cols: ['id','task_no'] },
  { table: 'wms_outbound',      cols: ['id','task_no','order_no','status','store_code'] },
  { table: 'wms_warehouses',    cols: ['id'] },
  { table: 'wms_zones',         cols: ['zone_code'] },
  { table: 'wms_transfer',      cols: ['id','transfer_no'] },
  { table: 'inv_batches',       cols: ['id','expire_date'] },
  { table: 'inv_ledger',        cols: ['id'] },
  // 订单
  { table: 'ord_orders',        cols: ['id','order_no','status','store_code','total_amount','currency_code'] },
  { table: 'ord_order_items',   cols: ['id','order_no'] },
  { table: 'ord_customers',     cols: ['id','customer_no','customer_name'] },
  { table: 'ord_prices',        cols: ['id','price_code','product_code'] },
  // 养殖
  { table: 'brd_farms',         cols: ['id','farm_code','farm_name','status'] },
  { table: 'brd_houses',        cols: ['id','house_code','house_name','farm_code','max_capacity','status'] },
  { table: 'brd_flocks',        cols: ['id','flock_no','house_code','farm_code','strain','placement_date','initial_qty','current_qty','status'] },
  { table: 'brd_daily_logs',    cols: ['id','log_date','house_code','egg_count','death_count','feed_kg'] },
  { table: 'brd_vaccinations',  cols: ['id'] },
  // IoT
  { table: 'mon_device_property_daily_agg', cols: ['id','agg_date','erp_house_code','property_code','avg_val'] },
  // POS/CRM/B2B
  { table: 'pos_sales',         cols: ['id','sale_no','store_code','total_amount','status'] },
  { table: 'crm_members',       cols: ['id','member_no','member_name'] },
  { table: 'b2b_customers',     cols: ['id','customer_code','status'] },
  // 物流
  { table: 'log_vehicles',      cols: ['id'] },
  { table: 'log_dispatch',      cols: ['id'] },
  // 质检
  { table: 'qa_inspections',    cols: ['id'] },
  { table: 'qa_non_conformance',cols: ['id'] },
  // 门店
  { table: 'mst_stores',        cols: ['id'] },
  { table: 'mst_products',      cols: ['id'] },
];

async function run() {
  await c.connect();
  console.log('🔍 Phoenix ERP V3 — 数据库完整性审计\n' + '═'.repeat(55));

  let passTable = 0, failTable = 0, passCol = 0, failCol = 0;
  const issues = [];

  for (const { table, cols } of REQUIRED) {
    // 检查表是否存在
    const tRes = await c.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [table]
    );
    if (tRes.rowCount === 0) {
      console.log(`❌ 表不存在: ${table}`);
      issues.push(`表缺失: ${table}`);
      failTable++;
      continue;
    }
    passTable++;

    // 检查必须字段
    const colRes = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      [table]
    );
    const existingCols = colRes.rows.map(r => r.column_name);
    const missingCols = cols.filter(col => !existingCols.includes(col));

    if (missingCols.length > 0) {
      console.log(`⚠️  ${table} — 缺字段: [${missingCols.join(', ')}]`);
      issues.push(`${table} 缺字段: ${missingCols.join(', ')}`);
      failCol += missingCols.length;
    } else {
      console.log(`✅ ${table} (${existingCols.length} cols)`);
      passCol += cols.length;
    }
  }

  // 统计行数
  console.log('\n📊 关键表数据量:');
  const countTables = ['sys_users','prc_purchase_orders','fin_transactions','brd_houses','brd_flocks','ord_orders','pos_sales','wms_inbound'];
  for (const t of countTables) {
    try {
      const r = await c.query(`SELECT COUNT(*) as n FROM ${t}`);
      console.log(`   ${t}: ${r.rows[0].n} 条`);
    } catch { console.log(`   ${t}: (查询失败)`); }
  }

  console.log('\n' + '═'.repeat(55));
  console.log(`表审计: ✅ ${passTable} 张  ❌ ${failTable} 张`);
  console.log(`字段审计: ✅ ${passCol} 个  ❌ ${failCol} 个缺失`);

  if (issues.length === 0) {
    console.log('\n🎉 数据库 100% 符合 V3 标准！可以进入生产。');
  } else {
    console.log('\n⚠️  待处理问题:');
    issues.forEach(i => console.log('  -', i));
  }

  await c.end();
}
run().catch(e => { console.error('连接失败:', e.message); process.exit(1); });
