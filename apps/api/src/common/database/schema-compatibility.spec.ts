import { ServiceUnavailableException } from '@nestjs/common';
import { assertConstraintsAbsent, assertExistingSchema } from './schema-compatibility';
import { ApiBootstrapSchemaCheck } from './api-bootstrap-schema-check';
import { SystemController } from '../../modules/master/master.controller';
import { CronMonitorService } from '../../modules/system-monitor/services/cron-monitor.service';
import { IotSyncService } from '../../modules/iot/iot-sync.service';

describe('Existing schema ownership at API startup', () => {
  it('reads metadata and stops on a missing table without repair', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(assertExistingSchema(query, { sys_settings: ['key'] })).rejects.toThrow(ServiceUnavailableException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/^SELECT/);
  });

  it('reports missing columns and retired constraints without modifying them', async () => {
    const query = jest.fn().mockResolvedValue([{ table_name: 'sys_settings', column_name: 'key' }]);
    await expect(assertExistingSchema(query, { sys_settings: ['key', 'value'] })).rejects.toMatchObject({
      response: { code: 'SCHEMA_MISMATCH', table: 'sys_settings', column: 'value' },
    });
    query.mockResolvedValue([{ conname: 'retired_fk' }]);
    await expect(assertConstraintsAbsent(query, ['retired_fk'])).rejects.toMatchObject({ response: { code: 'SCHEMA_MISMATCH' } });
    expect(query.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });

  it('UUID extensions are checked rather than installed', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(new ApiBootstrapSchemaCheck({ query } as never).onModuleInit()).rejects.toThrow(ServiceUnavailableException);
    query.mockResolvedValue([{ extname: 'uuid-ossp' }]);
    await expect(new ApiBootstrapSchemaCheck({ query } as never).onModuleInit()).resolves.toBeUndefined();
    expect(query.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
  });

  it('brand GET preserves existing defaults and never creates a table', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const controller = new SystemController({ query } as never);
    await expect(controller.getBrand()).resolves.toMatchObject({ ok: false, data: { system_name: expect.any(String) } });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/^SELECT/);
    query.mockRejectedValue(Object.assign(new Error('missing table'), { code: '42P01' }));
    await expect(controller.getBrand()).rejects.toMatchObject({ response: { code: 'SCHEMA_MISMATCH' } });
  });

  it('cron monitoring bootstrap reads metadata; heartbeat writes remain runtime operations', async () => {
    const columns = ['job_name', 'last_run_at', 'last_status', 'last_detail', 'last_success_at', 'last_failure_at', 'success_count', 'fail_count', 'updated_at'];
    const query = jest.fn().mockResolvedValue(columns.map(column_name => ({ table_name: 'sys_cron_heartbeat', column_name })));
    const service = new CronMonitorService({ query } as never, {} as never);
    await service.onModuleInit();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/^SELECT/);
    query.mockResolvedValue([]);
    await service.ok('fixture-runtime-job');
    expect(query.mock.calls[1][0]).toMatch(/INSERT INTO sys_cron_heartbeat/);
  });

  it('IoT startup checks three existing tables, does not drop FKs or contact the provider', async () => {
    const query = jest.fn().mockResolvedValueOnce(['mon_device_realtime_snapshot', 'mon_device_property_history', 'mon_device_alert_event'].map(table_name => ({ table_name, column_name: 'property_code' }))).mockResolvedValueOnce([]);
    const fetchSpy = jest.spyOn(global, 'fetch');
    try {
      await new IotSyncService({ query } as never, {} as never, {} as never).onModuleInit();
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });
});
