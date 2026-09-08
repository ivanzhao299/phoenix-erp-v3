import { masterDataPermissionMenus } from './master-data-type.guard';

describe('MasterDataTypeGuard menu contracts', () => {
  it('accepts both master-data and purchasing permissions for project runtime', () => {
    expect(masterDataPermissionMenus('project')).toEqual([
      'MENU_MD_PROJECT',
      'MENU_PRC2_PROJECT',
    ]);
  });

  it('does not add purchasing fallback to unrelated master-data types', () => {
    expect(masterDataPermissionMenus('supplier')).toEqual(['MENU_MD_SUPPLIER']);
    expect(masterDataPermissionMenus('unknown')).toEqual([]);
  });
});
