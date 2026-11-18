import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { ProductionInboundDocumentsService } from '../services/production-inbound-documents.service';
import { CreateProductionInboundDto, EditProductionInboundDto, PostProductionInboundDto,
  ProductionDocumentIdDto, ProductionDocumentVersionDto, ReadyProductionInboundDto,
  CreateProductionReversalDto, ApproveProductionReversalDto, RecordProductionFinancialClearanceDto,
  CreatePhysicalHandoverDto, ConfirmPhysicalHandoverDto, CancelPhysicalHandoverDto, ProductionPostingPeriodDto } from '../dto/production-inbound-document.dto';

@Controller('api/v2/inventory/production-inbound-documents')
@UseGuards(AuthGuard('jwt'),MenuGuard,DataScopeGuard)
export class ProductionInboundDocumentsController {
  constructor(private readonly documents: ProductionInboundDocumentsService) {}
  @Get('context') @RequireMenu('MENU_PROD_INBOUND','V',['MENU_FARM_DAILY'])
  context(@Query('companyCode') company:string,@Query('houseCode') house:string) { return this.documents.context(company,house); }
  @Get('locations') @RequireMenu('MENU_PROD_INBOUND','V')
  locations(@Query('companyCode') company:string,@Query('houseCode') house:string,@Query('warehouseCode') warehouse:string) {
    return this.documents.locations(company,house,warehouse);
  }
  @Get('posting-period') @RequireMenu('MENU_FIN2_AR_LEDGER','E')
  postingPeriod(@Query('companyCode') company:string,@Query('periodMonth') month:string) { return this.documents.postingPeriod(company,month); }
  @Get('handovers/:id/evidence/:fileId') @RequireMenu('MENU_PROD_INBOUND','V')
  async handoverEvidence(@Param('id') id:string,@Param('fileId') file:string,@Res({passthrough:true}) response:any) {
    const result=await this.documents.evidence('handover',id,file);response.setHeader('Content-Type',result.mimeType);
    response.setHeader('Content-Disposition',result.disposition);return result.stream;
  }
  @Get(':id/evidence/:fileId') @RequireMenu('MENU_PROD_INBOUND','V')
  async documentEvidence(@Param('id') id:string,@Param('fileId') file:string,@Res({passthrough:true}) response:any) {
    const result=await this.documents.evidence('document',id,file);response.setHeader('Content-Type',result.mimeType);
    response.setHeader('Content-Disposition',result.disposition);return result.stream;
  }
  @Get('balance') @RequireMenu('MENU_PROD_INBOUND','V')
  balance(@Query('companyCode') company: string,@Query('houseCode') house: string,
    @Query('eggDate') day: string,@Query('warehouseCode') warehouse: string) {
    return this.documents.balance(company,house,day,warehouse);
  }
  @Get('recover') @RequireMenu('MENU_PROD_INBOUND','V')
  recover(@Query('companyCode') company: string,@Query('intentKey') intent?: string,@Query('handoverRef') handover?: string) {
    return this.documents.recover(company,intent,handover);
  }
  @Get('handovers') @RequireMenu('MENU_PROD_INBOUND','V')
  handovers(@Query('companyCode') company:string,@Query('houseCode') house:string,@Query('eggDate') day:string) {
    return this.documents.handovers(company,house,day);
  }
  @Post('handovers') @RequireMenu('MENU_PROD_INBOUND','C')
  createHandover(@Body() body:CreatePhysicalHandoverDto) { return this.documents.createPhysicalHandover(body); }
  @Post('handovers/:id/confirm') @RequireMenu('MENU_PROD_INBOUND','E')
  confirmHandover(@Param() p:ProductionDocumentIdDto,@Body() body:ConfirmPhysicalHandoverDto) {
    return this.documents.confirmPhysicalHandover(p.id,body.version,body.contentHash);
  }
  @Post('handovers/:id/cancel') @RequireMenu('MENU_PROD_INBOUND','V')
  cancelHandover(@Param() p:ProductionDocumentIdDto,@Body() body:CancelPhysicalHandoverDto) {
    return this.documents.cancelPhysicalHandover(p.id,body.version,body.reason,body.evidenceFileIds);
  }
  @Post('posting-period') @RequireMenu('MENU_FIN2_AR_LEDGER','E')
  setPostingPeriod(@Body() body:ProductionPostingPeriodDto) { return this.documents.setPostingPeriod(body); }
  @Get() @RequireMenu('MENU_PROD_INBOUND','V')
  list(@Query('companyCode') company: string,@Query('houseCode') house: string,@Query('eggDate') day: string) {
    return this.documents.list(company,house,day);
  }
  @Get(':id') @RequireMenu('MENU_PROD_INBOUND','V')
  get(@Param() p: ProductionDocumentIdDto) { return this.documents.get(p.id); }
  @Post() @RequireMenu('MENU_PROD_INBOUND','C')
  create(@Body() body: CreateProductionInboundDto) { return this.documents.create(body); }
  @Patch(':id') @RequireMenu('MENU_PROD_INBOUND','E')
  edit(@Param() p: ProductionDocumentIdDto,@Body() body: EditProductionInboundDto) { return this.documents.edit(p.id,body.version,body); }
  @Post(':id/ready') @RequireMenu('MENU_PROD_INBOUND','E')
  ready(@Param() p: ProductionDocumentIdDto,@Body() body: ReadyProductionInboundDto) { return this.documents.ready(p.id,body.version,body.submitKey); }
  @Post(':id/post') @RequireMenu('MENU_PROD_INBOUND','V')
  post(@Param() p: ProductionDocumentIdDto,@Body() body: PostProductionInboundDto) { return this.documents.post(p.id,body.submitKey,body.contentHash); }
  @Post(':id/cancel') @RequireMenu('MENU_PROD_INBOUND','E')
  cancel(@Param() p: ProductionDocumentIdDto,@Body() body: ProductionDocumentVersionDto) { return this.documents.cancel(p.id,body.version); }
  @Post(':id/reversals') @RequireMenu('MENU_PROD_INBOUND','C')
  createReversal(@Param() p: ProductionDocumentIdDto,@Body() body: CreateProductionReversalDto) { return this.documents.createReversal(p.id,body); }
  @Post(':id/approve') @RequireMenu('MENU_PROD_INBOUND','A')
  approveReversal(@Param() p: ProductionDocumentIdDto,@Body() body: ApproveProductionReversalDto) {
    return this.documents.approveReversal(p.id,body.version,body.contentHash,body.financialClearanceId);
  }
  @Post(':id/financial-clearance') @RequireMenu('MENU_FIN2_AR_LEDGER','E')
  recordFinancialClearance(@Param() p: ProductionDocumentIdDto,@Body() body: RecordProductionFinancialClearanceDto) {
    return this.documents.recordFinancialClearance(p.id,body);
  }
}
