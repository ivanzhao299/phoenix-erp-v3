import { Controller, Get, Put, Body, UseGuards, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { API_BOOTSTRAP_SCHEMA_CONTRACT, assertExistingSchema, schemaMismatch } from '../../common/database/schema-compatibility';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

const DEFAULT_BRAND = {
  system_name:   '凤凰农业ERP管理系统',
  company_name:  '凤凰农业食品集团',
  logo_url:      '',
  favicon_url:   '',
  footer_text:   '© 2026 Phoenix ERP · All rights reserved',
  primary_color: '#f59e0b',
  label_logo_url:'',
};

// [Phase R1 — HIGH-3] 替换 AuthGuard('jwt') → MenuGuard + DataScopeGuard
@Controller('api/master')
@UseGuards(MenuGuard, DataScopeGuard)
export class MasterController {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  @Get('stores')
  async getStores() {
    try {
      const rows = await this.entityManager.query(
        `SELECT * FROM mst_stores WHERE status='ACTIVE' ORDER BY store_code`
      );
      return { code: 200, data: rows };
    } catch (e) {
      throw new InternalServerErrorException((e as Error).message);
    }
  }

  @Get('products')
  async getProducts() {
    try {
      const rows = await this.entityManager.query(
        `SELECT * FROM mst_products WHERE status='ACTIVE' ORDER BY product_code`
      );
      return { code: 200, data: rows };
    } catch (e) {
      throw new InternalServerErrorException((e as Error).message);
    }
  }
}

// ── 系统品牌配置 (/api/system/brand) — 无需 JWT，供登录页使用 ────────────
@Controller('api/system')
export class SystemController implements OnModuleInit {
  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  async onModuleInit() {
    await assertExistingSchema(this.em.query.bind(this.em), {
      sys_settings: API_BOOTSTRAP_SCHEMA_CONTRACT.tables.sys_settings,
    });
  }

  @Get('brand')
  async getBrand() {
    try {
      const rows = await this.em.query(`SELECT key, value FROM sys_settings WHERE key LIKE 'brand.%'`);
      if (rows.length === 0) {
        return { ok: false, data: DEFAULT_BRAND };
      }
      const data: Record<string, string> = { ...DEFAULT_BRAND };
      for (const r of rows) { data[r.key.replace('brand.', '')] = r.value; }
      return { ok: true, data };
    } catch {
      throw schemaMismatch('sys_settings');
    }
  }

  @Put('brand')
  @UseGuards(MenuGuard)
  @RequireMenu('MENU_SETTINGS_BRAND', 'E')
  async updateBrand(@Body() body: any) {
    try {
      const allowed = ['system_name','company_name','tagline','logo_url','favicon_url','footer_text','primary_color','label_logo_url'];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          await this.em.query(
            `INSERT INTO sys_settings (key, value, updated_at) VALUES ($1,$2,NOW())
             ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
            [`brand.${key}`, String(body[key])]
          );
        }
      }
      const rows = await this.em.query(`SELECT key, value FROM sys_settings WHERE key LIKE 'brand.%'`);
      const data: Record<string, string> = { ...DEFAULT_BRAND };
      for (const r of rows) { data[r.key.replace('brand.', '')] = r.value; }
      return { ok: true, data };
    } catch (e) {
      throw new InternalServerErrorException((e as Error).message);
    }
  }
}
