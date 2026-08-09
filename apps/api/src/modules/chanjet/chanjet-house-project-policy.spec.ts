import {
  CHANJET_HOUSE_PROJECT_TARGETS,
  resolveChanjetHouseProjectTarget,
} from './chanjet-house-project-policy';

describe('Chanjet house project rollout policy', () => {
  it('contains exactly the twelve reviewed production houses', () => {
    expect(Object.keys(CHANJET_HOUSE_PROJECT_TARGETS).sort()).toEqual([
      'HOUSE_DP_01', 'HOUSE_DP_02', 'HOUSE_DP_03', 'HOUSE_DP_04', 'HOUSE_DP_05', 'HOUSE_DP_06',
      'HOUSE_MS_01', 'HOUSE_MS_02', 'HOUSE_MS_03', 'HOUSE_MS_04', 'HOUSE_MS_05', 'HOUSE_MS_06',
    ]);
    const sourceIds = Object.values(CHANJET_HOUSE_PROJECT_TARGETS).map((target) => target.syncSourceId);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(sourceIds.every((id) => Number.isSafeInteger(id) && id > 0)).toBe(true);
  });

  it('resolves only an exact reviewed book, code, name and category tuple', () => {
    expect(resolveChanjetHouseProjectTarget(
      '3537748712226818', 'HOUSE_DP_06', '公鸡舍', '00',
    )).toMatchObject({ farmCode: 'FARM-DP', syncSourceId: 8202608090106 });
    expect(resolveChanjetHouseProjectTarget(
      '3533914511118750', 'HOUSE_DP_06', '公鸡舍', '00',
    )).toBeNull();
    expect(resolveChanjetHouseProjectTarget(
      '3537748712226818', 'HOUSE_DP_06', '6号鸡舍', '00',
    )).toBeNull();
    expect(resolveChanjetHouseProjectTarget(
      '3537748712226818', 'HOUSE_DP_07', '7号鸡舍', '00',
    )).toBeNull();
  });
});
