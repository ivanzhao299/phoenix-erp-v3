import { IsString, IsOptional, IsNumber, IsDateString, IsIn, IsArray, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// ── 单条核销分摊 ──────────────────────────────────────────────────────────

export class ArReceiptAllocationDto {
  /** AR 发票 ID */
  @IsString()
  arInvoiceId: string;

  /** 本次分摊金额（原币，必须 > 0，不可超过 AR 余额） */
  @IsNumber() @Min(0.01)
  @Type(() => Number)
  allocatedAmountOriginal: number;
}

// ── 创建收款草稿 ──────────────────────────────────────────────────────────

export class CreateArReceiptDto {
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

  @IsDateString()
  receiptDate: string;

  @IsString()
  currencyCode: string;

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
  receiptMethod?: string;

  @IsOptional() @IsString()
  receivedAccountCode?: string;

  @IsOptional() @IsString()
  bankRef?: string;

  @IsOptional() @IsString()
  remark?: string;

  /**
   * 可选：创建时直接附带核销分摊。
   * 若为空，收款草稿先创建，之后通过 confirm() 时统一核销。
   */
  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => ArReceiptAllocationDto)
  allocations?: ArReceiptAllocationDto[];
}

// ── 确认收款 ──────────────────────────────────────────────────────────────

export class ConfirmArReceiptDto {
  /**
   * 核销分摊列表。
   * 总分摊金额不得超过收款金额，每条 AR 分摊不得超过 AR 余额。
   */
  @IsArray() @ValidateNested({ each: true })
  @Type(() => ArReceiptAllocationDto)
  allocations: ArReceiptAllocationDto[];

  /**
   * 可选：收款入账的资金账户 ID（fin_cash_accounts.id）。
   * 若提供，确认时同步向该账户增加余额并写入 AR_RECEIPT 流水。
   */
  @IsOptional() @IsString()
  receiveAccountId?: string;
}

// ── 取消收款 ──────────────────────────────────────────────────────────────

export class CancelArReceiptDto {
  @IsOptional() @IsString()
  reason?: string;
}

// ── 查询收款 ──────────────────────────────────────────────────────────────

export class QueryArReceiptDto {
  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  customerCode?: string;

  @IsOptional() @IsString()
  @IsIn(['DRAFT','CONFIRMED','CANCELLED'])
  status?: string;

  @IsOptional() @IsDateString()
  dateFrom?: string;

  @IsOptional() @IsDateString()
  dateTo?: string;

  @IsOptional() @IsString()
  keyword?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  pageSize?: number;
}
