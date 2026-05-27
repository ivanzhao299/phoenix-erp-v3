import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { CustomersService } from '../services/customers.service';
import {
  CreateCustomerDto, UpdateCustomerDto, QueryCustomerDto,
  FreezeCustomerDto, BlacklistCustomerDto, UpdateCreditLimitDto,
} from '../dto/customer.dto';

@Controller('api/v2/sales/customers')
@UseGuards(MenuGuard)
export class SalesCustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Get()
  @RequireMenu('MENU_SALES2_CUSTOMER', 'V')
  list(@Query() q: QueryCustomerDto) {
    return this.svc.list(q);
  }

  @Get(':id')
  @RequireMenu('MENU_SALES2_CUSTOMER', 'V')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @RequireMenu('MENU_SALES2_CUSTOMER', 'C')
  create(@Body() dto: CreateCustomerDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequireMenu('MENU_SALES2_CUSTOMER', 'E')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/freeze')
  @RequireMenu('MENU_SALES2_CUSTOMER', 'E')
  @HttpCode(HttpStatus.OK)
  freeze(@Param('id') id: string, @Body() dto: FreezeCustomerDto) {
    return this.svc.freeze(id, dto);
  }

  @Post(':id/activate')
  @RequireMenu('MENU_SALES2_CUSTOMER', 'E')
  @HttpCode(HttpStatus.OK)
  activate(@Param('id') id: string) {
    return this.svc.activate(id);
  }

  @Post(':id/blacklist')
  @RequireMenu('MENU_SALES2_CUSTOMER', 'A')
  @HttpCode(HttpStatus.OK)
  blacklist(@Param('id') id: string, @Body() dto: BlacklistCustomerDto) {
    return this.svc.blacklist(id, dto);
  }

  @Patch(':id/credit-limit')
  @RequireMenu('MENU_SALES2_CUSTOMER', 'E')
  updateCreditLimit(@Param('id') id: string, @Body() dto: UpdateCreditLimitDto) {
    return this.svc.updateCreditLimit(id, dto);
  }

  @Get(':id/credit-snapshot')
  @RequireMenu('MENU_SALES2_CUSTOMER', 'V')
  getCreditSnapshot(@Param('id') id: string) {
    return this.svc.getCreditSnapshot(id);
  }
}
