export const CASH_ACCOUNT_CREATE_PERMISSION = 'MENU_MD_CASH_ACCOUNT';
export const FINANCE_CASH_MASTER_PERMISSION = 'MENU_FIN2_CASH_MASTER';
export const CASH_ACCOUNT_CREATE_DENIED_MESSAGE = '当前角色无权限新建账户';

type CashAccountCreateButtonInput = {
  canCreateCashAccount: boolean;
  canCreateFinanceCashMaster: boolean;
};

export function getCashAccountCreateButtonState({
  canCreateCashAccount,
  canCreateFinanceCashMaster,
}: CashAccountCreateButtonInput) {
  return {
    renderButton: canCreateCashAccount || canCreateFinanceCashMaster,
    allowCreate: canCreateCashAccount,
    deniedMessage: !canCreateCashAccount && canCreateFinanceCashMaster
      ? CASH_ACCOUNT_CREATE_DENIED_MESSAGE
      : '',
  };
}
