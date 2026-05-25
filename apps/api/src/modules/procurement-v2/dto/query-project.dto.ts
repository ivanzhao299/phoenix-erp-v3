import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryProjectDto {
  @IsOptional() @IsString() companyCode?: string;
  @IsOptional() @IsString() projectCode?: string;
  @IsOptional() @IsString() projectName?: string;
  @IsOptional() @IsString() projectType?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() keyword?: string;

  @IsOptional() @Type(() => Number) page?: number;
  @IsOptional() @Type(() => Number) pageSize?: number;
}
