import { IsNumber, IsBoolean, IsOptional, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

const SCOPE_LEVELS = ['SELF','PROJECT','COMPANY','REGION','GROUP'] as const;

export class AssignUserOrgDto {
  @IsNumber()
  @Type(() => Number)
  userId: number;

  @IsNumber()
  @Type(() => Number)
  orgId: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsIn(SCOPE_LEVELS)
  dataScopeLevel?: 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';
}

export class UpdateUserOrgDto {
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsIn(SCOPE_LEVELS)
  dataScopeLevel?: 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';
}
