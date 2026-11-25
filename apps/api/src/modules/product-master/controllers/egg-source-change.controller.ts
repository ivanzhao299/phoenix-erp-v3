import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { hasPerm } from '../../../auth/permissions.util';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { deriveOrgScope } from '../../farm/farm.service';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { sourceText } from '../services/egg-source-change-policy';
import { EggHistoryReviewService } from '../services/egg-history-review.service';
import { EggSourceChangeService } from '../services/egg-source-change.service';

const menu = 'MENU_MD_PRODUCT';

@Controller('api/product-master/egg-sources')
@UseGuards(MenuGuard,DataScopeGuard)
@RequireMenu(menu,'V')
export class EggSourceChangeController {
  constructor(private readonly service: EggSourceChangeService, private readonly history: EggHistoryReviewService) {}

  private scope(req: any) {
    if (!req.dataScope) throw new ForbiddenException('当前组织权限未解析');
    return { ...deriveOrgScope(req), allowedWarehouses:req.dataScope.allowedWarehouseCodes };
  }

  private actor(req: any) {
    if (req.user?.impersonatedBy) throw new ForbiddenException('须以本人身份提交或审核');
    return sourceText(String(req.user?.userId ?? ''),'实名账号');
  }

  @Get()
  async timeline(@Query('houseCode') house: string,@Req() req: any) {
    return { code:200,data:await this.service.timeline(house,this.scope(req)) };
  }

  @Get('flock-plans')
  async flockPlans(@Query('houseCode') house:string,@Query('effectiveDate') date:string,@Req() req:any) {
    return {code:200,data:await this.service.planOptions(house,date,this.scope(req))};
  }

  @Post('preview')
  async preview(@Body() body: Parameters<EggSourceChangeService['preview']>[0],@Req() req: any) {
    return { code:200,data:await this.service.preview(body,this.scope(req)) };
  }

  @Post('changes')
  @RequireMenu(menu,'E')
  async create(@Body() body: Parameters<EggSourceChangeService['create']>[0],@Req() req: any) {
    return { code:201,data:await this.service.create(body,this.scope(req),this.actor(req)) };
  }

  @Post('changes/:id/actions/:action')
  @RequireMenu(menu,'E')
  async edit(@Param('id') id: string,@Param('action') action: 'submit'|'cancel'|'request-revoke',
    @Body() body: Parameters<EggSourceChangeService['act']>[2],@Req() req: any) {
    if (!['submit','cancel','request-revoke'].includes(action)) throw new BadRequestException('未知制单动作');
    return { code:200,data:await this.service.act(id,action,body,this.scope(req),this.actor(req)) };
  }

  @Post('changes/:id/reviews/:action')
  @RequireMenu(menu,'A')
  async review(@Param('id') id: string,@Param('action') action: 'approve'|'reject'|'revoke'|'decline-revoke',
    @Body() body: Parameters<EggSourceChangeService['act']>[2],@Req() req: any) {
    if (!['approve','reject','revoke','decline-revoke'].includes(action)) throw new BadRequestException('未知审核动作');
    if (!hasPerm(req.user?.permissions,menu,'A') && !req.user?.roles?.includes('ROLE_ADMIN')) {
      throw new ForbiddenException('缺少商品主数据审核权限');
    }
    return { code:200,data:await this.service.act(id,action,body,this.scope(req),this.actor(req)) };
  }

  @Post('history/:id/dispositions')
  @RequireMenu('MENU_PROD_INBOUND','A')
  async recordHistoryDisposition(@Param('id') id:string,@Body() body: Parameters<EggHistoryReviewService['recordDisposition']>[1], @Req() req: any) {
    return { code:201,data:await this.history.recordDisposition(id,body,{ scope:this.scope(req),dataScope:req.dataScope,user:req.user },this.actor(req)) };
  }

  @Get('history')
  @RequireMenu('MENU_PROD_INBOUND','V')
  async historyEvidence(@Query() query: Parameters<EggHistoryReviewService['read']>[0], @Req() req: any) {
    return { code:200,data:await this.history.read(query,{ scope:this.scope(req),dataScope:req.dataScope,user:req.user }) };
  }

  @Get('history/:id/evidence/:fileId')
  @RequireMenu('MENU_PROD_INBOUND','V')
  async previewHistory(@Param('id') id:string,@Param('fileId') fileId:string,@Req() req:any,@Res({passthrough:true}) response:any) {
    const file=await this.history.preview(id,fileId,{scope:this.scope(req),dataScope:req.dataScope});
    response.setHeader('Content-Type',file.mimeType);
    response.setHeader('Content-Disposition',file.disposition);
    return file.stream;
  }

  @Post('history')
  @RequireMenu('MENU_PROD_INBOUND','E')
  async historySubmit(@Body() body: Parameters<EggHistoryReviewService['submit']>[0], @Req() req: any) {
    return { code:201,data:await this.history.submit(body,{ scope:this.scope(req),dataScope:req.dataScope,user:req.user },this.actor(req)) };
  }

  @Post('history/:id/review')
  @RequireMenu('MENU_PROD_INBOUND','A')
  async historyReview(@Param('id') id:string,@Body() body: Parameters<EggHistoryReviewService['review']>[1], @Req() req: any) {
    return { code:200,data:await this.history.review(id,body,{ scope:this.scope(req),dataScope:req.dataScope,user:req.user },this.actor(req)) };
  }

}
