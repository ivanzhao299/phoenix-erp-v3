import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, HttpException, InternalServerErrorException, Logger, Optional, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { hasPerm } from '../../../auth/permissions.util';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { deriveOrgScope } from '../../farm/farm.service';
import { DataScopeService } from '../../org/services/data-scope.service';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { sourceText } from '../services/egg-source-change-policy';
import { EggHistoryReviewService } from '../services/egg-history-review.service';
import { SourceSkuBlocked } from '../services/sku-availability.service';
import type { ChangeListQuery } from '../services/egg-source-change-read';
import { EggSourceChangeService } from '../services/egg-source-change.service';

const menu = 'MENU_MD_PRODUCT';

@Controller('api/product-master/egg-sources')
@UseGuards(MenuGuard,DataScopeGuard)
@RequireMenu(menu,'V')
export class EggSourceChangeController {
  constructor(private readonly service: EggSourceChangeService, private readonly history: EggHistoryReviewService,
    @Optional() private readonly dataScopes?: DataScopeService) {}

  private scope(req: any) {
    if (!req.dataScope) throw new ForbiddenException('当前组织权限未解析');
    return { ...deriveOrgScope(req), allowedWarehouses:req.dataScope.allowedWarehouseCodes };
  }

  private actor(req: any) {
    if (req.user?.impersonatedBy) throw new ForbiddenException('须以本人身份提交或审核');
    return sourceText(String(req.user?.userId ?? ''),'实名账号');
  }

  private permitted(req: any, permission: 'V'|'E'|'A', targetMenu = menu) {
    return hasPerm(req.user?.permissions,targetMenu,permission) ||
      req.user?.roles?.includes('ROLE_ADMIN') || req.user?.role==='ROLE_ADMIN';
  }

  private async relatedScope(req: any, targetMenu: string) {
    if (!this.dataScopes || !this.permitted(req,'V',targetMenu)) return undefined;
    const user = req.user;
    const roles = user.roles ?? (user.role ? [user.role] : []);
    const version = Number(user.perms_version);
    try {
      const dataScope = await this.dataScopes.resolve(String(user.userId??user.id??''),roles,targetMenu,
        Number.isFinite(version) ? version : undefined);
      return this.scope({ user,dataScope });
    } catch (error) {
      Logger.warn(`Linked document scope unavailable: ${targetMenu} (${error instanceof Error ? error.name : 'unknown'})`,
        EggSourceChangeController.name);
      return undefined;
    }
  }

  private reader(req: any) {
    const actor = req.user?.impersonatedBy ? null : String(req.user?.userId??'') || null;
    return { scope:this.scope(req),actor,edit:!!actor && !!this.permitted(req,'E'),approve:!!actor && !!this.permitted(req,'A') };
  }

  @Get('workspace')
  async workspace(@Query('houseCode') house:string,@Req() req:any) {
    return { code:200,data:await this.service.workspace(house,this.reader(req)) };
  }

  @Get('candidates/houses')
  async houses(@Req() req:any) {
    return { code:200,data:await this.service.candidateHouses(this.scope(req)) };
  }

  @Get('candidates/warehouses')
  async warehouses(@Query('houseCode') house:string,@Req() req:any) {
    return { code:200,data:await this.service.candidateWarehouses(house,this.scope(req)) };
  }

  @Get('candidates/options')
  async options() {
    return { code:200,data:await this.service.candidateOptions() };
  }

  @Get('changes')
  async list(@Query() query:ChangeListQuery,@Req() req:any) {
    return { code:200,data:await this.service.changeList(query,this.scope(req)) };
  }

  @Get('changes/:id')
  async detail(@Param('id') id:string,@Req() req:any) {
    const flock=await this.relatedScope(req,'MENU_FARM_DATA');
    return { code:200,data:await this.service.changeDetail(id,{ ...this.reader(req),flock }) };
  }

