import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboundController } from './inbound.controller';
import { OutboundController } from './outbound.controller';
import { InventoryController, StocktakeController } from './inventory.controller';
import { InventoryService } from './inventory/inventory.service';
import { WmsService } from './wms.service';
import { WmsLocationEntity } from './entities/wms-location.entity';
import { WmsStockBalanceEntity } from './entities/wms-stock-balance.entity';
import { WmsStockLedgerEntity } from './entities/wms-stock-ledger.entity';
import { ProcurementModule } from '../procurement/procurement.module';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WmsLocationEntity,
      WmsStockBalanceEntity,
      WmsStockLedgerEntity,
    ]),
    ProcurementModule,
    // forwardRef — OrderModule reverse-imports WmsModule
    forwardRef(() => OrderModule),
  ],
  controllers: [InboundController, OutboundController, InventoryController, StocktakeController],
  providers: [InventoryService, WmsService],
  exports: [InventoryService, WmsService],
})
export class WmsModule {}
