import { IsString, MinLength } from 'class-validator';

/** 拒绝采购申请 DTO（拒绝原因必填） */
export class RejectPurchaseRequestDto {
  @IsString()
  @MinLength(1, { message: '拒绝原因不能为空' })
  comment: string;
}
