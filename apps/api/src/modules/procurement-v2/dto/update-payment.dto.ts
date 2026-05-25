import {
  IsString, IsOptional, IsBoolean, IsDateString,
  IsNumber, IsPositive, Min, IsEnum, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentAllocationDto } from './payment-allocation.dto';
import { PayerType, PaymentMethod, FundNature } from './create-payment.dto';

export class UpdatePaymentDto {
  @IsOptional() @IsDateString()        paymentDate?:  string;
  @IsOptional() @IsString()            companyCode?:  string;
  @IsOptional() @IsString()            companyName?:  string;
  @IsOptional() @IsString()            companyId?:    string;
  @IsOptional() @IsString()            projectId?:    string;
  @IsOptional() @IsString()            projectCode?:  string;
  @IsOptional() @IsString()            projectName?:  string;
  @IsOptional() @IsEnum(PayerType)     payerType?:    PayerType;
  @IsOptional() @IsString()            payerId?:      string;
  @IsOptional() @IsString()            payerName?:    string;
  @IsOptional() @IsString()            payerAccount?: string;
  @IsOptional() @IsString()            payeeType?:    string;
  @IsOptional() @IsString()            payeeId?:      string;
  @IsOptional() @IsString()            payeeName?:    string;
  @IsOptional() @IsString()            payeeAccount?: string;
  @IsOptional() @IsString()            currencyCode?: string;
  @IsOptional() @IsNumber() @IsPositive() amountOriginal?: number;
  @IsOptional() @IsNumber() @Min(0)    exchangeRate?:  number;
  @IsOptional() @IsNumber() @Min(0)    amountBase?:    number;
  @IsOptional() @IsString()            baseCurrency?:  string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @IsEnum(FundNature)    fundNature?:    FundNature;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isShareholderPayment?: boolean;
  @IsOptional() @IsString() shareholderId?:   string;
  @IsOptional() @IsString() shareholderName?: string;
  @IsOptional() @IsString() voucherUrl?: string;
  @IsOptional() @IsString() remark?:     string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  @ArrayMinSize(1)
  allocations?: PaymentAllocationDto[];
}
