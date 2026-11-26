import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, HttpException, InternalServerErrorException, Logger, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { EGG_SOURCE_MENU as menu, EggSourcePermission } from '../../../auth/egg-source-permissions';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { deriveOrgScope } from '../../farm/farm.service';
import { EggSourceAccessService } from '../services/egg-source-access.service';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { sourceText } from '../services/egg-source-change-policy';
import { EggHistoryReviewService } from '../services/egg-history-review.service';
import { SourceSkuBlocked } from '../services/sku-availability.service';
import type { ChangeListQuery } from '../services/egg-source-change-read';
import { EggSourceChangeService } from '../services/egg-source-change.service';


@Controller('api/product-master/egg-sources')
@UseGuards(MenuGuard,DataScopeGuard)
@RequireMenu(menu,'V')
export class EggSourceChangeController {
  constructor(private readonly service: EggSourceChangeService, private readonly history: EggHistoryReviewService,
    private readonly access: EggSourceAccessService) {}

  private scope(req: any) {
    if (!req.dataScope) throw new ForbiddenException('当前组织权限未解析');
    return { ...deriveOrgScope(req), allowedWarehouses:req.dataScope.allowedWarehouseCodes };
  }

  private actor(req: any) {
    if (req.user?.impersonatedBy) throw new ForbiddenException('须以本人身份提交或审核');
    return sourceText(String(req.user?.userId ?? ''),'实名账号');
  }

  private async accessScope(req: any, action: EggSourcePermission = 'V', manager?: EntityManager) {
    const access = await this.access.resolve(req.user, action, manager);
    return action === 'V' ? access.scope : { ...access.scope, actionGrants: action === 'E' ? access.edit : access.approve };
  }

  private async reader(req: any) {
    const access = await this.access.resolve(req.user);
    return { scope: access.scope, actor: access.actor, edit: !!access.edit.length, approve: !!access.approve.length,
      editGrants: access.edit, approveGrants: access.approve };
  }

  @Get('workspace')
  async workspace(@Query('houseCode') house:string,@Req() req:any) {
    return { code:200,data:await this.service.workspace(house,await this.reader(req)) };
  }

  @Get('candidates/houses')
  async houses(@Req() req:any) {
    return { code:200,data:await this.service.candidateHouses(await this.accessScope(req)) };
  }

  @Get('candidates/warehouses')
  @RequireMenu(menu,'E')
  async warehouses(@Query('houseCode') house:string,@Req() req:any) {
    return { code:200,data:await this.service.candidateWarehouses(house,await this.accessScope(req,'E')) };
  }

  @Get('candidates/options')
  @RequireMenu(menu,'E')
  async options(@Req() req:any) {
    await this.accessScope(req,'E');
    return { code:200,data:await this.service.candidateOptions() };
  }

  @Get('changes')
  async list(@Query() query:ChangeListQuery,@Req() req:any) {
    return { code:200,data:await this.service.changeList(query,await this.accessScope(req)) };
  }

  @Get('changes/:id')
  async detail(@Param('id') id:string,@Req() req:any) {
    const flock=await this.access.flockScope(req.user);
    return { code:200,data:await this.service.changeDetail(id,{ ...await this.reader(req),flock }) };
  }

  @Get('change-requests/:key')
  async draftReceipt(@Param('key') key:string,@Query('houseCode') house:string,@Req() req:any) {
    return { code:200,data:await this.service.draftReceipt(key,house,await this.accessScope(req),this.actor(req)) };
  }

  @Get('changes/:id/action-requests/:key')
  async actionReceipt(@Param('id') id:string,@Param('key') key:string,@Req() req:any) {
    return { code:200,data:await this.service.actionReceipt(id,key,await this.accessScope(req),this.actor(req)) };
  }

  @Post('precheck')
  @HttpCode(200)
  @RequireMenu(menu,'E')
  async precheck(@Body() body: Parameters<EggSourceChangeService['precheck']>[0],@Req() req: any) {
    const scope = await this.accessScope(req,'E');
    return this.precheckResponse(() => this.service.precheck(body,scope));
  }

  @Post('changes/:id/precheck')
  @HttpCode(200)
  @RequireMenu(menu,'E')
  async precheckDraft(@Param('id') id:string,@Req() req:any) {
    const scope = await this.accessScope(req,'E');
    return this.precheckResponse(() => this.service.precheckDraft(id,scope,this.actor(req)));
  }

  private async precheckResponse(work:()=>Promise<unknown>) {
    try {
      return { code:200,data:await work() };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error('Egg source precheck failed',error instanceof Error ? error.name : undefined,EggSourceChangeController.name);
      throw new InternalServerErrorException('预检暂无法完成，请重试');
    }
  }

  private async safeWrite<T>(work:()=>Promise<T>) {
    try { return await work(); }
    catch (error) {
      if (error instanceof SourceSkuBlocked && error.issues.some(issue => issue.code==='CATALOG_INTEGRITY')) {
        throw new BadRequestException('候选 SKU 与产品壳色映射不一致');
      }
      throw error;
    }
  }

