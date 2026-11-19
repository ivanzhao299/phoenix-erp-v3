import { StrictBodyGuard } from '../../../common/guards/strict-body.guard';
import { Body,Controller,Get,Param,Post,Query,UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsInt,IsString,IsUUID,Matches,MaxLength,Min } from 'class-validator';
import { MenuGuard,RequireAnyMenu,RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { OfficialRawCollectionService } from '../services/official-raw-collection.service';

class RawIdentityDto {@IsUUID() id!:string;}
class RawCreateDto {
  @IsString() @MaxLength(128) companyCode!:string;
  @IsString() @MaxLength(128) houseCode!:string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) productionDate!:string;
  @IsString() @MaxLength(128) warehouseCode!:string;
  @Matches(/^[1-9]\d{0,18}$/) sourceBatchId!:string;
  @IsUUID() handoverId!:string;
  @IsString() @MaxLength(128) intentKey!:string;
}
class RawVersionDto {@IsInt() @Min(0) version!:number;}
class RawReadyDto extends RawVersionDto {@IsString() @MaxLength(128) submitKey!:string;}
class RawApproveDto extends RawVersionDto {@Matches(/^[a-f0-9]{64}$/) contentHash!:string;}
class RawPostDto {@IsString() @MaxLength(128) submitKey!:string;@Matches(/^[a-f0-9]{64}$/) contentHash!:string;}
const readers=(['V','C','E','A'] as const).map(perm=>({menu:'MENU_PROD_INBOUND',perm}));
@Controller('api/v2/inventory/raw-collection-receipts')
@UseGuards(AuthGuard('jwt'),MenuGuard,DataScopeGuard)
export class OfficialRawCollectionController {
  constructor(private readonly receipts:OfficialRawCollectionService){}
  @Get('sources') @RequireAnyMenu(readers)
  sources(@Query('companyCode') c:string,@Query('houseCode') h:string,@Query('productionDate') d:string,@Query('warehouseCode') w:string){return this.receipts.sources(c,h,d,w);}
  @Get() @RequireAnyMenu(readers)
  list(@Query('companyCode') c:string,@Query('houseCode') h:string,@Query('productionDate') d:string,@Query('warehouseCode') w:string){return this.receipts.list(c,h,d,w);}
  @Get(':id') @RequireAnyMenu(readers)
  get(@Param() p:RawIdentityDto){return this.receipts.get(p.id);}
  @Post() @RequireMenu('MENU_PROD_INBOUND','C')
  @UseGuards(new StrictBodyGuard(RawCreateDto))
  create(@Body() body:RawCreateDto){return this.receipts.create(body);}
  @Post(':id/ready') @RequireMenu('MENU_PROD_INBOUND','E')
  @UseGuards(new StrictBodyGuard(RawReadyDto))
  ready(@Param() p:RawIdentityDto,@Body() body:RawReadyDto){return this.receipts.ready(p.id,body.version,body.submitKey);}
  @Post(':id/approve') @RequireMenu('MENU_PROD_INBOUND','A')
  @UseGuards(new StrictBodyGuard(RawApproveDto))
  approve(@Param() p:RawIdentityDto,@Body() body:RawApproveDto){return this.receipts.approve(p.id,body.version,body.contentHash);}
  @Post(':id/post') @RequireAnyMenu(readers)
  @UseGuards(new StrictBodyGuard(RawPostDto))
  post(@Param() p:RawIdentityDto,@Body() body:RawPostDto){return this.receipts.post(p.id,body.submitKey,body.contentHash);}
  @Post(':id/cancel') @RequireMenu('MENU_PROD_INBOUND','E')
  @UseGuards(new StrictBodyGuard(RawVersionDto))
  cancel(@Param() p:RawIdentityDto,@Body() body:RawVersionDto){return this.receipts.cancel(p.id,body.version);}
}
