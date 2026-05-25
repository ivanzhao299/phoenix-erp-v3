import { IsNotEmpty, IsString, IsIn, IsOptional } from 'class-validator';

export const INIT_BATCH_TYPES = [
  'HISTORICAL_PO',
  'HISTORICAL_PAYMENT',
  'HISTORICAL_SHAREHOLDER_FUND',
  'HISTORICAL_RECEIPT',
] as const;

export type InitBatchType = typeof INIT_BATCH_TYPES[number];

export class UploadInitFileDto {
  @IsNotEmpty() @IsString()
  @IsIn(INIT_BATCH_TYPES)
  batchType: InitBatchType;

  @IsOptional() @IsString() remark?: string;
}
