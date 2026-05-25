import { IsString, IsOptional, IsNumber, IsPositive, Min } from 'class-validator';

export class PaymentAllocationDto {
  @IsOptional()
  @IsString()
  poId?: string;

  @IsOptional()
  @IsString()
  poNo?: string;

  @IsOptional()
  @IsString()
  apId?: string;

  @IsOptional()
  @IsString()
  apNo?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  companyCode?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  projectCode?: string;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsNumber()
  @IsPositive()
  allocatedAmountOriginal: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  allocatedAmountBase?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}
