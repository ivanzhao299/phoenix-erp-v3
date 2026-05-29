import {
  Controller, Get, Post, Body, Param, Query,
  UseGuards, Logger,
} from '@nestjs/common';
import { ClsService }              from 'nestjs-cls';
import { MenuGuard, RequireMenu }  from '../../../common/guards/menu.guard';
import { DataScopeGuard }          from '../../org/guards/data-scope.guard';
import { DeliveryOrdersService }   from '../services/delivery-orders.service';
import { ReceiptsService }         from '../services/receipts.service';
import { ReturnOrdersService }     from '../services/return-orders.service';
import { PushNotificationService } from '../../notification/push-notification.service';

const MENU = 'MENU_MOBILE_DELIVERY';

@Controller('api/v2/mobile/delivery')
@UseGuards(MenuGuard, DataScopeGuard)
export class MobileDeliveryController {
  private readonly logger = new Logger(MobileDeliveryController.name);

  constructor(
    private readonly deliverySvc: DeliveryOrdersService,
    private readonly receiptsSvc: ReceiptsService,
    private readonly returnsSvc:  ReturnOrdersService,
    private readonly pushSvc:     PushNotificationService,
    private readonly cls:         ClsService,
  ) {}

  private get user() { return this.cls.get('user') as any; }

  /** 当前用户是否为 ROLE_DRIVER */
  private isDriver(): boolean {
    const user = this.user;
    const roles: string[] = user?.roles ?? user?.role ? [user.role] : [];
    return roles.includes('ROLE_DRIVER');
  }

