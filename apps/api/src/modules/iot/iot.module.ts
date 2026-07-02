import { Module } from '@nestjs/common';
import { FarmDeviceController } from './farm-device.controller';
import { FarmCabinController } from './farm-cabin.controller';
import { MonDeviceController } from './mon-device.controller';
import { IotV3Controller } from './iot-v3.controller';
import { MonDeviceService } from './mon-device.service';
import { IotSyncService } from './iot-sync.service';
import { SystemMonitorModule } from '../system-monitor/system-monitor.module';

@Module({
  imports: [SystemMonitorModule],
  controllers: [
    FarmDeviceController,
    FarmCabinController,
    MonDeviceController,
    IotV3Controller,
  ],
  providers: [
    MonDeviceService,
    IotSyncService,
  ],
  exports: [MonDeviceService, IotSyncService],
})
export class IotModule {}
