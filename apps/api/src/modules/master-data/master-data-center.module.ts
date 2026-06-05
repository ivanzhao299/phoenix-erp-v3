import { Module } from '@nestjs/common';
import { MasterDataCenterController } from './master-data-center.controller';
import { MasterDataRuntimeController } from './master-data-runtime.controller';
import { CodeGeneratorService } from './code-generator.service';
import { MasterDataAuditService } from './master-data-audit.service';
import { MasterDataRuntimeService } from './master-data-runtime.service';
import { MasterDataReferencesService } from './master-data-references.service'; // G5.5-C
import { DictGovernanceService } from './dict-governance.service';              // G5.5-D
import { MasterDataGovernanceService } from './governance.service';             // G5.5-D
import { MasterDataOperationsService } from './operations.service';             // G5.5-E
import { BizProjectsController } from './biz-projects.controller';              // MDM-1
import { ApprovalEngineModule } from '../approval-engine/approval-engine.module';

/**
 * MasterDataCenterModule
 *   G1   编码生成 + 审计日志
 *   G3-A 核心主数据 Runtime（16 类）
 *   G3-B 主数据 Workflow 审批
 *   G5.5-C 引用关系中心
 *   G5.5-D 字典治理 + 治理驾驶舱
 *   G5.5-E 运营平台（聚合统计 / 全局搜索 / 趋势）
 */
@Module({
  imports: [ApprovalEngineModule],
  controllers: [MasterDataCenterController, MasterDataRuntimeController, BizProjectsController],
  providers: [
    CodeGeneratorService, MasterDataAuditService, MasterDataRuntimeService,
    MasterDataReferencesService,
    DictGovernanceService, MasterDataGovernanceService,
    MasterDataOperationsService,
  ],
  exports: [
    CodeGeneratorService, MasterDataAuditService, MasterDataRuntimeService,
    MasterDataReferencesService,
    DictGovernanceService, MasterDataGovernanceService,
    MasterDataOperationsService,
  ],
})
export class MasterDataCenterModule {}