  /** 司机查自己的 driverId（user_id 映射到 driver_id） */
  private driverFilter(): { driverId?: string } {
    return this.isDriver()
      ? { driverId: String(this.user?.userId ?? this.user?.user_id ?? '') }
      : {};
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  @RequireMenu(MENU, 'V')
  async dashboard(@Query('companyCode') companyCode?: string) {
    const stats = await this.deliverySvc.getDashboardStats(companyCode);
    const user  = this.user;
    return {
      ...stats,
      driverName: user?.realName ?? user?.userName ?? '',
      driverId:   user?.userId  ?? user?.user_id  ?? null,
    };
  }

  // ── 配送单列表（司机只看自己的）────────────────────────────────────────────

  @Get('orders')
  @RequireMenu(MENU, 'V')
  listOrders(
    @Query('status')      status?: string,
    @Query('waveDate')    waveDate?: string,
    @Query('companyCode') companyCode?: string,
    @Query('page')        page?: string,
    @Query('pageSize')    pageSize?: string,
  ) {
    return this.deliverySvc.listOrders({
      status,
      waveDate,
      companyCode,
      page:     page     ? Number(page)     : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      ...this.driverFilter(),
    } as any);
  }

  // ── 配送单详情 ────────────────────────────────────────────────────────────

  @Get('orders/:id')
  @RequireMenu(MENU, 'V')
  findById(@Param('id') id: string) {
    return this.deliverySvc.findById(id);
  }

  // ── 状态机：装车 ──────────────────────────────────────────────────────────

  @Post('orders/:id/start-loading')
  @RequireMenu(MENU, 'C')
  startLoading(@Param('id') id: string, @Body() dto: any) {
    return this.deliverySvc.startLoading(id, dto);
  }

  @Post('orders/:id/finish-loading')
  @RequireMenu(MENU, 'C')
  finishLoading(@Param('id') id: string, @Body() dto: any) {
    return this.deliverySvc.finishLoading(id, dto);
  }

  // ── 状态机：发车 ──────────────────────────────────────────────────────────

  @Post('orders/:id/depart')
  @RequireMenu(MENU, 'C')
  async depart(@Param('id') id: string, @Body() dto: any) {
    const result = await this.deliverySvc.depart(id, dto);
    // Push：通知调度员
    const order = await this.deliverySvc.findById(id).catch(() => null) as any;
    if (order) {
      await this.pushSvc.sendToUser(
        this.user?.userId ?? 0,
        { title: '配送已发车', body: `配送单 ${order.delivery_no ?? id} 已发车，预计送达时间请关注`, url: `/mobile/delivery/orders/${id}`, tag: 'delivery-depart' },
      );
    }
    return result;
  }

  // ── 状态机：到达 ──────────────────────────────────────────────────────────

  @Post('orders/:id/arrive')
  @RequireMenu(MENU, 'C')
  async arrive(@Param('id') id: string, @Body() dto: any) {
    const result = await this.deliverySvc.arrive(id, dto);
    const order  = await this.deliverySvc.findById(id).catch(() => null) as any;
    if (order) {
      await this.pushSvc.sendToUser(
        this.user?.userId ?? 0,
        { title: '已到达客户', body: `配送单 ${order.delivery_no ?? id} 已到达，请开始签收`, url: `/mobile/delivery/orders/${id}`, tag: 'delivery-arrive' },
      );
    }
    return result;
  }

  // ── 正常签收 ──────────────────────────────────────────────────────────────

  @Post('orders/:id/sign')
  @RequireMenu(MENU, 'C')
  async sign(@Param('id') id: string, @Body() dto: any) {
    const result = await this.receiptsSvc.createSigned(id, dto);
    // 签收完成 Push
    await this.pushSvc.sendToUser(
      this.user?.userId ?? 0,
      { title: '签收完成', body: `配送单 ${id} 签收成功`, url: `/mobile/delivery/orders/${id}`, tag: 'delivery-sign' },
    );
    return result;
  }

  // ── 异常签收 → 自动关联 Return Runtime ───────────────────────────────────

  @Post('orders/:id/sign-exception')
  @RequireMenu(MENU, 'C')
  async signException(@Param('id') id: string, @Body() body: {
    deliveryItemId:   string;
    receivedQty:      number;
    exceptionQty:     number;
    exceptionType:    string;
    signedBy?:        string;
    remark?:          string;
    photoUrls?:       string[];
    // 退货信息（用于 Return Runtime）
    customerCode?:    string;
    customerName?:    string;
    companyCode?:     string;
    productCode?:     string;
    productName?:     string;
    unitPrice?:       number;
  }) {
    // 1. 创建异常签收记录
    const receipt = await this.receiptsSvc.createException(id, {
      deliveryItemId: body.deliveryItemId,
      receivedQty:    body.receivedQty,
      exceptionQty:   body.exceptionQty,
      exceptionType:  body.exceptionType,
      signedBy:       body.signedBy,
      remark:         body.remark,
      photoUrls:      body.photoUrls,
    } as any);

    // 2. 有异常数量时自动创建 Return Order（DELIVERY_REJECT）
    let returnOrder: any = null;
    if (body.exceptionQty > 0 && body.customerCode && body.companyCode && body.productCode) {
      try {
        returnOrder = await this.returnsSvc.create({
          deliveryOrderId: id,
          customerCode:    body.customerCode,
          customerName:    body.customerName,
          companyCode:     body.companyCode,
          returnType:      'DELIVERY_REJECT',
          reasonCode:      body.exceptionType,
          remark:          body.remark,
          items: [{
            productCode:  body.productCode,
            productName:  body.productName,
            returnedQty:  body.exceptionQty,
            unitPrice:    body.unitPrice ?? 0,
            remark:       body.exceptionType,
          }],
        });
        this.logger.log(`[MobileDelivery] 异常签收 → Return Order ${returnOrder?.return_no ?? returnOrder?.id}`);
      } catch (err: any) {
        this.logger.warn(`[MobileDelivery] Return Order 创建失败（不阻断签收）: ${err.message}`);
      }
    }

    // 3. Push 通知：异常签收
    await this.pushSvc.sendToUser(
      this.user?.userId ?? 0,
      {
        title: '⚠️ 异常签收',
        body:  `配送单 ${id} 出现异常签收，异常类型：${body.exceptionType}`,
        url:   `/mobile/delivery/orders/${id}`,
        tag:   'delivery-exception',
      },
    );

    return { receipt, returnOrder };
  }

  // ── 签收照片上传（保存 photo_urls 到签收记录） ────────────────────────────

  @Post('orders/:id/photos')
  @RequireMenu(MENU, 'C')
  async savePhotos(@Param('id') id: string, @Body() body: { photos: string[] }) {
    // 直接更新 sal_delivery_orders 的 photo_urls 字段
    const svc = this.deliverySvc as any;
    const ds  = svc.ds ?? (svc as any)['dataSource'];
    if (ds) {
      await ds.query(
        `UPDATE sal_delivery_orders SET photo_urls = $1 WHERE id = $2`,
        [JSON.stringify(body.photos ?? []), id],
      );
    }
    return { code: 200, orderId: id, photoCount: body.photos?.length ?? 0 };
  }

  // ── 司机绩效统计 ──────────────────────────────────────────────────────────────
  @Get('performance')
  @RequireMenu(MENU, 'V')
  async performance(@Query('period') period?: string) {
    return this.deliverySvc.getDriverPerformance(
      String(this.user?.userId ?? this.user?.user_id ?? ''),
      period ?? 'today',
    );
  }

  // ── 异常配送记录列表 ──────────────────────────────────────────────────────────
  @Get('exceptions')
  @RequireMenu(MENU, 'V')
  listExceptions(
    @Query('page')     page?:     string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.deliverySvc.listOrders({
      status:   'EXCEPTION',
      page:     page     ? Number(page)     : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      ...this.driverFilter(),
    } as any);
  }
}
