import {
  IsString, IsOptional, IsNumber, IsIn, IsNotEmpty,
  Min, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const CUSTOMER_TYPES = ['DIRECT_STORE', 'DISTRIBUTOR', 'AGENT', 'KEY_ACCOUNT', 'RETAIL'] as const;
const RISK_LEVELS    = ['NORMAL', 'WATCH', 'BLACKLIST'] as const;
const STATUSES       = ['ACTIVE', 'FROZEN', 'BLACKLIST'] as const;

export class CreateCustomerDto {
  @IsString() @IsNotEmpty() @MaxLength(128)
  customerName: string;

  @IsString() @IsIn(CUSTOMER_TYPES)
  customerType: string;

  @IsString() @IsNotEmpty() @MaxLength(64)
  companyCode: string;

  @IsString() @IsOptional() @MaxLength(256)
  companyName?: string;

  @IsString() @IsOptional() @MaxLength(64)
  channelCode?: string;

  @IsString() @IsOptional() @MaxLength(64)
  regionCode?: string;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  creditLimit?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  paymentTerms?: number;

  @IsString() @IsOptional() @IsIn(RISK_LEVELS)
  riskLevel?: string;

  @IsString() @IsOptional() @MaxLength(128)
  salesRepName?: string;

  @IsString() @IsOptional() @MaxLength(128)
  contactName?: string;

  @IsString() @IsOptional() @MaxLength(64)
  contactPhone?: string;

  @IsString() @IsOptional()
  deliveryAddress?: string;

  @IsString() @IsOptional()
  remark?: string;
}

export class UpdateCustomerDto {
  @IsString() @IsOptional() @MaxLength(128)
  customerName?: string;

  @IsString() @IsOptional() @IsIn(CUSTOMER_TYPES)
  customerType?: string;

  @IsString() @IsOptional() @MaxLength(256)
  companyName?: string;

  @IsString() @IsOptional() @MaxLength(64)
  channelCode?: string;

  @IsString() @IsOptional() @MaxLength(64)
  regionCode?: string;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  paymentTerms?: number;

  @IsString() @IsOptional() @IsIn(RISK_LEVELS)
  riskLevel?: string;

  @IsString() @IsOptional() @MaxLength(128)
  salesRepName?: string;

  @IsString() @IsOptional() @MaxLength(128)
  contactName?: string;

  @IsString() @IsOptional() @MaxLength(64)
  contactPhone?: string;

  @IsString() @IsOptional()
  deliveryAddress?: string;

  @IsString() @IsOptional()
  remark?: string;
}

export class QueryCustomerDto {
  @IsString() @IsOptional()
  keyword?: string;

  @IsString() @IsOptional() @IsIn(CUSTOMER_TYPES)
  customerType?: string;

  @IsString() @IsOptional() @IsIn(STATUSES)
  status?: string;

  @IsString() @IsOptional() @IsIn(RISK_LEVELS)
  riskLevel?: string;

  @IsString() @IsOptional()
  channelCode?: string;

  @IsString() @IsOptional()
  companyCode?: string;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(1)
  page?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(1)
  limit?: number;
}

export class FreezeCustomerDto {
  @IsString() @IsOptional()
  remark?: string;
}

export class BlacklistCustomerDto {
  @IsString() @IsOptional()
  remark?: string;
}

export class UpdateCreditLimitDto {
  @Type(() => Number) @IsNumber() @Min(0)
  creditLimit: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(0)
  paymentTerms?: number;
}
