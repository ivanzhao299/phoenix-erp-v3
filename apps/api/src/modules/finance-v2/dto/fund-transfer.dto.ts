import { IsString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

// ── 创建转账申请 ──────────────────────────────────────────────────────────

export class CreateFundTransferDto {
  @IsString()
  fromAccountId: string;

  @IsString()
  toAccountId: string;

  @IsNumber() @Min(0.01)
  @Type(() => Number)
  amountOriginal: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  amountBase?: number;

  @IsOptional() @IsString()
  remark?: string;
}

// ── 审批操作 ──────────────────────────────────────────────────────────────

export class ApproveFundTransferDto {
  @IsOptional() @IsString()
  remark?: string;
}

// ── 取消转账 ──────────────────────────────────────────────────────────────

export class CancelFundTransferDto {
  @IsOptional() @IsString()
  remark?: string;
}

// ── 查询筛选 ──────────────────────────────────────────────────────────────

export class QueryFundTransferDto {
  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  fromAccountId?: string;

  @IsOptional() @IsString()
  toAccountId?: string;

  @IsOptional() @IsString()
  @IsIn(['DRAFT','PENDING_APPROVAL','APPROVED','EXECUTED','CANCELLED'])
  status?: string;

  @IsOptional() @IsString()
  dateFrom?: string;

  @IsOptional() @IsString()
  dateTo?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  pageSize?: number;
}
