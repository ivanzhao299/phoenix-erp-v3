import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitGradingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shiftId: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  sourceBatchIds: number[];

  @IsObject()
  outputs: Record<string, number>;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  idempotencyKey: string;
}

