import {
  IsString, IsOptional, IsInt, Min, MaxLength, IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 允许更新的字段；id / supplier_code 禁止更新 */
export class UpdateSupplierDto {
  @IsOptional() @IsString() @MaxLength(256) supplierName?: string;
  @IsOptional() @IsString() @MaxLength(8)   countryCode?: string;
  @IsOptional() @IsString()                 supplierType?: string;
  @IsOptional() @IsString() @MaxLength(8)   defaultCurrency?: string;
  @IsOptional() @IsString() @MaxLength(64)  contactName?: string;
  @IsOptional() @IsString() @MaxLength(32)  contactPhone?: string;
  @IsOptional() @IsEmail()  @MaxLength(128) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(128) bankName?: string;
  @IsOptional() @IsString() @MaxLength(128) bankAccountName?: string;
  @IsOptional() @IsString() @MaxLength(64)  bankAccountNo?: string;
  @IsOptional() @IsString() @MaxLength(64)  taxNo?: string;
  @IsOptional() @IsString()                 address?: string;
  @IsOptional() @IsString()                 status?: string;
  @IsOptional() @IsString()                 remark?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditDays?: number;
}
