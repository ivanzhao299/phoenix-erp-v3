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
import { ChanjetShareholderVoucherLinkEntity } from './chanjet-shareholder-voucher-link.entity';
import { ChanjetShareholderClosePeriodEntity } from './chanjet-shareholder-close-period.entity';
import { ChanjetShareholderAccountingBalanceEntity } from './chanjet-shareholder-accounting-balance.entity';
import { ChanjetErpInboundSyncRunEntity } from './chanjet-erp-inbound-sync-run.entity';
import { ChanjetErpInboundSyncService } from './chanjet-erp-inbound-sync.service';
import { ChanjetWmsPromotionCandidateEntity } from './chanjet-wms-promotion-candidate.entity';
import { ChanjetWmsWritebackOutboxEntity } from './chanjet-wms-writeback-outbox.entity';
import { ChanjetWmsBridgeService } from './chanjet-wms-bridge.service';
import { ChanjetWmsHouseLocationPolicyEntity } from './chanjet-wms-house-location-policy.entity';
import { ChanjetWmsUomConversionPolicyEntity } from './chanjet-wms-uom-conversion-policy.entity';
import { ChanjetErpMasterBusinessReviewService } from './chanjet-erp-master-business-review.service';
import { ChanjetHoldResolutionAuditService } from './chanjet-hold-resolution-audit.service';
import { ChanjetProductNameCanaryService } from './chanjet-product-name-canary.service';

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
      ChanjetShareholderVoucherLinkEntity,
      ChanjetShareholderClosePeriodEntity,
      ChanjetShareholderAccountingBalanceEntity,
      ChanjetErpInboundSyncRunEntity,
      ChanjetWmsPromotionCandidateEntity,
      ChanjetWmsWritebackOutboxEntity,
      ChanjetWmsHouseLocationPolicyEntity,
      ChanjetWmsUomConversionPolicyEntity,
      FinArLedgerEntity,
    ]),
  ],
  controllers: [ChanjetCallbackController],
  providers: [
    ChanjetAuthService,
    ChanjetArSyncService,
    ChanjetIntegrationService,
    ChanjetErpInboundSyncService,
    ChanjetReadonlySyncScheduler,
    ChanjetWmsBridgeService,
    ChanjetErpMasterBusinessReviewService,
    ChanjetHoldResolutionAuditService,
    ChanjetProductNameCanaryService,
  ],
  exports: [
    ChanjetAuthService,
    ChanjetArSyncService,
    ChanjetIntegrationService,
    ChanjetErpInboundSyncService,
    ChanjetReadonlySyncScheduler,
    ChanjetWmsBridgeService,
    ChanjetErpMasterBusinessReviewService,
    ChanjetHoldResolutionAuditService,
    ChanjetProductNameCanaryService,
  ],
})
export class ChanjetModule {}
