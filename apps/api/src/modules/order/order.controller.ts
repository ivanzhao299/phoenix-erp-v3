import { Controller, Post, Get, Put, Body, Param, UseGuards, Req, HttpException } from '@nestjs/common';
import { OrderService } from './order.service';
import { SalesOrderEntity } from './entities/sales-order.entity';
import { RequireMenu, MenuGuard } from '../../common/guards/menu.guard';

@Controller('api/orders')
@UseGuards(MenuGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('submit')
  @RequireMenu('MENU_ORDER_MGR', 'C')
  async submitOrder(@Body() dto: any, @Req() req: any) {
    // 不再 try/catch + 返 {code:500}：NestJS 异常过滤器会用正确的 HTTP code
    // (BadRequestException → 400, ForbiddenException → 403 等)
    return await this.orderService.submitOrder(dto, req.user);
  }

  @Post([':order_no/transition', ':order_no/status'])
  @RequireMenu('MENU_ORDER_MGR', 'E') // 实际权限会更复杂，这里先用基础权限
  async transitionOrder(
    @Param('order_no') orderNo: string,
    @Body('to_status') toStatus: string,
    @Body('action') action: string,
    @Body('remark') remark: string,
    @Req() req: any
  ) {
    const targetStatus = toStatus || action;
    return await this.orderService.transitionOrder(orderNo, targetStatus, remark, req.user);
  }

  @Get(':order_no')
  @RequireMenu('MENU_ORDER_MGR', 'V')
  async getOrder(@Param('order_no') orderNo: string) {
    return await this.orderService.getOrder(orderNo);
  }

  // 审计 C6: 移除死代码 createOrder/updateOrder（返回 'V3 Entity Logic' 字符串）
  // B2B 订单不再走 ord_orders；专用流程见 store/b2b 模块（待 B2B 业务模块独立时再实装）
}
