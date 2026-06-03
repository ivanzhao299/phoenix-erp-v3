import { Module } from '@nestjs/common';
import { MasterDataCenterController } from './master-data-center.controller';
import { MasterDataRuntimeController } from './master-data-runtime.controller';
import { CodeGeneratorService } from './code-generator.service';
import { MasterDataAuditService } from './master-data-audit.service';
import { MasterDataRuntimeService } from './master-data-runtime.service';

/**
 * MasterDataCenterModule — 主数据中心 + 核心主数据 Runtime（G1 + G3-A）
 * 提供：统一编码生成、主数据审计日志、数据质量检查、客户/供应商/项目/现金账户 Runtime。
 */
@Module({
  controllers: [MasterDataCenterController, MasterDataRuntimeController],
  providers: [CodeGeneratorService, MasterDataAuditService, MasterDataRuntimeService],
  exports: [CodeGeneratorService, MasterDataAuditService, MasterDataRuntimeService],
})
export class MasterDataCenterModule {}
