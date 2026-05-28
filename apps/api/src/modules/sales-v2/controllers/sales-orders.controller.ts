import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { SalesOrdersService } from '../services/sales-orders.service';
import {
  CreateSalesOrderDto, UpdateSalesOrderDto, QuerySalesOrderDto,
  SubmitSalesOrderDto, CancelSalesOrderDto, TransitionSalesOrderDto,
} from '../dto/sales-order.dto';

/**
 * Sales V2 — Sales Orders Controller
 *
 * Phase 3 Sales Order Runtime
 * Base: /api/v2/sales/orders
 * Guard: JWT + MENU_SALES2_ORDER
 */
@Controller('api/v2/sales/orders')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
@RequireMenu('MENU_SALES2_ORDER', 'V')
export class SalesOrdersController {
  constructor(private readonly svc: SalesOrdersService) {}

  /** GET /api/v2/sales/orders — 列表（DataScope + 分页） */
  @Get()
  list(@Query() q: QuerySalesOrderDto) {
    return this.svc.listOrders(q);
  }

  /** GET /api/v2/sales/orders/stats — Dashboard 统计 */
  @Get('stats')
  stats(@Query('companyCode') companyCode?: string) {
    return this.svc.getDashboardStats(companyCode);
  }

  /** GET /api/v2/sales/orders/:id — 详情（含 items + AR） */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  /** POST /api/v2/sales/orders — 新建草稿 */
  @Post()
  create(@Body() dto: CreateSalesOrderDto) {
    return this.svc.createDraft(dto);
  }

  /** PATCH /api/v2/sales/orders/:id — 更新草稿（仅 DRAFT） */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSalesOrderDto) {
    return this.svc.updateDraft(id, dto);
  }

  /** POST /api/v2/sales/orders/:id/submit — 提交审批 */
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('id') id: string, @Body() dto: SubmitSalesOrderDto) {
    return this.svc.submit(id, dto);
  }

  /** POST /api/v2/sales/orders/:id/cancel — 取消订单 */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Body() dto: CancelSalesOrderDto) {
    return this.svc.cancel(id, dto);
  }

  /** POST /api/v2/sales/orders/:id/transition — 状态流转 */
  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  transition(@Param('id') id: string, @Body() dto: TransitionSalesOrderDto) {
    return this.svc.transition(id, dto);
  }

  /** POST /api/v2/sales/orders/:id/mark-received — 标记签收 + 生成 AR */
  @Post(':id/mark-received')
  @HttpCode(HttpStatus.OK)
  markReceived(@Param('id') id: string) {
    return this.svc.markReceived(id);
  }
}
