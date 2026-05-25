import { IsString, IsOptional, IsIn } from 'class-validator';

const ORG_TYPES = ['GROUP','COMPANY','FACTORY','PROJECT','WAREHOUSE','STORE','DEPARTMENT'] as const;
const ORG_STATUSES = ['ACTIVE','INACTIVE','ARCHIVED'] as const;

export class UpdateOrgDto {
  @IsOptional()
  @IsString()
  orgName?: string;

  @IsOptional()
  @IsIn(ORG_TYPES)
  orgType?: 'GROUP' | 'COMPANY' | 'FACTORY' | 'PROJECT' | 'WAREHOUSE' | 'STORE' | 'DEPARTMENT';

  @IsOptional()
  @IsIn(ORG_STATUSES)
  status?: string;

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
  remark?: string;
}
