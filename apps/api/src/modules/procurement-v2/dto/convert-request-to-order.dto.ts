import {
  IsString, IsOptional, IsBoolean, IsDateString, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

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
}
