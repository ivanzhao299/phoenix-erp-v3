import { Module } from '@nestjs/common';
import { FarmController } from './farm.controller';
import { FarmService } from './farm.service';
import { FarmCronService } from './farm.cron';
import { FarmFeedController } from './farm-feed.controller';
import { FarmFeedService } from './farm-feed.service';
import { FarmEggController } from './farm-egg.controller';
import { FarmEggService } from './farm-egg.service';

@Module({
  controllers: [FarmController, FarmFeedController, FarmEggController],
  providers: [FarmService, FarmCronService, FarmFeedService, FarmEggService],
  exports: [FarmService, FarmFeedService, FarmEggService],
})
export class FarmModule {}
