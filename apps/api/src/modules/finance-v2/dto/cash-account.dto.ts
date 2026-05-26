import { IsString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

// ── 创建资金账户 ──────────────────────────────────────────────────────────

export class CreateCashAccountDto {
  @IsString()
  accountCode: string;

  @IsString()
  accountName: string;

  @IsString()
  companyCode: string;

  @IsOptional() @IsString()
  companyName?: string;

  @IsString()
  currencyCode: string;

  @IsString()
  @IsIn(['BANK','CASH','VIRTUAL','SHAREHOLDER','INTERNAL'])
  accountType: string;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  openingBalance?: number;

  @IsOptional() @IsString()
  bankName?: string;

  @IsOptional() @IsString()
  bankAccountNo?: string;

  @IsOptional() @IsString()
  remark?: string;
}

// ── 更新资金账户 ──────────────────────────────────────────────────────────

export class UpdateCashAccountDto {
  @IsOptional() @IsString()
  accountName?: string;

  @IsOptional() @IsString()
  bankName?: string;

  @IsOptional() @IsString()
  bankAccountNo?: string;

  @IsOptional() @IsString()
  remark?: string;
}

// ── 查询筛选 ──────────────────────────────────────────────────────────────

export class QueryCashAccountDto {
  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  currencyCode?: string;

  @IsOptional() @IsString()
  @IsIn(['BANK','CASH','VIRTUAL','SHAREHOLDER','INTERNAL'])
  accountType?: string;

  @IsOptional() @IsString()
  @IsIn(['ACTIVE','FROZEN','CLOSED'])
  status?: string;

  @IsOptional() @IsString()
  keyword?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  pageSize?: number;
}

// ── 流水查询 ──────────────────────────────────────────────────────────────

export class QueryCashTransactionDto {
  @IsOptional() @IsString()
  accountId?: string;

  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  @IsIn(['IN','OUT'])
  direction?: string;

  @IsOptional() @IsString()
  sourceType?: string;

  @IsOptional() @IsString()
  dateFrom?: string;

  @IsOptional() @IsString()
  dateTo?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  pageSize?: number;
}
