import { Module } from '@nestjs/common';
import { PermissionSetsController } from './permission-sets.controller';
import { PermissionSetsService } from './permission-sets.service';

@Module({
  controllers: [PermissionSetsController],
  providers: [PermissionSetsService],
  exports: [PermissionSetsService],
})
export class PermissionSetsModule {}
