import {
  Controller, Get, Post, Patch,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../../modules/org/guards/data-scope.guard';

import { ProjectsService } from '../services/projects.service';
import { CreateProjectDto } from '../dto/create-project.dto';
import { UpdateProjectDto } from '../dto/update-project.dto';
import { QueryProjectDto } from '../dto/query-project.dto';
import { UpdateProjectStatusDto } from '../dto/update-project-status.dto';

const MENU_PROJECT = 'MENU_PRC2_PROJECT';
const LEGACY_MASTER_MENU = ['MENU_PRC2_MASTER'];

@Controller('api/v2/procurement/projects')
@UseGuards(MenuGuard, DataScopeGuard)
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  /** GET /api/v2/procurement/projects  — 分页列表 */
  @Get()
  @RequireMenu(MENU_PROJECT, 'V', LEGACY_MASTER_MENU)
  list(@Query() query: QueryProjectDto) {
    return this.svc.list(query);
  }

  /** GET /api/v2/procurement/projects/:id  — 详情 */
  @Get(':id')
  @RequireMenu(MENU_PROJECT, 'V', LEGACY_MASTER_MENU)
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  /** POST /api/v2/procurement/projects  — 新建 */
  @Post()
  @RequireMenu(MENU_PROJECT, 'C', LEGACY_MASTER_MENU)
  create(@Body() dto: CreateProjectDto) {
    return this.svc.create(dto);
  }

  /** PATCH /api/v2/procurement/projects/:id  — 更新 */
  @Patch(':id')
  @RequireMenu(MENU_PROJECT, 'E', LEGACY_MASTER_MENU)
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.svc.update(id, dto);
  }

  /** PATCH /api/v2/procurement/projects/:id/status  — 状态切换 */
  @Patch(':id/status')
  @RequireMenu(MENU_PROJECT, 'E', LEGACY_MASTER_MENU)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateProjectStatusDto) {
    return this.svc.updateStatus(id, dto);
  }
}