  @Get('change-requests/:key')
  async draftReceipt(@Param('key') key:string,@Query('houseCode') house:string,@Req() req:any) {
    return { code:200,data:await this.service.draftReceipt(key,house,this.scope(req),this.actor(req)) };
  }

  @Get('changes/:id/action-requests/:key')
  async actionReceipt(@Param('id') id:string,@Param('key') key:string,@Req() req:any) {
    return { code:200,data:await this.service.actionReceipt(id,key,this.scope(req),this.actor(req)) };
  }

  @Post('precheck')
  @HttpCode(200)
  @RequireMenu(menu,'E')
  async precheck(@Body() body: Parameters<EggSourceChangeService['precheck']>[0],@Req() req: any) {
    this.precheckActor(req);
    return this.precheckResponse(() => this.service.precheck(body,this.scope(req)));
  }

  @Post('changes/:id/precheck')
  @HttpCode(200)
  @RequireMenu(menu,'E')
  async precheckDraft(@Param('id') id:string,@Req() req:any) {
    const actor = this.precheckActor(req);
    return this.precheckResponse(() => this.service.precheckDraft(id,this.scope(req),actor));
  }

  private precheckActor(req:any) {
    if (!this.permitted(req,'V')) throw new ForbiddenException('缺少商品主数据查看权限');
    return this.actor(req);
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
    return { code:200,data:await this.service.timeline(house,this.scope(req),await this.relatedScope(req,'MENU_FARM_DATA')) };
  }

  @Get('flock-plans')
  async flockPlans(@Query('houseCode') house:string,@Query('effectiveDate') date:string,@Req() req:any) {
    return {code:200,data:await this.service.planOptions(house,date,this.scope(req),await this.relatedScope(req,'MENU_FARM_DATA'))};
  }

  @Post('preview')
  async preview(@Body() body: Parameters<EggSourceChangeService['preview']>[0],@Req() req: any) {
    const flock = await this.relatedScope(req,'MENU_FARM_DATA');
    return { code:200,data:await this.safeWrite(() => this.service.preview(body,this.scope(req),flock)) };
  }

  @Post('changes')
  @RequireMenu(menu,'E')
  async create(@Body() body: Parameters<EggSourceChangeService['create']>[0],@Req() req: any) {
    const flock = await this.relatedScope(req,'MENU_FARM_DATA');
    const change=await this.service.create(body,this.scope(req),this.actor(req));
    return { code:201,data:await this.service.safeLegacyChange(change,flock) };
  }

  @Post('changes/:id/actions/:action')
  @RequireMenu(menu,'E')
  async edit(@Param('id') id: string,@Param('action') action: 'submit'|'cancel'|'request-revoke',
    @Body() body: Parameters<EggSourceChangeService['act']>[2],@Req() req: any) {
    if (!['submit','cancel','request-revoke'].includes(action)) throw new BadRequestException('未知制单动作');
    const flock = await this.relatedScope(req,'MENU_FARM_DATA');
    const receipt=await this.safeWrite(() => this.service.act(id,action,body,this.scope(req),this.actor(req)));
    return { code:200,data:{ ...receipt,change:await this.service.safeLegacyChange(receipt.change,flock) } };
  }

  @Post('changes/:id/reviews/:action')
  @RequireMenu(menu,'A')
  async review(@Param('id') id: string,@Param('action') action: 'approve'|'reject'|'revoke'|'decline-revoke',
    @Body() body: Parameters<EggSourceChangeService['act']>[2],@Req() req: any) {
    if (!['approve','reject','revoke','decline-revoke'].includes(action)) throw new BadRequestException('未知审核动作');
    if (!this.permitted(req,'A')) {
      throw new ForbiddenException('缺少商品主数据审核权限');
    }
    const flock = await this.relatedScope(req,'MENU_FARM_DATA');
    const receipt=await this.safeWrite(() => this.service.act(id,action,body,this.scope(req),this.actor(req)));
    return { code:200,data:{ ...receipt,change:await this.service.safeLegacyChange(receipt.change,flock) } };
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
