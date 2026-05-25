import { IsOptional, IsString } from 'class-validator';

export class QueryReceiptDto {
  @IsOptional() @IsString() companyCode?:     string;
  @IsOptional() @IsString() projectCode?:     string;
  @IsOptional() @IsString() poNo?:            string;
  @IsOptional() @IsString() shipmentNo?:      string;
  @IsOptional() @IsString() warehouseCode?:   string;
  @IsOptional() @IsString() status?:          string;
  @IsOptional() @IsString() receiptDateFrom?: string;
  @IsOptional() @IsString() receiptDateTo?:   string;
  @IsOptional() @IsString() keyword?:         string;
  @IsOptional() @IsString() page?:            string;
  @IsOptional() @IsString() pageSize?:        string;
}
