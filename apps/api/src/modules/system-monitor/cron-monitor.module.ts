import { Global, Module } from '@nestjs/common';
import { CronMonitorService } from './services/cron-monitor.service';
import { SystemMonitorModule } from './system-monitor.module';

/**
 * G126 · 全局 cron 心跳监控模块（评分补强 P6）
 *   @Global → 任何 feature 模块免 import 即可注入 CronMonitorService。
 */
@Global()
@Module({
  imports: [SystemMonitorModule],
  providers: [CronMonitorService],
  exports: [CronMonitorService],
})
export class CronMonitorModule {}
