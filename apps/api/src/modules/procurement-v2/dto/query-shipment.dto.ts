import { IsOptional, IsString } from 'class-validator';

export class QueryShipmentDto {
  @IsOptional() @IsString() companyCode?:        string;
  @IsOptional() @IsString() projectCode?:        string;
  @IsOptional() @IsString() poNo?:               string;
  @IsOptional() @IsString() shipmentType?:       string;
  @IsOptional() @IsString() status?:             string;
  @IsOptional() @IsString() customsStatus?:      string;
  @IsOptional() @IsString() originCountry?:      string;
  @IsOptional() @IsString() destinationCountry?: string;
  @IsOptional() @IsString() departureDateFrom?:  string;
  @IsOptional() @IsString() departureDateTo?:    string;
  @IsOptional() @IsString() arrivalDateFrom?:    string;
  @IsOptional() @IsString() arrivalDateTo?:      string;
  @IsOptional() @IsString() keyword?:            string;
  @IsOptional() @IsString() page?:               string;
  @IsOptional() @IsString() pageSize?:           string;
}
