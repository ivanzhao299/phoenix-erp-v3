import { describe, expect, it } from 'vitest';
import {
  CASH_ACCOUNT_CREATE_DENIED_MESSAGE,
  CASH_ACCOUNT_CREATE_PERMISSION,
  FINANCE_CASH_MASTER_PERMISSION,
  getCashAccountCreateButtonState,
} from './finance-cash-account-permissions';

describe('finance cash account create permission gate', () => {
  it('uses the master-data cash account permission as the real create authority', () => {
    expect(CASH_ACCOUNT_CREATE_PERMISSION).toBe('MENU_MD_CASH_ACCOUNT');
  });

  it('keeps the legacy finance master button visible but blocks modal open', () => {
    expect(FINANCE_CASH_MASTER_PERMISSION).toBe('MENU_FIN2_CASH_MASTER');
    expect(getCashAccountCreateButtonState({
      canCreateCashAccount: false,
      canCreateFinanceCashMaster: true,
    })).toEqual({
      renderButton: true,
      allowCreate: false,
      deniedMessage: CASH_ACCOUNT_CREATE_DENIED_MESSAGE,
    });
  });

  it('allows creation when the user has cash account filing create permission', () => {
    expect(getCashAccountCreateButtonState({
      canCreateCashAccount: true,
      canCreateFinanceCashMaster: false,
    })).toEqual({
      renderButton: true,
      allowCreate: true,
      deniedMessage: '',
    });
  });

  it('hides the create affordance when no relevant create permission is present', () => {
    expect(getCashAccountCreateButtonState({
      canCreateCashAccount: false,
      canCreateFinanceCashMaster: false,
    })).toEqual({
      renderButton: false,
      allowCreate: false,
      deniedMessage: '',
    });
  });
});
