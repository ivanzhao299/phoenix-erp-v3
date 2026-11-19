import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateBy, ValidateIf, ValidateNested } from 'class-validator';

class CutoverHouseDto {
  @IsString() @MaxLength(128) houseCode!:string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) firstProductionDate!:string;
}
export class CutoverBoundaryDto {
  @IsString() @MaxLength(128) companyCode!:string;
  @IsString() @MaxLength(128) warehouseCode!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({each:true}) @MaxLength(128,{each:true}) productCodes!:string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>CutoverHouseDto) houses!:CutoverHouseDto[];
}
class CountTotalDto {
  @IsString() @MaxLength(128) productCode!:string;
  @IsInt() @Min(0) @Max(2147483647) quantity!:number;
}
class CountLineDto {
  @IsString() @MaxLength(128) skuCode!:string;
  @IsString() @MaxLength(128) productCode!:string;
  @IsString() @MaxLength(128) gradeCode!:string;
  @IsString() @MaxLength(128) specCode!:string;
  @IsString() @MaxLength(128) locationCode!:string;
  @IsInt() @Min(1) @Max(2147483647) quantity!:number;
  @IsString() @MaxLength(128) stockStatus!:string;
  @ValidateIf((_o,v)=>v!==null) @Matches(/^\d{4}-\d{2}-\d{2}$/) productionDate!:string|null;
  @ValidateIf((_o,v)=>v!==null) @Matches(/^\d{4}-\d{2}-\d{2}$/) expireDate!:string|null;
  @IsIn(['UNKNOWN','CONFIRMED']) costStatus!:'UNKNOWN'|'CONFIRMED';
  @ValidateBy({name:'cutoverUnitCost',validator:{validate:(value:unknown)=>value===null
    ||typeof value==='number'&&Number.isFinite(value)&&value>=0
    ||typeof value==='string'&&/^(?:\d{1,12}(?:\.\d{0,6})?|\.\d{1,6})$/.test(value)}}) unitCost!:number|string|null;
  @IsBoolean() qualityConfirmed!:boolean;
}
class CountDecisionDto {
  @IsString() @MaxLength(128) batchNo!:string;
  @IsIn(['ARCHIVED_TEST','CARRY_FORWARD']) disposition!:'ARCHIVED_TEST'|'CARRY_FORWARD';
  @IsString() @MaxLength(128) evidenceFileId!:string;
  @IsString() @MaxLength(1000) reason!:string;
}
class ReferenceDecisionDto {
  @IsString() @MaxLength(128) table!:string;
  @Matches(/^[a-f0-9]{64}$/) rowSha256!:string;
  @IsIn(['TEST','RESOLVED']) classification!:'TEST'|'RESOLVED';
  @IsString() @MaxLength(128) evidenceFileId!:string;
  @IsString() @MaxLength(1000) reason!:string;
}
class RawPhysicalCountDto {
  @IsUUID() rawSegmentId!:string;
  @IsInt() @Min(0) @Max(2147483647) quantity!:number;
  @IsString() @MaxLength(128) evidenceFileId!:string;
  @IsString() @MaxLength(1000) reason!:string;
}
export class CreateCutoverDto {
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @ValidateNested({each:true}) @Type(()=>RawPhysicalCountDto) rawCounts?:RawPhysicalCountDto[];
  @ValidateNested() @Type(()=>CutoverBoundaryDto) boundary!:CutoverBoundaryDto;
  @IsString() @MaxLength(128) intentKey!:string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) postingDate!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({each:true}) @MaxLength(128,{each:true}) evidenceFileIds!:string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>CountTotalDto) physicalTotals!:CountTotalDto[];
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({each:true}) @Type(()=>CountLineDto) openingLines!:CountLineDto[];
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({each:true}) @Type(()=>CountDecisionDto) decisions!:CountDecisionDto[];
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({each:true}) @Type(()=>ReferenceDecisionDto) referenceDecisions!:ReferenceDecisionDto[];
}
export class EditCutoverDto extends CreateCutoverDto { @IsInt() @Min(0) version!:number; }
export class CutoverVersionDto { @IsInt() @Min(0) version!:number; }
export class CutoverIdDto { @IsUUID() id!:string; }
export class CutoverSignDto {
  @IsIn(['BUSINESS','FINANCE']) role!:'BUSINESS'|'FINANCE';
  @Matches(/^[a-f0-9]{64}$/) contentHash!:string;
  @Matches(/^[a-f0-9]{64}$/) snapshotSha256!:string;
  @IsString() @MaxLength(128) evidenceFileId!:string;
  @IsString() @MaxLength(1000) reason!:string;
}
