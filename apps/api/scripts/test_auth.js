/**
 * Phase 1 验证脚本：测试 V3.0 NestJS Auth 接口
 * 运行方式：node scripts/test_auth.js
 */
const http = require('http');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3100,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b || '{}') }));
    });
    req.on('error', e => reject(e));
    req.write(body);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3100,
      path,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b || '{}') }));
    });
    req.on('error', e => reject(e));
    req.end();
  });
}

async function run() {
  console.log('\n🚀 Phase 1 验证：Auth 接口兼容性测试\n');

  // 1. 测试登录
  console.log('⏳ 1. POST /api/auth/login (admin)...');
  try {
    const res = await post('/api/auth/login', { username: 'admin', password: 'admin123' });
    if (res.body.code === 200 && res.body.token) {
      console.log('✅ 登录成功！');
      console.log(`   token 前50字符: ${res.body.token.substring(0, 50)}...`);
      console.log(`   用户名: ${res.body.user_info?.username}`);
      console.log(`   角色: ${res.body.user_info?.role}`);
      console.log(`   storeCode: ${res.body.user_info?.storeCode}`);

      const token = res.body.token;

      // 2. 测试 /api/auth/me
      console.log('\n⏳ 2. GET /api/auth/me...');
      const meRes = await get('/api/auth/me', token);
      if (meRes.body.code === 200) {
        console.log('✅ /auth/me 成功！剩余有效期:', meRes.body.expires_in, '秒');
      } else {
        console.log('❌ /auth/me 失败:', JSON.stringify(meRes.body));
      }

      // 3. 测试 token refresh
      console.log('\n⏳ 3. POST /api/auth/refresh...');
      const refreshRes = await post('/api/auth/refresh', {});
      // refresh 需要带 Authorization header，这里只验证接口存在
      console.log(`   状态码: ${refreshRes.status} (401 is expected without token)`);

      console.log('\n🎉 Phase 1 Auth 接口验证完成！');
      console.log('\n📌 下一步：打开浏览器 http://localhost:5180，用 admin / admin123 登录，确认前端登录正常！');

    } else {
      console.log('❌ 登录失败！响应:', JSON.stringify(res.body, null, 2));
      if (res.status === 500) {
        console.log('\n💡 提示：如果是 500，可能是 sys_users 表字段不匹配，请检查 NestJS 启动日志');
      }
    }
  } catch (err) {
    console.error('❌ 连接失败:', err.message);
    console.log('\n💡 请确认 NestJS 已在 3100 端口启动 (npm run start:dev)');
  }
}

run();
