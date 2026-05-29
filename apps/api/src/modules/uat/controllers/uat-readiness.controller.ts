import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { UatReadinessService } from '../services/uat-readiness.service';

@Controller('api/uat/readiness')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class UatReadinessController {
  constructor(private readonly readinessService: UatReadinessService) {}

  /** 获取上线准备度评分（只读，综合评分） */
  @Get()
  @RequireMenu('MENU_UAT', 'V')
  async getReadiness() {
    return this.readinessService.getReadiness();
  }
}
