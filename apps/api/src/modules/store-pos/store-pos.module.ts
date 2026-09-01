/**
 * Phoenix ERP V3 — Store POS Module
 * Sales V2 Phase 9: 直营店收银作业台
 *
 * Phase D: SalesEngineService 从 order/ 迁入本模块，
 * 供 StoreModule (旧 POS) 消费，同时切断 StoreModule → OrderModule 依赖。
 */
import { Module }               from '@nestjs/common';
import { StorePosController }   from './controllers/store-pos.controller';
import { StorePosService }      from './services/store-pos.service';
import { StorePosShiftService } from './services/store-pos-shift.service';
import { SalesEngineService }   from './services/sales-engine.service';
import { StoreContextResolver, StoreScopePolicy } from './services/store-scope-policy.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreEntity } from './entities/store.entity';
import { StoreAliasEntity } from './entities/store-alias.entity';
import { StoreMembershipEntity } from './entities/store-membership.entity';
import { StoreWarehouseBindingEntity } from './entities/store-warehouse-binding.entity';
import { StoreIdentityGovernanceService } from './services/store-identity-governance.service';
import { WmsModule } from '../wms/wms.module';
import { StoreReplenishmentController } from './controllers/store-replenishment.controller';
import { StoreReplenishmentService } from './services/store-replenishment.service';
import { StoreInventoryQueryService } from './services/store-inventory-query.service';
import { SalesV2Module } from '../sales-v2/sales-v2.module';
import { StoreSettlementController } from './controllers/store-settlement.controller';
import { StoreSettlementService } from './services/store-settlement.service';

@Module({
  imports: [WmsModule, SalesV2Module, TypeOrmModule.forFeature([StoreEntity, StoreAliasEntity, StoreMembershipEntity, StoreWarehouseBindingEntity])],
  controllers: [StorePosController, StoreReplenishmentController, StoreSettlementController],
  providers:   [StorePosService, StorePosShiftService, StoreSettlementService, SalesEngineService, StoreScopePolicy, StoreIdentityGovernanceService, StoreReplenishmentService, StoreInventoryQueryService, { provide: StoreContextResolver, useExisting: StoreScopePolicy }],
  exports:     [StorePosService, StorePosShiftService, SalesEngineService, StoreScopePolicy, StoreContextResolver, StoreIdentityGovernanceService],
})
export class StorePosModule {}
