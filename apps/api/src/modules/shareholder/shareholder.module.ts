import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ShrProjectEntity } from './entities/shr-project.entity';
import { ShrShareholderEntity } from './entities/shr-shareholder.entity';
import { ShrProjectEquityEntity } from './entities/shr-project-equity.entity';
import { ShrCapitalContributionEntity } from './entities/shr-capital-contribution.entity';
import { ShrShareholderScopeEntity } from './entities/shr-shareholder-scope.entity';
import { ShrBeneficialEquityEntity } from './entities/shr-beneficial-equity.entity';
import { ShareholderService } from './services/shareholder.service';
import { CapitalAggregationService } from './services/capital-aggregation.service';
import { ShareholderController } from './controllers/shareholder.controller';
import { ShareholderAccountingReconciliationService } from './services/shareholder-accounting-reconciliation.service';
import { ChanjetModule } from '../chanjet/chanjet.module';
import { ChanjetBookCompanyMapEntity } from '../chanjet/chanjet-book-company-map.entity';
import { ChanjetEntitySnapshotEntity } from '../chanjet/chanjet-entity-snapshot.entity';
import { ChanjetMasterMappingEntity } from '../chanjet/chanjet-master-mapping.entity';
import { ChanjetReconciliationResultEntity } from '../chanjet/chanjet-reconciliation-result.entity';
import { ChanjetShareholderVoucherLinkEntity } from '../chanjet/chanjet-shareholder-voucher-link.entity';
import { ChanjetShareholderClosePeriodEntity } from '../chanjet/chanjet-shareholder-close-period.entity';

@Module({
  imports: [
    ChanjetModule,
    TypeOrmModule.forFeature([
      ShrProjectEntity,
      ShrShareholderEntity,
      ShrProjectEquityEntity,
      ShrCapitalContributionEntity,
      ShrShareholderScopeEntity,
      ShrBeneficialEquityEntity,
      ChanjetBookCompanyMapEntity,
      ChanjetEntitySnapshotEntity,
      ChanjetMasterMappingEntity,
      ChanjetReconciliationResultEntity,
      ChanjetShareholderVoucherLinkEntity,
      ChanjetShareholderClosePeriodEntity,
    ]),
  ],
  controllers: [ShareholderController],
  providers: [ShareholderService, CapitalAggregationService, ShareholderAccountingReconciliationService],
  exports: [ShareholderService],
})
export class ShareholderModule {}
