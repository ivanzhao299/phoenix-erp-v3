import { Module } from '@nestjs/common';
import { FarmController } from './farm.controller';
import { FarmService } from './farm.service';
import { FarmCronService } from './farm.cron';
import { FarmFeedController } from './farm-feed.controller';
import { FarmFeedService } from './farm-feed.service';

@Module({
  controllers: [FarmController, FarmFeedController],
  providers: [FarmService, FarmCronService, FarmFeedService],
  exports: [FarmService, FarmFeedService],
})
export class FarmModule {}
