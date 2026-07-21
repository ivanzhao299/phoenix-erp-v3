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
import { ChanjetVoucherDraftEntity } from './chanjet-voucher-draft.entity';
import { ChanjetReconciliationResultEntity } from './chanjet-reconciliation-result.entity';
import { ChanjetReadSnapshotEntity } from './chanjet-read-snapshot.entity';
import { ChanjetEntitySnapshotEntity } from './chanjet-entity-snapshot.entity';
import { ChanjetErpFieldMappingEntity } from './chanjet-erp-field-mapping.entity';
import { FinArLedgerEntity } from '../finance-v2/entities/fin-ar-ledger.entity';
import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';
import { ChanjetWritebackOutboxEntity } from './chanjet-writeback-outbox.entity';

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
      ChanjetVoucherDraftEntity,
      ChanjetReconciliationResultEntity,
      ChanjetReadSnapshotEntity,
      ChanjetEntitySnapshotEntity,
      ChanjetErpFieldMappingEntity,
      ChanjetWritebackOutboxEntity,
      FinArLedgerEntity,
    ]),
  ],
  controllers: [ChanjetCallbackController],
  providers: [ChanjetAuthService, ChanjetArSyncService, ChanjetIntegrationService, ChanjetReadonlySyncScheduler],
  exports: [ChanjetAuthService, ChanjetArSyncService, ChanjetIntegrationService, ChanjetReadonlySyncScheduler],
})
export class ChanjetModule {}
