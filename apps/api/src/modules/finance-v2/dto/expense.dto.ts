import {
  IsString, IsOptional, IsNumber, IsDateString,
  IsArray, Min, IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── 费用申请 DTO ──────────────────────────────────────────────────────────────

export class CreateExpenseRequestDto {
  @IsString() @IsNotEmpty()
  companyCode: string;

  @IsOptional() @IsString()
  companyName?: string;

  /** TRAVEL / MEAL / ENTERTAINMENT / OFFICE / MATERIAL / TRANSPORT / OTHER */
  @IsString() @IsNotEmpty()
  expenseType: string;

  @IsString() @IsNotEmpty()
  currencyCode: string;

  @IsNumber() @Min(0.01)
  @Type(() => Number)
  amountOriginal: number;

  @IsOptional() @IsNumber() @Min(0.000001)
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  amountBase?: number;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  projectName?: string;

  @IsOptional() @IsDateString()
  expenseDate?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsArray()
  attachmentUrls?: string[];

  @IsOptional() @IsString()
  remark?: string;
}

export class UpdateExpenseRequestDto {
  @IsOptional() @IsString()
  expenseType?: string;

  @IsOptional() @IsString()
  currencyCode?: string;

  @IsOptional() @IsNumber() @Min(0.01)
  @Type(() => Number)
  amountOriginal?: number;

  @IsOptional() @IsNumber() @Min(0.000001)
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  amountBase?: number;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  projectName?: string;

  @IsOptional() @IsDateString()
  expenseDate?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsArray()
  attachmentUrls?: string[];

  @IsOptional() @IsString()
  remark?: string;
}

export class QueryExpenseRequestDto {
  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsString()
  expenseType?: string;

  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  keyword?: string;

  @IsOptional() @IsString()
  dateFrom?: string;

  @IsOptional() @IsString()
  dateTo?: string;

  @IsOptional() @Type(() => Number) @IsNumber()
  page?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  pageSize?: number;
}

export class SubmitExpenseRequestDto {
  @IsOptional() @IsString()
  remark?: string;
}

export class CancelExpenseRequestDto {
  @IsOptional() @IsString()
  remark?: string;
}

// ── 报销 DTO ──────────────────────────────────────────────────────────────────

export class QueryReimbursementDto {
  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  expenseRequestId?: string;

  @IsOptional() @Type(() => Number) @IsNumber()
  page?: number;

  @IsOptional() @Type(() => Number) @IsNumber()
  pageSize?: number;
}

export class SubmitReimbursementDto {
  @IsOptional() @IsString()
  remark?: string;
}

export class ApproveReimbursementDto {
  @IsOptional() @IsString()
  remark?: string;
}

export class PayReimbursementDto {
  @IsString() @IsNotEmpty()
  cashAccountId: string;

  @IsOptional() @IsString()
  remark?: string;
}

export class CancelReimbursementDto {
  @IsOptional() @IsString()
  remark?: string;
}
