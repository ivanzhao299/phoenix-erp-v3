import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/guards/menu.guard';
import { BackgroundTaskService } from './background-task.service';

@Controller('api/internal/background')
export class BackgroundStatusController {
  constructor(private readonly tasks: BackgroundTaskService) {}
  @Public()
  @Get('status')
  status(@Req() request: Request) {
    // Deliberately ignores trust-proxy, X-Forwarded-For and request.ip.
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) throw new ForbiddenException();
    return this.tasks.status();
  }
}
