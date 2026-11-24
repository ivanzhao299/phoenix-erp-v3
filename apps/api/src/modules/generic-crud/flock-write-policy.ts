import { BadRequestException } from '@nestjs/common';
import { birdCount } from '../farm/daily-stock-policy';
import { EntityManager } from 'typeorm';

/** Validate and persist flock provenance in one transaction. Legacy names are display only. */
export async function writeFlock(
  manager: EntityManager,
  body: Record<string, unknown>,
  existing?: { pkName: string; id: unknown },
): Promise<{ msg: string }> {
  if (body.elimination_date !== undefined) throw new BadRequestException('旧淘汰日期含义待核实，仅可维护计划日期，实际关闭须走生命周期单据');
  const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!body || !Object.keys(body).length || Object.keys(body).some(key => !safe.test(key))) {
    throw new BadRequestException('鸡群写入字段无效');
  }
  if (existing && existing.pkName !== 'flock_no') throw new BadRequestException('鸡群必须使用 flock_no 标识');
  if (!existing) throw new BadRequestException('新鸡群请办理生命周期入栏单，禁止档案直接建立存栏');

  return manager.transaction(async tx => {
    const identity = existing ? (await tx.query('SELECT house_code FROM brd_flocks WHERE flock_no=$1', [existing.id]))[0] : undefined;
    for (const houseCode of [...new Set([identity?.house_code, body.house_code].filter(Boolean))].sort()) {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'), hashtext($1))", [houseCode]);
    }
    const current = existing
      ? (await tx.query(`SELECT *, placement_date::text AS placement_date, start_date::text AS start_date,
          elimination_date::text AS elimination_date FROM brd_flocks WHERE flock_no=$1 FOR UPDATE`, [existing.id]))[0]
      : undefined;
    if (existing && !current) throw new BadRequestException('鸡群不存在');
    if (current && body.flock_no !== undefined && body.flock_no !== current.flock_no) {
      throw new BadRequestException('鸡群编码为稳定身份，禁止修改');
    }
    if (current) {
      if (body.status === 'RETIRED' && current.status !== 'RETIRED') throw new BadRequestException('关闭鸡群请办理生命周期关闭单');
      const [schema] = await tx.query("SELECT to_regclass('brd_flock_balances') AS ledger");
      const managed = schema?.ledger && (await tx.query('SELECT 1 FROM brd_flock_balances WHERE flock_no=$1', [current.flock_no])).length;
      if (managed && ['status','breed_code','farm_code','company_code','site_code','placement_date','start_date'].some(key => body[key] !== undefined && String(body[key] ?? '') !== String(current[key] ?? '') && !(key === 'status' && body.status !== 'RETIRED'))) {
        throw new BadRequestException('已接续事件账的身份/关闭信息须走生命周期流程');
      }
      for (const field of ['current_qty', 'initial_qty', 'current_lay_rate']) {
        if (body[field] !== undefined) throw new BadRequestException('存栏由受控业务账维护，档案禁止直接修改');
      }
      if (body.status === 'RETIRED' && Number(current.current_qty) !== 0) {
        throw new BadRequestException('在栏数量未归零，不能关闭鸡群');
      }
      if (current.status === 'RETIRED' && body.status !== undefined && body.status !== current.status) {
        throw new BadRequestException('已关闭鸡群不可重新启用，请建立新批次');
      }
    } else {
      const initial = birdCount(body.initial_qty ?? body.current_qty ?? 0, '初始存栏');
      if (body.current_qty !== undefined && birdCount(body.current_qty, '初始存栏') !== initial) {
        throw new BadRequestException('新鸡群初始存栏与当前存栏必须一致');
      }
      body = { ...body, initial_qty: initial, current_qty: initial };
      if (body.status === 'RETIRED' && initial > 0) throw new BadRequestException('在栏数量未归零，不能关闭鸡群');
    }
    const nextStatus = body.status ?? current?.status ?? 'GROWING';
    // ACTIVE is read-only legacy compatibility; new/changed values use the governed five states.
    if ((!current || body.status !== undefined && body.status !== current.status)) {
      if (!['GROWING','LAYING','PEAK','DECLINING','RETIRED'].includes(String(nextStatus))) throw new BadRequestException('鸡群状态无效');
      const states = await tx.query("SELECT dict_code FROM sys_dict WHERE dict_type='BRD_FLOCK_STATUS' AND dict_code=$1 AND status='ACTIVE'", [nextStatus]);
      if (!states.length) throw new BadRequestException('鸡群状态未启用');
    }
    if (!current) body.status = nextStatus;
    if (current && body.house_code !== undefined && body.house_code !== current.house_code) {
      throw new BadRequestException('鸡群转舍必须使用生命周期流程，档案禁止直接变更鸡舍');
    }
    if (!current && nextStatus !== 'RETIRED') {
      const occupied = await tx.query("SELECT 1 FROM brd_flocks WHERE house_code=$1 AND (status IS DISTINCT FROM 'RETIRED' OR COALESCE(current_qty,0)>0) LIMIT 1", [body.house_code]);
      if (occupied.length) throw new BadRequestException('鸡舍已有在栏鸡群，请先办理出栏关闭；混群需分栏模型');
    }
    const dateFields = ['placement_date', 'start_date', 'planned_elimination_date'];
    for (const key of dateFields) {
      const value = body[key];
      if (value !== undefined && value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || value.startsWith('0000-') || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) {
        throw new BadRequestException('鸡群日期必须为真实 YYYY-MM-DD，不接受会跨时区漂移的时间戳');
      }
    }
    const merged = { ...current, ...body };
    const dateChanged = !current || dateFields.some(key => Object.prototype.hasOwnProperty.call(body, key)
      && String(body[key] ?? '') !== String(current[key] ?? ''));
    if (dateChanged && merged.placement_date && merged.start_date && merged.placement_date !== merged.start_date) {
      throw new BadRequestException('鸡群入栏日期与开始日期不一致');
    }
    const breedChanged = body.breed_code !== undefined && String(body.breed_code ?? '') !== String(current?.breed_code ?? '');
    let breedLabel: string | null = null;
    if (breedChanged) {
      if (!current?.breed_code?.trim()) throw new BadRequestException('请在鸡群档案使用“确认遗传品种”，由有权限的审核人核对后补录');
      if (typeof body.breed_code !== 'string' || !body.breed_code.trim() || body.breed_code !== body.breed_code.trim()) {
        throw new BadRequestException('请选择有效的遗传品种标准码');
      }
      const breeds = await tx.query(
        `SELECT dict_label_zh FROM sys_dict WHERE dict_type='BRD_BREED' AND dict_code=$1 AND status='ACTIVE' FOR SHARE`,
        [body.breed_code],
      );
      if (breeds.length !== 1) throw new BadRequestException('鸡群品种不是唯一有效的 BRD_BREED 标准码');
      breedLabel = breeds[0].dict_label_zh || body.breed_code;
    }
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
    // Corrections to established identities must not silently relabel already recorded production.
    const identityFields = ['breed_code', 'house_code', 'farm_code', 'placement_date', 'start_date', 'elimination_date'];
    if (current && identityFields.some(key => Object.prototype.hasOwnProperty.call(body, key)
      && String(body[key] ?? '') !== String(current[key] ?? ''))) {
      const facts = await tx.query('SELECT 1 FROM brd_daily_logs WHERE flock_no=$1 LIMIT 1', [current.flock_no]);
      if (facts.length) throw new BadRequestException('鸡群已有生产日报，已登记品种、归属或在栏日期需经追溯更正；请联系生产管理审核人核对原始单据');
    }
    const valuesBody: Record<string, unknown> = { ...body,
      ...(body.start_date && !merged.placement_date ? { placement_date: body.start_date } : {}),
      company_code: owner.company_code,
      site_code: owner.mapped_site_code || null,
    };
    delete valuesBody.strain;
    delete valuesBody.breed_type;
    if (breedChanged) {
      valuesBody.strain = breedLabel;
      valuesBody.breed_type = breedLabel;
    } else {
      delete valuesBody.breed_code;
    }
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
