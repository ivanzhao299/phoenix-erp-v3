import { IsOptional, IsString } from 'class-validator';

export class ConfirmReceiptDto {
  @IsOptional() @IsString() comment?: string;
}
