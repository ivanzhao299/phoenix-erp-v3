import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { deriveOrgScope } from './farm.service';
import { readFlockCycle, readFlockCycleCare } from './flock-cycle';
import { FlockActor } from './flock-lifecycle-access';
import { FlockLifecycleService } from './flock-lifecycle.service';
import {
  FlockSearchInput, readFlockActionEligibility, readFlockClosePreview, readFlockDeliveryBlockers,
  searchFlockDocuments, searchFlockOccupancies, searchFlockReports,
} from './flock-lifecycle-queries';

@Controller('api/v3/farm/flock-lifecycle')
@UseGuards(MenuGuard,DataScopeGuard)
@RequireMenu('MENU_FARM_DATA','V')
export class FlockLifecycleController {
  constructor(
    private readonly service: FlockLifecycleService,
    @InjectEntityManager() private readonly db: EntityManager,
  ) {}
  private actor(req: any): FlockActor {
    return {id:String(req.user?.username??req.user?.userId??req.user?.sub??''),accountId:String(req.user?.userId??req.user?.sub??''),permissions:req.user?.permissions,impersonatedBy:req.user?.impersonatedBy,
      admin:req.user?.roles?.includes('ROLE_ADMIN') || req.user?.role==='ROLE_ADMIN' || req.user?.permissions?.includes('*')};
  }
  @Post('provision-actions') async provision(@Req() req: any) { return {code:200,data:await this.service.provisionActions(this.actor(req))}; }
  @Get('houses') async houses(@Req() req: any) { return {code:200,data:await this.service.overview(deriveOrgScope(req))}; }
  @Get('occupancies') async occupancies(@Req() req:any){return {code:200,data:await this.service.occupancies(deriveOrgScope(req))};}
  @Get('occupancies/search')
  async searchOccupancies(@Req() req: any, @Query() filters: FlockSearchInput) {
    return {code:200,data:await searchFlockOccupancies(this.db,deriveOrgScope(req),filters)};
  }
  @Get('occupancies/:id/close-blockers')
  async closeBlockers(@Param('id') id: string,@Query('businessDate') day: string,@Req() req: any) {
    return {code:200,data:await this.service.closeBlockers(id,day,deriveOrgScope(req))};
  }
  @Get('occupancies/:id/close-preview')
  async closePreview(@Param('id') id: string, @Query('businessDate') date: string, @Query('finalProductionStatus') production: string, @Req() req: any) {
    return {code:200,data:await readFlockClosePreview(this.db,deriveOrgScope(req),id,date,production)};
  }
  @Get('reports') async reports(@Req() req:any){return {code:200,data:await this.service.reports(deriveOrgScope(req))};}
  @Get('reports/missing-shifts')
  async missingShifts(@Req() req: any, @Query() input: Record<string, unknown>) {
    return {code:200,data:await this.service.missingFormalShifts(input,deriveOrgScope(req),this.actor(req))};
  }
  @Get('reports/search')
  async searchReports(@Req() req: any, @Query() filters: FlockSearchInput) {
    return {code:200,data:await searchFlockReports(this.db,deriveOrgScope(req),filters)};
  }
  @Get('care') @RequireMenu('MENU_FARM_VET','V') async care(@Req() req: any) { return {code:200,data:await this.service.care(deriveOrgScope(req))}; }
  @Get('attribution') async attribution(@Req() req: any) { return {code:200,data:await this.service.attribution(deriveOrgScope(req))}; }
  @Get('balances') async balances(@Req() req: any) { return {code:200,data:await this.service.balances(deriveOrgScope(req))}; }
  @Get('held') async held(@Req() req: any) { return {code:200,data:await this.service.held(deriveOrgScope(req))}; }
  @Get('held/:id/delivery-blockers')
  async deliveryBlockers(@Param('id') id: string, @Query('businessDate') date: string, @Req() req: any) {
    return {code:200,data:await readFlockDeliveryBlockers(this.db,deriveOrgScope(req),id,date)};
  }
  @Get('flocks/:flockNo/cycle')
  async flockCycle(@Param('flockNo') flockNo: string, @Req() req: any) {
    return {code:200,data:await readFlockCycle(this.db,flockNo,deriveOrgScope(req))};
  }
  @Get('flocks/:flockNo/cycle/care')
  @RequireMenu('MENU_FARM_VET','V')
  async flockCycleCare(@Param('flockNo') flockNo: string, @Req() req: any) {
    return {code:200,data:await readFlockCycleCare(this.db,flockNo,deriveOrgScope(req))};
  }
  @Get('flocks/:flockNo/breed-confirmation')
  async breedConfirmation(@Param('flockNo') flockNo: string,@Req() req: any) {
    return {code:200,data:await this.service.breedConfirmation(flockNo,deriveOrgScope(req))};
  }
  @Post('flocks/:flockNo/breed-confirmation')
  async confirmBreed(@Param('flockNo') flockNo: string,@Body() body: Record<string, unknown>,@Req() req: any) {
    return {code:200,data:await this.service.confirmBreed(flockNo,body,deriveOrgScope(req),this.actor(req))};
  }
  @Get('documents') async list(@Req() req: any) { return {code:200,data:await this.service.list(deriveOrgScope(req))}; }
  @Get('documents/search')
  async searchDocuments(@Req() req: any, @Query() filters: FlockSearchInput) {
    return {code:200,data:await searchFlockDocuments(this.db,deriveOrgScope(req),filters)};
  }
  @Get('inbox')
  async inbox(@Req() req: any, @Query() filters: FlockSearchInput) {
    return {code:200,data:await searchFlockDocuments(this.db,deriveOrgScope(req),filters,this.actor(req))};
  }
  @Get('documents/:id') async detail(@Param('id') id: string,@Req() req: any) {
    const scope=deriveOrgScope(req);
    const doc=await this.service.detail(id,scope);
    return {code:200,data:{...doc,...await readFlockActionEligibility(this.db,id,scope,this.actor(req))}};
  }
  @Get('documents/:id/evidence/:fileId') async evidence(@Param('id') id: string,@Param('fileId') fileId: string,@Req() req: any,@Res({passthrough:true}) response: any) {
    const result=await this.service.evidence(id,fileId,deriveOrgScope(req));
    response.setHeader('Content-Type',result.mimeType);response.setHeader('Content-Disposition',result.disposition);return result.stream;
  }
  @Post('documents') async create(@Body() body: any,@Req() req: any) {
    return {code:201,data:await this.service.create(body,deriveOrgScope(req),this.actor(req))};
  }
  @Post('documents/:id/:action') async action(@Param('id') id: string,@Param('action') action: string,@Body() body: any,@Req() req: any) {
    if (!['submit','approve','post','cancel'].includes(action)) throw new BadRequestException('动作无效');
    return {code:200,data:await this.service.transition(id,action as 'submit'|'approve'|'post'|'cancel',body.version,deriveOrgScope(req),this.actor(req))};
  }
}
