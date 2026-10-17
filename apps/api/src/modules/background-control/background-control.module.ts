import { Global, Module } from '@nestjs/common';
import { BackgroundManifestReader } from './background-manifest.reader';
import { BackgroundLockBackend } from './background-lock.backend';
import { BackgroundTaskService } from './background-task.service';
import { BackgroundStatusController } from './background-status.controller';

@Global()
@Module({
  controllers: [BackgroundStatusController],
  providers: [BackgroundManifestReader, BackgroundLockBackend, BackgroundTaskService],
  exports: [BackgroundTaskService],
})
export class BackgroundControlModule {}
