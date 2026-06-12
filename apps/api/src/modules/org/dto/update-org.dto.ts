import { IsString, IsOptional, IsIn, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

// G88：与 CreateOrgDto 对齐（原缺 BU/SITE——编辑事业群/场站节点 orgType 校验整单 400）
const ORG_TYPES = [
  'GROUP', 'BU', 'COMPANY', 'SITE',
  'FACTORY', 'PROJECT', 'WAREHOUSE', 'STORE', 'DEPARTMENT',
] as const;
const ORG_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

export class UpdateOrgDto {
  @IsOptional()
  @IsString()
  orgName?: string;

  @IsOptional()
  @IsIn(ORG_TYPES)
  orgType?: (typeof ORG_TYPES)[number];

  @IsOptional()
  @IsIn(ORG_STATUSES)
  status?: string;

  /** G88：变更上级（按 orgCode）。service 解析为 parentId 并重算子树 level/path/company_code，防成环。
   *  原 DTO 缺此字段 → 全局 ValidationPipe whitelist 直接剥离 → "改上级保存无变化"的根因。 */
  @IsOptional()
  @IsString()
  parentCode?: string;

  @IsOptional()
  @IsString()
  orgShortName?: string;

  @IsOptional()
  @IsString()
  orgNameCn?: string;

  @IsOptional()
  @IsString()
  siteBusinessType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

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
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
