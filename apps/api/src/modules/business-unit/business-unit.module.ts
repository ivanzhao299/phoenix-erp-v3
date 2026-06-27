import { Module } from '@nestjs/common';
import { BusinessUnitController } from './business-unit.controller';
import { BusinessUnitService } from './business-unit.service';

/** G110/S5 事业群（业务维度）模块 */
@Module({
  controllers: [BusinessUnitController],
  providers: [BusinessUnitService],
  exports: [BusinessUnitService],
})
export class BusinessUnitModule {}
