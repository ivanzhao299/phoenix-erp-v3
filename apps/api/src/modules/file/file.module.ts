import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileMetadataEntity } from './entities/file-metadata.entity';
import { FileAccessService } from './file-access.service';
import { SysOperationLogEntity } from '../../common/entities/sys-operation-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FileMetadataEntity, SysOperationLogEntity])],
  providers: [FileAccessService],
  exports: [FileAccessService],
})
export class FileModule {}
