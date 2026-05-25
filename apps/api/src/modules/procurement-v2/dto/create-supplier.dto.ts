import {
  IsString, IsOptional, IsEnum, IsNumber, MaxLength, ValidateIf, IsEmail, IsInt, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SharedScope {
  GROUP   = 'GROUP',
  COMPANY = 'COMPANY',
  PROJECT = 'PROJECT',
}

export class CreateSupplierDto {
  @IsString()
  @MaxLength(64)
  supplierCode: string;

  @IsString()
  @MaxLength(256)
  supplierName: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  supplierNameEn?: string;

  @IsString()
  @MaxLength(8)
  countryCode: string;

  @IsOptional()
  @IsString()
  supplierType?: string;

  @IsString()
  @MaxLength(8)
  defaultCurrency: string;

  @IsEnum(SharedScope, { message: 'sharedScope 必须为 GROUP / COMPANY / PROJECT' })
  sharedScope: string;

  // ── 仅 shared_scope = COMPANY 或 PROJECT 时必填 ──────────────────────────
  @ValidateIf(o => o.sharedScope === 'COMPANY' || o.sharedScope === 'PROJECT')
  @IsString()
  @MaxLength(64)
  ownerCompanyCode: string;

  @ValidateIf(o => o.sharedScope === 'COMPANY' || o.sharedScope === 'PROJECT')
  @IsString()
  @MaxLength(256)
  ownerCompanyName: string;

  @IsOptional()
  @IsString()
  ownerCompanyId?: string;

  // ── 仅 shared_scope = PROJECT 时必填 ────────────────────────────────────
  @ValidateIf(o => o.sharedScope === 'PROJECT')
  @IsString()
  @MaxLength(64)
  ownerProjectCode: string;

  @ValidateIf(o => o.sharedScope === 'PROJECT')
  @IsString()
  @MaxLength(256)
  ownerProjectName: string;

  @IsOptional()
  @IsString()
  ownerProjectId?: string;

  // ── 联系信息（可选） ─────────────────────────────────────────────────────
  @IsOptional() @IsString() @MaxLength(64)  contactName?: string;
  @IsOptional() @IsString() @MaxLength(32)  contactPhone?: string;
  @IsOptional() @IsEmail()  @MaxLength(128) contactEmail?: string;

  // ── 银行信息（可选） ─────────────────────────────────────────────────────
  @IsOptional() @IsString() @MaxLength(128) bankName?: string;
  @IsOptional() @IsString() @MaxLength(128) bankAccountName?: string;
  @IsOptional() @IsString() @MaxLength(64)  bankAccountNo?: string;
  @IsOptional() @IsString() @MaxLength(32)  bankSwift?: string;
  @IsOptional() @IsString() @MaxLength(64)  taxNo?: string;
  @IsOptional() @IsString()                 address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditDays?: number;

  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() remark?: string;
}
