import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileMetadataEntity } from '../file/entities/file-metadata.entity';
import { UploadController } from './upload.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FileMetadataEntity])],
  controllers: [UploadController],
})
export class UploadModule {}
