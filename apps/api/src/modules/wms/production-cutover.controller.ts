import { financeReviewEditors } from './production-finance-review';
import { StrictBodyGuard } from '../../common/guards/strict-body.guard';
import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireAnyMenu, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { ProductionCutoverService } from './production-cutover.service';
import { CutoverStateDto, CutoverStateReceiptParams, CreateCutoverDto, EditCutoverDto, CutoverBoundaryDto, CutoverIdDto, CutoverSignDto, CutoverVersionDto } from './production-cutover.dto';

const readers=[{menu:'MENU_PROD_INBOUND',perm:'V' as const},{menu:'MENU_PROD_INBOUND',perm:'A' as const},{menu:'MENU_FIN2_AR_LEDGER',perm:'E' as const}];
@Controller('api/v2/inventory/production-cutovers')
@UseGuards(AuthGuard('jwt'),MenuGuard,DataScopeGuard)
export class ProductionCutoverController {
  constructor(private readonly cutovers:ProductionCutoverService){}
  @Post('inspect') @RequireAnyMenu(readers)
  @UseGuards(new StrictBodyGuard(CutoverBoundaryDto))
  inspect(@Body() body:CutoverBoundaryDto){return this.cutovers.inspect(body);}
  @Post('inspect-extension') @RequireAnyMenu(readers)
  inspectExtension(@Body() body:Parameters<ProductionCutoverService['inspectExtension']>[0]){
    return this.cutovers.inspectExtension(body);
  }
  @Get() @RequireAnyMenu(readers)
  list(@Query('companyCode') company:string,@Query('warehouseCode') warehouse:string){return this.cutovers.list(company,warehouse);}
  @Get('locations') @RequireAnyMenu(readers)
  locations(@Query('companyCode') company:string,@Query('warehouseCode') warehouse:string){return this.cutovers.locations(company,warehouse);}
  @Get(':id') @RequireAnyMenu(readers)
  get(@Param() p:CutoverIdDto){return this.cutovers.get(p.id);}
  @Get(':id/evidence/:fileId') @RequireAnyMenu(readers)
  async evidence(@Param('id') id:string,@Param('fileId') fileId:string,@Res({passthrough:true}) response:any){
    const file=await this.cutovers.evidence(id,fileId);response.setHeader('Content-Type',file.mimeType);
    response.setHeader('Content-Disposition',file.disposition);return file.stream;
  }
  @Post() @RequireMenu('MENU_PROD_INBOUND','C')
  @UseGuards(new StrictBodyGuard(CreateCutoverDto))
  create(@Body() body:CreateCutoverDto){return this.cutovers.create(body);}
  @Patch(':id') @RequireMenu('MENU_PROD_INBOUND','E')
  @UseGuards(new StrictBodyGuard(EditCutoverDto))
  edit(@Param() p:CutoverIdDto,@Body() body:EditCutoverDto){return this.cutovers.edit(p.id,body.version,body);}
  @Post(':id/freeze') @RequireMenu('MENU_PROD_INBOUND','E')
  @UseGuards(new StrictBodyGuard(CutoverVersionDto))
  freeze(@Param() p:CutoverIdDto,@Body() body:CutoverVersionDto){return this.cutovers.freeze(p.id,body.version);}
  @Post(':id/sign') @RequireAnyMenu([{menu:'MENU_PROD_INBOUND',perm:'A'},...financeReviewEditors])
  @UseGuards(new StrictBodyGuard(CutoverSignDto))
  sign(@Param() p:CutoverIdDto,@Body() body:CutoverSignDto){return this.cutovers.sign(p.id,body);}
  @Get(':id/state-boundary') @RequireAnyMenu(readers)
  stateBoundary(@Param() p:CutoverIdDto,@Query('houseCode') house?:string){return this.cutovers.statePreview(p.id,house);}
  @Get(':id/state-receipts/:intentKey') @RequireAnyMenu(readers)
  stateReceipt(@Param() p:CutoverStateReceiptParams){return this.cutovers.stateReceipt(p.id,p.intentKey);}
  @Post(':id/state') @RequireMenu('MENU_PROD_INBOUND','A')
  @UseGuards(new StrictBodyGuard(CutoverStateDto))
  changeState(@Param() p:CutoverIdDto,@Body() body:CutoverStateDto){return this.cutovers.changeState(p.id,body);}
  @Post(':id/cancel') @RequireMenu('MENU_PROD_INBOUND','E')
  @UseGuards(new StrictBodyGuard(CutoverVersionDto))
  cancel(@Param() p:CutoverIdDto,@Body() body:CutoverVersionDto){return this.cutovers.cancel(p.id,body.version);}
}
