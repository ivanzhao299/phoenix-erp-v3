import { IsOptional, IsString } from 'class-validator';

export class QueryInitBatchDto {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
  @IsOptional() @IsString() batchType?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() keyword?: string;
}
