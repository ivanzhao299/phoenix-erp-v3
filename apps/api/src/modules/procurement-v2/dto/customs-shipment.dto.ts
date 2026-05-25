import { IsOptional, IsString } from 'class-validator';

export class CustomsShipmentDto {
  @IsOptional() @IsString() customsDeclNo?: string;
  @IsOptional() @IsString() comment?:       string;
}
