import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { REQUIRE_MENU_KEY } from '../../common/guards/menu.guard';
import type { MenuRequirement } from '../../common/guards/menu.guard';
import { FarmCabinController } from './farm-cabin.controller';
import { MonDeviceService } from './mon-device.service';

describe('FarmCabinController daily report compatibility route', () => {
  it('registers the captured cabin daily-report POST route with edit permission', () => {
    const handler = FarmCabinController.prototype.generateDailyReport;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('daily-report/generate');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(REQUIRE_MENU_KEY, handler) as MenuRequirement).toEqual({
      menu: 'MENU_DEVICE_MONITOR',
      perm: 'E',
      altMenus: undefined,
      denialMessage: undefined,
    });
  });

  it('delegates daily-report generation to MonDeviceService', async () => {
    const monDeviceService = {
      generateDailyReportFromIoT: jest.fn().mockResolvedValue({ ok: true, feedKg: '12.50' }),
    } as unknown as jest.Mocked<Pick<MonDeviceService, 'generateDailyReportFromIoT'>>;
    const controller = new FarmCabinController(monDeviceService as unknown as MonDeviceService);

    await expect(controller.generateDailyReport({
      house_code: 'H001',
      log_date: '2026-07-06',
      snapshot_hour: 17,
    })).resolves.toEqual({ ok: true, feedKg: '12.50' });

    expect(monDeviceService.generateDailyReportFromIoT).toHaveBeenCalledWith(
      'H001',
      '2026-07-06',
      { snapshotHour: 17 },
    );
  });
});
