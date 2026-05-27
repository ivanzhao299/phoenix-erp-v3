import {
  Controller, Get, Post, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { PriceRuntimeService } from '../services/price-runtime.service';
import { ResolvePriceDto, ValidatePriceDto } from '../dto/price-item.dto';

@Controller('api/v2/sales/pricing')
@UseGuards(MenuGuard)
export class SalesPriceRuntimeController {
  constructor(private readonly svc: PriceRuntimeService) {}

  /**
   * POST /api/v2/sales/pricing/resolve-price
   * 价格解析：输入客户/渠道/品级/规格/数量，输出命中价格
   */
  @Post('resolve-price')
  @RequireMenu('MENU_SALES2_PRICE', 'V')
  @HttpCode(HttpStatus.OK)
  resolvePrice(@Body() dto: ResolvePriceDto) {
    return this.svc.resolvePrice(dto);
  }

  /**
   * POST /api/v2/sales/pricing/validate-price
   * 价格校验：实际报价是否低于底价，返回 needApproval
   */
  @Post('validate-price')
  @RequireMenu('MENU_SALES2_PRICE', 'V')
  @HttpCode(HttpStatus.OK)
  validatePrice(@Body() dto: ValidatePriceDto) {
    return this.svc.validatePrice(dto);
  }

  /**
   * GET /api/v2/sales/pricing/current
   * 当前生效价格（移动端动态价格入口）
   * 按 grade + packagingSpec 聚合最高优先级价格
   */
  @Get('current')
  @RequireMenu('MENU_SALES2_PRICE', 'V')
  getCurrentPrices(@Query('companyCode') companyCode?: string) {
    return this.svc.getCurrentPrices(companyCode);
  }
}
