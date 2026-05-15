/**
 * Phoenix ERP V3 — 全量字段缺口修复 (基于审计结果)
 * 用法: node migrations/fix_audit_gaps.js
 */
const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'mac',
  database: process.env.DB_NAME || 'phoenix_erp',
  password: process.env.DB_PASSWORD || '',
});

// 添加 id BIGSERIAL 到没有 id 列的 V2 旧表（并回填现有行）
async function addSerialId(table) {
  const seqName = `${table}_id_seq`;
  await c.query(`CREATE SEQUENCE IF NOT EXISTS ${seqName}`);
  await c.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS id BIGINT`);
  await c.query(`UPDATE ${table} SET id = nextval('${seqName}') WHERE id IS NULL`);
  await c.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT nextval('${seqName}')`);
}

const steps = [
  // ── 1. id 字段补全 ──────────────────────────────────────────
  async () => { await addSerialId('prc_purchase_orders');    console.log('✅ prc_purchase_orders.id'); },
  async () => { await addSerialId('prc_suppliers');          console.log('✅ prc_suppliers.id'); },
  async () => { await addSerialId('fin_accounts');           console.log('✅ fin_accounts.id'); },
  async () => { await addSerialId('fin_payments');           console.log('✅ fin_payments.id'); },
  async () => { await addSerialId('wms_inbound');            console.log('✅ wms_inbound.id'); },
  async () => { await addSerialId('wms_outbound');           console.log('✅ wms_outbound.id'); },
  async () => { await addSerialId('wms_warehouses');         console.log('✅ wms_warehouses.id'); },
  async () => { await addSerialId('inv_batches');            console.log('✅ inv_batches.id'); },
  async () => { await addSerialId('ord_orders');             console.log('✅ ord_orders.id'); },
  async () => { await addSerialId('brd_farms');              console.log('✅ brd_farms.id'); },
  async () => { await addSerialId('brd_flocks');             console.log('✅ brd_flocks.id'); },
  async () => { await addSerialId('crm_members');            console.log('✅ crm_members.id'); },
  async () => { await addSerialId('b2b_customers');          console.log('✅ b2b_customers.id'); },
  async () => { await addSerialId('log_vehicles');           console.log('✅ log_vehicles.id'); },
  async () => { await addSerialId('log_dispatch');           console.log('✅ log_dispatch.id'); },
  async () => { await addSerialId('qa_inspections');         console.log('✅ qa_inspections.id'); },
  async () => { await addSerialId('mst_stores');             console.log('✅ mst_stores.id'); },
  async () => { await addSerialId('mst_products');           console.log('✅ mst_products.id'); },

  // ── 2. 其他缺失字段 ─────────────────────────────────────────
  async () => {
    await c.query(`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS currency_code VARCHAR(8) DEFAULT 'LAK'`);
    console.log('✅ fin_transactions.currency_code');
  },
  async () => {
    await c.query(`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) DEFAULT 'ALL'`);
    console.log('✅ wms_inbound.store_code');
  },
  async () => {
    await c.query(`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS task_no VARCHAR(64)`);
    console.log('✅ wms_inbound.task_no');
  },
  async () => {
    await c.query(`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS task_no VARCHAR(64)`);
    console.log('✅ wms_outbound.task_no');
  },
  async () => {
    // ord_customers: V2存在但缺 customer_no
    await c.query(`ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS customer_no VARCHAR(64)`);
    // 对已有行回填唯一的 customer_no
    await c.query(`UPDATE ord_customers SET customer_no = 'CST-' || id::text WHERE customer_no IS NULL`);
    console.log('✅ ord_customers.customer_no + 回填');
  },
  async () => {
    await c.query(`ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS customer_name VARCHAR(128)`);
    console.log('✅ ord_customers.customer_name');
  },
  async () => {
    await c.query(`ALTER TABLE ord_prices ADD COLUMN IF NOT EXISTS product_code VARCHAR(64)`);
    console.log('✅ ord_prices.product_code');
  },
  async () => {
    await c.query(`ALTER TABLE ord_prices ADD COLUMN IF NOT EXISTS price_code VARCHAR(64)`);
    // 回填 price_code
    await c.query(`UPDATE ord_prices SET price_code = 'PRC-' || id::text WHERE price_code IS NULL`);
    console.log('✅ ord_prices.price_code + 回填');
  },
  async () => {
    await c.query(`ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS member_no VARCHAR(64)`);
    await c.query(`UPDATE crm_members SET member_no = 'MBR-' || id::text WHERE member_no IS NULL`);
    console.log('✅ crm_members.member_no + 回填');
  },
  async () => {
    await c.query(`ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS member_name VARCHAR(128)`);
    await c.query(`UPDATE crm_members SET member_name = COALESCE(name, nickname, '会员-' || id::text) WHERE member_name IS NULL`).catch(() =>
      c.query(`UPDATE crm_members SET member_name = '会员-' || id::text WHERE member_name IS NULL`)
    );
    console.log('✅ crm_members.member_name + 回填');
  },

  // ── 3. 确保关键索引存在 ─────────────────────────────────────
  async () => {
    await c.query(`CREATE INDEX IF NOT EXISTS idx_wms_inbound_task ON wms_inbound(task_no) WHERE task_no IS NOT NULL`);
    console.log('✅ idx wms_inbound(task_no)');
  },
  async () => {
    await c.query(`CREATE INDEX IF NOT EXISTS idx_wms_outbound_task ON wms_outbound(task_no) WHERE task_no IS NOT NULL`);
    console.log('✅ idx wms_outbound(task_no)');
  },
];

async function run() {
  await c.connect();
  console.log('🔧 开始修复审计发现的 25 个字段缺口...\n' + '─'.repeat(50));

  let ok = 0, fail = 0;
  for (const step of steps) {
    try {
      await step();
      ok++;
    } catch(e) {
      if (e.message.includes('already exists')) {
        console.log('⏭  已存在，跳过');
        ok++;
      } else {
        console.error('❌', e.message);
        fail++;
      }
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ 成功: ${ok}  ❌ 失败: ${fail}`);
  if (!fail) console.log('🎉 所有字段缺口修复完成！重新运行审计验证。');
  await c.end();
}
run().catch(e => { console.error('连接失败:', e.message); process.exit(1); });
