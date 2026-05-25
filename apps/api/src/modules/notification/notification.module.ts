import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysNotificationEntity } from './entities/sys-notification.entity';
import { NotificationService }   from './notification.service';
import { NotificationController } from './notification.controller';

@Global()
@Module({
  imports:     [TypeOrmModule.forFeature([SysNotificationEntity])],
  controllers: [NotificationController],
  providers:   [NotificationService],
  exports:     [NotificationService],
})
export class NotificationModule {}
