import { Module } from '@nestjs/common';
import { MasterDataCenterController } from './master-data-center.controller';
import { MasterDataRuntimeController } from './master-data-runtime.controller';
import { CodeGeneratorService } from './code-generator.service';
import { MasterDataAuditService } from './master-data-audit.service';
import { MasterDataRuntimeService } from './master-data-runtime.service';
import { MasterDataReferencesService } from './master-data-references.service'; // G5.5-C
import { DictGovernanceService } from './dict-governance.service';              // G5.5-D
import { MasterDataGovernanceService } from './governance.service';             // G5.5-D
import { ApprovalEngineModule } from '../approval-engine/approval-engine.module';

/**
 * MasterDataCenterModule — 主数据中心 + 核心主数据 Runtime + 审批接入（G1 + G3-A + G3-B）
 * G5.5-C 扩展：引用关系中心
 * G5.5-D 扩展：字典治理 + 治理驾驶舱
 */
@Module({
  imports: [ApprovalEngineModule],
  controllers: [MasterDataCenterController, MasterDataRuntimeController],
  providers: [
    CodeGeneratorService, MasterDataAuditService, MasterDataRuntimeService,
    MasterDataReferencesService,
    DictGovernanceService, MasterDataGovernanceService,
  ],
  exports: [
    CodeGeneratorService, MasterDataAuditService, MasterDataRuntimeService,
    MasterDataReferencesService,
    DictGovernanceService, MasterDataGovernanceService,
  ],
})
export class MasterDataCenterModule {}
