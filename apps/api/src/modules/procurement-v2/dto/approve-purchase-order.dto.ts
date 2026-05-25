import { IsOptional, IsString } from 'class-validator';

export class ApprovePurchaseOrderDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
