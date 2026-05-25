import {
  IsString, IsOptional, IsBoolean, IsDateString,
  MaxLength, IsArray, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PurchaseOrderItemDto } from './purchase-order-item.dto';

export class CreatePurchaseOrderDto {
  /** 采购主题（必填） */
  @IsString()
  @MaxLength(256)
  subject: string;

  /** ── 多公司维度 ── */
  @IsString()
  @MaxLength(64)
  companyCode: string;

  @IsString()
  @MaxLength(256)
  companyName: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  /** ── 多项目维度 ── */
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

  /** ── 供应商 ── */
  @IsString()
  @MaxLength(64)
  supplierCode: string;

  @IsString()
  @MaxLength(256)
  supplierName: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  /** 采购类型 */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  purchaseType?: string;

  /** 货币代码 */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currencyCode?: string;

  /** 期望到货日 */
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  /** 付款截止日 */
  @IsOptional()
  @IsDateString()
  payDeadline?: string;

  /** 是否跨境 */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  crossBorderFlag?: boolean;

  /** 来源国家 */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  originCountry?: string;

  /** 目的国家 */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  destinationCountry?: string;

  /** 合同号 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  contractNo?: string;

  /** 合同文件 URL */
  @IsOptional()
  @IsString()
  contractUrl?: string;

  /** 合同摘要 */
  @IsOptional()
  @IsString()
  contractNote?: string;

  /** 付款条款 */
  @IsOptional()
  @IsString()
  payTerms?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  /** 明细行（至少 1 行） */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}
