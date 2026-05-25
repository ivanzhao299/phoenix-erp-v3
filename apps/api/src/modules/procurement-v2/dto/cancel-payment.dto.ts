import { IsOptional, IsString } from 'class-validator';
export class CancelPaymentDto {
  @IsOptional() @IsString() comment?: string;
}
