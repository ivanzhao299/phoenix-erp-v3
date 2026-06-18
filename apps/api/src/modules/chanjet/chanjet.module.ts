import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetArSyncService } from './chanjet-ar-sync.service';
import { ChanjetCallbackController } from './chanjet-callback.controller';
import { SysChanjetStateEntity } from './sys-chanjet-state.entity';
import { ChanjetArSnapshotEntity } from './chanjet-ar-snapshot.entity';
import { ChanjetBookCompanyMapEntity } from './chanjet-book-company-map.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SysChanjetStateEntity,
      ChanjetArSnapshotEntity,
      ChanjetBookCompanyMapEntity,
    ]),
  ],
  controllers: [ChanjetCallbackController],
  providers: [ChanjetAuthService, ChanjetArSyncService],
  exports: [ChanjetAuthService, ChanjetArSyncService],
})
export class ChanjetModule {}
