import {
  IsString, IsOptional, IsArray, IsNumber, IsIn,
  IsDateString, IsPositive, Min, Max,
  ArrayNotEmpty, ValidateNested, IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─────────────────────────────────────────────────────────────
// 司机
// ─────────────────────────────────────────────────────────────
export class CreateDriverDto {
  @IsString() @IsNotEmpty() driverName: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() licenseNo?: string;
  @IsString() @IsNotEmpty() companyCode: string;
  @IsOptional() @IsString() remark?: string;
}

export class UpdateDriverDto {
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() licenseNo?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsString() remark?: string;
}

// ─────────────────────────────────────────────────────────────
// 车辆
// ─────────────────────────────────────────────────────────────
export class CreateVehicleDto {
  @IsString() @IsNotEmpty() vehicleNo: string;
  @IsOptional() @IsString() plateNo?: string;
  @IsOptional() @IsString() vehicleType?: string;
  @IsOptional() @IsNumber() @IsPositive() capacity?: number;
  @IsString() @IsNotEmpty() companyCode: string;
  @IsOptional() @IsString() remark?: string;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() plateNo?: string;
  @IsOptional() @IsString() vehicleType?: string;
  @IsOptional() @IsNumber() @IsPositive() capacity?: number;
  @IsOptional() @IsIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE']) status?: string;
  @IsOptional() @IsString() remark?: string;
}

// ─────────────────────────────────────────────────────────────
// 配送单
// ─────────────────────────────────────────────────────────────
export class CreateDeliveryOrderDto {
  @IsString() @IsNotEmpty() companyCode: string;
  @IsOptional() @IsString() companyName?: string;

  /** 关联的销售订单 ID 列表（至少 1 条） */
  @IsArray() @ArrayNotEmpty() salesOrderIds: string[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DeliveryPlanItemDto)
  items?: DeliveryPlanItemDto[];

  @IsOptional() @IsString() routeCode?: string;
  @IsOptional() @IsString() routeName?: string;

  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() vehicleNo?: string;

  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() driverName?: string;

  @IsOptional() @IsDateString() waveDate?: string;
  @IsOptional() @IsDateString() expectedArrivalAt?: string;

  @IsOptional() @IsString() remark?: string;
}

export class DeliveryPlanItemDto {
  @IsString() @IsNotEmpty() salesOrderId: string;
  @Type(() => Number) @IsNumber() @Min(0.01) qty: number;
}

export class UpdateDeliveryOrderDto {
  @IsOptional() @IsString() routeCode?: string;
  @IsOptional() @IsString() routeName?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() vehicleNo?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsDateString() waveDate?: string;
  @IsOptional() @IsDateString() expectedArrivalAt?: string;
  @IsOptional() @IsString() remark?: string;
}

export class QueryDeliveryOrderDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200) limit?: number = 20;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() companyCode?: string;
  @IsOptional() @IsDateString() waveDate?: string;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

// ── 状态流转 ──────────────────────────────────────────────────
export class LoadDeliveryDto {
  @IsOptional() @IsString() remark?: string;
}
export class DepartDeliveryDto {
  @IsOptional() @IsString() remark?: string;
}
export class ArriveDeliveryDto {
  @IsOptional() @IsString() remark?: string;
}
export class CompleteDeliveryDto {
  @IsString() @IsNotEmpty() remark: string;
}
export class CancelDeliveryDto {
  @IsOptional() @IsString() remark?: string;
}

// ─────────────────────────────────────────────────────────────
// 签收
// ─────────────────────────────────────────────────────────────
export class CreateReceiptDto {
  @IsString() @IsNotEmpty() deliveryItemId: string;

  @IsOptional() @IsString() signedBy?: string;

  @IsNumber() @Min(0) receivedQty: number;

  @IsOptional() @IsArray() @IsString({ each: true }) photoUrls?: string[];
  @IsOptional() @IsString() remark?: string;
}

export class ExceptionReceiptDto {
  @IsString() @IsNotEmpty() deliveryItemId: string;

  @IsOptional() @IsString() signedBy?: string;

  @IsNumber() @Min(0) receivedQty: number;
  @IsNumber() @Min(0) exceptionQty: number;

  @IsIn(['SHORTAGE', 'DAMAGED', 'REJECTED', 'LATE', 'OTHER'])
  exceptionType: string;

  @IsOptional() @IsArray() @IsString({ each: true }) photoUrls?: string[];
  @IsOptional() @IsString() remark?: string;
}
