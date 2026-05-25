import { IsOptional, IsString } from 'class-validator';

/** 取消采购申请 DTO */
export class CancelPurchaseRequestDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
