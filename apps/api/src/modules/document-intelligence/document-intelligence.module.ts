import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileMetadataEntity } from '../file/entities/file-metadata.entity';
import { DocumentIntelligenceController } from './document-intelligence.controller';
import { DocumentIntelligenceService } from './document-intelligence.service';

@Module({
  imports: [TypeOrmModule.forFeature([FileMetadataEntity])],
  controllers: [DocumentIntelligenceController],
  providers: [DocumentIntelligenceService],
})
export class DocumentIntelligenceModule {}
