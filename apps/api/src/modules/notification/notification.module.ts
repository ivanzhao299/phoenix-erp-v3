import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysNotificationEntity }   from './entities/sys-notification.entity';
import { NotificationService }     from './notification.service';
import { PushNotificationService } from './push-notification.service';
import { NotificationController }  from './notification.controller';

@Global()
@Module({
  imports:     [TypeOrmModule.forFeature([SysNotificationEntity])],
  controllers: [NotificationController],
  providers:   [NotificationService, PushNotificationService],
  exports:     [NotificationService, PushNotificationService],
})
export class NotificationModule {}
