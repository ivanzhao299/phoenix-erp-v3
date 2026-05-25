import {
  IsString, IsOptional, IsBoolean, IsDateString, IsNumber, Min, IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum ShipmentType {
  DOMESTIC     = 'DOMESTIC',
  CROSS_BORDER = 'CROSS_BORDER',
  LOCAL        = 'LOCAL',
}

export class CreateShipmentDto {
  @IsString()
  poId: string;

  @IsString()
  poNo: string;

  @IsOptional() @IsString() companyId?:   string;
  @IsOptional() @IsString() companyCode?: string;
  @IsOptional() @IsString() companyName?: string;

  @IsOptional() @IsString() projectId?:   string;
  @IsOptional() @IsString() projectCode?: string;
  @IsOptional() @IsString() projectName?: string;

  @IsOptional() @IsEnum(ShipmentType)
  shipmentType?: ShipmentType;

  @IsOptional() @IsString() carrierName?:  string;
  @IsOptional() @IsString() trackingNo?:   string;

  @IsOptional() @IsString() originCountry?:      string;
  @IsOptional() @IsString() originAddress?:      string;
  @IsOptional() @IsString() destinationCountry?: string;
  @IsOptional() @IsString() destinationAddress?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  customsRequired?: boolean;

  @IsOptional() @IsString() customsStatus?:  string;
  @IsOptional() @IsString() customsDeclNo?:  string;

  @IsOptional() @IsDateString() departureDate?: string;
  @IsOptional() @IsDateString() arrivalDate?:   string;

  @IsOptional() @IsNumber() @Min(0) freightAmount?:   number;
  @IsOptional() @IsString()         freightCurrency?: string;

  @IsOptional() @IsNumber() @Min(0) customsDuty?:      number;
  @IsOptional() @IsString()         customsCurrency?:  string;

  @IsOptional() @IsString() remark?: string;
}
