import { IsInt, Min, IsOptional, IsString, MinLength } from 'class-validator';

/** 拒绝必须填写原因 */
export class RejectPurchaseOrderDto {
  @IsString()
  @MinLength(1, { message: '拒绝原因不能为空' })
  comment: string;
  @IsOptional() @IsInt() @Min(1) expectedStepNo?: number;
}
