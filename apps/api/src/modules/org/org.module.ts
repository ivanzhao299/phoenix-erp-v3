/**
 * Phoenix ERP V3 — OrgModule
 * RBAC-2 组织范围 + 数据范围 全局模块
 * @Global() 使 DataScopeService / DataScopeHelper / DataScopeGuard 全局可注入
 * 2026-05-25
 */
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SysOrganizationEntity } from './entities/sys-organization.entity';
import { SysUserOrgEntity } from './entities/sys-user-org.entity';
import { SysUserProjectScopeEntity } from './entities/sys-user-project-scope.entity';
import { SysUserWarehouseScopeEntity } from './entities/sys-user-warehouse-scope.entity';
import { SysDataScopeEntity } from './entities/sys-data-scope.entity';

import { DataScopeService } from './services/data-scope.service';
import { OrgService } from './services/org.service';
import { DataScopeHelper } from './helpers/data-scope.helper';
import { DataScopeGuard } from './guards/data-scope.guard';
import { OrgController } from './org.controller';
import { OrganizationController } from './organization.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SysOrganizationEntity,
      SysUserOrgEntity,
      SysUserProjectScopeEntity,
      SysUserWarehouseScopeEntity,
      SysDataScopeEntity,
    ]),
  ],
  controllers: [OrgController, OrganizationController],
  providers: [OrgService, DataScopeService, DataScopeHelper, DataScopeGuard],
  exports: [OrgService, DataScopeService, DataScopeHelper, DataScopeGuard],
})
export class OrgModule {}
