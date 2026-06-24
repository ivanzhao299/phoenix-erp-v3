import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileMetadataEntity } from './entities/file-metadata.entity';
import { FileAccessService } from './file-access.service';

@Module({
  imports: [TypeOrmModule.forFeature([FileMetadataEntity])],
  providers: [FileAccessService],
  exports: [FileAccessService],
})
export class FileModule {}
