import { Client } from 'pg';

async function verify() {
  const passwordsToTry = ['postgres', 'password', ''];
  let connected = false;
  let client: Client | null = null;

  for (const pwd of passwordsToTry) {
    client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || pwd,
      database: process.env.DB_NAME || 'phoenix_erp',
    });

    try {
      await client.connect();
      connected = true;
      break;
    } catch (e) {
      // try next
    }
  }

  if (!connected || !client) {
    console.error('❌ 无法连接到 PostgreSQL 数据库，请检查密码和运行状态。');
    process.exit(1);
  }

  try {
    const res = await client.query('SELECT count(*) FROM sys_dict');
    console.log(`✅ 成功读取到 sys_dict 表，总条目数: ${res.rows[0].count}`);

    const sample = await client.query('SELECT dict_type, dict_code, dict_label_zh, dict_label_lo, dict_label_en FROM sys_dict LIMIT 5');
    console.log('\n🔍 多语言数据抽样检查 (前 5 条):');
    console.table(sample.rows);

    const total = parseInt(res.rows[0].count);
    const missingLo = await client.query("SELECT count(*) FROM sys_dict WHERE dict_label_lo IS NULL OR dict_label_lo = ''");
    const missingEn = await client.query("SELECT count(*) FROM sys_dict WHERE dict_label_en IS NULL OR dict_label_en = ''");
    
    console.log('\n📊 国际化完整度统计:');
    console.log(`总条目数: ${total}`);
    console.log(`老挝文翻译覆盖率: ${total - parseInt(missingLo.rows[0].count)} / ${total} (缺失 ${missingLo.rows[0].count} 条)`);
    console.log(`英文翻译覆盖率: ${total - parseInt(missingEn.rows[0].count)} / ${total} (缺失 ${missingEn.rows[0].count} 条)`);

  } catch(e: any) {
    if (e.message.includes('relation "sys_dict" does not exist')) {
      console.error('❌ 表 sys_dict 不存在！V2 的数据未能成功同步到 V3。');
    } else {
      console.error('❌ 查询失败:', e.message);
    }
  } finally {
    await client.end();
  }
}

verify();
