import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class QuerySupplierDto {
  @IsOptional() @IsString() ownerCompanyCode?: string;
  @IsOptional() @IsString() ownerProjectCode?: string;
  @IsOptional() @IsString() supplierCode?: string;
  @IsOptional() @IsString() supplierName?: string;
  @IsOptional() @IsString() supplierType?: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsOptional() @IsString() defaultCurrency?: string;
  @IsOptional() @IsString() sharedScope?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @Type(() => Number) page?: number;
  @IsOptional() @Type(() => Number) pageSize?: number;
}
