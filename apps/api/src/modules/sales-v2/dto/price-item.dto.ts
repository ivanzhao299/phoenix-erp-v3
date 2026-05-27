import {
  IsString, IsOptional, IsNumber, IsIn, IsNotEmpty, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePriceItemDto {
  @Type(() => Number) @IsNumber()
  priceBookId: number;

  @IsString() @IsNotEmpty() @MaxLength(64)
  productCode: string;

  @IsString() @IsOptional() @MaxLength(16)
  gradeCode?: string;

  @IsString() @IsOptional() @MaxLength(64)
  packagingSpec?: string;

  @IsString() @IsOptional() @MaxLength(8)
  currencyCode?: string;

  @Type(() => Number) @IsNumber() @Min(0)
  unitPrice: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  floorPrice?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  ceilingPrice?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  minQty?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  maxQty?: number;
}

export class UpdatePriceItemDto {
  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  unitPrice?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  floorPrice?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  ceilingPrice?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  minQty?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  maxQty?: number;

  @IsString() @IsOptional() @MaxLength(8)
  currencyCode?: string;
}

export class QueryPriceItemDto {
  @Type(() => Number) @IsNumber() @IsOptional()
  priceBookId?: number;

  @IsString() @IsOptional()
  productCode?: string;

  @IsString() @IsOptional()
  gradeCode?: string;

  @IsString() @IsOptional()
  packagingSpec?: string;

  @IsString() @IsOptional() @IsIn(['ACTIVE', 'DISABLED'])
  status?: string;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(1)
  page?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(1)
  limit?: number;
}

export class BulkImportPriceItemDto {
  @Type(() => Number) @IsNumber()
  priceBookId: number;

  items: CreatePriceItemDto[];
}

export class ResolvePriceDto {
  @IsString() @IsNotEmpty()
  companyCode: string;

  @IsString() @IsOptional()
  customerCode?: string;

  @IsString() @IsOptional()
  channelCode?: string;

  @IsString() @IsNotEmpty()
  productCode: string;

  @IsString() @IsOptional()
  gradeCode?: string;

  @IsString() @IsOptional()
  packagingSpec?: string;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  qty?: number;

  @IsString() @IsOptional()
  currencyCode?: string;
}

export class ValidatePriceDto {
  @IsString() @IsNotEmpty()
  companyCode: string;

  @IsString() @IsOptional()
  customerCode?: string;

  @IsString() @IsOptional()
  channelCode?: string;

  @IsString() @IsNotEmpty()
  productCode: string;

  @IsString() @IsOptional()
  gradeCode?: string;

  @IsString() @IsOptional()
  packagingSpec?: string;

  @Type(() => Number) @IsNumber() @Min(0)
  unitPrice: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  qty?: number;
}
