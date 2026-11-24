import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { deriveOrgScope } from './farm.service';
import { flockBusinessDate } from './flock-lifecycle.service';
import { EggWithdrawalReviewService } from './egg-withdrawal-review.service';

function actor(req: any) {
  return { id: String(req.user?.username ?? ''), accountId: String(req.user?.userId ?? req.user?.sub ?? ''),
    impersonatedBy: req.user?.impersonatedBy };
}

@Controller('api/v3/farm/egg-withdrawal')
@UseGuards(MenuGuard,DataScopeGuard)
export class EggWithdrawalReviewController {
  constructor(private readonly service: EggWithdrawalReviewService) {}

  @Get('vet') @RequireMenu('MENU_FARM_VET','V')
  async vet(@Query('day') day: string,@Req() req: any) {
    return {code:200,data:await this.service.list(deriveOrgScope(req),flockBusinessDate(day),false)};
  }

  @Get('quality') @RequireMenu('MENU_QA_OP','V')
  async quality(@Query('day') day: string,@Req() req: any) {
    return {code:200,data:await this.service.list(deriveOrgScope(req),flockBusinessDate(day),true)};
  }

  @Post('reviews') @RequireMenu('MENU_FARM_VET','E')
  async request(@Body() body: {medicationId:number;dailyLogId:string;reason:string;requestId:string;priorReviewId?:string},@Req() req: any) {
    return {code:201,data:await this.service.requestReview(deriveOrgScope(req),actor(req),body.medicationId,body.dailyLogId,body.reason,body.requestId,body.priorReviewId)};
  }

  @Post('reviews/:id/decision') @RequireMenu('MENU_QA_OP','E')
  async decide(@Param('id',ParseUUIDPipe) id: string,@Body() body: {outcome:string;evidence:string},@Req() req: any) {
    return {code:200,data:await this.service.decide(deriveOrgScope(req),actor(req),id,body.outcome,body.evidence)};
  }
}
