import { Module } from '@nestjs/common';
import { PackagingController, GradingController } from './packaging.controller';
import { PdaController, PdaAppController, PdaPublicController } from './pda.controller';
import { LabelsController } from './labels.controller';
import { StocktakeController, DailyCloseController } from './stocktake.controller';
import { TerminalService } from './terminal.service';
import { PackagingService } from './packaging.service';
import { LabelsService } from './labels.service';
import { PdaTerminalsService } from './pda-terminals.service';
import { SalesV2Module } from '../sales-v2/sales-v2.module'; // 生产链路收口 Phase 1：包装完成 → 唯一库存入口

@Module({
  imports: [SalesV2Module], // 注入 PackagingInventoryIntegrationService（单向依赖，无循环）
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
