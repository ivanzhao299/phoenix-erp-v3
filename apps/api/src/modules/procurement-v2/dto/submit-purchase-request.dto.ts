import { IsOptional, IsString } from 'class-validator';

/** 提交审批 DTO（字段可全为空） */
export class SubmitPurchaseRequestDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
