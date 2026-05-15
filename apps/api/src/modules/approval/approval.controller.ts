import { Controller, Post, Body, Param, Req } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { RequireMenu } from '../../common/guards/menu.guard';

@Controller('api/v3/approval')
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Post('submit')
  @RequireMenu('MENU_APPROVAL', 'C')
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
