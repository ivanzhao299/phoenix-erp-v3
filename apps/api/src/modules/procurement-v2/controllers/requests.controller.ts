import {
  Controller, Get, Post, Patch,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../../modules/org/guards/data-scope.guard';

import { RequestsService }              from '../services/requests.service';
import { CreatePurchaseRequestDto }     from '../dto/create-purchase-request.dto';
import { UpdatePurchaseRequestDto }     from '../dto/update-purchase-request.dto';
import { QueryPurchaseRequestDto }      from '../dto/query-purchase-request.dto';
import { SubmitPurchaseRequestDto }     from '../dto/submit-purchase-request.dto';
import { ApprovePurchaseRequestDto }    from '../dto/approve-purchase-request.dto';
import { RejectPurchaseRequestDto }     from '../dto/reject-purchase-request.dto';
import { CancelPurchaseRequestDto }     from '../dto/cancel-purchase-request.dto';

const MENU_REQUEST = 'MENU_PRC2_REQUEST';
const LEGACY_MASTER_MENU = ['MENU_PRC2_MASTER'];

@Controller('api/v2/procurement/requests')
@UseGuards(MenuGuard, DataScopeGuard)
export class RequestsController {
  constructor(private readonly svc: RequestsService) {}

  /** GET /api/v2/procurement/requests  — 分页列表 */
  @Get()
  @RequireMenu(MENU_REQUEST, 'V', LEGACY_MASTER_MENU)
  list(@Query() query: QueryPurchaseRequestDto) {
    return this.svc.list(query);
  }

  /** GET /api/v2/procurement/requests/:id  — 详情（含明细行 + 审批日志） */
  @Get(':id')
  @RequireMenu(MENU_REQUEST, 'V', LEGACY_MASTER_MENU)
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  /** GET /api/v2/procurement/requests/:id/approvals  — 审批日志 */
  @Get(':id/approvals')
  @RequireMenu(MENU_REQUEST, 'V', LEGACY_MASTER_MENU)
  getApprovals(@Param('id') id: string) {
    return this.svc.getApprovals(id);
  }

  /** POST /api/v2/procurement/requests  — 新建 */
  @Post()
  @RequireMenu(MENU_REQUEST, 'C', LEGACY_MASTER_MENU)
  create(@Body() dto: CreatePurchaseRequestDto) {
    return this.svc.create(dto);
  }

  /** PATCH /api/v2/procurement/requests/:id  — 更新（仅 DRAFT） */
  @Patch(':id')
  @RequireMenu(MENU_REQUEST, 'E', LEGACY_MASTER_MENU)
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseRequestDto) {
    return this.svc.update(id, dto);
  }

  /** POST /api/v2/procurement/requests/:id/submit  — 提交审批 */
  @Post(':id/submit')
  @RequireMenu(MENU_REQUEST, 'E', LEGACY_MASTER_MENU)
  submit(@Param('id') id: string, @Body() dto: SubmitPurchaseRequestDto) {
    return this.svc.submit(id, dto);
  }

  /** POST /api/v2/procurement/requests/:id/approve  — 批准 */
  @Post(':id/approve')
  @RequireMenu(MENU_REQUEST, 'A', LEGACY_MASTER_MENU)
  approve(@Param('id') id: string, @Body() dto: ApprovePurchaseRequestDto) {
    return this.svc.approve(id, dto);
  }

  /** POST /api/v2/procurement/requests/:id/reject  — 拒绝 */
  @Post(':id/reject')
  @RequireMenu(MENU_REQUEST, 'A', LEGACY_MASTER_MENU)
  reject(@Param('id') id: string, @Body() dto: RejectPurchaseRequestDto) {
    return this.svc.reject(id, dto);
  }

  /** POST /api/v2/procurement/requests/:id/cancel  — 取消 */
  @Post(':id/cancel')
  @RequireMenu(MENU_REQUEST, 'E', LEGACY_MASTER_MENU)
  cancel(@Param('id') id: string, @Body() dto: CancelPurchaseRequestDto) {
    return this.svc.cancel(id, dto);
  }
}
