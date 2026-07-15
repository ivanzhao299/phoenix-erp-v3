export const FARM_MASTER_PERMISSION = "MENU_FARM_MASTER";
export const FARM_MASTER_PATH = "/master/farms";
export const FARM_MASTER_MENU_LABEL = "养殖场档案";

type FarmMasterPermissions = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function getFarmMasterUiState({
  canCreate,
  canEdit,
  canDelete,
}: FarmMasterPermissions) {
  return {
    showCreateButton: canCreate,
    enableCreate: canCreate,
    showRowActions: canEdit || canDelete,
  };
}
