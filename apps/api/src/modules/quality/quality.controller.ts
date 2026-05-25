import { Controller, Get, Post, Body, Param, Query, Req, BadRequestException, UseGuards } from '@nestjs/common';
import { QualityService } from './quality.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';

/**
 * V2 fidelity QualityController — 来源 _archive/phoenix-backend-v2-sqlite/src/routes/qualityTrace.js
 * 路由前缀 /api/quality
 */
@Controller('api/quality')
@UseGuards(MenuGuard)
export class QualityController {
  constructor(private readonly qaService: QualityService) {}

  /** 正向追溯（扫码用） */
  @Get('trace/forward')
  @RequireMenu('MENU_QA', 'V')
  async traceForward(@Query('batch_no') batchNo: string) {
    if (!batchNo) throw new BadRequestException('batch_no required');
    return await this.qaService.traceForward(batchNo);
  }

  /** 逆向追溯 + 召回评估 */
  @Get('trace/backward')
  @RequireMenu('MENU_QA', 'V')
  async traceBackward(
    @Query('sale_no') saleNo?: string,
    @Query('batch_no') batchNo?: string,
    @Query('keyword') keyword?: string,
  ) {
    return await this.qaService.traceBackward({ sale_no: saleNo, batch_no: batchNo, keyword });
  }

  @Get('inspections')
  @RequireMenu('MENU_QA', 'V')
  async listInspections(@Query() query: any) {
    return await this.qaService.listInspections(query);
  }

  @Post('inspections')
  @RequireMenu('MENU_QA', 'C')
  async createInspection(@Body() body: any, @Req() req: any) {
    return await this.qaService.createInspection(body, req.user);
  }

  @Get('inspections/:inspect_no')
  @RequireMenu('MENU_QA', 'V')
  async getInspection(@Param('inspect_no') inspectNo: string) {
    return await this.qaService.getInspection(inspectNo);
  }

  @Get('non-conformances')
  @RequireMenu('MENU_QA', 'V')
  async listNCs(@Query() query: any) {
    return await this.qaService.listNonConformances(query);
  }

  @Post('non-conformances')
  @RequireMenu('MENU_QA', 'C')
  async createNC(@Body() body: any, @Req() req: any) {
    return await this.qaService.createNonConformance(body, req.user);
  }

  @Get('standards')
  @RequireMenu('MENU_QA', 'V')
  async listStandards() {
    return await this.qaService.listStandards();
  }
}
