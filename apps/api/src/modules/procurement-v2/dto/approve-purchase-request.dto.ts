import { IsOptional, IsString } from 'class-validator';

/** 批准采购申请 DTO */
export class ApprovePurchaseRequestDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
