import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { MenuGuard, RequireMenu } from './common/guards/menu.guard';

@Controller('api/v3/debug')
@UseGuards(MenuGuard)
export class DebugController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  @Get('migrated-data')
  @RequireMenu('MENU_SYSTEM', 'V')
  async getMigratedData() {
    const users = await this.em.query('SELECT * FROM sys_user ORDER BY user_id DESC LIMIT 5');
    const cashFlows = await this.em.query('SELECT * FROM biz_cash_flow ORDER BY id ASC LIMIT 5');
    const approvalLogs = await this.em.query('SELECT * FROM sys_approval_log ORDER BY id ASC LIMIT 5');
    
    // 统计数据
    const userCount = await this.em.query('SELECT COUNT(*) FROM sys_user');
    const cashFlowCount = await this.em.query('SELECT COUNT(*) FROM biz_cash_flow');
    const downgradedCount = await this.em.query("SELECT COUNT(*) FROM biz_cash_flow WHERE status = 'PENDING_APPROVAL'");

    return {
      stats: {
        totalUsers: userCount[0].count,
        totalCashFlows: cashFlowCount[0].count,
        downgradedCashFlows: downgradedCount[0].count,
      },
      samples: {
        users,
        cashFlows,
        approvalLogs,
      }
    };
  }
}
