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
  @RequireMenu('MENU_STORE_PAYMENT', 'E')
  createRecord(@Body() dto: CreateStorePaymentRecordDto) {
    return this.service.createRecord(dto);
  }

  @Get('records/:id')
  @RequireMenu('MENU_STORE_PAYMENT', 'V')
  getRecord(@Param('id') id: string) {
    return this.service.getRecord(id);
  }

  @Get('accounts/:id/qr-attachment')
  @RequireMenu('MENU_STORE_PAYMENT_ACCOUNT', 'V')
  getAccountQrAttachment(@Param('id') id: string) {
    return this.service.getAccountQrAttachmentAccess(id);
  }

  @Get('records/:id/proof-attachment')
  @RequireMenu('MENU_STORE_PAYMENT', 'V')
  getRecordProofAttachment(@Param('id') id: string) {
    return this.service.getRecordProofAttachmentAccess(id);
  }

  @Get('attachments/:attachmentId/status')
  @RequireMenu('MENU_STORE_PAYMENT', 'V')
  getAttachmentStatus(@Param('attachmentId') attachmentId: string) {
    return this.service.getStorePaymentAttachmentStatus(attachmentId);
  }

  @Get('attachments/:attachmentId/preview')
  @RequireMenu('MENU_STORE_PAYMENT', 'V')
  previewAttachment(@Param('attachmentId') attachmentId: string) {
    return this.service.openStorePaymentAttachment(attachmentId, 'preview');
  }

  @Get('attachments/:attachmentId/download')
  @RequireMenu('MENU_STORE_PAYMENT', 'V')
  downloadAttachment(@Param('attachmentId') attachmentId: string) {
    return this.service.openStorePaymentAttachment(attachmentId, 'download');
  }

  @Post('records/:id/confirm')
  @RequireMenu('MENU_STORE_PAYMENT_CONFIRM', 'E')
  confirmRecord(@Param('id') id: string, @Body() dto: ConfirmStorePaymentRecordDto) {
    return this.service.confirmRecord(id, dto);
  }

  @Post('records/:id/reject')
  @RequireMenu('MENU_STORE_PAYMENT_CONFIRM', 'E')
  rejectRecord(@Param('id') id: string, @Body() dto: RejectStorePaymentRecordDto) {
    return this.service.rejectRecord(id, dto);
  }

  @Post('records/:id/void')
  @RequireMenu('MENU_STORE_PAYMENT_VOID', 'E')
  voidRecord(@Param('id') id: string, @Body() dto: VoidStorePaymentRecordDto) {
    return this.service.voidRecord(id, dto);
  }
}
