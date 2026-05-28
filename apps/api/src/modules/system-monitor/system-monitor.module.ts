/**
 * Phoenix ERP V3 — SystemMonitor Module
 * Production Stabilization Phase 1
 */
import { Module } from '@nestjs/common';
import { SystemMonitorController } from './controllers/system-monitor.controller';
import { SysErrorLogsController } from './controllers/sys-error-logs.controller';
import { SysAlertsController } from './controllers/sys-alerts.controller';
import { SysConfigsController } from './controllers/sys-configs.controller';
import { SystemMonitorService } from './services/system-monitor.service';
import { SysErrorLogsService } from './services/sys-error-logs.service';
import { SysAlertsService } from './services/sys-alerts.service';
import { SysConfigsService } from './services/sys-configs.service';

@Module({
  controllers: [
    SystemMonitorController,
    SysErrorLogsController,
    SysAlertsController,
    SysConfigsController,
  ],
  providers: [
    SystemMonitorService,
    SysErrorLogsService,
    SysAlertsService,
    SysConfigsService,
  ],
  exports: [
    SysErrorLogsService,
    SysAlertsService,
    SysConfigsService,
  ],
})
export class SystemMonitorModule {}
