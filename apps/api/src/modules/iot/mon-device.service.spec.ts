import { MonDeviceService } from './mon-device.service';

describe('MonDeviceService IoT summary usage fallback', () => {
  it('uses realtime cumulative snapshots for today feed and water when daily aggregates are absent', async () => {
    const now = new Date().toISOString();
    const entityManager = {
      query: jest.fn()
        .mockResolvedValueOnce([
          {
            erp_house_code: 'H001',
            erp_farm_code: 'F001',
            map_status: 'ACTIVE',
            house_name: '一号鸡舍',
            capacity: 50000,
            house_status: 'ACTIVE',
          },
        ])
        .mockResolvedValueOnce([
          {
            erp_house_code: 'H001',
            property_code: '2488',
            value: 125.5,
            is_alarm: 0,
            collect_time: now,
            updated_at: now,
            system_category: 'feed',
            metric_type: 'cumulative',
            display_level: 1,
            threshold_high: null,
            threshold_low: null,
          },
          {
            erp_house_code: 'H001',
            property_code: '2484',
            value: 3.75,
            is_alarm: 0,
            collect_time: now,
            updated_at: now,
            system_category: 'water',
            metric_type: 'cumulative',
            display_level: 1,
            threshold_high: null,
            threshold_low: null,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const service = new MonDeviceService(entityManager as never, {} as never);

    const result = await service.getAllSummary();

    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.houses[0]).toMatchObject({
      houseCode: 'H001',
      feedToday: 125.5,
      waterToday: 3.75,
      feedCumNow: 125.5,
      waterCumNow: 3.75,
    });
    expect(entityManager.query).toHaveBeenCalledTimes(5);
  });
});
