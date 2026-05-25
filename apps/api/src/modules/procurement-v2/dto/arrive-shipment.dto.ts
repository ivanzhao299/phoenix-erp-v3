import { IsOptional, IsString, IsDateString } from 'class-validator';

export class ArriveShipmentDto {
  @IsOptional() @IsDateString() actualArrivalDate?: string;
  @IsOptional() @IsString()     comment?:           string;
}
