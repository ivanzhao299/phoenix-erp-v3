import { IsString, IsOptional, IsNumber, IsDateString, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

// ── 创建手工 AR ────────────────────────────────────────────────────────────

export class CreateArInvoiceDto {
  @IsString()
  companyCode: string;

  @IsOptional() @IsString()
  companyName?: string;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  projectName?: string;

  @IsOptional() @IsString()
  customerId?: string;

  @IsOptional() @IsString()
  customerCode?: string;

  @IsString()
  customerName: string;

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

  @IsOptional() @IsString()
  remark?: string;
}

// ── 更新 AR（仅 OPEN / PARTIALLY_RECEIVED 可编辑）─────────────────────────

export class UpdateArInvoiceDto {
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

  @IsOptional() @IsString()
  customerName?: string;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  projectName?: string;

  @IsOptional() @IsString()
  remark?: string;
}

// ── 取消 AR ───────────────────────────────────────────────────────────────

export class CancelArInvoiceDto {
  @IsOptional() @IsString()
  reason?: string;
}

// ── 查询筛选 ──────────────────────────────────────────────────────────────

export class QueryArInvoiceDto {
  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  customerCode?: string;

  @IsOptional() @IsString()
  @IsIn(['OPEN','PARTIALLY_RECEIVED','RECEIVED','OVERDUE','DISPUTED','WRITTEN_OFF','CANCELLED'])
  status?: string;

  @IsOptional() @IsString()
  @IsIn(['UNRECEIVED','PARTIAL','RECEIVED'])
  collectionStatus?: string;

  @IsOptional() @IsString()
  currencyCode?: string;

  @IsOptional() @IsString()
  @IsIn(['SALES_ORDER','SALES_RETURN','STORE_SALE','STORE_SALE_RETURN','MANUAL','CONTRACT','OPENING'])
  sourceType?: string;

  @IsOptional() @IsDateString()
  dateFrom?: string;

  @IsOptional() @IsDateString()
  dateTo?: string;

  /** 搜索 ar_no / customer_name / invoice_no */
  @IsOptional() @IsString()
  keyword?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  pageSize?: number;
}
