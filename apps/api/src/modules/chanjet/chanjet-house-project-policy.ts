export interface ChanjetHouseProjectTarget {
  bookId: string;
  houseCode: string;
  expectedName: string;
  farmCode: string;
  projectCategoryCode: '00';
  /** Stable upstream identity used by Chanjet batchUpsert. Must be unique per project. */
  syncSourceId: number;
}

export const CHANJET_HOUSE_PROJECT_TARGETS: Readonly<Record<string, ChanjetHouseProjectTarget>> = Object.freeze({
  HOUSE_MS_01: Object.freeze({
    bookId: '3533914511118750', houseCode: 'HOUSE_MS_01', expectedName: '1号鸡舍',
    farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', syncSourceId: 8202608090001,
  }),
  HOUSE_MS_02: Object.freeze({
    bookId: '3533914511118750', houseCode: 'HOUSE_MS_02', expectedName: '2号鸡舍',
    farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', syncSourceId: 3533914913770789,
  }),
  HOUSE_MS_03: Object.freeze({
    bookId: '3533914511118750', houseCode: 'HOUSE_MS_03', expectedName: '3号鸡舍',
    farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', syncSourceId: 8202608090003,
  }),
  HOUSE_MS_04: Object.freeze({
    bookId: '3533914511118750', houseCode: 'HOUSE_MS_04', expectedName: '4号鸡舍',
    farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', syncSourceId: 8202608090004,
  }),
  HOUSE_MS_05: Object.freeze({
    bookId: '3533914511118750', houseCode: 'HOUSE_MS_05', expectedName: '5号鸡舍',
    farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', syncSourceId: 8202608090005,
  }),
  HOUSE_MS_06: Object.freeze({
    bookId: '3533914511118750', houseCode: 'HOUSE_MS_06', expectedName: '6号鸡舍',
    farmCode: 'LPH_MENGSAI', projectCategoryCode: '00', syncSourceId: 8202608090006,
  }),
  HOUSE_DP_01: Object.freeze({
    bookId: '3537748712226818', houseCode: 'HOUSE_DP_01', expectedName: '1号鸡舍',
    farmCode: 'FARM-DP', projectCategoryCode: '00', syncSourceId: 8202608090101,
  }),
  HOUSE_DP_02: Object.freeze({
    bookId: '3537748712226818', houseCode: 'HOUSE_DP_02', expectedName: '2号鸡舍',
    farmCode: 'FARM-DP', projectCategoryCode: '00', syncSourceId: 8202608090102,
  }),
  HOUSE_DP_03: Object.freeze({
    bookId: '3537748712226818', houseCode: 'HOUSE_DP_03', expectedName: '3号鸡舍',
    farmCode: 'FARM-DP', projectCategoryCode: '00', syncSourceId: 8202608090103,
  }),
  HOUSE_DP_04: Object.freeze({
    bookId: '3537748712226818', houseCode: 'HOUSE_DP_04', expectedName: '4号鸡舍',
    farmCode: 'FARM-DP', projectCategoryCode: '00', syncSourceId: 8202608090104,
  }),
  HOUSE_DP_05: Object.freeze({
    bookId: '3537748712226818', houseCode: 'HOUSE_DP_05', expectedName: '5号鸡舍',
    farmCode: 'FARM-DP', projectCategoryCode: '00', syncSourceId: 8202608090105,
  }),
  HOUSE_DP_06: Object.freeze({
    bookId: '3537748712226818', houseCode: 'HOUSE_DP_06', expectedName: '公鸡舍',
    farmCode: 'FARM-DP', projectCategoryCode: '00', syncSourceId: 8202608090106,
  }),
});

export function resolveChanjetHouseProjectTarget(
  bookId: string,
  houseCode: string,
  expectedName: string,
  projectCategoryCode: string,
): ChanjetHouseProjectTarget | null {
  const target = CHANJET_HOUSE_PROJECT_TARGETS[houseCode];
  if (!target) return null;
  if (target.bookId !== bookId
    || target.expectedName !== expectedName
    || target.projectCategoryCode !== projectCategoryCode) return null;
  return target;
}
