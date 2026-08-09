export const HOUSE_PROJECT_ROLLOUT_TARGETS = Object.freeze([
  Object.freeze({ order: 0, bookId: '3533914511118750', houseCode: 'HOUSE_MS_02', expectedName: '2号鸡舍', farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', phase: 'VERIFIED_CANARY' }),
  Object.freeze({ order: 1, bookId: '3533914511118750', houseCode: 'HOUSE_MS_01', expectedName: '1号鸡舍', farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', phase: 'MENGSAI_1' }),
  Object.freeze({ order: 2, bookId: '3533914511118750', houseCode: 'HOUSE_MS_03', expectedName: '3号鸡舍', farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', phase: 'MENGSAI_REMAINDER' }),
  Object.freeze({ order: 3, bookId: '3533914511118750', houseCode: 'HOUSE_MS_04', expectedName: '4号鸡舍', farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', phase: 'MENGSAI_REMAINDER' }),
  Object.freeze({ order: 4, bookId: '3533914511118750', houseCode: 'HOUSE_MS_05', expectedName: '5号鸡舍', farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', phase: 'MENGSAI_REMAINDER' }),
  Object.freeze({ order: 5, bookId: '3533914511118750', houseCode: 'HOUSE_MS_06', expectedName: '6号鸡舍', farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', phase: 'MENGSAI_REMAINDER' }),
  Object.freeze({ order: 6, bookId: '3537748712226818', houseCode: 'HOUSE_DP_01', expectedName: '1号鸡舍', farmCode: 'FARM-DP', projectCategoryCode: '00', phase: 'DONGPENG' }),
  Object.freeze({ order: 7, bookId: '3537748712226818', houseCode: 'HOUSE_DP_02', expectedName: '2号鸡舍', farmCode: 'FARM-DP', projectCategoryCode: '00', phase: 'DONGPENG' }),
  Object.freeze({ order: 8, bookId: '3537748712226818', houseCode: 'HOUSE_DP_03', expectedName: '3号鸡舍', farmCode: 'FARM-DP', projectCategoryCode: '00', phase: 'DONGPENG' }),
  Object.freeze({ order: 9, bookId: '3537748712226818', houseCode: 'HOUSE_DP_04', expectedName: '4号鸡舍', farmCode: 'FARM-DP', projectCategoryCode: '00', phase: 'DONGPENG' }),
  Object.freeze({ order: 10, bookId: '3537748712226818', houseCode: 'HOUSE_DP_05', expectedName: '5号鸡舍', farmCode: 'FARM-DP', projectCategoryCode: '00', phase: 'DONGPENG' }),
  Object.freeze({ order: 11, bookId: '3537748712226818', houseCode: 'HOUSE_DP_06', expectedName: '公鸡舍', farmCode: 'FARM-DP', projectCategoryCode: '00', phase: 'DONGPENG' }),
]);

export function resolveHouseProjectRolloutTarget(houseCode) {
  const normalized = String(houseCode || '').trim();
  const matches = HOUSE_PROJECT_ROLLOUT_TARGETS.filter((target) => target.houseCode === normalized);
  if (matches.length !== 1) {
    throw new Error(`house code is not a unique reviewed rollout target: ${normalized || 'EMPTY'}`);
  }
  return matches[0];
}
