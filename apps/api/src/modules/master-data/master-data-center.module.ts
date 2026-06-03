import { Module } from '@nestjs/common';
import { MasterDataCenterController } from './master-data-center.controller';
import { CodeGeneratorService } from './code-generator.service';
import { MasterDataAuditService } from './master-data-audit.service';

/**
 * MasterDataCenterModule — 主数据中心（G1）
 * 提供：统一编码生成、主数据审计日志、数据质量检查。
 * 供其他主数据维护模块复用 CodeGeneratorService / MasterDataAuditService。
 */
@Module({
  controllers: [MasterDataCenterController],
  providers: [CodeGeneratorService, MasterDataAuditService],
  exports: [CodeGeneratorService, MasterDataAuditService],
})
export class MasterDataCenterModule {}
