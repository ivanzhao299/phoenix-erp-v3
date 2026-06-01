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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShrProjectEntity,
      ShrShareholderEntity,
      ShrProjectEquityEntity,
      ShrCapitalContributionEntity,
      ShrShareholderScopeEntity,
      ShrBeneficialEquityEntity,
    ]),
  ],
  controllers: [ShareholderController],
  providers: [ShareholderService, CapitalAggregationService],
  exports: [ShareholderService],
})
export class ShareholderModule {}
