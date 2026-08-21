import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysNotificationEntity }     from './entities/sys-notification.entity';
import { NotificationService }       from './notification.service';
import { PushNotificationService }   from './push-notification.service';
import { NotificationController }    from './notification.controller';
import { NotificationStreamController } from './notification-stream.controller';      // G167: SSE 实时流
import { PresenceService }            from './presence.service';                      // G171: 在线状态
import { PresenceController }         from './presence.controller';                   // G171: 在线用户
import { NotificationDispatcherService } from './notification-dispatcher.service';   // V1: 规则引擎
import { NotificationSchedulerService }  from './notification-scheduler.service';    // V1: cron
import { NotificationConfigController }  from './notification-config.controller';    // V1: 配置 CRUD
import { ScopedNotificationRecipientService } from './scoped-notification-recipient.service';

@Global()
@Module({
  imports:     [TypeOrmModule.forFeature([SysNotificationEntity])],
  controllers: [NotificationController, NotificationConfigController, NotificationStreamController, PresenceController],
  providers:   [
    NotificationService,
    PushNotificationService,
    PresenceService,
    NotificationDispatcherService,
    NotificationSchedulerService,
    ScopedNotificationRecipientService,
  ],
  exports:     [
    NotificationService,
    PushNotificationService,
    PresenceService,
    NotificationDispatcherService,
    ScopedNotificationRecipientService,
  ],
})
export class NotificationModule {}
