import { Global, Module } from '@nestjs/common';
import { CronMonitorService } from './services/cron-monitor.service';

/**
 * G126 · 全局 cron 心跳监控模块（评分补强 P6）
 *   @Global → 任何 feature 模块免 import 即可注入 CronMonitorService。
 */
@Global()
@Module({
  providers: [CronMonitorService],
  exports: [CronMonitorService],
})
export class CronMonitorModule {}
