import { IsOptional, IsString } from 'class-validator';

export class CancelReceiptDto {
  @IsOptional() @IsString() comment?: string;
}
