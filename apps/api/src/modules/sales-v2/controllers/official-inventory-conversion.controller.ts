import { StrictBodyGuard } from '../../../common/guards/strict-body.guard';
import { Body,Controller,Get,Param,Post,Query,Res,UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ArrayMaxSize,ArrayMinSize,IsIn,IsInt,IsOptional,IsString,IsUUID,Matches,Max,MaxLength,Min,ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Response } from 'express';
import { MenuGuard,RequireAnyMenu,RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { OfficialInventoryConversionService } from '../services/official-inventory-conversion.service';

class ConversionIdentityDto {@IsUUID() id!:string;}
class ConversionVersionDto {@IsInt() @Min(0) version!:number;}
class ConversionReadyDto extends ConversionVersionDto {@IsString() @MaxLength(128) submitKey!:string;}
class ConversionApproveDto extends ConversionVersionDto {@Matches(/^[a-f0-9]{64}$/) contentHash!:string;}
class ConversionPostDto {@IsString() @MaxLength(128) submitKey!:string;@Matches(/^[a-f0-9]{64}$/) contentHash!:string;}
class ConversionInputDto {
  @IsOptional() @IsUUID() rawSegmentId?:string;
  @IsOptional() @IsString() @MaxLength(128) parentBatchNo?:string;
  @IsInt() @Min(1) @Max(2147483647) quantity!:number;
}
class ConversionOutputDto {
  @IsIn(['STOCK','WIP','LOSS']) outputKind!:'STOCK'|'WIP'|'LOSS';
  @IsString() @MaxLength(128) gradeCode!:string;
  @IsInt() @Min(1) @Max(2147483647) quantity!:number;
  @IsString() @MaxLength(128) evidenceFileId!:string;
  @IsOptional() @IsString() @MaxLength(128) skuCode?:string;
  @IsOptional() @IsString() @MaxLength(128) locationCode?:string;
  @IsOptional() @IsString() @MaxLength(128) lossReason?:string;
}
class ConversionCreateDto {
  @IsString() @MaxLength(128) companyCode!:string;
  @IsString() @MaxLength(128) warehouseCode!:string;
  @IsString() @MaxLength(128) productCode!:string;
  @IsIn(['GRADING','PACKING','REPACKING']) operationKind!:'GRADING'|'PACKING'|'REPACKING';
  @IsString() @MaxLength(128) physicalGroupRef!:string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) operationDate!:string;
  @IsString() @MaxLength(128) intentKey!:string;
  @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({each:true}) @Type(()=>ConversionInputDto) inputs!:ConversionInputDto[];
  @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({each:true}) @Type(()=>ConversionOutputDto) outputs!:ConversionOutputDto[];
}
class ConversionEditDto extends ConversionCreateDto {@IsInt() @Min(0) version!:number;}
const readers=(['V','C','E','A'] as const).map(perm=>({menu:'MENU_PROD_INBOUND',perm}));
@Controller('api/v2/inventory/conversions')
@UseGuards(AuthGuard('jwt'),MenuGuard,DataScopeGuard)
export class OfficialInventoryConversionController {
  constructor(private readonly conversions:OfficialInventoryConversionService){}
  @Get('sources') @RequireAnyMenu(readers)
  sources(@Query('companyCode') company:string,@Query('warehouseCode') warehouse:string,@Query('productCode') product:string){return this.conversions.sources(company,warehouse,product);}
  @Get('recover') @RequireAnyMenu(readers)
  recover(@Query('companyCode') company:string,@Query('warehouseCode') warehouse:string,@Query('intentKey') intent?:string,@Query('physicalGroupRef') group?:string){return this.conversions.recover(company,warehouse,intent,group);}
  @Get() @RequireAnyMenu(readers)
  list(@Query('companyCode') company:string,@Query('warehouseCode') warehouse:string,@Query('productCode') product:string,@Query('operationDate') date?:string){return this.conversions.list(company,warehouse,product,date);}
  @Get(':id/evidence/:fileId') @RequireAnyMenu(readers)
  async evidence(@Param('id') id:string,@Param('fileId') fileId:string,@Res({passthrough:true}) response:Response){
    const result=await this.conversions.evidence(id,fileId);response.setHeader('Content-Type',result.mimeType);response.setHeader('Content-Disposition',result.disposition);return result.stream;
  }
  @Get(':id') @RequireAnyMenu(readers)
  get(@Param() identity:ConversionIdentityDto){return this.conversions.get(identity.id);}
  @Post() @RequireMenu('MENU_PROD_INBOUND','C')
  @UseGuards(new StrictBodyGuard(ConversionCreateDto))
  create(@Body() body:ConversionCreateDto){return this.conversions.create(body);}
  @Post(':id/edit') @RequireMenu('MENU_PROD_INBOUND','E')
  @UseGuards(new StrictBodyGuard(ConversionEditDto))
  edit(@Param() identity:ConversionIdentityDto,@Body() body:ConversionEditDto){return this.conversions.edit(identity.id,body.version,body);}
  @Post(':id/ready') @RequireMenu('MENU_PROD_INBOUND','E')
  @UseGuards(new StrictBodyGuard(ConversionReadyDto))
  ready(@Param() identity:ConversionIdentityDto,@Body() body:ConversionReadyDto){return this.conversions.ready(identity.id,body.version,body.submitKey);}
  @Post(':id/approve') @RequireMenu('MENU_PROD_INBOUND','A')
  @UseGuards(new StrictBodyGuard(ConversionApproveDto))
  approve(@Param() identity:ConversionIdentityDto,@Body() body:ConversionApproveDto){return this.conversions.approve(identity.id,body.version,body.contentHash);}
  @Post(':id/post') @RequireAnyMenu(readers)
  @UseGuards(new StrictBodyGuard(ConversionPostDto))
  post(@Param() identity:ConversionIdentityDto,@Body() body:ConversionPostDto){return this.conversions.post(identity.id,body.submitKey,body.contentHash);}
  @Post(':id/cancel') @RequireMenu('MENU_PROD_INBOUND','E')
  @UseGuards(new StrictBodyGuard(ConversionVersionDto))
  cancel(@Param() identity:ConversionIdentityDto,@Body() body:ConversionVersionDto){return this.conversions.cancel(identity.id,body.version);}
}
