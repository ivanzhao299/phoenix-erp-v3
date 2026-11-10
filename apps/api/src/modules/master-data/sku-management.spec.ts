import { INestApplication, Injectable } from '@nestjs/common';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ClsModule } from 'nestjs-cls';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request = require('supertest');
import jwt = require('jsonwebtoken');
import { MasterDataRuntimeController } from './master-data-runtime.controller';
import { MasterDataRuntimeService } from './master-data-runtime.service';
import { MasterDataTypeGuard } from '../../common/guards/master-data-type.guard';

const secret = 'sku-management-local-test-only';
@Injectable()
class TestJwtStrategy extends PassportStrategy(Strategy) {
  constructor() { super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: secret }); }
  validate(payload: Record<string, unknown>) { return payload; }
}

describe('SKU management HTTP / service', () => {
  let app: INestApplication;
  const query = jest.fn();
  const service = new MasterDataRuntimeService({ query } as any, {} as any, {} as any, {} as any, {} as any, { get: jest.fn() } as any, {} as any);
  const result = { items: [{ sku_code: 'HISTORICAL', status: 'ARCHIVED', product_code: 'P1' }], total: 27, relatedTotal: 27, statusCounts: { ACTIVE: 20, FROZEN: 6, ARCHIVED: 1 } };
  const get = (suffix = '', permissions: string[] = ['MENU_MD_SKU:V']) => request(app.getHttpServer())
    .get(`/api/master-data/runtime/sku/management${suffix}`)
    .set('Authorization', `Bearer ${jwt.sign({ sub: 'test-user', permissions, roles: [] }, secret)}`);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' }), ClsModule.forRoot({ global: true, middleware: { mount: true } })],
      controllers: [MasterDataRuntimeController],
      providers: [TestJwtStrategy, MasterDataTypeGuard, { provide: MasterDataRuntimeService, useValue: service }],
    }).compile();
    app = module.createNestApplication(); await app.init();
  });
  beforeEach(() => { query.mockReset(); query.mockResolvedValue([result]); });
  afterAll(async () => { await app.close(); });
  it.each(['MENU_MD_SKU:V', 'MENU_MASTER_SKU:V'])('allows explicit %s and returns totals beyond page size and historical states', async permission => {
    const response = await get('?product_code=P1&page=2&pageSize=10', [permission]).expect(200);
    expect(response.body).toEqual({ ...result, page: 2, pageSize: 10 });
    expect(query.mock.calls[0][1]).toEqual(['P1', null, 10, 10]);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('COUNT(*)::int FROM filtered');
    expect(sql).toContain('COUNT(*)::int FROM related');
    expect(sql).toContain('FROM related GROUP BY status');
    expect(sql).not.toContain("status = 'ACTIVE'");
    expect(sql).not.toContain('effective_date');
  });
  it.each(['MENU_MD_PRODUCT:V,C,E', 'MENU_MD_SKU:C', 'MENU_MD_SKU:E', 'MENU_MASTER_SKU:E', 'MENU_SALES2_ORDER:V'])('does not infer SKU management V from %s', async permission => {
    await get('', [permission]).expect(403); expect(query).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => { await request(app.getHttpServer()).get('/api/master-data/runtime/sku/management').expect(401); });
  it('parameterizes product / status and clears product filtering explicitly', async () => {
    await get('?product_code=P%27%20OR%201%3D1--&status=FROZEN&pageSize=1').expect(200);
    expect(query.mock.calls[0][1]).toEqual(["P' OR 1=1--", 'FROZEN', 1, 0]);
    expect(query.mock.calls[0][0]).not.toContain("P' OR 1=1--");
    await get().expect(200); expect(query.mock.calls[1][1]).toEqual([null, null, 20, 0]);
  });
  it.each(['?where=1%3D1', '?limit=999', '?page=0', '?page=-1', '?page=1.5', '?pageSize=101', '?status=UNKNOWN', '?product_code=', '?page=1&page=2'])('rejects invalid / free-form conditions %s', async suffix => {
    await get(suffix).expect(400); expect(query).not.toHaveBeenCalled();
  });
  it('propagates a failed query instead of reporting zero totals', async () => {
    query.mockRejectedValue(new Error('test unavailable'));
    const logger = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try { await get().expect(500); } finally { logger.mockRestore(); }
  });
  it('does not expose the SKU query for a different type', async () => {
    await expect(service.listSkuManagement('product')).rejects.toMatchObject({ status: 400 }); expect(query).not.toHaveBeenCalled();
  });
});
