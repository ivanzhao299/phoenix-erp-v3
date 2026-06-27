import { IsOptional, IsString } from 'class-validator';
export class SubmitPaymentDto {
  @IsOptional() @IsString() comment?: string;

  @IsOptional() @IsString() approverUserId?: string;
}
