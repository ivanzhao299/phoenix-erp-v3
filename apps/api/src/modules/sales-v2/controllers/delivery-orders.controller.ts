import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { DeliveryOrdersService } from '../services/delivery-orders.service';
import { ReceiptsService }        from '../services/receipts.service';
import {
  CreateDeliveryOrderDto, UpdateDeliveryOrderDto, QueryDeliveryOrderDto,
  LoadDeliveryDto, DepartDeliveryDto, ArriveDeliveryDto,
  CancelDeliveryDto, CompleteDeliveryDto,
  CreateReceiptDto, ExceptionReceiptDto,
  CreateDriverDto, UpdateDriverDto, CreateVehicleDto, UpdateVehicleDto,
} from '../dto/delivery.dto';

/**
 * Sales V2 Phase 4 — Delivery Orders Controller
 *
 * Base: /api/v2/sales/delivery
 * Guard: JWT + MENU_SALES2_DELIVERY
 */
@Controller('api/v2/sales/delivery')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
@RequireMenu('MENU_SALES2_DELIVERY', 'V')
export class DeliveryOrdersController {
  constructor(
    private readonly svc: DeliveryOrdersService,
    private readonly receiptsSvc: ReceiptsService,
  ) {}

  // ── 配送单 ────────────────────────────────────────────────────────────────

  /** GET /api/v2/sales/delivery — 配送单列表 */
  @Get()
  list(@Query() q: QueryDeliveryOrderDto) {
    return this.svc.listOrders(q);
  }

  /** GET /api/v2/sales/delivery/stats — Dashboard 统计 */
  @Get('stats')
  stats(@Query('companyCode') companyCode?: string) {
    return this.svc.getDashboardStats(companyCode);
  }

  /** GET /api/v2/sales/delivery/drivers — 司机列表 */
  @Get('drivers')
  listDrivers(@Query('companyCode') companyCode?: string) {
    return this.svc.listDrivers(companyCode);
  }

  /** POST /api/v2/sales/delivery/drivers — 新建司机 */
  @Post('drivers')
  createDriver(@Body() dto: CreateDriverDto) {
    return this.svc.createDriver(dto);
  }

  /** PATCH /api/v2/sales/delivery/drivers/:id — 更新司机 */
  @Patch('drivers/:id')
  updateDriver(@Param('id') id: string, @Body() dto: UpdateDriverDto) {
    return this.svc.updateDriver(id, dto);
  }

  /** GET /api/v2/sales/delivery/vehicles — 车辆列表 */
  @Get('vehicles')
  listVehicles(@Query('companyCode') companyCode?: string) {
    return this.svc.listVehicles(companyCode);
  }

  /** POST /api/v2/sales/delivery/vehicles — 新建车辆 */
  @Post('vehicles')
  createVehicle(@Body() dto: CreateVehicleDto) {
    return this.svc.createVehicle(dto);
  }

  /** PATCH /api/v2/sales/delivery/vehicles/:id — 更新车辆 */
  @Patch('vehicles/:id')
  updateVehicle(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.svc.updateVehicle(id, dto);
  }

  /** GET /api/v2/sales/delivery/:id — 配送单详情 */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  /** POST /api/v2/sales/delivery — 新建配送单 */
  @Post()
  create(@Body() dto: CreateDeliveryOrderDto) {
    return this.svc.create(dto);
  }

  /** PATCH /api/v2/sales/delivery/:id — 更新基本信息 */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryOrderDto) {
    return this.svc.update(id, dto);
  }

  /** POST /api/v2/sales/delivery/:id/start-loading — 开始装车 */
  @Post(':id/start-loading')
  @HttpCode(HttpStatus.OK)
  startLoading(@Param('id') id: string, @Body() dto: LoadDeliveryDto) {
    return this.svc.startLoading(id, dto);
  }

  /** POST /api/v2/sales/delivery/:id/finish-loading — 装车完成 */
  @Post(':id/finish-loading')
  @HttpCode(HttpStatus.OK)
  finishLoading(@Param('id') id: string, @Body() dto: LoadDeliveryDto) {
    return this.svc.finishLoading(id, dto);
  }

  /** POST /api/v2/sales/delivery/:id/depart — 发车 */
  @Post(':id/depart')
  @HttpCode(HttpStatus.OK)
  depart(@Param('id') id: string, @Body() dto: DepartDeliveryDto) {
    return this.svc.depart(id, dto);
  }

  /** POST /api/v2/sales/delivery/:id/arrive — 到达 */
  @Post(':id/arrive')
  @HttpCode(HttpStatus.OK)
  arrive(@Param('id') id: string, @Body() dto: ArriveDeliveryDto) {
    return this.svc.arrive(id, dto);
  }

  /** POST /api/v2/sales/delivery/:id/complete — 强制完成（管理员） */
  @Post(':id/complete')
  @RequireMenu('MENU_SALES2_DELIVERY', 'A')
  @HttpCode(HttpStatus.OK)
  complete(@Param('id') id: string, @Body() dto: CompleteDeliveryDto) {
    return this.svc.complete(id, dto);
  }

  /** POST /api/v2/sales/delivery/:id/cancel — 取消 */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Body() dto: CancelDeliveryDto) {
    return this.svc.cancel(id, dto);
  }

  // ── 签收 ──────────────────────────────────────────────────────────────────

  /** GET /api/v2/sales/delivery/:id/receipts — 签收记录列表 */
  @Get(':id/receipts')
  listReceipts(@Param('id') id: string) {
    return this.receiptsSvc.listReceipts(id);
  }

  /** POST /api/v2/sales/delivery/:id/receipts — 正常签收 */
  @Post(':id/receipts')
  createReceipt(@Param('id') id: string, @Body() dto: CreateReceiptDto) {
    return this.receiptsSvc.createSigned(id, dto);
  }

  /** POST /api/v2/sales/delivery/:id/receipts/exception — 异常签收 */
  @Post(':id/receipts/exception')
  createExceptionReceipt(@Param('id') id: string, @Body() dto: ExceptionReceiptDto) {
    return this.receiptsSvc.createException(id, dto);
  }
}
