import { Module } from '@nestjs/common';
import { GenericCrudController } from './generic-crud.controller';
import { GenericCrudService } from './generic-crud.service';
import { WmsModule } from '../wms/wms.module';

@Module({
  imports: [WmsModule],
  controllers: [GenericCrudController],
  providers: [GenericCrudService],
})
export class GenericCrudModule {}
