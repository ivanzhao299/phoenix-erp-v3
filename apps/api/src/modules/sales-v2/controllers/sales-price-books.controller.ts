import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { PriceBooksService } from '../services/price-books.service';
import { PriceItemsService } from '../services/price-items.service';
import {
  CreatePriceBookDto, UpdatePriceBookDto, QueryPriceBookDto, SubmitPriceBookDto,
} from '../dto/price-book.dto';
import {
  CreatePriceItemDto, UpdatePriceItemDto, QueryPriceItemDto, BulkImportPriceItemDto,
} from '../dto/price-item.dto';

@Controller('api/v2/sales/pricing')
@UseGuards(MenuGuard, DataScopeGuard)
export class SalesPriceBooksController {
  constructor(
    private readonly booksSvc: PriceBooksService,
    private readonly itemsSvc: PriceItemsService,
  ) {}

  // ── 价格册 ───────────────────────────────────────────────────────────────

  @Get('books')
  @RequireMenu('MENU_SALES2_PRICE', 'V')
  listBooks(@Query() q: QueryPriceBookDto) {
    return this.booksSvc.listBooks(q);
  }

  @Get('books/:id')
  @RequireMenu('MENU_SALES2_PRICE', 'V')
  findBook(@Param('id') id: string) {
    return this.booksSvc.findById(id);
  }

  @Post('books')
  @RequireMenu('MENU_SALES2_PRICE', 'C')
  createBook(@Body() dto: CreatePriceBookDto) {
    return this.booksSvc.createBook(dto);
  }

  @Patch('books/:id')
  @RequireMenu('MENU_SALES2_PRICE', 'E')
  updateBook(@Param('id') id: string, @Body() dto: UpdatePriceBookDto) {
    return this.booksSvc.updateBook(id, dto);
  }

  @Post('books/:id/submit')
  @RequireMenu('MENU_SALES2_PRICE', 'E')
  @HttpCode(HttpStatus.OK)
  submitBook(@Param('id') id: string, @Body() dto: SubmitPriceBookDto) {
    return this.booksSvc.submitBook(id, dto);
  }

  @Post('books/:id/activate')
  @RequireMenu('MENU_SALES2_PRICE', 'A')
  @HttpCode(HttpStatus.OK)
  activateBook(@Param('id') id: string) {
    return this.booksSvc.activateBook(id);
  }

  @Post('books/:id/expire')
  @RequireMenu('MENU_SALES2_PRICE', 'E')
  @HttpCode(HttpStatus.OK)
  expireBook(@Param('id') id: string) {
    return this.booksSvc.expireBook(id);
  }

  @Post('books/:id/cancel')
  @RequireMenu('MENU_SALES2_PRICE', 'D')
  @HttpCode(HttpStatus.OK)
  cancelBook(@Param('id') id: string) {
    return this.booksSvc.cancelBook(id);
  }

  // ── 价格明细 ─────────────────────────────────────────────────────────────

  @Get('items')
  @RequireMenu('MENU_SALES2_PRICE', 'V')
  listItems(@Query() q: QueryPriceItemDto) {
    return this.itemsSvc.listItems(q);
  }

  @Post('items')
  @RequireMenu('MENU_SALES2_PRICE', 'C')
  createItem(@Body() dto: CreatePriceItemDto) {
    return this.itemsSvc.createItem(dto);
  }

  @Patch('items/:id')
  @RequireMenu('MENU_SALES2_PRICE', 'E')
  updateItem(@Param('id') id: string, @Body() dto: UpdatePriceItemDto) {
    return this.itemsSvc.updateItem(id, dto);
  }

  @Post('items/:id/disable')
  @RequireMenu('MENU_SALES2_PRICE', 'E')
  @HttpCode(HttpStatus.OK)
  disableItem(@Param('id') id: string) {
    return this.itemsSvc.disableItem(id);
  }

  @Post('items/bulk-import')
  @RequireMenu('MENU_SALES2_PRICE', 'C')
  @HttpCode(HttpStatus.OK)
  bulkImport(@Body() dto: BulkImportPriceItemDto) {
    return this.itemsSvc.bulkImport(dto);
  }

  @Post('items/copy-from-book')
  @RequireMenu('MENU_SALES2_PRICE', 'C')
  @HttpCode(HttpStatus.OK)
  copyFromBook(
    @Body('sourceBookId') sourceBookId: string,
    @Body('targetBookId') targetBookId: string,
  ) {
    return this.itemsSvc.copyFromBook(sourceBookId, targetBookId);
  }
}
