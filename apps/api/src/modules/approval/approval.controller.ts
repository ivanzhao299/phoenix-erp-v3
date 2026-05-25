import { Controller, Post, Body, Param, Req, UseGuards, Header } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';

/** @deprecated V1 规则审批，已被 ApprovalEngine (/api/approval/*) 替代 */
@Controller('api/v3/approval')
@UseGuards(MenuGuard)
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Post('submit')
  @RequireMenu('MENU_APPROVAL', 'C')
  @Header('X-Deprecated', 'true')
  @Header('X-Replaced-By', '/api/approval/*')
  async submitForApproval(@Body() dto: { docType: string; docId: number; amount: number; currencyCode: string }) {
    // 假设 req.user 已由 jwt.strategy 注入，为了演示先默认 1
    const submitterId = 1; 
    const chain = await this.approvalService.submitForApproval({
      ...dto,
      submitterId,
    });
    return { success: true, requiredChain: chain };
  }

  @Post(':docType/:docId/approve')
  @RequireMenu('MENU_APPROVAL', 'A')
  @Header('X-Deprecated', 'true')
  @Header('X-Replaced-By', '/api/approval/instances/:id/approve')
  async approveDocument(
    @Param('docType') docType: string,
    @Param('docId') docId: number,
    @Body('comment') comment: string,
    @Req() req: any,
  ) {
    const approverId = req.user?.userId || 1;
    // 取用户最高权限角色或者从前端传入当前担任的审批角色
    const roleCode = req.user?.roles?.[0] || 'ROLE_UNKNOWN'; 
    return await this.approvalService.approveDocument(docType, docId, approverId, roleCode, comment);
  }
}
