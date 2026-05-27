import { IsString, IsOptional, IsIn, IsNotEmpty, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

const CHANNEL_TYPES = ['DIRECT', 'DISTRIBUTOR', 'AGENT', 'RETAIL'] as const;

export class CreateChannelDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  channelCode: string;

  @IsString() @IsNotEmpty() @MaxLength(128)
  channelName: string;

  @IsString() @IsIn(CHANNEL_TYPES)
  channelType: string;

  @IsString() @IsNotEmpty() @MaxLength(64)
  companyCode: string;

  @IsString() @IsOptional() @MaxLength(256)
  companyName?: string;

  @IsString() @IsOptional()
  remark?: string;
}

export class UpdateChannelDto {
  @IsString() @IsOptional() @MaxLength(128)
  channelName?: string;

  @IsString() @IsOptional() @IsIn(CHANNEL_TYPES)
  channelType?: string;

  @IsString() @IsOptional() @MaxLength(256)
  companyName?: string;

  @IsString() @IsOptional()
  remark?: string;
}

export class QueryChannelDto {
  @IsString() @IsOptional()
  keyword?: string;

  @IsString() @IsOptional() @IsIn(CHANNEL_TYPES)
  channelType?: string;

  @IsString() @IsOptional() @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;

  @IsString() @IsOptional()
  companyCode?: string;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(1)
  page?: number;

  @Type(() => Number) @IsNumber() @IsOptional() @Min(1)
  limit?: number;
}
