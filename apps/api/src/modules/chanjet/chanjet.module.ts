import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetArSyncService } from './chanjet-ar-sync.service';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import { ChanjetCallbackController } from './chanjet-callback.controller';
import { SysChanjetStateEntity } from './sys-chanjet-state.entity';
import { ChanjetArSnapshotEntity } from './chanjet-ar-snapshot.entity';
import { ChanjetBookCompanyMapEntity } from './chanjet-book-company-map.entity';
import { ChanjetAccountBookEntity } from './chanjet-account-book.entity';
import { ChanjetApiFieldCatalogEntity } from './chanjet-api-field-catalog.entity';
import { ChanjetMasterMappingEntity } from './chanjet-master-mapping.entity';
import { ChanjetSyncJobEntity } from './chanjet-sync-job.entity';
import { FinArLedgerEntity } from '../finance-v2/entities/fin-ar-ledger.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SysChanjetStateEntity,
      ChanjetArSnapshotEntity,
      ChanjetBookCompanyMapEntity,
      ChanjetAccountBookEntity,
      ChanjetApiFieldCatalogEntity,
      ChanjetMasterMappingEntity,
      ChanjetSyncJobEntity,
      FinArLedgerEntity,
    ]),
  ],
  controllers: [ChanjetCallbackController],
  providers: [ChanjetAuthService, ChanjetArSyncService, ChanjetIntegrationService],
  exports: [ChanjetAuthService, ChanjetArSyncService, ChanjetIntegrationService],
})
export class ChanjetModule {}
