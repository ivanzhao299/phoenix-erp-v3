import { Module } from '@nestjs/common';
import { MasterController, SystemController } from './master.controller';
import { SystemUsersController } from './system-users.controller';

@Module({
  controllers: [MasterController, SystemController, SystemUsersController],
})
export class MasterModule {}
