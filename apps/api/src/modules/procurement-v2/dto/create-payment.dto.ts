import {
  IsString, IsOptional, IsBoolean, IsDateString,
  IsNumber, IsPositive, Min, IsEnum, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentAllocationDto } from './payment-allocation.dto';

export enum PayerType {
  COMPANY     = 'COMPANY',
  SHAREHOLDER = 'SHAREHOLDER',
  BORROW      = 'BORROW',
  INTERNAL    = 'INTERNAL',
}

export enum PaymentMethod {
  BANK     = 'BANK',
  CASH     = 'CASH',
  TRANSFER = 'TRANSFER',
  ALIPAY   = 'ALIPAY',
  WECHAT   = 'WECHAT',
}

export enum FundNature {
  INVESTMENT = 'INVESTMENT',
  LOAN       = 'LOAN',
  ADVANCE    = 'ADVANCE',
  NORMAL     = 'NORMAL',
}

export class CreatePaymentDto {
  @IsDateString()
  paymentDate: string;

  @IsOptional() @IsString() companyId?:   string;
  @IsOptional() @IsString() companyCode?: string;
  @IsOptional() @IsString() companyName?: string;

  @IsOptional() @IsString() projectId?:   string;
  @IsOptional() @IsString() projectCode?: string;
  @IsOptional() @IsString() projectName?: string;

  @IsEnum(PayerType)
  payerType: PayerType;

  @IsOptional() @IsString() payerId?:      string;
  @IsString()               payerName:     string;
  @IsOptional() @IsString() payerAccount?: string;

  @IsOptional() @IsString() payeeType?:    string;
  @IsOptional() @IsString() payeeId?:      string;
  @IsOptional() @IsString() payeeName?:    string;
  @IsOptional() @IsString() payeeAccount?: string;

  @IsString()
  currencyCode: string;

  // G143：amountOriginal 不再必填——付款总金额由后端从各分摊金额合计派生（service.create 用
  //   sumAllocations 的 totalOriginal，根本不读 dto.amountOriginal）。原 @IsPositive 必填使前端
  //   未传（旧缓存）时在校验层就被拦，报"金额必须大于 0、必须是数字"。改可选，单一真相=分摊明细。
  @IsOptional() @IsNumber() @IsPositive()
  amountOriginal?: number;

  @IsNumber() @Min(0)
  exchangeRate: number;

  @IsOptional() @IsNumber() @Min(0)
  amountBase?: number;

  @IsOptional() @IsString()
  baseCurrency?: string;

  @IsOptional() @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional() @IsEnum(FundNature)
  fundNature?: FundNature;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isShareholderPayment?: boolean;

  @IsOptional() @IsString() shareholderId?:   string;
  @IsOptional() @IsString() shareholderName?: string;

  @IsOptional() @IsString() voucherUrl?: string;
  @IsOptional() @IsString() remark?:     string;

  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  @ArrayMinSize(1)
  allocations: PaymentAllocationDto[];
}
