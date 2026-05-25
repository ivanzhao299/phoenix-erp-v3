import { IsOptional, IsString, IsNumberString, IsDateString } from 'class-validator';

export class QueryPaymentDto {
  @IsOptional() @IsString()       companyCode?:     string;
  @IsOptional() @IsString()       projectCode?:     string;
  @IsOptional() @IsString()       payerType?:       string;
  @IsOptional() @IsString()       shareholderId?:   string;
  @IsOptional() @IsString()       status?:          string;
  @IsOptional() @IsString()       currencyCode?:    string;
  @IsOptional() @IsDateString()   paymentDateFrom?: string;
  @IsOptional() @IsDateString()   paymentDateTo?:   string;
  @IsOptional() @IsString()       keyword?:         string;
  @IsOptional() @IsNumberString() page?:            string;
  @IsOptional() @IsNumberString() pageSize?:        string;
}
