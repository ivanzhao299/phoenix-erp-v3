import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { MenuGuard } from '../../../common/guards/menu.guard';
import { SalesActivityService } from '../services/sales-activity.service';
import { SalesActivityController } from './sales-activity.controller';

describe('SalesActivityController HTTP contract', () => {
  let app: INestApplication;

  afterEach(async () => { await app?.close(); });

  it('preserves the facade envelope and its field types over HTTP', async () => {
    const envelope = {
      data: [{ sourceType: 'ORDER', sourceId: '1', documentNo: 'SO-HTTP-001' }],
      availableSources: ['ORDER', 'POS'],
      page: 1,
      limit: 20,
      hasMore: false,
      sort: ['occurredAt:DESC', 'sourceType:ASC', 'sourceId:ASC'],
      confirmationTiming: { ORDER: 'ORDER_CREATED', POS: 'POS_COMPLETED_OR_CREATED' },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [SalesActivityController],
      providers: [{ provide: SalesActivityService, useValue: { list: jest.fn().mockResolvedValue(envelope) } }],
    })
      .overrideGuard(MenuGuard).useValue({ canActivate: () => true })
      .overrideGuard(DataScopeGuard).useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer()).get('/api/v2/sales/activity?source=ALL').expect(200);
    expect(response.body).toEqual(envelope);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(Array.isArray(response.body.availableSources)).toBe(true);
    expect(typeof response.body.page).toBe('number');
    expect(typeof response.body.limit).toBe('number');
    expect(typeof response.body.hasMore).toBe('boolean');
  });
});
