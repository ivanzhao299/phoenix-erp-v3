import {
  IsString, IsOptional, IsDateString, IsArray, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReceiptItemDto } from './receipt-item.dto';

export class CreateReceiptDto {
  @IsString()               poId:   string;
  @IsString()               poNo:   string;

  @IsOptional() @IsString() shipmentId?: string;
  @IsOptional() @IsString() shipmentNo?: string;

  @IsOptional() @IsString() companyId?:   string;
  @IsOptional() @IsString() companyCode?: string;
  @IsOptional() @IsString() companyName?: string;

  @IsOptional() @IsString() projectId?:   string;
  @IsOptional() @IsString() projectCode?: string;
  @IsOptional() @IsString() projectName?: string;

  @IsOptional() @IsString()     warehouseCode?: string;
  @IsOptional() @IsString()     receiverId?:    string;
  @IsOptional() @IsString()     receiverName?:  string;
  @IsOptional() @IsDateString() receiptDate?:   string;

  @IsOptional() @IsString() remark?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  @ArrayMinSize(1)
  items: ReceiptItemDto[];
}
