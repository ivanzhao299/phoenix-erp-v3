import {
  IsString, IsOptional, IsNumber, IsBoolean, IsIn, IsInt,
} from 'class-validator';

const PROJECT_TYPES = ['LAYER_FARM','BROILER_FARM','SLAUGHTER','FOOD_FACTORY','ORGANIC_FERTILIZER','OTHER'];
const CAPITAL_STATUS = ['PAID_IN_FULL','PARTIALLY_PAID','PENDING_CONFIRMATION'];
const SOURCE_TYPES = ['BANK_TRANSFER','CASH','DIVIDEND_OFFSET','SHAREHOLDER_ADVANCE','OTHER'];
const SCOPE_TYPES = ['GROUP','BU','COMPANY','SITE','PROJECT'];

export class CreateProjectDto {
  @IsString() projectCode: string;
  @IsString() projectName: string;
  @IsOptional() @IsString() companyCode?: string;
  @IsOptional() @IsString() siteCode?: string;
  @IsOptional() @IsIn(PROJECT_TYPES) projectType?: string;
  @IsOptional() @IsIn(CAPITAL_STATUS) capitalStatus?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remark?: string;
}
export class UpdateProjectDto {
  @IsOptional() @IsString() projectName?: string;
  @IsOptional() @IsString() companyCode?: string;
  @IsOptional() @IsString() siteCode?: string;
  @IsOptional() @IsIn(PROJECT_TYPES) projectType?: string;
  @IsOptional() @IsIn(CAPITAL_STATUS) capitalStatus?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remark?: string;
}

export class CreateShareholderDto {
  @IsString() shareholderCode: string;
  @IsString() shareholderName: string;
  @IsOptional() @IsInt() linkedUserId?: number;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() idNoMasked?: string;
  @IsOptional() @IsString() remark?: string;
}
export class UpdateShareholderDto {
  @IsOptional() @IsString() shareholderName?: string;
  @IsOptional() @IsInt() linkedUserId?: number;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remark?: string;
}

export class CreateEquityDto {
  @IsString() projectCode: string;
  @IsString() shareholderCode: string;
  @IsNumber() equityRatio: number;
  @IsOptional() @IsNumber() subscribedCapital?: number;
  @IsOptional() @IsNumber() paidInCapital?: number;
  @IsOptional() @IsIn(CAPITAL_STATUS) capitalStatus?: string;
  @IsOptional() @IsBoolean() isVotingShareholder?: boolean;
  @IsOptional() @IsString() remark?: string;
}
export class UpdateEquityDto {
  @IsOptional() @IsNumber() equityRatio?: number;
  @IsOptional() @IsNumber() subscribedCapital?: number;
  @IsOptional() @IsNumber() paidInCapital?: number;
  @IsOptional() @IsIn(CAPITAL_STATUS) capitalStatus?: string;
  @IsOptional() @IsBoolean() isVotingShareholder?: boolean;
  @IsOptional() @IsString() remark?: string;
}

export class CreateContributionDto {
  @IsString() projectCode: string;
  @IsString() shareholderCode: string;
  @IsNumber() amount: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() contributionDate?: string;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsIn(SOURCE_TYPES) sourceType?: string;
  @IsOptional() @IsString() sourceReference?: string;
  @IsOptional() @IsString() bankAccount?: string;
  @IsOptional() @IsString() remark?: string;
}

export class CreateScopeDto {
  @IsInt() userId: number;
  @IsOptional() @IsString() shareholderCode?: string;
  @IsIn(SCOPE_TYPES) scopeType: string;
  @IsOptional() @IsString() scopeCode?: string;
  @IsOptional() @IsString() projectCode?: string;
  @IsOptional() @IsBoolean() canViewFinance?: boolean;
  @IsOptional() @IsBoolean() canViewOperation?: boolean;
  @IsOptional() @IsBoolean() canViewDividend?: boolean;
  @IsOptional() @IsBoolean() canApprove?: boolean;
}
