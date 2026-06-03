import { Module } from '@nestjs/common';
import { MasterDataCenterController } from './master-data-center.controller';
import { MasterDataRuntimeController } from './master-data-runtime.controller';
import { CodeGeneratorService } from './code-generator.service';
import { MasterDataAuditService } from './master-data-audit.service';
import { MasterDataRuntimeService } from './master-data-runtime.service';
import { ApprovalEngineModule } from '../approval-engine/approval-engine.module';

/**
 * MasterDataCenterModule — 主数据中心 + 核心主数据 Runtime + 审批接入（G1 + G3-A + G3-B）
 * 提供：统一编码生成、主数据审计日志、数据质量检查、客户/供应商/项目/现金账户 Runtime + Workflow 审批。
 */
@Module({
  imports: [ApprovalEngineModule],   // G3-B：主数据新增审批接入 ApprovalEngine
  controllers: [MasterDataCenterController, MasterDataRuntimeController],
  providers: [CodeGeneratorService, MasterDataAuditService, MasterDataRuntimeService],
  exports: [CodeGeneratorService, MasterDataAuditService, MasterDataRuntimeService],
})
export class MasterDataCenterModule {}
