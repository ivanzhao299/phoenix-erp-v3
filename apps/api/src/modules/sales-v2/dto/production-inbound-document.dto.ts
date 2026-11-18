import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested, Matches } from 'class-validator';

export class ProductionSourceAllocationDto {
  @IsInt() @Min(1) dailyLogId!: number;
  @IsInt() @Min(1) @Max(2147483647) quantity!: number;
  @IsOptional() @IsString() @MaxLength(100) evidenceFileId?: string;
}
export class ProductionInboundItemDto {
  @IsString() @MaxLength(100) gradeCode!: string;
  @IsInt() @Min(1) @Max(2147483647) quantity!: number;
  @IsOptional() @IsString() @MaxLength(100) specCode?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each:true })
  @Type(() => ProductionSourceAllocationDto) allocations?: ProductionSourceAllocationDto[];
}
export class CreateProductionInboundDto {
  @IsString() @MaxLength(100) companyCode!: string;
  @IsString() @MaxLength(100) houseCode!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) eggDate!: string;
  @IsString() @MaxLength(100) warehouseCode!: string;
  @IsString() @MaxLength(100) locationCode!: string;
  @IsString() @MaxLength(100) intentKey!: string;
  @IsOptional() @IsString() @MaxLength(100) handoverRef?: string;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each:true }) @MaxLength(100,{ each:true }) evidenceFileIds?: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each:true })
  @Type(() => ProductionInboundItemDto) items!: ProductionInboundItemDto[];
}
export class EditProductionInboundDto extends CreateProductionInboundDto {
  @IsInt() @Min(1) version!: number;
}
export class ProductionDocumentVersionDto {
  @IsInt() @Min(1) version!: number;
}
export class ReadyProductionInboundDto extends ProductionDocumentVersionDto {
  @IsString() @MaxLength(100) submitKey!: string;
}
export class PostProductionInboundDto {
  @IsString() @MaxLength(100) submitKey!: string;
  @Matches(/^[a-f0-9]{64}$/) contentHash!: string;
}
export class ProductionDocumentIdDto {
  @IsUUID() id!: string;
}
export class ProductionReversalSegmentDto {
  @IsUUID() allocationId!: string;
  @IsInt() @Min(1) @Max(2147483647) quantity!: number;
}
export class CreateProductionReversalDto {
  @IsString() @MaxLength(100) intentKey!: string;
  @IsString() @MaxLength(1000) reason!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each:true })
  @Type(() => ProductionReversalSegmentDto) segments!: ProductionReversalSegmentDto[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each:true }) evidenceFileIds!: string[];
}
export class ApproveProductionReversalDto extends ProductionDocumentVersionDto {
  @Matches(/^[a-f0-9]{64}$/) contentHash!: string;
  @IsUUID() financialClearanceId!: string;
}
export class ProductionCostClearanceDto {
  @IsString() @MaxLength(100) batchNo!: string;
  @IsIn(['UNKNOWN','CONFIRMED']) costStatus!: 'UNKNOWN'|'CONFIRMED';
  @IsOptional() @IsNumber({ allowNaN:false,allowInfinity:false }) @Min(0) unitCost!: number|null;
}
export class RecordProductionFinancialClearanceDto {
  @Matches(/^[a-f0-9]{64}$/) contentHash!: string;
  @IsString() @MaxLength(100) financialEvidenceFileId!: string;
  @IsIn(['OPEN']) periodStatus!: 'OPEN';
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each:true })
  @Type(() => ProductionCostClearanceDto) costs!: ProductionCostClearanceDto[];
}
export class PhysicalHandoverSegmentDto {
  @IsInt() @Min(1) dailyLogId!: number;
  @IsString() @MaxLength(100) gradeCode!: string;
  @IsInt() @Min(1) @Max(2147483647) quantity!: number;
  @IsString() @MaxLength(100) evidenceFileId!: string;
}
export class CreatePhysicalHandoverDto {
  @IsOptional() @IsUUID() replacesId?: string;
  @IsString() @MaxLength(100) companyCode!: string;
  @IsString() @MaxLength(100) houseCode!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) eggDate!: string;
  @IsString() @MaxLength(100) warehouseCode!: string;
  @IsString() @MaxLength(100) handoverRef!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each:true })
  @Type(() => PhysicalHandoverSegmentDto) segments!: PhysicalHandoverSegmentDto[];
}
export class ConfirmPhysicalHandoverDto extends ProductionDocumentVersionDto {
  @Matches(/^[a-f0-9]{64}$/) contentHash!: string;
}
export class CancelPhysicalHandoverDto extends ProductionDocumentVersionDto {
  @IsString() @MaxLength(1000) reason!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each:true }) @MaxLength(100,{ each:true }) evidenceFileIds?: string[];
}
export class ProductionPostingPeriodDto {
  @IsString() @MaxLength(100) companyCode!: string;
  @IsString() @MaxLength(100) houseCode!: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) periodMonth!: string;
  @IsIn(['OPEN','CLOSED']) state!: 'OPEN'|'CLOSED';
  @IsInt() @Min(0) expectedVersion!: number;
  @IsString() @MaxLength(100) evidenceFileId!: string;
  @IsString() @MaxLength(1000) reason!: string;
}
