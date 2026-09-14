import { PackagingHandoverService, uuid } from './packaging-handover.service';
import { BadRequestException, NotFoundException, Body, Controller, Get, Header, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { PackagingHistoryService } from './packaging-history.service';

@Controller('api/packaging/terminal')
@UseGuards(AuthGuard('jwt'),MenuGuard)
@RequireMenu('MENU_PKG_OP','V',['MENU_PKG_MGR'])
export class PackagingHistoryController {
  constructor(readonly history: PackagingHistoryService, readonly workflow: PackagingHandoverService) {}
  @Get('history') @Header('Cache-Control','private,no-store')
  async list(@Query() q: Record<string,string>,@Req() req:any){return {code:200,data:await this.history.list(q,req)};}
  @Get('history/:packingCode') @Header('Cache-Control','private,no-store')
  async detail(@Param('packingCode') code:string,@Req() req:any){return {code:200,data:await this.workflow.detail(code,req)};}

  @Post('history/:packingCode/box-registration') @RequireMenu('MENU_PKG_OP','E')
  register(@Param('packingCode') code:string,@Headers('idempotency-key') key:string,@Body() body:any,@Req() req:any){return this.run('REGISTER',code,key,body,req);}
  @Post('history/:packingCode/verification-sessions') @RequireMenu('MENU_PKG_OP','E')
  session(@Param('packingCode') code:string,@Headers('idempotency-key') key:string,@Body() body:any,@Req() req:any){return this.run('SESSION',code,key,body,req);}
  @Post('history/:packingCode/box-verifications') @RequireMenu('MENU_PKG_OP','E')
  scan(@Param('packingCode') code:string,@Headers('idempotency-key') key:string,@Body() body:any,@Req() req:any){return this.run('SCAN',code,key,body,req);}
  @Post('history/:packingCode/labels/:labelCode/void') @RequireMenu('MENU_PKG_OP','E')
  voidLabel(@Param('packingCode') code:string,@Param('labelCode') labelCode:string,@Headers('idempotency-key') key:string,@Body() body:any,@Req() req:any){return this.run('VOID',code,key,{...body,labelCode},req);}
  @Post('labels/print-requests') @RequireMenu('MENU_PKG_OP','E')
  print(@Headers('idempotency-key') key:string,@Body() body:any,@Req() req:any){return this.run('PRINT',body.packingCode,key,body,req);}
  @Post('labels/print-requests/:id/events') @RequireMenu('MENU_PKG_OP','E')
  result(@Param('id') id:string,@Headers('idempotency-key') key:string,@Body() body:any,@Req() req:any){return this.run('PRINT_RESULT',body.packingCode,key,{...body,requestId:id},req);}
  @Get('history/:packingCode/candidates') @Header('Cache-Control','private,no-store')
  async candidates(@Param('packingCode') code:string,@Query() q:any,@Req() req:any){
    const d=await this.history.detail(code,req),scope=await this.history.scope(req);
    const scopes=((scope as any).alternatives||[scope]).filter((s:any)=>s.isGlobal||(s.allowedCompanyCodes.includes(d.ownership.companyCode)&&s.allowedFarmCodes.includes(d.ownership.siteCode)));
    const warehouses=await this.history.em.query(`SELECT warehouse_code code,warehouse_name label FROM wms_warehouses
      WHERE company_code=$1 AND status='ACTIVE' AND ($2 OR warehouse_code=ANY($3::text[])) ORDER BY warehouse_code`,
      [d.ownership.companyCode,scopes.some((s:any)=>s.isGlobal),[...new Set(scopes.flatMap((s:any)=>s.allowedWarehouseCodes))]]);
    if(q.kind==='WAREHOUSE')return {code:200,data:warehouses};
    if(!warehouses.some((w:any)=>w.code===q.warehouseCode))return {code:200,data:[]};
    if(q.kind==='LOCATION')return {code:200,data:await this.history.em.query(`SELECT location_code code,location_name label FROM wms_locations
      WHERE warehouse_code=$1 AND status IN ('NORMAL','EMPTY','OCCUPIED') ORDER BY location_code`,[q.warehouseCode])};
    if(q.kind==='RECEIVER'){
      const users=await this.history.em.query('SELECT user_id::text code,real_name label FROM sys_user WHERE status=1 ORDER BY user_id');
      const eligible=[];
      for(const u of users){const roles=await this.history.em.query(`SELECT r.role_code FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id WHERE ur.user_id=$1 AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE'`,[u.code]);const s=await this.history.scopes.resolve(u.code,roles.map((r:any)=>r.role_code),'MENU_PKG_OP');
        if(s.isGlobal||(s.allowedCompanyCodes.includes(d.ownership.companyCode)&&s.allowedWarehouseCodes.includes(q.warehouseCode)))eligible.push(u);}
      return {code:200,data:eligible};
    }
    return {code:200,data:[]};
  }
  @Get('boxes/resolve') @Header('Cache-Control','private,no-store')
  async resolve(@Query() q:any,@Req() req:any){const d=await this.history.detail(q.packingCode,req);return {code:200,data:await this.workflow.boxes.resolve(this.history.em,d.record.id,q.labelCode)};}
  @Get('operations/:key') @Header('Cache-Control','private,no-store')
  async operation(@Param('key') key:string,@Query() q:any,@Req() req:any){
    uuid(key);if(!['REGISTER','SESSION','SCAN','PRINT','PRINT_RESULT','CONFIRM','VOID'].includes(q.action))throw new BadRequestException('INVALID_FILTER');
    const d=await this.history.detail(q.packingCode,req);
    const rows=await this.history.em.query(`SELECT o.state,e.id "eventId",e.payload result FROM pkg_packing_operations o
      LEFT JOIN pkg_packing_events e ON e.id=o.result_event_id WHERE o.idempotency_key=$1 AND o.actor_id=$2 AND o.packing_id=$3 AND o.action=$4`,
      [key,String(req.user.userId??req.user.id??req.user.user_id),d.record.id,q.action]);
    return {code:200,data:rows[0]||{state:'NOT_FOUND'}};
  }
  @Get('labels/print-requests/:id') @Header('Cache-Control','private,no-store')
  async printRequest(@Param('id') id:string,@Req() req:any){
    uuid(id);const [request]=await this.history.em.query(`SELECT p.code FROM pkg_packing_events e JOIN pkg_packing_records p ON p.id=e.packing_id WHERE e.id=$1 AND e.event_type='PRINT_REQUEST'`,[id]);
    if(!request)throw new NotFoundException('RECORD_NOT_ACCESSIBLE');const d=await this.workflow.detail(request.code,req);
    return {code:200,data:d.events.filter((e:any)=>e.id===id||e.payload.requestId===id)};
  }
  @Get('history/:packingCode/:section') @Header('Cache-Control','private,no-store')
  async section(@Param('packingCode') code:string,@Param('section') section:string,@Query() q:any,@Req() req:any){
    if(!['outputs','sources','boxes','evidence'].includes(section))throw new NotFoundException('RECORD_NOT_ACCESSIBLE');
    const d=await this.workflow.detail(code,req);return {code:200,data:this.history.section(d,section,q)};
  }
  @Get('reports/production-summary') @Header('Cache-Control','private,no-store')
  async summary(@Query() q:any,@Req() req:any){return {code:200,data:await this.history.summary(q,req)};}
  private async run(action:string,code:string,key:string,body:any,req:any){return {code:200,data:await this.workflow.command(action,code,key,body,req)};}
}