  @Get()
  async timeline(@Query('houseCode') house: string,@Req() req: any) {
    return { code:200,data:await this.service.timeline(house,await this.accessScope(req),await this.access.flockScope(req.user)) };
  }

  @Get('flock-plans')
  @RequireMenu(menu,'E')
  async flockPlans(@Query('houseCode') house:string,@Query('effectiveDate') date:string,@Req() req:any) {
    return {code:200,data:await this.service.planOptions(house,date,await this.accessScope(req,'E'),await this.access.flockScope(req.user))};
  }

  @Post('preview')
  @RequireMenu(menu,'E')
  async preview(@Body() body: Parameters<EggSourceChangeService['preview']>[0],@Req() req: any) {
    const flock = await this.access.flockScope(req.user);
    return { code:200,data:await this.safeWrite(async () => this.service.preview(body,await this.accessScope(req,'E'),flock)) };
  }

  @Post('changes')
  @RequireMenu(menu,'E')
  async create(@Body() body: Parameters<EggSourceChangeService['create']>[0],@Req() req: any) {
    const change=await this.service.create(body,await this.accessScope(req,'E'),this.actor(req),m=>this.accessScope(req,'E',m));
    return { code:201,data:await this.service.safeLegacyChange(change,await this.access.flockScope(req.user)) };
  }

  @Post('changes/:id/actions/:action')
  @RequireMenu(menu,'E')
  async edit(@Param('id') id: string,@Param('action') action: 'submit'|'cancel'|'request-revoke',
    @Body() body: Parameters<EggSourceChangeService['act']>[2],@Req() req: any) {
    if (!['submit','cancel','request-revoke'].includes(action)) throw new BadRequestException('未知制单动作');
    const receipt=await this.safeWrite(async () => this.service.act(id,action,body,await this.accessScope(req,'E'),this.actor(req),undefined,m=>this.accessScope(req,'E',m)));
    return { code:200,data:{ ...receipt,change:await this.service.safeLegacyChange(receipt.change,await this.access.flockScope(req.user)) } };
  }

  @Post('changes/:id/reviews/:action')
  @RequireMenu(menu,'A')
  async review(@Param('id') id: string,@Param('action') action: 'approve'|'reject'|'revoke'|'decline-revoke',
    @Body() body: Parameters<EggSourceChangeService['act']>[2],@Req() req: any) {
    if (!['approve','reject','revoke','decline-revoke'].includes(action)) throw new BadRequestException('未知审核动作');
    const receipt=await this.safeWrite(async () => this.service.act(id,action,body,await this.accessScope(req,'A'),this.actor(req),m=>this.access.flockScope(req.user,m),m=>this.accessScope(req,'A',m)));
    return { code:200,data:{ ...receipt,change:await this.service.safeLegacyChange(receipt.change,await this.access.flockScope(req.user)) } };
  }

  @Post('history/:id/dispositions')
  @RequireMenu('MENU_PROD_INBOUND','A')
  async recordHistoryDisposition(@Param('id') id:string,@Body() body: Parameters<EggHistoryReviewService['recordDisposition']>[1], @Req() req: any) {
    return { code:201,data:await this.history.recordDisposition(id,body,{ scope:this.scope(req),dataScope:req.dataScope,user:req.user },this.actor(req)) };
  }

  @Get('history/reviews')
  @RequireMenu('MENU_PROD_INBOUND','V')
  async historyReviews(@Query() query: Parameters<EggHistoryReviewService['listReviews']>[0], @Req() req: any) {
    return {code:200,data:await this.history.listReviews(query,{scope:this.scope(req),dataScope:req.dataScope,user:req.user})};
  }

  @Get('history/reviews/:id')
  @RequireMenu('MENU_PROD_INBOUND','V')
  async historyReviewDetail(@Param('id') id: string, @Req() req: any) {
    return {code:200,data:await this.history.getReview(id,{scope:this.scope(req),dataScope:req.dataScope,user:req.user})};
  }

  @Get('history/reviews/:id/action-receipt')
  @RequireMenu('MENU_PROD_INBOUND','V')
  async historyActionReceipt(@Param('id') id:string,@Query('kind') kind:string,@Query('ledgerId') ledgerId:string,@Req() req:any) {
    return {code:200,data:await this.history.actionReceipt(id,kind,ledgerId,{scope:this.scope(req),dataScope:req.dataScope,user:req.user})};
  }

  @Get('history/requests/:key')
  @RequireMenu('MENU_PROD_INBOUND','V')
  async historySubmissionReceipt(@Param('key') key: string,@Query('companyCode') company: string,@Req() req: any) {
    return {code:200,data:await this.history.submissionReceipt(key,company,{scope:this.scope(req),dataScope:req.dataScope,user:req.user})};
  }

  @Get('history/options')
  @RequireMenu('MENU_PROD_INBOUND','V')
  async historyOptions(@Query('houseCode') houseCode: string | undefined, @Req() req: any) {
    return { code: 200, data: await this.history.options(houseCode, { scope: this.scope(req), dataScope: req.dataScope }) };
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
