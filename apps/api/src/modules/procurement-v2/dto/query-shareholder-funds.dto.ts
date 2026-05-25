import { IsOptional, IsString, IsNumberString, IsDateString } from 'class-validator';
export class QueryShareholderFundsDto {
  @IsOptional() @IsString()       shareholderId?:  string;
  @IsOptional() @IsString()       companyCode?:    string;
  @IsOptional() @IsString()       projectCode?:    string;
  @IsOptional() @IsString()       fundNature?:     string;
  @IsOptional() @IsDateString()   dateFrom?:       string;
  @IsOptional() @IsDateString()   dateTo?:         string;
  @IsOptional() @IsString()       currencyCode?:   string;
  @IsOptional() @IsNumberString() page?:           string;
  @IsOptional() @IsNumberString() pageSize?:       string;
}
