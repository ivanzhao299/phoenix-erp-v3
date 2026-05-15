import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function initBrdData() {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'mac',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'phoenix_erp',
  });

  try {
    await client.connect();
    console.log('✅ Connected to database. Starting Phase 10E Data Ingestion...');

    // 1. Create Base Farm
    const farmCode = 'FARM-01';
    await client.query(`
      INSERT INTO brd_farms (farm_code, farm_name, location, status) 
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (farm_code) DO NOTHING
    `, [farmCode, '凤羽一号基地', '老挝万象生态农业园', 'ACTIVE']);
    console.log('✅ Base Farm initialized: FARM-01');

    // 2. Extract and Initialize Houses
    // We base this on the known IoT houses (A001-A006, B001) or pull from mapping
    const houses = [
      { code: 'A001', name: '一号鸡舍', capacity: 50000 },
      { code: 'A002', name: '二号鸡舍', capacity: 50000 },
      { code: 'A003', name: '三号鸡舍', capacity: 50000 },
      { code: 'A004', name: '四号鸡舍', capacity: 50000 },
      { code: 'A005', name: '五号鸡舍', capacity: 50000 },
      { code: 'A006', name: '六号鸡舍', capacity: 50000 },
      { code: 'B001', name: '七号鸡舍', capacity: 60000 },
    ];

    for (const h of houses) {
      await client.query(`
        INSERT INTO brd_houses (house_code, house_name, farm_code, max_capacity, status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (house_code) DO UPDATE SET house_name = $2
      `, [h.code, h.name, farmCode, h.capacity, 'ACTIVE']);
      
      // 3. Initialize First Batch Flocks
      const flockNo = `FLK-${h.code}-${new Date().getFullYear()}`;
      await client.query(`
        INSERT INTO brd_flocks (flock_no, house_code, farm_code, strain, placement_date, placement_age, initial_qty, current_qty, status)
        VALUES ($1, $2, $3, $4, CURRENT_DATE - interval '100 days', $5, $6, $6, $7)
        ON CONFLICT (flock_no) DO NOTHING
      `, [flockNo, h.code, farmCode, 'Hy-Line Brown', 1, h.capacity, 'ACTIVE']);
    }
    
    console.log(`✅ Initialized ${houses.length} Breeding Houses and Flocks.`);
    console.log('🎉 Phase 10E Breeding Data Onboarding completed successfully!');
  } catch (err) {
    console.error('❌ Error during data ingestion:', err);
  } finally {
    await client.end();
  }
}

initBrdData();
