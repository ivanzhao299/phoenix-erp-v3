import { IsInt, Min, IsOptional, IsString } from 'class-validator';

/** 批准采购申请 DTO */
export class ApprovePurchaseRequestDto {
  @IsOptional()
  @IsString()
  comment?: string;
  @IsOptional() @IsInt() @Min(1) expectedStepNo?: number;
}
