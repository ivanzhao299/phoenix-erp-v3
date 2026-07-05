import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { BugIntakeService, BugReportPayload, BugReportUser } from './bug-intake.service';

type AuthedRequest = Request & { user?: BugReportUser };

@Controller('api/bug-intake')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class BugIntakeController {
  constructor(private readonly service: BugIntakeService) {}

  @Post('reports')
  @UseInterceptors(FilesInterceptor('screenshots', 5, {
    storage: memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
  }))
  async create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('payload') payloadRaw: string,
    @Req() req: AuthedRequest,
  ) {
    const payload = this.parsePayload(payloadRaw);
    return this.service.create(payload, files ?? [], req.user ?? {}, this.reqMeta(req));
  }

  @Get('reports')
  @RequireMenu('MENU_BUG_REPORT', 'V')
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.service.list({ page: Number(page) || 1, limit: Number(limit) || 20, status, keyword });
  }

  @Get('reports/:bugNo')
  @RequireMenu('MENU_BUG_REPORT', 'V')
  async detail(@Param('bugNo') bugNo: string) {
    return this.service.detail(bugNo);
  }

  @Patch('reports/:bugNo/status')
  @RequireMenu('MENU_BUG_REPORT', 'E')
  async updateStatus(
    @Param('bugNo') bugNo: string,
    @Body() body: { status?: string; resolutionNote?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.service.updateStatus(bugNo, body, req.user ?? {}, this.reqMeta(req));
  }

  @Patch('reports/:bugNo/triage')
  @RequireMenu('MENU_BUG_REPORT', 'E')
  async updateTriage(
    @Param('bugNo') bugNo: string,
    @Body() body: {
      status?: string;
      priority?: string;
      moduleCode?: string;
      assigneeUsername?: string;
      assigneeName?: string;
      resolutionNote?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    return this.service.updateTriage(bugNo, body, req.user ?? {}, this.reqMeta(req));
  }

  @Post('reports/:bugNo/repair-task')
  @RequireMenu('MENU_BUG_REPORT', 'E')
  async createRepairTask(
    @Param('bugNo') bugNo: string,
    @Body() body: { acceptanceCriteria?: string; suggestedOwner?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.service.createRepairTask(bugNo, body, req.user ?? {}, this.reqMeta(req));
  }

  @Post('reports/:bugNo/agent-plan')
  @RequireMenu('MENU_BUG_REPORT', 'E')
  async generateAgentPlan(
    @Param('bugNo') bugNo: string,
    @Req() req: AuthedRequest,
  ) {
    return this.service.generateAgentPlan(bugNo, req.user ?? {}, this.reqMeta(req));
  }

  @Post('reports/:bugNo/agent-approval')
  @RequireMenu('MENU_BUG_REPORT', 'E')
  async approveAgentExecution(
    @Param('bugNo') bugNo: string,
    @Body() body: { approvalScope?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.service.approveAgentExecution(bugNo, body, req.user ?? {}, this.reqMeta(req));
  }

  @Get('reports/:bugNo/attachments/:fileName')
  @RequireMenu('MENU_BUG_REPORT', 'V')
  @Header('Cache-Control', 'private, max-age=60')
  async attachment(
    @Param('bugNo') bugNo: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const file = await this.service.getAttachment(bugNo, decodeURIComponent(fileName));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    file.stream.pipe(res);
  }

  private parsePayload(payloadRaw: string): BugReportPayload {
    try {
      return JSON.parse(payloadRaw || '{}') as BugReportPayload;
    } catch {
      return {};
    }
  }

  private reqMeta(req: Request) {
    return {
      ip: ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || ''),
      userAgent: String(req.headers['user-agent'] ?? ''),
    };
  }
}
