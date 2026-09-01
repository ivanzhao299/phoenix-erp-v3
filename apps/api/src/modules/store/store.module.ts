import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetiredPosController, StoreController } from './store.controller';
import { StoreService } from './store.service';
import { StoreDailyCloseEntity } from './entities/store-daily-close.entity';
import { StorePosModule } from '../store-pos/store-pos.module';

// R4.1（删除旧 POS 旁路）：移除 PosController(@Controller('api/v3/pos')) + PosService。
//   旧 POS createSale 直接 UPDATE inv_batches(SALE_OUT，无 FIFO、无 legacy_source 过滤)，前端零调用，属 C 类 Legacy。
//   POS 唯一活跃入口 = StorePosModule(api/v2/store-sales，fifoDeductItems)。
//   pos.controller.ts / pos.service.ts 文件保留但已从模块注销 → api/v3/pos 不再可访问；createSale 另加冻结防御。
@Module({
  imports: [TypeOrmModule.forFeature([StoreDailyCloseEntity]), StorePosModule],
  controllers: [StoreController, RetiredPosController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
