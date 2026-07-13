import { IsString, IsOptional, IsNumber, IsDateString, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

// ── 创建手工 AP ────────────────────────────────────────────────────────────

export class CreateApInvoiceDto {
  @IsString()
  companyCode: string;

  @IsOptional() @IsString()
  companyName?: string;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  projectName?: string;

  @IsOptional() @IsString()
  supplierId?: string;

  @IsOptional() @IsString()
  supplierCode?: string;

  @IsString()
  supplierName: string;

  @IsOptional() @IsString()
  invoiceNo?: string;

  @IsOptional() @IsDateString()
  invoiceDate?: string;

  @IsOptional() @IsDateString()
  dueDate?: string;

  @IsString()
  currencyCode: string;

  @IsNumber() @Min(0)
  @Type(() => Number)
  amountOriginal: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  amountBase?: number;

  @IsOptional() @IsString()
  baseCurrency?: string;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  taxAmount?: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  taxRate?: number;

  @IsOptional() @IsString()
  remark?: string;
}

// ── 更新 AP（仅 OPEN/PARTIALLY_PAID 可编辑）─────────────────────────────────

export class UpdateApInvoiceDto {
  @IsOptional() @IsString()
  invoiceNo?: string;

  @IsOptional() @IsDateString()
  invoiceDate?: string;

  @IsOptional() @IsDateString()
  dueDate?: string;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  amountOriginal?: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  taxAmount?: number;

  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  taxRate?: number;

  @IsOptional() @IsString()
  supplierName?: string;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  projectName?: string;

  @IsOptional() @IsString()
  remark?: string;
}

// ── 取消 AP ───────────────────────────────────────────────────────────────

export class CancelApInvoiceDto {
  @IsOptional() @IsString()
  reason?: string;
}

// ── AP 付款核销 ───────────────────────────────────────────────────────────

export class PayApInvoiceDto {
  @IsString()
  cashAccountId: string;

  @IsDateString()
  paymentDate: string;

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
  baseCurrency?: string;

  @IsOptional() @IsString()
  paymentMethod?: string;

  @IsOptional() @IsString()
  referenceNo?: string;

  @IsOptional() @IsString()
  remark?: string;
}

// ── 查询筛选 ──────────────────────────────────────────────────────────────

export class QueryApInvoiceDto {
  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  supplierCode?: string;

  @IsOptional() @IsString()
  @IsIn(['OPEN','PARTIALLY_PAID','PAID','DISPUTED','CANCELLED'])
  status?: string;

  @IsOptional() @IsString()
  @IsIn(['UNPAID','PARTIAL','PAID'])
  paymentStatus?: string;

  @IsOptional() @IsString()
  currencyCode?: string;

  @IsOptional() @IsString()
  @IsIn(['PO','MANUAL','EXPENSE','REIMBURSEMENT','OPENING'])
  sourceType?: string;

  @IsOptional() @IsDateString()
  dateFrom?: string;

  @IsOptional() @IsDateString()
  dateTo?: string;

  /** 搜索 ap_no / supplier_name / invoice_no */
  @IsOptional() @IsString()
  keyword?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  pageSize?: number;
}
