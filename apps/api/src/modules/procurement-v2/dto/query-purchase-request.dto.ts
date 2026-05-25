import { IsOptional, IsString, IsNumber, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryPurchaseRequestDto {
  @IsOptional()
  @IsString()
  companyCode?: string;

  @IsOptional()
  @IsString()
  projectCode?: string;

  @IsOptional()
  @IsString()
  purchaseType?: string;

  /** status: DRAFT | SUBMITTED | APPROVED | REJECTED | CANCELLED | CONVERTED */
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  urgency?: string;

  @IsOptional()
  @IsString()
  requesterId?: string;

  @IsOptional()
  @IsString()
  deptCode?: string;

  /** 期望到货日范围 */
  @IsOptional()
  @IsDateString()
  expectedDateFrom?: string;

  @IsOptional()
  @IsDateString()
  expectedDateTo?: string;

  /** 关键字：匹配 req_no / subject / requester_name */
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
