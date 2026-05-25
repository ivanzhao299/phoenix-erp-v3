import {
  IsString, IsOptional, IsEnum, IsDateString, MaxLength,
} from 'class-validator';

export enum ProjectType {
  PRODUCTION   = 'PRODUCTION',
  CONSTRUCTION = 'CONSTRUCTION',
  EQUIPMENT    = 'EQUIPMENT',
  OPERATIONS   = 'OPERATIONS',
  INIT         = 'INIT',
  OTHER        = 'OTHER',
}

export class CreateProjectDto {
  /** 归属公司代码（必填） */
  @IsString()
  @MaxLength(64)
  companyCode: string;

  /** 归属公司名称快照（必填） */
  @IsString()
  @MaxLength(256)
  companyName: string;

  /** 归属公司ID（可选，供未来关联公司主档） */
  @IsOptional()
  @IsString()
  companyId?: string;

  /** 项目编号（同公司下唯一） */
  @IsString()
  @MaxLength(64)
  projectCode: string;

  @IsString()
  @MaxLength(256)
  projectName: string;

  @IsOptional()
  @IsEnum(ProjectType)
  projectType?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
