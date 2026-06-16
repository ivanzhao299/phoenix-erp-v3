import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysNotificationEntity }     from './entities/sys-notification.entity';
import { NotificationService }       from './notification.service';
import { PushNotificationService }   from './push-notification.service';
import { NotificationController }    from './notification.controller';
import { NotificationStreamController } from './notification-stream.controller';      // G167: SSE 实时流
import { NotificationDispatcherService } from './notification-dispatcher.service';   // V1: 规则引擎
import { NotificationSchedulerService }  from './notification-scheduler.service';    // V1: cron
import { NotificationConfigController }  from './notification-config.controller';    // V1: 配置 CRUD

@Global()
@Module({
  imports:     [TypeOrmModule.forFeature([SysNotificationEntity])],
  controllers: [NotificationController, NotificationConfigController, NotificationStreamController],
  providers:   [
    NotificationService,
    PushNotificationService,
    NotificationDispatcherService,
    NotificationSchedulerService,
  ],
  exports:     [
    NotificationService,
    PushNotificationService,
    NotificationDispatcherService,
  ],
})
export class NotificationModule {}
