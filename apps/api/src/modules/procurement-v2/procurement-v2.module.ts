import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WmsModule } from '../wms/wms.module';   // G84 收货→库存统一入库

// ── Entities ────────────────────────────────────────────────────────────────
import { Prc2SupplierEntity }           from './entities/prc2-supplier.entity';
import { Prc2ProjectEntity }            from './entities/prc2-project.entity';
import { Prc2PurchaseRequestEntity }    from './entities/prc2-purchase-request.entity';
import { Prc2RequestItemEntity }        from './entities/prc2-request-item.entity';
import { Prc2PurchaseOrderEntity }      from './entities/prc2-purchase-order.entity';
import { Prc2OrderItemEntity }          from './entities/prc2-order-item.entity';
import { Prc2ShipmentEntity }           from './entities/prc2-shipment.entity';
import { Prc2ReceiptEntity }            from './entities/prc2-receipt.entity';
import { Prc2ReceiptItemEntity }        from './entities/prc2-receipt-item.entity';
import { Prc2PaymentEntity }            from './entities/prc2-payment.entity';
import { Prc2PaymentAllocationEntity }  from './entities/prc2-payment-allocation.entity';
import { Prc2ShareholderFundEntity }    from './entities/prc2-shareholder-fund.entity';
import { Prc2ApLedgerEntity }           from './entities/prc2-ap-ledger.entity';
import { Prc2ApprovalEntity }           from './entities/prc2-approval.entity';
import { SysExchangeRateEntity }        from './entities/sys-exchange-rate.entity';
import { Prc2InitBatchEntity }          from './entities/prc2-init-batch.entity';
import { Prc2InitBatchRowEntity }       from './entities/prc2-init-batch-row.entity';

// ── Controllers ──────────────────────────────────────────────────────────────
import { ProcurementV2Controller }  from './procurement-v2.controller';
import { ProjectsController }       from './controllers/projects.controller';
import { SuppliersController }      from './controllers/suppliers.controller';
import { RequestsController }       from './controllers/requests.controller';
import { OrdersController }         from './controllers/orders.controller';
import { PaymentsController }       from './controllers/payments.controller';
import { ShipmentsController }      from './controllers/shipments.controller';
import { ReceiptsController }       from './controllers/receipts.controller';
import { InitController }               from './controllers/init.controller';
import { DashboardController }          from './controllers/dashboard.controller';
import { ShareholderFundsController }   from './controllers/shareholder-funds.controller';

// ── Services ─────────────────────────────────────────────────────────────────
import { ProcurementV2Service } from './procurement-v2.service';
import { ProjectsService }      from './services/projects.service';
import { SuppliersService }     from './services/suppliers.service';
import { RequestsService }      from './services/requests.service';
import { OrdersService }        from './services/orders.service';
import { PaymentsService }      from './services/payments.service';
import { ShipmentsService }     from './services/shipments.service';
import { ReceiptsService }      from './services/receipts.service';
import { InitService }                from './services/init.service';
import { DashboardService }          from './services/dashboard.service';
import { ShareholderFundsService }   from './services/shareholder-funds.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Prc2SupplierEntity,
      Prc2ProjectEntity,
      Prc2PurchaseRequestEntity,
      Prc2RequestItemEntity,
      Prc2PurchaseOrderEntity,
      Prc2OrderItemEntity,
      Prc2ShipmentEntity,
      Prc2ReceiptEntity,
      Prc2ReceiptItemEntity,
      Prc2PaymentEntity,
      Prc2PaymentAllocationEntity,
      Prc2ShareholderFundEntity,
      Prc2ApLedgerEntity,
      Prc2ApprovalEntity,
      SysExchangeRateEntity,
      Prc2InitBatchEntity,
      Prc2InitBatchRowEntity,
    ]),
    WmsModule,   // G84 收货确认→统一经 WmsService.inboundFromReceipt 写库存
  ],
  controllers: [
    ProcurementV2Controller,
    ProjectsController,
    SuppliersController,
    RequestsController,
    OrdersController,
    PaymentsController,
    ShipmentsController,
    ReceiptsController,
    InitController,
    DashboardController,
    ShareholderFundsController,
  ],
  providers: [
    ProcurementV2Service,
    ProjectsService,
    SuppliersService,
    RequestsService,
    OrdersService,
    PaymentsService,
    ShipmentsService,
    ReceiptsService,
    InitService,
    DashboardService,
    ShareholderFundsService,
  ],
  exports: [
    ProcurementV2Service,
    ProjectsService,
    SuppliersService,
    RequestsService,
    OrdersService,
    PaymentsService,
    ShipmentsService,
    ReceiptsService,
    InitService,
    DashboardService,
    ShareholderFundsService,
  ],
})
export class ProcurementV2Module {}
