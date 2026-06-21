import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import {
  ConfirmStorePaymentRecordDto,
  CreateStorePaymentAccountDto,
  CreateStorePaymentRecordDto,
  QueryStorePaymentAccountDto,
  QueryStorePaymentRecordDto,
  RejectStorePaymentRecordDto,
  UpdateStorePaymentAccountDto,
  VoidStorePaymentRecordDto,
} from './dto/store-payment.dto';
import { StorePaymentService } from './store-payment.service';

@Controller('store-payment')
@UseGuards(MenuGuard, DataScopeGuard)
export class StorePaymentController {
  constructor(private readonly service: StorePaymentService) {}

  @Get('accounts')
  @RequireMenu('MENU_STORE_PAYMENT_ACCOUNT', 'V')
  listAccounts(@Query() query: QueryStorePaymentAccountDto) {
    return this.service.listAccounts(query);
  }

  @Post('accounts')
  @RequireMenu('MENU_STORE_PAYMENT_ACCOUNT', 'E')
  createAccount(@Body() dto: CreateStorePaymentAccountDto) {
    return this.service.createAccount(dto);
  }

  @Patch('accounts/:id')
  @RequireMenu('MENU_STORE_PAYMENT_ACCOUNT', 'E')
  updateAccount(@Param('id') id: string, @Body() dto: UpdateStorePaymentAccountDto) {
    return this.service.updateAccount(id, dto);
  }

  @Get('records')
  @RequireMenu('MENU_STORE_PAYMENT', 'V')
  listRecords(@Query() query: QueryStorePaymentRecordDto) {
    return this.service.listRecords(query);
  }

  @Post('records')
  @RequireMenu('MENU_STORE_PAYMENT', 'C')
  createRecord(@Body() dto: CreateStorePaymentRecordDto) {
    return this.service.createRecord(dto);
  }

  @Get('records/:id')
  @RequireMenu('MENU_STORE_PAYMENT', 'V')
  getRecord(@Param('id') id: string) {
    return this.service.getRecord(id);
  }

  @Post('records/:id/confirm')
  @RequireMenu('MENU_STORE_PAYMENT_CONFIRM', 'A')
  confirmRecord(@Param('id') id: string, @Body() dto: ConfirmStorePaymentRecordDto) {
    return this.service.confirmRecord(id, dto);
  }

  @Post('records/:id/reject')
  @RequireMenu('MENU_STORE_PAYMENT_CONFIRM', 'A')
  rejectRecord(@Param('id') id: string, @Body() dto: RejectStorePaymentRecordDto) {
    return this.service.rejectRecord(id, dto);
  }

  @Post('records/:id/void')
  @RequireMenu('MENU_STORE_PAYMENT_VOID', 'A')
  voidRecord(@Param('id') id: string, @Body() dto: VoidStorePaymentRecordDto) {
    return this.service.voidRecord(id, dto);
  }
}
