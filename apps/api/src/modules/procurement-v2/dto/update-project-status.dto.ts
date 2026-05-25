import { IsEnum } from 'class-validator';

export enum ProjectStatusEnum {
  ACTIVE   = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CLOSED   = 'CLOSED',
}

export class UpdateProjectStatusDto {
  @IsEnum(ProjectStatusEnum, { message: 'status 必须为 ACTIVE / INACTIVE / CLOSED' })
  status: string;
}
