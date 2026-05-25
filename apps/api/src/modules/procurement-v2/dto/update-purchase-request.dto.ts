import {
  IsString, IsOptional, IsEnum, IsDateString,
  MaxLength, IsArray, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseRequestItemDto } from './purchase-request-item.dto';
import { PurchaseType, Urgency } from './create-purchase-request.dto';

/** 更新采购申请 DTO（仅 DRAFT 状态可更新） */
export class UpdatePurchaseRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  projectName?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsEnum(PurchaseType)
  purchaseType?: string;

  @IsOptional()
  @IsEnum(Urgency)
  urgency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currencyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deptCode?: string;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  /** 传入 items 时全量替换明细行 */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemDto)
  items?: PurchaseRequestItemDto[];
}
