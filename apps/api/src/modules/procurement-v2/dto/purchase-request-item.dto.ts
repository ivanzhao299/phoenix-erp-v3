import {
  IsString, IsOptional, IsNumber, IsPositive, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** PR 明细行 DTO（嵌入 CreatePurchaseRequestDto / UpdatePurchaseRequestDto） */
export class PurchaseRequestItemDto {
  /** 物料编码（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  itemCode?: string;

  /** 物品名称（必填） */
  @IsString()
  @MaxLength(256)
  itemName: string;

  /** 规格型号 */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  spec?: string;

  /** 数量（必填，> 0） */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  qty: number;

  /** 单位 */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  /** 估算单价 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  estimatedUnitPrice?: number;

  /** 估算小计（前端传入则存储，否则后端计算 qty * price） */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedAmount?: number;

  /** 入库仓库代码（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  warehouseCode?: string;

  /** 用途说明 */
  @IsOptional()
  @IsString()
  usageDesc?: string;

  /** 行级项目覆盖（不填则继承头表项目） */
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
}
