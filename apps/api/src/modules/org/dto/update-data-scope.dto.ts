import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn } from 'class-validator';

const SCOPE_TYPES = ['SELF','PROJECT','COMPANY','REGION','GROUP'] as const;

export class CreateDataScopeDto {
  @IsString()
  @IsNotEmpty()
  roleCode: string;

  @IsString()
  @IsNotEmpty()
  moduleCode: string;

  @IsIn(SCOPE_TYPES)
  scopeType: 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';
}

export class UpdateDataScopeDto {
  @IsOptional()
  @IsIn(SCOPE_TYPES)
  scopeType?: 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
