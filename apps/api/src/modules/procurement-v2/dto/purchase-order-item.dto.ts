import {
  IsString, IsOptional, IsNumber, IsPositive, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** PO 明细行 DTO */
export class PurchaseOrderItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  itemCode?: string;

  @IsString()
  @MaxLength(256)
  itemName: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  spec?: string;

  /** G85-C SKU 带出：产品编码（成本按产品归集） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  productCode?: string;

  /** G85-C SKU 带出：等级编码（成本按等级归集） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  gradeCode?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  qty: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice: number;

  /** 小计：不传则后端计算 qty * unitPrice */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  warehouseCode?: string;

  @IsOptional()
  @IsString()
  usageDesc?: string;

  /** 行级项目覆盖（不填则继承头表） */
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  projectName?: string;
}
