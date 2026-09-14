import { PackagingHandoverService, uuid } from './packaging-handover.service';
import { BadRequestException, ConflictException, NotFoundException, Body, Controller, Get, Header, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
  print(@Headers('idempotency-key') key:string,@Body() body:any,@Req() req:any){return this.run('PRINT',body?.packingCode,key,body,req);}
  @Post('labels/print-requests/:id/events') @RequireMenu('MENU_PKG_OP','E')
  result(@Param('id') id:string,@Headers('idempotency-key') key:string,@Body() body:any,@Req() req:any){return this.run('PRINT_RESULT',body?.packingCode,key,{...body,requestId:id},req);}
  @Get('history/:packingCode/candidates') @Header('Cache-Control','private,no-store')
  async candidates(@Param('packingCode') code:string,@Query() q:any,@Req() req:any){
    const d=await this.history.detail(code,req),scope=await this.history.scope(req);
    const scopes=((scope as any).alternatives||[scope]).filter((s:any)=>s.isGlobal||(s.allowedCompanyCodes.includes(d.ownership.companyCode)&&s.allowedFarmCodes.includes(d.ownership.siteCode)));
    const limit=Number(q.limit||50),search=String(q.search||'');
    if(![25,50,100].includes(limit)||search.length>100||!['WAREHOUSE','LOCATION','RECEIVER'].includes(q.kind)||String(q.after||'').length>100)throw new BadRequestException('INVALID_FILTER');
    const pack=(items:any[],nextCursor:string|null=null)=>({code:200,data:q.paged==='1'?{items,nextCursor}:items});
    const page=(rows:any[])=>{const items=rows.slice(0,limit);return pack(items,rows.length>limit?items.at(-1)?.code:null);};
    const whAllowed=(alias:string)=>`(${alias}.company_code=$1 AND ${alias}.status='ACTIVE' AND ($2 OR ${alias}.warehouse_code=ANY($3::text[])))`;
    const owner=[d.ownership.companyCode,scopes.some((s:any)=>s.isGlobal),[...new Set(scopes.flatMap((s:any)=>s.allowedWarehouseCodes))]];
    if(q.kind==='WAREHOUSE')return page(await this.history.em.query(`SELECT w.warehouse_code code,w.warehouse_name label FROM wms_warehouses w WHERE ${whAllowed('w')}
      AND w.warehouse_code>$4 AND (strpos(lower(w.warehouse_code||' '||COALESCE(w.warehouse_name,'')),lower($5))>0) ORDER BY w.warehouse_code LIMIT $6`,[...owner,q.after||'',search,limit+1]));
    const [warehouse]=await this.history.em.query(`SELECT w.warehouse_code FROM wms_warehouses w WHERE ${whAllowed('w')} AND w.warehouse_code=$4`,[...owner,q.warehouseCode]);
    if(!warehouse)return pack([]);
    if(q.kind==='LOCATION')return page(await this.history.em.query(`SELECT location_code code,location_name label FROM wms_locations WHERE warehouse_code=$1 AND status IN ('NORMAL','EMPTY','OCCUPIED')
      AND location_code>$2 AND strpos(lower(location_code||' '||COALESCE(location_name,'')),lower($3))>0 ORDER BY location_code LIMIT $4`,[q.warehouseCode,q.after||'',search,limit+1]));
    if(q.after&&(!/^[1-9][0-9]*$/.test(q.after)||BigInt(q.after)>9223372036854775807n))throw new BadRequestException('INVALID_FILTER');
    const rows=await this.history.em.query(`SELECT u.user_id::text code,u.real_name label,COALESCE(array_agg(r.role_code) FILTER(WHERE r.role_code IS NOT NULL),'{}') roles
      FROM sys_user u LEFT JOIN sys_user_role ur ON ur.user_id=u.user_id AND COALESCE(ur.is_visible,true)
      LEFT JOIN sys_role r ON r.role_id=ur.role_id AND r.status='ACTIVE'
      WHERE u.status=1 AND u.user_id>$1::bigint AND strpos(lower(u.user_id::text||' '||COALESCE(u.real_name,'')),lower($2))>0
      GROUP BY u.user_id ORDER BY u.user_id LIMIT $3`,[q.after||'0',search,limit+1]);
    const users=rows.slice(0,limit),eligible=await this.history.scopes.eligibleWarehouseRecipients(users,'MENU_PKG_OP',d.ownership.companyCode,q.warehouseCode);
    return pack(users.filter((u:any)=>eligible.has(u.code)).map((u:any)=>({code:u.code,label:u.label})),rows.length>limit?users.at(-1)?.code:null);
  }
  @Get('boxes/resolve') @Header('Cache-Control','private,no-store')
  async resolve(@Query() q:any,@Req() req:any){const d=await this.history.detail(q.packingCode,req);return {code:200,data:await this.workflow.boxes.resolve(this.history.em,d.record.id,q.labelCode)};}
  @Get('operations/:key') @Header('Cache-Control','private,no-store')
  async operation(@Param('key') key:string,@Query() q:any,@Req() req:any){
    uuid(key);if(!['REGISTER','SESSION','SCAN','PRINT','PRINT_RESULT','CONFIRM','VOID'].includes(q.action))throw new BadRequestException('INVALID_FILTER');
    const d=await this.history.detail(q.packingCode,req);
    const rows=await this.history.em.query(`SELECT o.state,e.id "eventId",e.payload result FROM pkg_packing_operations o
      LEFT JOIN pkg_packing_events e ON e.id=o.result_event_id AND e.operation_id=o.id AND e.packing_id=o.packing_id AND e.actor_id=o.actor_id AND e.event_type=CASE o.action WHEN 'REGISTER' THEN 'REGISTRATION' WHEN 'SESSION' THEN 'VERIFICATION_SESSION' WHEN 'SCAN' THEN 'BOX_VERIFIED' WHEN 'PRINT' THEN 'PRINT_REQUEST' WHEN 'PRINT_RESULT' THEN 'PRINT_RESULT' WHEN 'VOID' THEN 'LABEL_VOID' WHEN 'CONFIRM' THEN 'COMMIT_RECEIPT' END WHERE o.idempotency_key=$1 AND o.actor_id=$2 AND o.packing_id=$3 AND o.action=$4`,
      [key,String(req.user.userId??req.user.id??req.user.user_id),d.record.id,q.action]);
    if(rows[0]?.state==='COMMITTED'&&(!rows[0].eventId||!rows[0].result||Array.isArray(rows[0].result)||typeof rows[0].result!=='object'))throw new ConflictException('OPERATION_INCOMPLETE');
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
