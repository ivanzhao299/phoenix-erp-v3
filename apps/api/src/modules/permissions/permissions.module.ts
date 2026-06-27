import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysRoleEntity } from './entities/sys-role.entity';
import { SysMenuEntity } from './entities/sys-menu.entity';
import { SysUserRoleEntity } from './entities/sys-user-role.entity';
import { SysRoleMenuPermissionEntity } from './entities/sys-role-menu-permission.entity';
import { SysRoleConflictEntity } from './entities/sys-role-conflict.entity';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SysRoleEntity,
      SysMenuEntity,
      SysUserRoleEntity,
      SysRoleMenuPermissionEntity,
      SysRoleConflictEntity,
    ]),
  ],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
