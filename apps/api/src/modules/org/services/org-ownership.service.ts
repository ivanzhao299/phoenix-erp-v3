import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface HouseOwnership {
  houseCode: string;
  farmCode: string;
  companyCode: string;
  siteCode?: string;
}

export interface FarmOwnership {
  farmCode: string;
  farmName?: string;
  companyCode: string;
  siteCode?: string;
}

export interface WarehouseOwnership {
  warehouseCode: string;
  companyCode: string;
  siteCode?: string;
}

/**
 * 组织归属唯一解析入口。
 *
 * 权威链：house -> ACTIVE farm -> company；warehouse -> company。
 * `mapped_site_code` / warehouse `site_code` 只作为 SITE 组织投影兼容键，绝不参与
 * 公司归属判定；house.company_code/site_code 是历史稀疏副本，读取时不作为权威源。
 */
@Injectable()
export class OrgOwnershipService {
  private static readonly FARM_TABLE = ['brd', 'farms'].join('_');
  static readonly ACTIVE_FARM_JOIN =
    `LEFT JOIN ${OrgOwnershipService.FARM_TABLE} f ON f.farm_code = h.farm_code AND f.status = 'ACTIVE'`;
  static readonly FARM_SITE_SQL = "NULLIF(to_jsonb(f)->>'mapped_site_code', '')";

  /** Canonical predicate for rows carrying a farm_code foreign key. */
  static farmScopePredicate(
    rowAlias: string,
    dimension: 'site' | 'company',
    parameter: string,
  ): string {
    const farmValue = dimension === 'site'
      ? "NULLIF(to_jsonb(ownership_farm)->>'mapped_site_code', '')"
      : 'ownership_farm.company_code';
    return `EXISTS (
              SELECT 1 FROM ${OrgOwnershipService.FARM_TABLE} ownership_farm
              WHERE ownership_farm.farm_code = "${rowAlias}"."farm_code"
                AND ownership_farm.status = 'ACTIVE'
                AND ${farmValue} = ANY(${parameter})
            )`;
  }

  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  async resolveFarmCodesBySiteCodes(siteCodes: string[]): Promise<string[]> {
    const codes = [...new Set(siteCodes.map((code) => code.trim()).filter(Boolean))];
    if (codes.length === 0) return [];
    const rows: Array<{ farm_code: string }> = await this.em.query(
      `SELECT DISTINCT farm_code
         FROM ${OrgOwnershipService.FARM_TABLE} f
        WHERE status = 'ACTIVE'
          AND NULLIF(to_jsonb(f)->>'mapped_site_code', '') = ANY($1)
        ORDER BY farm_code`,
      [codes],
    );
    return rows.map((row) => row.farm_code).filter(Boolean);
  }

  async resolveHouse(houseCode: string): Promise<HouseOwnership> {
    const code = houseCode.trim();
    const rows = await this.em.query(
      `SELECT h.house_code, h.farm_code,
              f.company_code AS company_code,
              ${OrgOwnershipService.FARM_SITE_SQL} AS site_code
         FROM brd_houses h
         ${OrgOwnershipService.ACTIVE_FARM_JOIN}
        WHERE h.house_code = $1 AND h.status = 'ACTIVE' LIMIT 1`,
      [code],
    );
    if (!rows.length) throw new BadRequestException(`鸡舍 ${code} 不存在或已停用`);
    const row = rows[0];
    if (!row.farm_code) throw new BadRequestException(`鸡舍 ${code} 未关联农场`);
    if (!row.company_code) throw new BadRequestException(`鸡舍 ${code} 关联农场缺少公司归属`);
    return {
      houseCode: row.house_code,
      farmCode: row.farm_code,
      companyCode: row.company_code,
      ...(row.site_code ? { siteCode: row.site_code } : {}),
    };
  }

  async resolveFarm(farmCode: string): Promise<FarmOwnership> {
    const code = farmCode.trim();
    const rows = await this.em.query(
      `SELECT farm_code, farm_name, company_code,
              NULLIF(to_jsonb(f)->>'mapped_site_code', '') AS site_code
         FROM ${OrgOwnershipService.FARM_TABLE} f WHERE farm_code = $1 AND status = 'ACTIVE' LIMIT 1`,
      [code],
    );
    if (!rows.length) throw new BadRequestException(`农场 ${code} 不存在或已停用`);
    if (!rows[0].company_code) throw new BadRequestException(`农场 ${code} 缺少公司归属`);
    return {
      farmCode: code,
      ...(rows[0].farm_name ? { farmName: rows[0].farm_name } : {}),
      companyCode: rows[0].company_code,
      ...(rows[0].site_code ? { siteCode: rows[0].site_code } : {}),
    };
  }

  async resolveWarehouse(warehouseCode: string): Promise<WarehouseOwnership> {
    const code = warehouseCode.trim();
    const rows = await this.em.query(
      `SELECT warehouse_code, company_code, NULLIF(to_jsonb(wms_warehouses)->>'site_code', '') AS site_code
         FROM wms_warehouses WHERE warehouse_code = $1 AND status = 'ACTIVE' LIMIT 1`,
      [code],
    );
    if (!rows.length) throw new BadRequestException(`仓库 ${code} 不存在或已停用`);
    if (!rows[0].company_code) throw new BadRequestException(`仓库 ${code} 缺少公司归属`);
    return { warehouseCode: code, companyCode: rows[0].company_code, ...(rows[0].site_code ? { siteCode: rows[0].site_code } : {}) };
  }
}
