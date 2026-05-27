import {
  IsString, IsOptional, IsNumber, IsIn, IsNotEmpty, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const STATUSES = ['DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','EXPIRED','CANCELLED'] as const;

export class CreatePriceBookDto {
  @IsString() @IsNotEmpty() @MaxLength(256)
  priceBookName: string;

  @IsString() @IsNotEmpty() @MaxLength(64)
  companyCode: string;

  @IsString() @IsOptional() @MaxLength(256)
  companyName?: string;

  @IsString() @IsOptional() @MaxLength(64)
  channelCode?: string;

  @IsString() @IsOptional() @MaxLength(64)
  customerCode?: string;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(1)
  priority?: number;

  @IsString() @IsOptional()
  effectiveFrom?: string;

  @IsString() @IsOptional()
  effectiveTo?: string;

  @IsString() @IsOptional()
  remark?: string;
}

export class UpdatePriceBookDto {
  @IsString() @IsOptional() @MaxLength(256)
  priceBookName?: string;

  @IsString() @IsOptional() @MaxLength(256)
  companyName?: string;

  @IsString() @IsOptional() @MaxLength(64)
  channelCode?: string;

  @IsString() @IsOptional() @MaxLength(64)
  customerCode?: string;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(1)
  priority?: number;

  @IsString() @IsOptional()
  effectiveFrom?: string;

  @IsString() @IsOptional()
  effectiveTo?: string;

  @IsString() @IsOptional()
  remark?: string;
}

export class QueryPriceBookDto {
  @IsString() @IsOptional()
  keyword?: string;

  @IsString() @IsOptional() @IsIn(STATUSES)
  status?: string;

  @IsString() @IsOptional()
  companyCode?: string;

  @IsString() @IsOptional()
  channelCode?: string;

  @IsString() @IsOptional()
  customerCode?: string;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(1)
  page?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(1)
  limit?: number;
}

export class SubmitPriceBookDto {
  @IsString() @IsOptional()
  remark?: string;
}
