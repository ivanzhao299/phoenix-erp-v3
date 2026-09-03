import {
  IsString, IsOptional, IsNumber, IsBoolean, IsArray,
  IsDateString, IsIn, Min, ValidateNested, IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── 订单明细行 ────────────────────────────────────────────────────────────────

export class CreateSalesOrderItemDto {
  /**
   * Phase H5: SKU 编码（优先）。
   * 传入后自动带出 productCode / gradeCode / packagingSpec，
   * 价格解析也优先按 sku_code 匹配。
   */
  @IsOptional() @IsString()
  skuCode?: string;

  @IsString() @IsNotEmpty()
  productCode: string;

  @IsOptional() @IsString()
  productName?: string;

  @IsOptional() @IsString()
  gradeCode?: string;

  @IsOptional() @IsString()
  packagingSpec?: string;

  @IsNumber() @Min(0.01)
  @Type(() => Number)
  qty: number;

  /**
   * 实际成交价（可选，不传则使用 PriceRuntime 解析价）
   * 低于 floor_price 时 below_floor_price=true，触发审批
   */
  @IsOptional() @IsNumber() @Min(0)
  @Type(() => Number)
  actualUnitPrice?: number;
}

// ── 创建草稿订单 ──────────────────────────────────────────────────────────────

export class CreateSalesOrderDto {
  @IsString() @IsNotEmpty()
  companyCode: string;

  @IsString() @IsNotEmpty()
  fulfillmentWarehouseCode: string;

  @IsOptional() @IsString()
  companyName?: string;

  @IsOptional() @IsString()
  customerCode?: string;

  @IsOptional() @IsString()
  channelCode?: string;

  @IsOptional() @IsString()
  priceBookId?: string;

  @IsOptional() @IsString()
  currencyCode?: string;

  @IsOptional() @IsDateString()
  expectedDeliveryDate?: string;

  @IsOptional() @IsString()
  deliveryAddress?: string;

  @IsOptional() @IsString()
  remark?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items: CreateSalesOrderItemDto[];
}

// ── 更新草稿订单（仅 DRAFT 可编辑）──────────────────────────────────────────

export class UpdateSalesOrderDto {
  @IsOptional() @IsString()
  customerCode?: string;

  @IsOptional() @IsString()
  channelCode?: string;

  @IsOptional() @IsString()
  priceBookId?: string;

  @IsOptional() @IsString()
  currencyCode?: string;

  @IsOptional() @IsDateString()
  expectedDeliveryDate?: string;

  @IsOptional() @IsString()
  deliveryAddress?: string;

  @IsOptional() @IsString()
  remark?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderItemDto)
  items?: CreateSalesOrderItemDto[];
}

// ── 查询列表 ──────────────────────────────────────────────────────────────────

export class QuerySalesOrderDto {
  @IsOptional() @IsNumber() @Min(1) @Type(() => Number)
  page?: number;

  @IsOptional() @IsNumber() @Min(1) @Type(() => Number)
  limit?: number;

  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsString()
  customerCode?: string;

  @IsOptional() @IsString()
  channelCode?: string;

  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  keyword?: string;

  @IsOptional() @IsDateString()
  dateFrom?: string;

  @IsOptional() @IsDateString()
  dateTo?: string;
}

// ── 提交审批 ──────────────────────────────────────────────────────────────────

export class SubmitSalesOrderDto {
  @IsOptional() @IsString()
  remark?: string;
}

// ── 取消 ──────────────────────────────────────────────────────────────────────

export class CancelSalesOrderDto {
  @IsString() @IsNotEmpty()
  remark: string;
}

// ── 状态流转 ──────────────────────────────────────────────────────────────────

export class TransitionSalesOrderDto {
  @IsString()
  @IsIn(['ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED'])
  targetStatus: string;

  @IsOptional() @IsString()
  remark?: string;
}

export class ManualOverrideSalesOrderDto {
  @IsString() @IsNotEmpty()
  @IsIn(['DRAFT','PENDING_APPROVAL','APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED','RECEIVED','RECONCILED','CANCELLED','REJECTED'])
  targetStatus: string;

  @IsString() @IsNotEmpty()
  reason: string;
}
