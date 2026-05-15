import { Module } from '@nestjs/common';
import { GenericCrudController } from './generic-crud.controller';
import { GenericCrudService } from './generic-crud.service';

@Module({
  controllers: [GenericCrudController],
  providers: [GenericCrudService],
})
export class GenericCrudModule {}
