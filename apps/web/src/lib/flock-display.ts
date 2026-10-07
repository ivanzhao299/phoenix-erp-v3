import { localizedMasterName, type AppLanguage } from './localized-master-data';

type MasterRow = object & { farm_code?: string; house_code?: string; farm_name?: string; house_name?: string };

/** Derive labels from facts and scoped masters each time masters or locale change. */
export function flockMasterLabels(flocks: Record<string, unknown>[], farms: MasterRow[], houses: MasterRow[], lang: AppLanguage): (Record<string, unknown> & { farmCode: string; farmName: string; houseCode: string; houseName: string })[] {
  const farmMap = new Map(farms.map(farm => [farm.farm_code, farm]));
  const houseMap = new Map(houses.map(house => [`${house.farm_code}\0${house.house_code}`, house]));
  return flocks.map(flock => {
    const farmCode = String(flock.farm_code ?? '');
    const houseCode = String(flock.house_code ?? '');
    const farm = farmMap.get(farmCode);
    const house = houseMap.get(`${farmCode}\0${houseCode}`);
    // A historical flock snapshot can contain code in its name column. Prefer
    // the authoritative master; use the snapshot only when no master name exists.
    const name = (master: object | undefined, base: string, code: string) => {
      const masterName = localizedMasterName(master as Record<string, unknown> | undefined, base, lang);
      const snapshotName = localizedMasterName(flock, base, lang);
      return (masterName && masterName !== code ? masterName : '')
        || (snapshotName !== code ? snapshotName : '');
    };
    return { ...flock, farmCode, farmName: name(farm, 'farm_name', farmCode), houseCode, houseName: name(house, 'house_name', houseCode) };
  });
}
