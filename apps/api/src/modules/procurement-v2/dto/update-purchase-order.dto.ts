import {
  IsString, IsOptional, IsBoolean, IsDateString,
  MaxLength, IsArray, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PurchaseOrderItemDto } from './purchase-order-item.dto';

/** 编辑 PO（仅 DRAFT 状态） */
export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  subject?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  projectName?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  supplierCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  supplierName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  purchaseType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currencyCode?: string;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsDateString()
  payDeadline?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  crossBorderFlag?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  originCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  destinationCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  contractNo?: string;

  @IsOptional()
  @IsString()
  contractUrl?: string;

  @IsOptional()
  @IsString()
  contractNote?: string;

  @IsOptional()
  @IsString()
  payTerms?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  /** 传入时全量替换明细行 */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items?: PurchaseOrderItemDto[];
}
