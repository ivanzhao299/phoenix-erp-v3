import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MonDeviceService } from './modules/iot/mon-device.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(MonDeviceService);
  
  const houseCode = 'A005';
  const properties = ['2001'];
  const range = '7d';
  
  console.log('Testing getHouseTrendsV3...');
  const result = await service.getHouseTrendsV3(houseCode, properties, range);
  console.log(JSON.stringify(result, null, 2));
  
  await app.close();
}
bootstrap();
