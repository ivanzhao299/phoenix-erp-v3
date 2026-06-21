import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const STORE_PAYMENT_ACCOUNT_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export const STORE_PAYMENT_RECORD_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'VOIDED'] as const;

export class CreateStorePaymentAccountDto {
  @IsString()
  @MaxLength(64)
  accountCode: string;

  @IsString()
  @MaxLength(160)
  accountName: string;

  @IsString()
  @MaxLength(64)
  companyCode: string;

  @IsString()
  @MaxLength(64)
  storeCode: string;

  @IsOptional()
  @IsString()
  finCashAccountId?: string;

  @IsString()
  @MaxLength(16)
  currency: string;

  @IsString()
  @MaxLength(64)
  paymentMethod: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  qrAttachmentId?: string;

  @IsOptional()
  @IsString()
  @IsIn(STORE_PAYMENT_ACCOUNT_STATUSES)
  status?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateStorePaymentAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  accountName?: string;

  @IsOptional()
  @IsString()
  finCashAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  qrAttachmentId?: string;

  @IsOptional()
  @IsString()
  @IsIn(STORE_PAYMENT_ACCOUNT_STATUSES)
  status?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class QueryStorePaymentAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  companyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  storeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @IsIn(STORE_PAYMENT_ACCOUNT_STATUSES)
  status?: string;

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
  pageSize?: number;
}

export class CreateStorePaymentRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentNo?: string;

  @IsString()
  @MaxLength(64)
  storeCode: string;

  @IsString()
  @MaxLength(64)
  companyCode: string;

  @IsString()
  paymentAccountId: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @IsString()
  @MaxLength(16)
  currency: string;

  @IsString()
  @MaxLength(64)
  paymentMethod: string;

  @IsDateString()
  paidAt: string;

  @IsString()
  @MaxLength(255)
  proofAttachmentId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  saleNo?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class QueryStorePaymentRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  storeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  companyCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(STORE_PAYMENT_RECORD_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  submittedBy?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;
}

export class TransitionStorePaymentRecordDto {
  @IsOptional()
  @IsString()
  @IsIn(STORE_PAYMENT_RECORD_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ConfirmStorePaymentRecordDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectStorePaymentRecordDto {
  @IsString()
  reason: string;
}

export class VoidStorePaymentRecordDto {
  @IsString()
  reason: string;
}
