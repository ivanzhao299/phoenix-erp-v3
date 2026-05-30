import { Controller, Get, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { UatReadinessService } from '../services/uat-readiness.service';

// [Phase R1 — HIGH-3] 替换 AuthGuard('jwt') + MenuGuard → MenuGuard + DataScopeGuard
@Controller('api/uat/readiness')
@UseGuards(MenuGuard, DataScopeGuard)
export class UatReadinessController {
  constructor(private readonly readinessService: UatReadinessService) {}

  /** 获取上线准备度评分（只读，综合评分） */
  @Get()
  @RequireMenu('MENU_UAT', 'V')
  async getReadiness() {
    return this.readinessService.getReadiness();
  }
}
