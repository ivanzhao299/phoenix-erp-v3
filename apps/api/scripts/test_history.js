const fs = require('fs');

async function test() {
  // Use the same auth token logic or just grab a known token
  // Let's just require the service and run it
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { IotSyncService } = require('../dist/modules/iot/iot-sync.service');

  const app = await NestFactory.createApplicationContext(AppModule);
  const syncSvc = app.get(IotSyncService);
  
  const token = await syncSvc.getAccessToken();
  const res = await fetch('https://iot.xiaojuyun.com/open/api/house/device/property/date/data/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({
      houseId: '1248',
      date: '2026-05-08',
      propertyCodes: ["2001", "2002", "2003"]
    })
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
  await app.close();
}
test().catch(console.error);
