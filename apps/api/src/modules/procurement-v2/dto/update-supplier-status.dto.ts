import { IsEnum } from 'class-validator';

export enum SupplierStatusEnum {
  ACTIVE      = 'ACTIVE',
  INACTIVE    = 'INACTIVE',
  BLACKLISTED = 'BLACKLISTED',
}

export class UpdateSupplierStatusDto {
  @IsEnum(SupplierStatusEnum, { message: 'status 必须为 ACTIVE / INACTIVE / BLACKLISTED' })
  status: string;
}
