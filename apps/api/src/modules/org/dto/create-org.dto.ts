import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

const ORG_TYPES = ['GROUP','COMPANY','FACTORY','PROJECT','WAREHOUSE','STORE','DEPARTMENT'] as const;

export class CreateOrgDto {
  @IsString()
  @IsNotEmpty()
  orgCode: string;

  @IsString()
  @IsNotEmpty()
  orgName: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  parentId?: number;

  @IsIn(ORG_TYPES)
  orgType: 'GROUP' | 'COMPANY' | 'FACTORY' | 'PROJECT' | 'WAREHOUSE' | 'STORE' | 'DEPARTMENT';

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
