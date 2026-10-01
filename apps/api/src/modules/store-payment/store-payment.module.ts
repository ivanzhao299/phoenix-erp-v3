import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysOperationLogEntity } from '../../common/entities/sys-operation-log.entity';
import { FileModule } from '../file/file.module';
import { StorePaymentAccountEntity } from './entities/store-payment-account.entity';
import { StorePaymentRecordEntity } from './entities/store-payment-record.entity';
import { FileMetadataEntity } from '../file/entities/file-metadata.entity';
import { StorePaymentController } from './store-payment.controller';
import { StorePaymentService } from './store-payment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StorePaymentAccountEntity,
      StorePaymentRecordEntity,
      SysOperationLogEntity,
      FileMetadataEntity,
    ]),
    FileModule,
  ],
  controllers: [StorePaymentController],
  providers: [StorePaymentService],
  exports: [StorePaymentService],
})
export class StorePaymentModule {}
