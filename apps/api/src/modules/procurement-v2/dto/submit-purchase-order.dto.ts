import { IsOptional, IsString } from 'class-validator';

export class SubmitPurchaseOrderDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
