import {
  IsString, IsNumber, IsBoolean, IsOptional, IsArray,
  ValidateNested, Min, IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// ── 步骤 DTO ──────────────────────────────────────────────────────────────────

export class ApprovalRuleStepDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  stepNo: number;

  @IsOptional()
  @IsString()
  @IsIn(['ROLE', 'USER', 'ORG_MANAGER', 'PROJECT_MANAGER', 'COMPANY_FINANCE', 'DIRECT_MANAGER', 'COMPANY_ROLE', 'PROJECT_ROLE'])
  approverType?: string;

  @IsOptional()
  @IsString()
  approverRole?: string;

  @IsOptional()
  @IsString()
  approverUserId?: string;

  @IsOptional()
  @IsString()
  orgScope?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  requiredApprovalCount?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  allowAdminOverride?: boolean;

  // ── SLA 配置（Phase G 开放配置化）──────────────────────────────────────────
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  slaHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  reminderIntervalHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxReminders?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  escalationEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  escalationAfterHours?: number;

  @IsOptional()
  @IsString()
  escalationRole?: string;
}

// ── 查询 DTO ──────────────────────────────────────────────────────────────────

export class QueryApprovalRuleDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsString()
  bizType?: string;

  @IsOptional()
  @IsString()
  moduleCode?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  enabled?: boolean;
}

// ── 创建 DTO ──────────────────────────────────────────────────────────────────

export class CreateApprovalRuleDto {
  @IsString()
  ruleCode: string;

  @IsString()
  moduleCode: string;

  @IsString()
  bizType: string;

  @IsOptional()
  @IsString()
  orgType?: string;

  @IsOptional()
  @IsString()
  companyCode?: string;

  @IsOptional()
  @IsString()
  projectCode?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  @IsIn(['SEQUENTIAL', 'PARALLEL', 'ANY_ONE'])
  approvalMode?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  enabled?: boolean;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalRuleStepDto)
  steps: ApprovalRuleStepDto[];
}

// ── 更新 DTO ──────────────────────────────────────────────────────────────────

export class UpdateApprovalRuleDto {
  @IsOptional()
  @IsString()
  moduleCode?: string;

  @IsOptional()
  @IsString()
  bizType?: string;

  @IsOptional()
  @IsString()
  orgType?: string;

  @IsOptional()
  @IsString()
  companyCode?: string;

  @IsOptional()
  @IsString()
  projectCode?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  @IsIn(['SEQUENTIAL', 'PARALLEL', 'ANY_ONE'])
  approvalMode?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  priority?: number;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalRuleStepDto)
  steps?: ApprovalRuleStepDto[];
}

// ── 状态更新 DTO ──────────────────────────────────────────────────────────────

export class UpdateApprovalRuleStatusDto {
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  enabled: boolean;
}
