import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { PdaTerminalsService } from './pda-terminals.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// [Fix Pack 1 — HIGH-2] 替换 AuthGuard → MenuGuard，添加 RequireMenu
// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/pda')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_PDA', 'V')
export class PdaController {
  constructor(
    private readonly terminalService: TerminalService,
    private readonly pdaTerminalsService: PdaTerminalsService,
  ) {}

  @Get('inventory/:warehouse_code')
  async syncInventory(@Param('warehouse_code') warehouseCode: string) {
    return await this.terminalService.pdaSyncInventory(warehouseCode);
  }

  @Post('scan')
  async scanBarcode(@Body('barcode') barcode: string) {
    return await this.terminalService.pdaScanBarcode(barcode);
  }

  // ═══ V2 fidelity: 终端 CRUD ═══════════════════════════════════════════
  @Get('terminals')
  async listTerminals() {
    return await this.pdaTerminalsService.listTerminals();
  }

  @Post('terminals')
  async createTerminal(@Body() body: any) {
    return await this.pdaTerminalsService.createTerminal(body);
  }

  @Put('terminals/:id')
  async updateTerminal(@Param('id') id: string, @Body() body: any) {
    return await this.pdaTerminalsService.updateTerminal(id, body);
  }

  @Delete('terminals/:id')
  async deleteTerminal(@Param('id') id: string) {
    return await this.pdaTerminalsService.deleteTerminal(id);
  }

  // ═══ 全局系统配置（受保护） ═══════════════════════════════════════════
  @Put('system-config')
  async updateSystemConfig(@Body() body: any) {
    return await this.pdaTerminalsService.updateSystemConfig(body);
  }
}

// 设备端公开路径（无需 JWT —— 局域网/扫码场景）
@Controller('api/pda')
export class PdaPublicController {
  constructor(private readonly pdaTerminalsService: PdaTerminalsService) {}

  @Post('register')
  async register(@Body() body: any) {
    return await this.pdaTerminalsService.register(body);
  }

  @Post('heartbeat')
  async heartbeat(@Body() body: any) {
    return await this.pdaTerminalsService.heartbeat(body);
  }

  @Get('system-config')
  async getSystemConfig() {
    return await this.pdaTerminalsService.getSystemConfig();
  }

  @Get('scanner-config/:serial')
  async getScannerConfig(@Param('serial') serial: string) {
    return await this.pdaTerminalsService.getScannerConfig(serial);
  }
}

// /api/pda/app 版本检查
@Controller('api/pda/app')
export class PdaAppController {
  /** V2 fidelity: APK 元信息 */
  @Get('info')
  async info() {
    // V2 用文件系统判断；V3 简化为静态版本（实际 APK 由前端 /downloads 静态路径提供）
    return {
      available: true,
      version: '3.0.0',
      size: null,
      date: new Date().toISOString().slice(0, 10),
      msg: 'PDA APK 元信息',
    };
  }

  @Get('latest')
  async getLatestVersion() {
    return { code: 200, data: { version: '3.0.0', url: '/downloads/pda-v3.apk' } };
  }
}
