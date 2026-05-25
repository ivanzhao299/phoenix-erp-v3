import { IsOptional, IsString, IsNumber, IsDateString, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryPurchaseOrderDto {
  @IsOptional()
  @IsString()
  companyCode?: string;

  @IsOptional()
  @IsString()
  projectCode?: string;

  @IsOptional()
  @IsString()
  supplierCode?: string;

  @IsOptional()
  @IsString()
  purchaseType?: string;

  /** DRAFT | SUBMITTED | APPROVED | REJECTED | CANCELLED | ... */
  @IsOptional()
  @IsString()
  status?: string;

  /** NONE | PENDING | APPROVED | REJECTED | CANCELLED */
  @IsOptional()
  @IsString()
  approvalStatus?: string;

  /** 是否跨境：'true' | 'false' */
  @IsOptional()
  @IsString()
  crossBorderFlag?: string;

  @IsOptional()
  @IsDateString()
  expectedDateFrom?: string;

  @IsOptional()
  @IsDateString()
  expectedDateTo?: string;

  /** 关键字：po_no / subject / supplier_name */
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
