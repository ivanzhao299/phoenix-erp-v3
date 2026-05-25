import { IsString, IsOptional, IsNumber, Min, IsEnum } from 'class-validator';

export enum QualityStatus {
  PASS    = 'PASS',
  PARTIAL = 'PARTIAL',
  REJECT  = 'REJECT',
}

export class ReceiptItemDto {
  @IsOptional() @IsString() poItemId?: string;

  @IsOptional() @IsString() projectId?:   string;
  @IsOptional() @IsString() projectCode?: string;
  @IsOptional() @IsString() projectName?: string;

  @IsOptional() @IsString() itemCode?: string;
  @IsString()               itemName:  string;
  @IsOptional() @IsString() spec?:     string;

  @IsNumber() @Min(0) expectedQty: number;
  @IsNumber() @Min(0) actualQty:   number;
  @IsOptional() @IsNumber() @Min(0) rejectedQty?: number;

  @IsOptional() @IsString() unit?: string;

  @IsOptional() @IsEnum(QualityStatus)
  qualityStatus?: QualityStatus;

  @IsOptional() @IsString() remark?: string;
}
