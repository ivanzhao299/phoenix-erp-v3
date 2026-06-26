import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { MenuGuard, RequireMenu } from './common/guards/menu.guard';

@Controller('api/v3/debug')
@UseGuards(MenuGuard)
export class DebugController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  @Get('migrated-data')
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async getMigratedData() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Debug endpoint is disabled in production');
    }

    const userCount = await this.em.query('SELECT COUNT(*) FROM sys_user');
    const cashFlowCount = await this.em.query('SELECT COUNT(*) FROM biz_cash_flow');
    const downgradedCount = await this.em.query("SELECT COUNT(*) FROM biz_cash_flow WHERE status = 'PENDING_APPROVAL'");

    return {
      stats: {
        totalUsers: userCount[0].count,
        totalCashFlows: cashFlowCount[0].count,
        downgradedCashFlows: downgradedCount[0].count,
      },
    };
  }
}
