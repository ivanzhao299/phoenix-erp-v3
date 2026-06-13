import {
  IsString, IsOptional, IsBoolean, IsDateString, MaxLength,
  IsArray, ValidateNested, IsNumber, Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** G96：转单逐项调价——按申请明细 id 覆盖估算单价（采购员议价后的真实单价） */
export class ConvertItemPriceDto {
  @IsString()
  id: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

/** 从已审批 PR 转 PO 的 DTO */
export class ConvertRequestToOrderDto {
  /** 供应商（必填） */
  @IsString()
  @MaxLength(64)
  supplierCode: string;

  @IsString()
  @MaxLength(256)
  supplierName: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  /** 合同号（可选） */
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

  /** 期望到货日 */
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  /** 付款截止日 */
  @IsOptional()
  @IsDateString()
  payDeadline?: string;

  /** 是否跨境 */
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
  payTerms?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  /** G96：逐项调价覆盖（可选；不传则沿用申请估算价） */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConvertItemPriceDto)
  items?: ConvertItemPriceDto[];
}
