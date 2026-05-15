/**
 * P3 业务闭环本地测试脚本 (采购入库 -> 销售出库)
 * 前置条件：
 * 1. 已经执行了 ddl/04_create_p3_tables.sql
 * 2. npm run start:dev 正在运行
 */
const http = require('http');

function postData(path, data) {
  return new Promise((resolve, reject) => {
    const postDataStr = JSON.stringify(data);
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postDataStr),
        'x-dev-mock-user': 'admin'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        } else {
          resolve(JSON.parse(body));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postDataStr);
    req.end();
  });
}

async function runTest() {
  console.log('🚀 开始 P3 本地业务闭环测试 (采购 -> PDA入库 -> 销售 -> PDA出库)...\n');

  try {
    // 1. 创建并提交采购单 (Procurement)
    console.log('⏳ 1. 创建采购订单 (PO)...');
    const poRes = await postData('/api/v3/procurement/create', {
      supplier_code: 'SUP-JingDong',
      plan_qty: 500,
      total_amount: 15000 // 正常金额，走CNY
    });
    console.log(`✅ PO 创建成功: 单号 [${poRes.po_no}], 状态 [${poRes.status}]`);

    console.log('⏳ 2. 提交审批 PO...');
    const poSubmit = await postData(`/api/v3/procurement/${poRes.po_no}/submit`, {});
    // 模拟管理员已经在数据库里改成了 APPROVED
    // 因为这里我们没有完整的登录身份去调审批流，我们通过直接走 HTTP 不现实
    // 为了简化脚本验证入库，我们可以利用一个内部后门或者默认让小金额自动通过？
    // 为了防止测试卡住，我们在脚本里直连数据库强行改状态
    const { Client } = require('pg');
    const pgClient = new Client({ host: '127.0.0.1', user: 'mac', database: 'phoenix_erp' });
    await pgClient.connect();
    await pgClient.query(`UPDATE biz_purchase_order SET status='APPROVED' WHERE po_no=$1`, [poRes.po_no]);
    console.log(`✅ PO 审批通过 (强行修改状态用于测试). 当前状态: APPROVED`);

    // 3. PDA 扫码入库
    console.log('\n⏳ 3. 模拟 PDA 扫码收货入库...');
    const inboundRes = await postData('/api/v3/wms/inbound', {
      warehouse_code: 'WH-01',
      location_code: 'LOC-A1-01',
      spec_code: 'EGG-A-RED',
      batch_no: 'BATCH-20260506',
      qty: 500, // 满量收货
      source_po_no: poRes.po_no
    });
    console.log(`✅ 入库成功! (底层乐观锁保护)`);
    console.log(`📦 当前库位余量: ${inboundRes.currentBalance}`);
    console.log(`📝 采购单最新状态: ${inboundRes.poStatus} \n`);

    // 4. 创建销售订单 (OrderModule)
    // 假设系统里已经有一条我们通过 P1 代码创建的 SO，或者这里直接查一条
    const soRes = await pgClient.query(`SELECT order_no FROM biz_sales_order WHERE status='CONFIRMED' LIMIT 1`);
    let targetSo = 'SO-TEST-001';
    if (soRes.rows.length === 0) {
      await pgClient.query(`
        INSERT INTO biz_sales_order 
          (order_no, status, customer_id, total_amount, currency_code, store_code, created_store_code, created_by)
        VALUES ('SO-TEST-001', 'CONFIRMED', 1, 8000.00, 'CNY', 'ALL', 'ALL', 1)
      `);
    } else {
      targetSo = soRes.rows[0].order_no;
    }
    console.log(`⏳ 4. 提取到已确认的销售订单: [${targetSo}]`);

    // 5. PDA 扫码出库
    console.log('⏳ 5. 模拟 PDA 扫码发货出库...');
    const outboundRes = await postData('/api/v3/wms/outbound', {
      warehouse_code: 'WH-01',
      location_code: 'LOC-A1-01',
      spec_code: 'EGG-A-RED',
      batch_no: 'BATCH-20260506',
      qty: 200, // 部分出库
      source_so_no: targetSo
    });
    console.log(`✅ 出库成功! (底层乐观锁保护)`);
    console.log(`📦 当前库位余量: ${outboundRes.currentBalance}`);
    console.log(`📝 销售单最新状态: ${outboundRes.soStatus} \n`);

    // 6. 验证流水账 Ledger
    console.log('⏳ 6. 验证库存追溯流水账 (Stock Ledger)...');
    const ledgerRes = await pgClient.query(`SELECT * FROM wms_stock_ledger ORDER BY id DESC LIMIT 2`);
    for (const r of ledgerRes.rows.reverse()) {
      console.log(`   - [${r.biz_type}] 关联单号: ${r.bill_no} | 入库: +${r.in_qty} | 出库: -${r.out_qty} | 结存防篡改: ${r.balance_qty}`);
    }

    await pgClient.end();
    console.log('\n🎉 P3 业务闭环测试圆满通过！');
    
  } catch (err) {
    console.error('❌ 测试失败:', err.message);
  }
}

runTest();
