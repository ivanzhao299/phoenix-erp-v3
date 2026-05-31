import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

const ORG_TYPES = [
  'GROUP', 'BU', 'COMPANY', 'SITE',
  'FACTORY', 'PROJECT', 'WAREHOUSE', 'STORE', 'DEPARTMENT',
] as const;

const SITE_BUSINESS_TYPES = [
  'LAYER_FARM', 'BROILER_FARM', 'SLAUGHTER', 'FEED_MILL',
  'HATCHERY', 'ORGANIC_FERTILIZER', 'STORE', 'WAREHOUSE', 'HQ', 'OTHER',
] as const;

export class CreateOrgDto {
  @IsString()
  @IsNotEmpty()
  orgCode: string;

  @IsString()
  @IsNotEmpty()
  orgName: string;

  @IsOptional()
  @IsString()
  orgNameCn?: string;

  @IsOptional()
  @IsString()
  orgShortName?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  parentId?: number;

  @IsOptional()
  @IsString()
  parentCode?: string;

  @IsIn(ORG_TYPES)
  orgType: typeof ORG_TYPES[number];

  @IsOptional()
  @IsString()
  siteCode?: string;

  @IsOptional()
  @IsIn(SITE_BUSINESS_TYPES)
  siteBusinessType?: string;

  @IsOptional()
  @IsString()
  companyCode?: string;

  @IsOptional()
  @IsString()
  projectCode?: string;

  @IsOptional()
  @IsString()
  warehouseCode?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
