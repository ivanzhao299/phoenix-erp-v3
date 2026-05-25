import { IsOptional, IsString, IsIn } from 'class-validator';

export class QueryDashboardDto {
  @IsOptional() @IsString() companyCode?: string;
  @IsOptional() @IsString() projectCode?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() supplierCode?: string;
  @IsOptional() @IsString() @IsIn(['day', 'month']) groupBy?: string;
}
