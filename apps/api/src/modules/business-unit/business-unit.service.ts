import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * G110/S5 事业群「业务维度」服务（法人树 ⟂ 事业群解耦）。
 *  - biz_business_units      事业群主表
 *  - biz_bu_membership       经营单元(公司/场站) ↔ 事业群 M:N + 权重
 * 仅管经营归类/汇总；不参与权限（DataScope 仍按公司/场站）。
 */
@Injectable()
export class BusinessUnitService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  /** 事业群列表（含成员数） */
  async listBus() {
    return this.ds.query(`
      SELECT b.bu_code, b.bu_name, b.bu_short_name, b.manager_user_id,
             b.sort_order, b.status, b.remark,
             COALESCE(m.cnt, 0)::int AS member_count
        FROM biz_business_units b
        LEFT JOIN (SELECT bu_code, COUNT(*) cnt FROM biz_bu_membership WHERE status='ACTIVE' GROUP BY bu_code) m
               ON m.bu_code = b.bu_code
       ORDER BY b.sort_order, b.bu_code`);
  }

  /** 某事业群的成员（经营单元 + 名称） */
  async getMembers(buCode: string) {
    return this.ds.query(`
      SELECT m.id, m.bu_code, m.org_code, m.org_type, m.weight_pct, m.is_primary, m.status,
             o.org_name, o.org_name_cn
        FROM biz_bu_membership m
        LEFT JOIN sys_organizations o ON o.org_code = m.org_code
       WHERE m.bu_code = $1 AND m.status='ACTIVE'
       ORDER BY m.is_primary DESC, m.org_type, m.org_code`, [buCode]);
  }

  async createBu(dto: any) {
    const code = (dto.bu_code || '').trim();
    const name = (dto.bu_name || '').trim();
    if (!code || !name) throw new BadRequestException('事业群编码和名称必填');
    const dup = await this.ds.query(`SELECT 1 FROM biz_business_units WHERE bu_code=$1`, [code]);
    if (dup.length) throw new BadRequestException(`事业群编码「${code}」已存在`);
    await this.ds.query(
      `INSERT INTO biz_business_units (bu_code, bu_name, bu_short_name, manager_user_id, sort_order, status, remark)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6)`,
      [code, name, dto.bu_short_name ?? null, dto.manager_user_id ?? null, Number(dto.sort_order) || 0, dto.remark ?? null]);
    return { ok: true, bu_code: code };
  }

  async updateBu(buCode: string, dto: any) {
    const sets: string[] = []; const params: any[] = [];
    for (const [k, col] of [['bu_name','bu_name'],['bu_short_name','bu_short_name'],['manager_user_id','manager_user_id'],['sort_order','sort_order'],['status','status'],['remark','remark']] as const) {
      if (dto[k] !== undefined) { params.push(dto[k]); sets.push(`${col}=$${params.length}`); }
    }
    if (!sets.length) return { ok: true };
    params.push(buCode);
    await this.ds.query(`UPDATE biz_business_units SET ${sets.join(', ')}, updated_at=NOW() WHERE bu_code=$${params.length}`, params);
    return { ok: true };
  }

  /** 添加成员（经营单元 ↔ 事业群） */
  async addMember(dto: any) {
    const { bu_code, org_code, org_type } = dto;
    if (!bu_code || !org_code || !org_type) throw new BadRequestException('bu_code/org_code/org_type 必填');
    const exists = await this.ds.query(`SELECT 1 FROM biz_bu_membership WHERE bu_code=$1 AND org_code=$2`, [bu_code, org_code]);
    if (exists.length) throw new BadRequestException('该经营单元已在此事业群');
    await this.ds.query(
      `INSERT INTO biz_bu_membership (bu_code, org_code, org_type, weight_pct, is_primary, status)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE')`,
      [bu_code, org_code, org_type, Number(dto.weight_pct) || 100, dto.is_primary !== false]);
    return { ok: true };
  }

  async removeMember(id: string) {
    await this.ds.query(`DELETE FROM biz_bu_membership WHERE id=$1`, [id]);
    return { ok: true };
  }

  /**
   * BU 经营概览（看板数据源）：每个事业群 → 成员经营单元 + 规模统计。
   *   公司级成员 → 统计其名下 场站/门店 数（按 sys_organizations.company_code 归集）。
   */
  async overview() {
    const bus = await this.listBus();
    const out: any[] = [];
    for (const b of bus) {
      const members = await this.getMembers(b.bu_code);
      const companyCodes = members.filter((m: any) => m.org_type === 'COMPANY').map((m: any) => m.org_code);
      let siteCount = 0, storeCount = 0;
      if (companyCodes.length) {
        // 按树路径统计成员公司下的场站/门店（不依赖 company_code——场站历史 company_code 多为空，
        //   靠 parent_id 挂公司；路径 LIKE 公司 path 前缀更稳健）。
        const compPaths: string[] = (await this.ds.query(
          `SELECT path FROM sys_organizations WHERE org_code = ANY($1) AND path IS NOT NULL`,
          [companyCodes],
        )).map((r: any) => r.path);
        if (compPaths.length) {
          const conds = compPaths.map((_, i) => `path LIKE $${i + 1} || '%'`).join(' OR ');
          const rows = await this.ds.query(
            `SELECT org_type, COUNT(*)::int cnt FROM sys_organizations
              WHERE status='ACTIVE' AND org_type IN ('SITE','STORE') AND (${conds})
              GROUP BY org_type`, compPaths);
          for (const r of rows) {
            if (r.org_type === 'SITE') siteCount = r.cnt;
            if (r.org_type === 'STORE') storeCount = r.cnt;
          }
        }
      }
      out.push({
        bu_code: b.bu_code, bu_name: b.bu_name, bu_short_name: b.bu_short_name,
        company_count: companyCodes.length, site_count: siteCount, store_count: storeCount,
        members,
      });
    }
    return out;
  }
}
