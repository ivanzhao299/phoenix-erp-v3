import {
  IsString, IsOptional, IsNumber, IsIn, Min, IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

// ══════════════════════════════════════════════════════════════════════════════
// 出资 DTOs
// ══════════════════════════════════════════════════════════════════════════════

export class CreateShareholderContributionDto {
  @IsOptional() @IsString()
  shareholderCode?: string;

  @IsNotEmpty() @IsString()
  shareholderName: string;

  @IsNotEmpty() @IsString()
  companyCode: string;

  @IsOptional() @IsString()
  companyName?: string;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  projectName?: string;

  @IsNotEmpty()
  @IsIn(['INVESTMENT', 'LOAN', 'ADVANCE', 'GUARANTEE', 'PAYMENT_ON_BEHALF'])
  contributionType: string;

  @IsOptional() @IsString()
  fundNature?: string;

  @IsNotEmpty() @IsString()
  currencyCode: string;

  @IsNumber() @Min(0.01) @Type(() => Number)
  amountOriginal: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  exchangeRate?: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  amountBase?: number;

  @IsOptional() @IsString()
  expectedReturnDate?: string;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  interestRate?: number;

  @IsOptional() @IsString()
  cashAccountId?: string;

  @IsOptional() @IsString()
  remark?: string;
}

export class UpdateShareholderContributionDto {
  @IsOptional() @IsString()
  shareholderCode?: string;

  @IsOptional() @IsString()
  shareholderName?: string;

  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  companyName?: string;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  projectName?: string;

  @IsOptional()
  @IsIn(['INVESTMENT', 'LOAN', 'ADVANCE', 'GUARANTEE', 'PAYMENT_ON_BEHALF'])
  contributionType?: string;

  @IsOptional() @IsString()
  fundNature?: string;

  @IsOptional() @IsString()
  currencyCode?: string;

  @IsOptional() @IsNumber() @Min(0.01) @Type(() => Number)
  amountOriginal?: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  exchangeRate?: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  amountBase?: number;

  @IsOptional() @IsString()
  expectedReturnDate?: string;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  interestRate?: number;

  @IsOptional() @IsString()
  cashAccountId?: string;

  @IsOptional() @IsString()
  remark?: string;
}

export class QueryShareholderContributionDto {
  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  shareholderCode?: string;

  @IsOptional()
  @IsIn(['INVESTMENT', 'LOAN', 'ADVANCE', 'GUARANTEE', 'PAYMENT_ON_BEHALF'])
  contributionType?: string;

  // PENDING 是「待处理」聚合筛选关键字（非真实状态）——service.list 会展开成
  // status IN ('DRAFT','PENDING_CONFIRM')。必须在白名单内，否则 ValidationPipe
  // 会把前端"待处理"卡片/筛选发来的 status=PENDING 拦成 400，导致列表空白。
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_CONFIRM', 'CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED', 'PENDING'])
  status?: string;

  @IsOptional() @IsString()
  keyword?: string;

  @IsOptional() @IsString()
  dateFrom?: string;

  @IsOptional() @IsString()
  dateTo?: string;

  @IsOptional() @IsNumber() @Min(1) @Type(() => Number)
  page?: number;

  @IsOptional() @IsNumber() @Min(1) @Type(() => Number)
  pageSize?: number;
}

export class ConfirmShareholderContributionDto {
  @IsOptional() @IsString()
  remark?: string;
}

export class CancelShareholderContributionDto {
  @IsOptional() @IsString()
  reason?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// 还款/核销 DTOs
// ══════════════════════════════════════════════════════════════════════════════

export class CreateShareholderSettlementDto {
  @IsNotEmpty() @IsString()
  contributionId: string;

  @IsNotEmpty()
  @IsIn(['RETURN', 'OFFSET', 'TRANSFER', 'WRITE_OFF'])
  settlementType: string;

  @IsNotEmpty() @IsString()
  currencyCode: string;

  @IsNumber() @Min(0.01) @Type(() => Number)
  amountOriginal: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  exchangeRate?: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  amountBase?: number;

  /** RETURN 类型时必填 */
  @IsOptional() @IsString()
  cashAccountId?: string;

  @IsOptional() @IsString()
  remark?: string;
}

export class QueryShareholderSettlementDto {
  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  contributionId?: string;

  @IsOptional() @IsString()
  shareholderCode?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SETTLED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsIn(['RETURN', 'OFFSET', 'TRANSFER', 'WRITE_OFF'])
  settlementType?: string;

  @IsOptional() @IsNumber() @Min(1) @Type(() => Number)
  page?: number;

  @IsOptional() @IsNumber() @Min(1) @Type(() => Number)
  pageSize?: number;
}

export class SubmitShareholderSettlementDto {
  @IsOptional() @IsString()
  remark?: string;
}

export class ApproveShareholderSettlementDto {
  @IsOptional() @IsString()
  remark?: string;
}

export class CancelShareholderSettlementDto {
  @IsOptional() @IsString()
  reason?: string;
}
