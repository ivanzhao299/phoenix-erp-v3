/**
 * Phoenix ERP V3 — 演示数据填充脚本
 * 为 fin_transactions / wms_inbound / ord_orders 注入基础数据
 * 用法: node migrations/seed_demo_data.js
 */
const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'mac',
  database: process.env.DB_NAME || 'phoenix_erp',
  password: process.env.DB_PASSWORD || '',
});

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function run() {
  await c.connect();
  console.log('🌱 开始注入演示数据...\n');

  // ── 1. fin_transactions (AR + AP) ─────────────────────────
  console.log('📒 写入 fin_transactions...');
  const finTypes = [
    { type: 'AR', desc: '团购收入汇款',         min: 50000, max: 200000 },
    { type: 'AR', desc: '门店日营收结算',        min: 10000, max: 80000  },
    { type: 'AR', desc: '批发大客户对账款',       min: 30000, max: 150000 },
    { type: 'AP', desc: '饲料采购付款',           min: 40000, max: 120000 },
    { type: 'AP', desc: '兽药添加剂采购',         min: 5000,  max: 30000  },
    { type: 'AP', desc: '包材纸箱采购',           min: 8000,  max: 40000  },
    { type: 'AP', desc: '员工薪酬发放',           min: 20000, max: 60000  },
    { type: 'AP', desc: '水电冷链运营费',         min: 5000,  max: 25000  },
  ];
  for (let i = 0; i < 80; i++) {
    const ft  = finTypes[i % finTypes.length];
    const amt = rnd(ft.min, ft.max);
    const days = rnd(1, 90);
    const dueDate = pastDate(rnd(-30, 30)); // 部分未来，部分过期
    const status = i % 7 === 0 ? 'PENDING' : (i % 5 === 0 ? 'OVERDUE' : 'COMPLETED');
    const txNo = `TX-${Date.now().toString().slice(-8)}-${String(i).padStart(3,'0')}`;
    await c.query(`
      INSERT INTO fin_transactions
        (transaction_no, type, description, amount, paid_amount, status, currency_code, due_date, account_code, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,'LAK',$7,'ACC-001', NOW() - INTERVAL '${days} days')
      ON CONFLICT DO NOTHING
    `, [txNo, ft.type, ft.desc, amt,
        status === 'COMPLETED' ? amt : (status === 'OVERDUE' ? rnd(0, amt) : 0),
        status, dueDate]).catch(() => {});
  }
  console.log('  ✅ 写入 80 条财务交易记录');

  // ── 2. wms_inbound ────────────────────────────────────────
  console.log('📦 写入 wms_inbound...');
  for (let i = 0; i < 30; i++) {
    const taskNo = `IN-${Date.now().toString().slice(-7)}-${String(i).padStart(3,'0')}`;
    const poNo   = `PO-${String(rnd(1,10)).padStart(3,'0')}`;
    const status = i % 4 === 0 ? 'PENDING' : (i % 3 === 0 ? 'PROCESSING' : 'COMPLETED');
    await c.query(`
      INSERT INTO wms_inbound
        (task_no, source_po_no, source_type, warehouse_code, total_amount, currency_code, status, store_code, created_at)
      VALUES ($1,$2,'PURCHASE','WH-MAIN',$3,'LAK',$4,'ALL', NOW() - INTERVAL '${rnd(1,60)} days')
      ON CONFLICT DO NOTHING
    `, [taskNo, poNo, rnd(5000, 80000), status]).catch(() => {});
  }
  console.log('  ✅ 写入 30 条入库单');

  // ── 3. wms_outbound ───────────────────────────────────────
  console.log('📤 写入 wms_outbound...');
  for (let i = 0; i < 20; i++) {
    const taskNo  = `OUT-${Date.now().toString().slice(-7)}-${String(i).padStart(3,'0')}`;
    const orderNo = `ORD-${String(rnd(1,20)).padStart(3,'0')}`;
    const status  = i % 3 === 0 ? 'PENDING' : 'COMPLETED';
    await c.query(`
      INSERT INTO wms_outbound
        (task_no, order_no, source_type, warehouse_code, total_amount, currency_code, status, store_code, created_at)
      VALUES ($1,$2,'SALE','WH-MAIN',$3,'LAK',$4,'ALL', NOW() - INTERVAL '${rnd(1,45)} days')
      ON CONFLICT DO NOTHING
    `, [taskNo, orderNo, rnd(10000, 150000), status]).catch(() => {});
  }
  console.log('  ✅ 写入 20 条出库单');

  // ── 4. ord_orders ─────────────────────────────────────────
  console.log('🛒 写入 ord_orders...');
  const orderStatuses = ['DRAFT','CONFIRMED','APPROVED','ALLOCATED','SHIPPED','DELIVERED','COMPLETED'];
  for (let i = 0; i < 25; i++) {
    const orderNo = `ORD-${String(i+1).padStart(3,'0')}`;
    const status  = orderStatuses[i % orderStatuses.length];
    const amt     = rnd(20000, 300000);
    await c.query(`
      INSERT INTO ord_orders
        (order_no, total_amount, currency_code, status, store_code, created_at, updated_at)
      VALUES ($1,$2,'LAK',$3,'ALL', NOW() - INTERVAL '${rnd(1,60)} days', NOW())
      ON CONFLICT (order_no) DO NOTHING
    `, [orderNo, amt, status]).catch(() => {});
  }
  console.log('  ✅ 写入 25 条销售订单');

  // ── 5. prc_suppliers (如为空) ─────────────────────────────
  const suppCount = await c.query('SELECT COUNT(*) as n FROM prc_suppliers');
  if (parseInt(suppCount.rows[0].n) < 3) {
    console.log('🏭 写入 prc_suppliers...');
    const supps = [
      ['SUP-001', '老挝万象饲料集团', 'FEED'],
      ['SUP-002', '泰国农化兽药供应商', 'MEDICINE'],
      ['SUP-003', '广东包材印刷厂', 'PACKAGING'],
      ['SUP-004', '万象物流设备租赁', 'EQUIPMENT'],
    ];
    for (const [code, name, type] of supps) {
      await c.query(`
        INSERT INTO prc_suppliers (supplier_code, supplier_name, supplier_type, status, currency_code, credit_days)
        VALUES ($1,$2,$3,'ACTIVE','LAK',30)
        ON CONFLICT (supplier_code) DO NOTHING
      `, [code, name, type]).catch(() => {});
    }
    console.log('  ✅ 写入 4 条供应商');
  }

  // ── 6. crm_members (如为空) ───────────────────────────────
  const mbrCount = await c.query('SELECT COUNT(*) as n FROM crm_members');
  if (parseInt(mbrCount.rows[0].n) < 3) {
    console.log('👥 写入 crm_members...');
    for (let i = 1; i <= 10; i++) {
      await c.query(`
        INSERT INTO crm_members (member_no, member_name, phone, level, points, status)
        VALUES ($1,$2,$3,'SILVER',$4,'ACTIVE')
        ON CONFLICT DO NOTHING
      `, [`MBR-${String(i).padStart(4,'0')}`, `会员${i}号`, `020${String(rnd(10000000,99999999))}`, rnd(0,5000)]).catch(() => {});
    }
    console.log('  ✅ 写入 10 条会员');
  }

  // ── 统计结果 ──────────────────────────────────────────────
  console.log('\n📊 填充后各表数据量:');
  const checkTables = ['fin_transactions','wms_inbound','wms_outbound','ord_orders','prc_suppliers','crm_members'];
  for (const t of checkTables) {
    const r = await c.query(`SELECT COUNT(*) as n FROM ${t}`);
    console.log(`   ${t}: ${r.rows[0].n} 条`);
  }

  console.log('\n🎉 演示数据注入完成！各模块均有数据可供前端验证。');
  await c.end();
}
run().catch(e => { console.error('连接失败:', e.message); process.exit(1); });
