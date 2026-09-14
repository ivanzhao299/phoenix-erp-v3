import 'reflect-metadata';
import { randomBytes, randomUUID } from 'crypto';
import { resolve } from 'path';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { SysUserEntity } from './entities/sys-user.entity';
import { SysUserRoleEntity } from '../modules/permissions/entities/sys-user-role.entity';
import { WfApprovalRuleEntity } from '../modules/approval-engine/entities/wf-approval-rule.entity';
import { WfApprovalRuleStepEntity } from '../modules/approval-engine/entities/wf-approval-rule-step.entity';
import { WfApprovalInstanceEntity } from '../modules/approval-engine/entities/wf-approval-instance.entity';
import { WfApprovalInstanceStepEntity } from '../modules/approval-engine/entities/wf-approval-instance-step.entity';

// Only this test controller is synthetic. Login, JWT verification, repositories and PG are real.
@Controller('test-alignment')
class IdentityController {
  @Get() @UseGuards(AuthGuard('jwt')) identity(@Req() req: any) { return req.user; }
}
(process.env.PACKAGING_HISTORY_PG === '1' ? describe : describe.skip)('A/B entity alignment real PG18 and HTTP', () => {
  let app: any, ds: DataSource, base: string, secret: string;
  const suffix = randomUUID().slice(0, 8), ids = new Map<string, string>();
  beforeAll(async () => {
    secret = randomBytes(32).toString('hex'); process.env.JWT_SECRET = secret;
    process.env.ENABLE_DEV_LOGIN = 'false'; delete process.env.JWT_SECRET_PREV;
    const { AuthModule } = await import('./auth.module');
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      TypeOrmModule.forRoot({ type: 'postgres', host: '127.0.0.1', port: 55432, username: 'postgres', database: 'packaging_history_test',
        entities: [resolve(__dirname, '../**/*.entity.ts')], synchronize: false, logging: false }),
      ThrottlerModule.forRoot([{ name: 'login', ttl: 900000, limit: 100 }]), AuthModule,
    ], controllers: [IdentityController] }).compile();
    app = module.createNestApplication({ logger: false }); await app.init(); ds = app.get(DataSource);
    const [identity] = await ds.query("SELECT current_database() db,current_setting('server_version_num') version");
    expect(identity).toEqual({ db: 'packaging_history_test', version: '180006' });
    await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  }, 60000);
  afterAll(async () => { await app?.close(); delete process.env.JWT_SECRET; });
  async function account(large = false) {
    const username = 'TEST-AB-' + randomUUID().slice(0, 12), password = randomBytes(18).toString('hex');
    // Explicit high IDs do not alter the ordinary user sequence. Each run gets unique IDs.
    const id = large ? (9007199254740992n + BigInt('0x' + randomBytes(5).toString('hex'))).toString() : undefined;
    const repo = ds.getRepository(SysUserEntity);
    const fields = { username, real_name: 'TEST真实姓名', password_hash: await bcrypt.hash(password, 4), note: 'TEST literal note / ຊື່', store_code: null };
    // TypeORM generated columns intentionally use DEFAULT on insert; seed the extreme
    // physical PK explicitly, then exercise real ORM hydration/update/relations.
    if (id) await ds.query('INSERT INTO sys_user(user_id,username,real_name,password_hash,note,store_code) VALUES($1,$2,$3,$4,$5,NULL)', [id, username, fields.real_name, fields.password_hash, fields.note]);
    const u = id ? await repo.findOneByOrFail({ id }) : await repo.save(repo.create(fields));
    expect(u.perms_version).toBe('1');
    if (large) expect(BigInt(u.id)).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    ids.set(username, u.id);
    const [role] = await ds.query("INSERT INTO sys_role(role_code,role_name_zh,role_type) VALUES($1,$1,'BUSINESS') RETURNING role_id", [username]);
    await ds.getRepository(SysUserRoleEntity).save({ user_id: u.id, role_id: role.role_id, granted_by: u.id, is_primary: true });
    return { u, username, password, role: role.role_id };
  }
  async function login(a: any) {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: a.username, password: a.password }) });
    const body: any = await r.json(); expect(r.status).toBe(200); expect(typeof body.token).toBe('string'); return body;
  }
  async function identity(token: string) { const r = await fetch(base + '/test-alignment', { headers: { Authorization: 'Bearer ' + token } }); return { status: r.status, body: await r.json() as any }; }
  it('ORM physical ID/defaults/null/note and all three relations hydrate without 42703 or rounding', async () => {
    const a = await account(true), row = await ds.getRepository(SysUserEntity).findOneByOrFail({ id: a.u.id });
    expect(row.id).toBe(a.u.id); expect(typeof row.id).toBe('string'); expect(row.status).toBe(1);
    expect(row.store_code).toBeNull(); expect(row.locale).toBe('zh-CN'); expect(row.perms_version).toBe('2'); // real binding trigger bumps version
    expect(row.real_name_zh).toBe('TEST真实姓名'); expect(row.real_name_lo).toBeUndefined(); expect(row.note).toBe('TEST literal note / ຊື່');
    const relation = await ds.getRepository(SysUserRoleEntity).findOneOrFail({ where: { user_id: row.id }, relations: { user: true, granter: true, role: true } });
    expect(relation.user?.id).toBe(row.id); expect(relation.granter?.id).toBe(row.id); expect(String(relation.role?.role_id)).toBe(String(a.role));
    row.real_name_zh = 'TEST别名更新'; await ds.getRepository(SysUserEntity).save(row);
    const [physical] = await ds.query('SELECT real_name,note FROM sys_user WHERE user_id=$1', [row.id]);
    expect(physical).toEqual({ real_name: 'TEST别名更新', note: 'TEST literal note / ຊື່' });
  });
  it.each([false, true])('HTTP login/me/refresh and guarded JWT preserve DTO aliases, large=%s', async large => {
    const a = await account(large), session = await login(a);
    expect(session.user_info).toMatchObject({ userId: a.u.id, sub: a.u.id, realNameZh: 'TEST真实姓名', realNameLo: '', role: a.username });
    expect(session.user_info).not.toHaveProperty('password_hash'); expect(session.user_info).not.toHaveProperty('note');
    const expected = large ? a.u.id : Number(a.u.id);
    expect((await identity(session.token)).body.userId).toBe(expected);
    const me = await fetch(base + '/api/auth/me', { headers: { Authorization: 'Bearer ' + session.token } });
    expect((await me.json() as any).user.userId).toBe(a.u.id);
    const refreshed = await fetch(base + '/api/auth/refresh', { method: 'POST', headers: { Authorization: 'Bearer ' + session.token } });
    expect((await identity((await refreshed.json() as any).token)).body.userId).toBe(expected);
  });
  it.each([0, -1])('real integer status %s rejects existing guarded JWT and new login', async status => {
    const a = await account(true), session = await login(a);
    await ds.getRepository(SysUserEntity).update(a.u.id, { status, ...(status === -1 ? { archived_at: new Date(), archived_by: a.u.id, archive_reason: 'TEST archive' } : {}) });
    const r = await identity(session.token); expect(r.status).toBe(401); expect(r.body.subcode).toBe('USER_DISABLED');
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: a.username, password: a.password }) }); expect(response.status).toBe(401);
    if (status === -1) expect((await ds.getRepository(SysUserEntity).findOneByOrFail({ id: a.u.id })).archived_by).toBe(a.u.id);
  });
  it('real role visibility revoke + version increment invalidates old token and removes role on login', async () => {
    const a = await account(true), session = await login(a);
    await ds.transaction(async em => { await em.getRepository(SysUserRoleEntity).update({ user_id: a.u.id }, { is_visible: false }); await em.increment(SysUserEntity, { id: a.u.id }, 'perms_version', 1); });
    const r = await identity(session.token); expect(r.status).toBe(401); expect(r.body.subcode).toBe('PERMS_CHANGED');
    const next = await login(a); expect(next.user_info.roles).toEqual([]); expect(next.user_info.role).toBe('ROLE_NONE'); expect(next.user_info.inactiveRoles[0].role_code).toBe(a.username); expect((await identity(next.token)).status).toBe(200);
  });
  it.each([9007199254740992, '9223372036854775808', '1.5', '-1', '0', 'NaN'])('unsafe/out-of-range JWT ID %s is rejected over HTTP', async sub => {
    const token = jwt.sign({ sub, username: 'TEST-INVALID', perms_version: 1 }, secret);
    const r = await identity(token); expect(r.status).toBe(401); expect(r.body.subcode).toBe('INVALID_TOKEN');
  });
  it('approval four-table ORM roundtrip retains long strings, defaults, nulls, named unique/CHECK/GIN', async () => {
    const em = ds.manager, key = 'TEST-AB-' + suffix;
    const rule = await em.getRepository(WfApprovalRuleEntity).save({ ruleCode: key, moduleCode: 'M'.repeat(255), bizType: 'TEST', companyCode: null as any });
    const ruleStep = await em.getRepository(WfApprovalRuleStepEntity).save({ ruleId: rule.id, stepNo: 1, approverRole: 'R'.repeat(255) });
    const instance = await em.getRepository(WfApprovalInstanceEntity).save({ instanceNo: key, moduleCode: 'TEST', bizType: 'SALES_ORDER', bizId: '1', ruleId: rule.id });
    const step = await em.getRepository(WfApprovalInstanceStepEntity).save({ instanceId: instance.id, stepNo: 1, approverName: 'N'.repeat(255) });
    expect((await em.getRepository(WfApprovalRuleEntity).findOneByOrFail({ id: rule.id })).companyCode).toBeNull();
    expect(ruleStep.approverType).toBe('ROLE'); expect(step.status).toBe('PENDING'); expect(instance.triggerCodes).toEqual([]); expect(instance.contextSnapshot).toEqual({});
    await expect(em.getRepository(WfApprovalRuleEntity).insert({ ruleCode: key, moduleCode: 'TEST', bizType: 'TEST' })).rejects.toMatchObject({ driverError: { code: '23505', constraint: 'wf_approval_rules_rule_code_key' } });
    await expect(em.getRepository(WfApprovalInstanceEntity).update(instance.id, { triggerCodes: ['UNKNOWN'] })).rejects.toMatchObject({ driverError: { code: '23514', constraint: 'ck_wf_inst_sales_trigger_codes' } });
    const [index] = await ds.query("SELECT indexdef FROM pg_indexes WHERE indexname='idx_wf_inst_trigger_codes'"); expect(index.indexdef).toContain('USING gin');
  });
  it('DB lifecycle CHECK and single visible-primary unique remain enforced with transactional rollback', async () => {
    const a = await account(true);
    await expect(ds.getRepository(SysUserEntity).update(a.u.id, { status: 2 })).rejects.toMatchObject({ driverError: { code: '23514' } });
    const [role] = await ds.query("INSERT INTO sys_role(role_code,role_name_zh,role_type) VALUES($1,$1,'BUSINESS') RETURNING role_id", ['TEST-SECOND-' + suffix]);
    await expect(ds.transaction(async em => {
      await em.getRepository(SysUserEntity).update(a.u.id, { note: 'must rollback' });
      await em.getRepository(SysUserRoleEntity).insert({ user_id: a.u.id, role_id: role.role_id, is_primary: true });
    })).rejects.toMatchObject({ driverError: { code: '23505', constraint: 'uq_sys_user_role_one_visible_primary' } });
    expect((await ds.getRepository(SysUserEntity).findOneByOrFail({ id: a.u.id })).note).toBe(a.u.note);
  });
});
