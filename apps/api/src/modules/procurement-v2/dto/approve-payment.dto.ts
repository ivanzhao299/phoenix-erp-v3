import { IsOptional, IsString } from 'class-validator';
export class ApprovePaymentDto {
  @IsOptional() @IsString() comment?: string;
}
