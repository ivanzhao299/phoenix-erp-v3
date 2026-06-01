import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ShrProjectEntity } from './entities/shr-project.entity';
import { ShrShareholderEntity } from './entities/shr-shareholder.entity';
import { ShrProjectEquityEntity } from './entities/shr-project-equity.entity';
import { ShrCapitalContributionEntity } from './entities/shr-capital-contribution.entity';
import { ShrShareholderScopeEntity } from './entities/shr-shareholder-scope.entity';
import { ShareholderService } from './services/shareholder.service';
import { ShareholderController } from './controllers/shareholder.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShrProjectEntity,
      ShrShareholderEntity,
      ShrProjectEquityEntity,
      ShrCapitalContributionEntity,
      ShrShareholderScopeEntity,
    ]),
  ],
  controllers: [ShareholderController],
  providers: [ShareholderService],
  exports: [ShareholderService],
})
export class ShareholderModule {}
