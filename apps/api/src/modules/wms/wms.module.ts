import { WarehouseDailyCloseService } from './warehouse-daily-close.service';
import { ProductionCutoverController } from './production-cutover.controller';
import { ProductionCutoverService } from './production-cutover.service';
import { FileModule } from '../file/file.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboundController } from './inbound.controller';
import { OutboundController } from './outbound.controller';
import { InventoryController, StocktakeController } from './inventory.controller';
import { InventoryService } from './inventory/inventory.service';
import { WmsService } from './wms.service';
import { WmsLocationEntity } from './entities/wms-location.entity';
import { WmsStockBalanceEntity } from './entities/wms-stock-balance.entity';
import { WmsStockLedgerEntity } from './entities/wms-stock-ledger.entity';

// Phase C: OrderModule import removed — WmsService queries ord_orders directly
// via EntityManager SQL and does NOT inject OrderService. The forwardRef was
// unnecessary and created a false circular dependency. OrderModule still
// imports WmsModule (one-way) to call WmsService.advanceOutboundOrder().

@Module({
  imports: [FileModule,
    TypeOrmModule.forFeature([
      WmsLocationEntity,
      WmsStockBalanceEntity,
      WmsStockLedgerEntity,
    ]),
  ],
  controllers: [ProductionCutoverController, InboundController, OutboundController, InventoryController, StocktakeController],
  providers: [ProductionCutoverService, InventoryService, WmsService, WarehouseDailyCloseService],
  exports: [InventoryService, WmsService],
})
export class WmsModule {}
