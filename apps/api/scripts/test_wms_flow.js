const http = require('http');

function request(path, method = 'GET', data = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3100,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runWmsFlow() {
  console.log('--- 开始仓储 (WMS) 业务链路彩排 ---');

  try {
    console.log('\n1. 仓储管理员登录...');
    const loginRes = await request('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    if (!loginRes.token) throw new Error(`登录失败: ${JSON.stringify(loginRes)}`);
    const token = loginRes.token;
    console.log('✅ 登录成功，获取到 Token');

    console.log('\n2. 访问 Inbound (入库) 面板...');
    const inbDash = await request('/inbound/dashboard', 'GET', null, token);
    console.log('入库面板数据:', inbDash.data);

    console.log('\n3. 查询待入库任务...');
    const pendingInb = await request('/inbound/pending', 'GET', null, token);
    console.log(`获取到 ${pendingInb.data?.length || 0} 个待入库任务`);

    if (pendingInb.data && pendingInb.data.length > 0) {
      const taskNo = pendingInb.data[0].task_no;
      console.log(`\n4. 确认入库任务 ${taskNo}...`);
      const confirmRes = await request('/inbound/confirm', 'POST', { task_no: taskNo, items: [] }, token);
      console.log('入库确认结果:', confirmRes.msg);
    } else {
      console.log('\n4. [跳过] 无待入库任务');
    }

    console.log('\n5. 访问 Outbound (出库) 面板...');
    const outbDash = await request('/outbound/dashboard', 'GET', null, token);
    console.log('出库面板数据:', outbDash.data);

    console.log('\n6. 查询待出库订单...');
    const pendingOutb = await request('/outbound/orders', 'GET', null, token);
    console.log(`获取到 ${pendingOutb.data?.length || 0} 个待出库订单`);

    console.log('\n7. 访问 Inventory (库存) 批次账本...');
    const batches = await request('/inventory/batches', 'GET', null, token);
    console.log(`获取到 ${batches.data?.length || 0} 个可用库存批次`);
    if (batches.data && batches.data.length > 0) {
      console.log('示例批次:', batches.data[0]);
    }

    console.log('\n--- 仓储链路彩排成功完成 ---');

  } catch (err) {
    console.error('\n❌ 彩排中途失败:');
    console.error(err);
  }
}

runWmsFlow();
