import { Module } from '@nestjs/common';
import { FarmController } from './farm.controller';
import { FarmService } from './farm.service';
import { FarmCronService } from './farm.cron';

/**
 * A6: 移除 FarmDailyEntity 注册 — entity 指向不存在的 biz_farm_daily 表，整体死代码
 *     真实数据写入 brd_daily_logs，由 farm.service 用 EntityManager 直接操作
 */
@Module({
  controllers: [FarmController],
  providers: [FarmService, FarmCronService],
  exports: [FarmService],
})
export class FarmModule {}
