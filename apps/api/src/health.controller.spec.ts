import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController readiness', () => {
  it('returns READY when the database responds', async () => {
    const controller = new HealthController({ query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as any);
    await expect(controller.getReadiness()).resolves.toMatchObject({ status: 'READY', db: 'connected' });
  });

  it('returns HTTP 503 when the database is unavailable', async () => {
    const controller = new HealthController({ query: jest.fn().mockRejectedValue(new Error('connection refused')) } as any);
    await expect(controller.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
