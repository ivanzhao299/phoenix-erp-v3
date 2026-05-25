import { IsOptional, IsString } from 'class-validator';
export class PayPaymentDto {
  @IsOptional() @IsString() comment?: string;
}
