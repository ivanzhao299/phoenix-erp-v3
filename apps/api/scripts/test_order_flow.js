const http = require('http');

const API_BASE = 'http://127.0.0.1:3100/api';

async function request(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runBusinessFlow() {
  console.log('--- 开始业务链路彩排 ---');
  
  // 1. 登录获取 Token
  console.log('1. 管理员登录...');
  const loginRes = await request('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
  if (!loginRes.token) throw new Error('登录失败');
  const token = loginRes.token;
  console.log('✅ 登录成功，获取到 Token');

  // 2. 创建一笔销售订单 (触发低价审批)
  console.log('\n2. 业务员新建订单...');
  const orderData = {
    customer_code: 'CUST-001',
    customer_name: '测试客户A',
    order_type: 'normal',
    lines: [
      {
        product_code: 'P-01',
        product_name_zh: '鲜鸡蛋 30枚装',
        qty: 100,
        unit_price: 15.00, // 故意低价
        below_floor_price: true, // 触发特价审批
      }
    ]
  };
  const submitRes = await request('/orders/submit', 'POST', orderData, token);
  console.log('提交结果:', submitRes);
  const orderNo = submitRes.order_no;
  if (!orderNo) throw new Error('订单创建失败');

  // 3. 验证单据处于待审批状态
  console.log(`\n3. 获取订单详情 ${orderNo}...`);
  const getRes = await request(`/orders/${orderNo}`, 'GET', null, token);
  console.log(`当前状态: ${getRes.data.status}`);

  // 4. 审批中心同意订单
  console.log('\n4. 主管同意特价审批...');
  const approveRes = await request(`/orders/${orderNo}/status`, 'POST', { action: 'approve' }, token);
  console.log('审批结果:', approveRes.msg);

  // 5. 模拟后续物流与财务流转
  const steps = ['locked', 'allocated', 'shipped', 'received', 'reconciled'];
  for (const step of steps) {
    console.log(`\n> 流转订单至状态: ${step}`);
    const transRes = await request(`/orders/${orderNo}/transition`, 'POST', { to_status: step, remark: `自动测试 - ${step}` }, token);
    console.log(`结果:`, transRes.msg);
    // 延迟一点点
    await new Promise(r => setTimeout(r, 200));
  }

  // 6. 验证财务流水是否生成
  console.log('\n5. 验证财务流水 (fin_transactions)...');
  const finRes = await request(`/crud/fin_transactions?ref_no=${orderNo}`, 'GET', null, token);
  if (finRes.data && finRes.data.length > 0) {
    console.log('✅ 发现自动生成的财务流水:');
    finRes.data.forEach(t => {
      console.log(`   [${t.type}] ${t.amount} LAK -> ${t.note}`);
    });
  } else {
    console.log('❌ 未找到财务流水！');
  }

  console.log('\n--- 业务链路彩排成功完成 ---');
}

runBusinessFlow().catch(console.error);
