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

@Module({
  controllers: [FarmController, FarmFeedController, FarmEggController, FarmSalesController],
  providers: [FarmService, FarmCronService, FarmFeedService, FarmEggService, FarmSalesService],
  exports: [FarmService, FarmFeedService, FarmEggService, FarmSalesService],
})
export class FarmModule {}
