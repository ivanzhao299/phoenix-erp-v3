import { INestApplication, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getEntityManagerToken } from '@nestjs/typeorm';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request = require('supertest');
import jwt = require('jsonwebtoken');
import { MenuGuard } from '../../../common/guards/menu.guard';
import { DataScopeService } from '../../org/services/data-scope.service';
import { MasterDataRuntimeService } from '../../master-data/master-data-runtime.service';
import { ProductMasterService } from '../services/product-master.service';
import { LookupController } from './lookup.controller';

const JWT_SECRET = 'lookup-guard-integration-test-secret';

@Injectable()
class LookupTestJwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  validate(payload: Record<string, unknown>) {
    return {
      ...payload,
      userId: payload.sub,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
    };
  }
}

describe('LookupController guard and DataScope HTTP integration', () => {
  let app: INestApplication;
  const companies = [
    { companyCode: 'COMP-A', orgCode: 'COMP-A', orgName: 'Company A' },
    { companyCode: 'COMP-B', orgCode: 'COMP-B', orgName: 'Company B' },
  ];
  const customers = [
    { code: 'CUS-A', name: 'Customer A', companyCode: 'COMP-A' },
    { code: 'CUS-B', name: 'Customer B', companyCode: 'COMP-B' },
  ];
  const dataScope = { resolve: jest.fn() };
  const em = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      const allowed = (params[0] as string[] | undefined) ?? null;
      if (sql.includes('FROM sys_organizations')) {
        return allowed ? companies.filter(row => allowed.includes(row.companyCode)) : companies;
      }
      if (sql.includes('FROM sal_customers')) {
        return allowed ? customers.filter(row => allowed.includes(row.companyCode)) : customers;
      }
      return [];
    }),
  };

  const token = (payload: Record<string, unknown>) => jwt.sign(payload, JWT_SECRET, { expiresIn: '5m' });
  const get = (path: string, bearer?: string) => {
    const call = request(app.getHttpServer()).get(path);
    return bearer ? call.set('Authorization', `Bearer ${bearer}`) : call;
  };

  beforeAll(async () => {
    dataScope.resolve.mockImplementation(async (userId: string, roles: string[]) => {
      if (userId === 'scope-error') throw new Error('scope unavailable');
      if (roles.includes('ROLE_ADMIN')) return { isGlobal: true };
      return {
        isGlobal: false,
        allowedCompanyCodes: userId === 'company-a' ? ['COMP-A'] : [],
      };
    });
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        ClsModule.forRoot({ global: true, middleware: { mount: true } }),
      ],
      controllers: [LookupController],
      providers: [
        LookupTestJwtStrategy,
        MenuGuard,
        Reflector,
        { provide: ProductMasterService, useValue: { listGrades: jest.fn(), listSpecs: jest.fn() } },
        { provide: getEntityManagerToken(), useValue: em },
        { provide: DataScopeService, useValue: dataScope },
        { provide: MasterDataRuntimeService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app?.close(); });
  beforeEach(() => { dataScope.resolve.mockClear(); em.query.mockClear(); });

  it('returns non-empty company and customer lookups for an admin JWT', async () => {
    const bearer = token({ sub: 'admin-1', username: 'admin', roles: ['ROLE_ADMIN'], permissions: [] });
    const companyResponse = await get('/api/lookup/companies', bearer).expect(200);
    const customerResponse = await get('/api/lookup/customers', bearer).expect(200);

    expect(companyResponse.body.data).toHaveLength(2);
    expect(customerResponse.body.data).toHaveLength(2);
    expect(dataScope.resolve).toHaveBeenCalledWith('admin-1', ['ROLE_ADMIN'], 'MENU_MD_COMPANY');
    expect(dataScope.resolve).toHaveBeenCalledWith('admin-1', ['ROLE_ADMIN'], 'MENU_MD_CUSTOMER');
  });

  it('limits a company-scoped JWT to its authorized company across both lookup chains', async () => {
    const bearer = token({ sub: 'company-a', username: 'scoped', roles: ['ROLE_SALES'], permissions: [] });
    const companyResponse = await get('/api/lookup/companies', bearer).expect(200);
    const customerResponse = await get('/api/lookup/customers', bearer).expect(200);

    expect(companyResponse.body.data.map((row: any) => row.companyCode)).toEqual(['COMP-A']);
    expect(customerResponse.body.data.map((row: any) => row.companyCode)).toEqual(['COMP-A']);
  });

  it('does not require an extra menu permission when no @RequireMenu is declared', async () => {
    const bearer = token({ sub: 'company-a', username: 'no-menu', roles: ['ROLE_SALES'], permissions: [] });
    await get('/api/lookup/companies', bearer).expect(200);
  });

  it('rejects requests without a JWT', async () => {
    await get('/api/lookup/companies').expect(401);
    expect(dataScope.resolve).not.toHaveBeenCalled();
  });

  it('fails closed when DataScope resolution throws', async () => {
    const bearer = token({ sub: 'scope-error', username: 'broken-scope', roles: ['ROLE_SALES'], permissions: [] });
    const response = await get('/api/lookup/companies', bearer).expect(200);

    expect(response.body.data).toEqual([]);
    expect(em.query).not.toHaveBeenCalled();
  });
});
