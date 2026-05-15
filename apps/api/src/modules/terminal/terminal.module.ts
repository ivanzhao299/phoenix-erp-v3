import { Module } from '@nestjs/common';
import { PackagingController, GradingController } from './packaging.controller';
import { PdaController, PdaAppController, PdaPublicController } from './pda.controller';
import { LabelsController } from './labels.controller';
import { StocktakeController, DailyCloseController } from './stocktake.controller';
import { TerminalService } from './terminal.service';
import { PackagingService } from './packaging.service';
import { LabelsService } from './labels.service';
import { PdaTerminalsService } from './pda-terminals.service';

@Module({
  controllers: [
    PackagingController,
    GradingController,
    PdaController,
    PdaAppController,
    PdaPublicController,
    LabelsController,
    StocktakeController,
    DailyCloseController,
  ],
  providers: [TerminalService, PackagingService, LabelsService, PdaTerminalsService],
  exports: [TerminalService, PackagingService, LabelsService, PdaTerminalsService],
})
export class TerminalModule {}
