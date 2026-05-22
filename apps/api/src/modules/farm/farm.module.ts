import { Module } from '@nestjs/common';
import { FarmController } from './farm.controller';
import { FarmService } from './farm.service';
import { FarmCronService } from './farm.cron';
import { FarmFeedController } from './farm-feed.controller';
import { FarmFeedService } from './farm-feed.service';
import { FarmEggController } from './farm-egg.controller';
import { FarmEggService } from './farm-egg.service';
import { FarmSalesController } from './farm-sales.controller';
import { FarmSalesService } from './farm-sales.service';
import { FarmMedicineController } from './farm-medicine.controller';
import { FarmMedicineService } from './farm-medicine.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [FarmController, FarmFeedController, FarmEggController, FarmSalesController, FarmMedicineController],
  providers: [FarmService, FarmCronService, FarmFeedService, FarmEggService, FarmSalesService, FarmMedicineService, RolesGuard],
  exports: [FarmService, FarmFeedService, FarmEggService, FarmSalesService, FarmMedicineService],
})
export class FarmModule {}
