import { IsInt, Min, IsOptional, IsString } from 'class-validator';
export class ApprovePaymentDto {
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsInt() @Min(1) expectedStepNo?: number;
}
