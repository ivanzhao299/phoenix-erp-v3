import {
  IsString, IsOptional, IsEnum, IsDateString,
  MaxLength, IsArray, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseRequestItemDto } from './purchase-request-item.dto';

export enum PurchaseType {
  MATERIAL   = 'MATERIAL',
  EQUIPMENT  = 'EQUIPMENT',
  SERVICE    = 'SERVICE',
  FIXED_ASSET= 'FIXED_ASSET',
  OTHER      = 'OTHER',
}

export enum Urgency {
  NORMAL   = 'NORMAL',
  URGENT   = 'URGENT',
  CRITICAL = 'CRITICAL',
}

export class CreatePurchaseRequestDto {
  /** 申请主题（必填） */
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
  @MaxLength(64)
  projectCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  projectName?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  /** 采购类型 */
  @IsOptional()
  @IsEnum(PurchaseType)
  purchaseType?: string;

  /** 紧急程度 */
  @IsOptional()
  @IsEnum(Urgency)
  urgency?: string;

  /** 货币代码 */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currencyCode?: string;

  /** 部门代码 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deptCode?: string;

  /** 期望到货日 */
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  /** 申请原因 */
  @IsOptional()
  @IsString()
  reason?: string;

  /** 附件 URL */
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  /** 备注 */
  @IsOptional()
  @IsString()
  remark?: string;

  /** 明细行（至少 1 行） */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemDto)
  items: PurchaseRequestItemDto[];
}
