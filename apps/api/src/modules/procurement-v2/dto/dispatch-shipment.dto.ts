import { IsOptional, IsString } from 'class-validator';

export class DispatchShipmentDto {
  @IsOptional() @IsString() comment?: string;
}
