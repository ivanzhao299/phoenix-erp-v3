import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** Validate and persist flock provenance in one transaction. Legacy names are display only. */
export async function writeFlock(
  manager: EntityManager,
  body: Record<string, unknown>,
  existing?: { pkName: string; id: unknown },
): Promise<{ msg: string }> {
  const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!body || !Object.keys(body).length || Object.keys(body).some(key => !safe.test(key))) {
    throw new BadRequestException('鸡群写入字段无效');
  }
  if (existing && existing.pkName !== 'flock_no') throw new BadRequestException('鸡群必须使用 flock_no 标识');
  return manager.transaction(async tx => {
    const current = existing
      ? (await tx.query('SELECT * FROM brd_flocks WHERE flock_no=$1 FOR UPDATE', [existing.id]))[0]
      : undefined;
    if (existing && !current) throw new BadRequestException('鸡群不存在');
    if (current && body.flock_no !== undefined && body.flock_no !== current.flock_no) {
      throw new BadRequestException('鸡群编码为稳定身份，禁止修改');
    }
    const merged = { ...current, ...body };
    if (typeof merged.breed_code !== 'string' || !merged.breed_code.trim() || merged.breed_code !== merged.breed_code.trim()) {
      throw new BadRequestException('请选择标准 BRD_BREED 品种；无法识别的历史名称不得自动代填');
    }
    const breeds = await tx.query(
      `SELECT dict_code, dict_label_zh FROM sys_dict WHERE dict_type='BRD_BREED' AND dict_code=$1 AND status='ACTIVE' FOR SHARE`,
      [merged.breed_code],
    );
    if (breeds.length !== 1) throw new BadRequestException('鸡群品种不是唯一有效的 BRD_BREED 标准码');
    const ownership = await tx.query(
      `SELECT h.farm_code, f.company_code, f.mapped_site_code FROM brd_houses h
         JOIN brd_farms f ON f.farm_code=h.farm_code
        WHERE h.house_code=$1 AND h.status='ACTIVE' AND f.status='ACTIVE' FOR SHARE OF h,f`,
      [merged.house_code],
    );
    if (ownership.length !== 1 || ownership[0].farm_code !== merged.farm_code) {
      throw new BadRequestException('鸡舍与农场归属不一致或未启用');
    }
    const owner = ownership[0];
    if (!owner.company_code || (merged.company_code && merged.company_code !== owner.company_code)
      || (merged.site_code && merged.site_code !== owner.mapped_site_code)) {
      throw new BadRequestException('鸡群公司/场站与鸡舍权威归属不一致');
    }
    // A breed/house/date correction must not silently relabel already recorded production.
    const identityFields = ['breed_code', 'house_code', 'farm_code', 'placement_date', 'start_date', 'elimination_date'];
    if (current && identityFields.some(key => Object.prototype.hasOwnProperty.call(body, key) && String(body[key] ?? '') !== String(current[key] ?? ''))) {
      const facts = await tx.query('SELECT 1 FROM brd_daily_logs WHERE flock_no=$1 LIMIT 1', [current.flock_no]);
      if (facts.length) throw new BadRequestException('鸡群已有生产日报，品种/归属/在栏日期修正须走专项追溯治理');
    }
    const valuesBody: Record<string, unknown> = { ...body,
      ...(body.start_date && !merged.placement_date ? { placement_date: body.start_date } : {}),
      breed_code: merged.breed_code,
      strain: breeds[0].dict_label_zh || merged.breed_code,
      breed_type: breeds[0].dict_label_zh || merged.breed_code,
      company_code: owner.company_code,
      site_code: owner.mapped_site_code || null,
    };
    const fields = Object.keys(valuesBody);
    const values = Object.values(valuesBody);
    if (existing) {
      const updates = fields.map((field, index) => `"${field}"=$${index + 1}`);
      if (!fields.includes('updated_at')) updates.push('updated_at=NOW()');
      await tx.query(`UPDATE brd_flocks SET ${updates.join(',')} WHERE flock_no=$${values.length + 1}`, [...values, existing.id]);
    } else {
      await tx.query(`INSERT INTO brd_flocks (${fields.map(field => `"${field}"`).join(',')}) VALUES (${values.map((_, index) => `$${index + 1}`).join(',')})`, values);
    }
    return { msg: existing ? 'Updated successfully' : 'Created successfully' };
  });
}
