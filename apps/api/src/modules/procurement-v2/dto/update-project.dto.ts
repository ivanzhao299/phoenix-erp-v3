import {
  IsString, IsOptional, IsEnum, IsDateString, MaxLength,
} from 'class-validator';

export enum ProjectStatus {
  ACTIVE   = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CLOSED   = 'CLOSED',
}

export class UpdateProjectDto {
  /** 允许更新的字段；id / company_code / project_code 禁止更新 */

  @IsOptional()
  @IsString()
  @MaxLength(256)
  projectName?: string;

  @IsOptional()
  @IsString()
  projectType?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: string;

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
