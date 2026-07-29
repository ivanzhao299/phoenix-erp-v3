export interface CashAccountPaymentLike {
  currentBalance?: unknown;
  current_balance?: unknown;
  currencyCode?: unknown;
  currency_code?: unknown;
  companyCode?: unknown;
  company_code?: unknown;
}

export interface NormalizedCashAccountPayment {
  currentBalance: number;
  currencyCode: string;
  companyCode: string;
}

export function normalizeCashAccountPayment(
  account: CashAccountPaymentLike | null | undefined,
): NormalizedCashAccountPayment | null {
  if (!account) return null;

  const currentBalance = Number(account.currentBalance ?? account.current_balance);
  return {
    currentBalance: Number.isFinite(currentBalance) ? currentBalance : 0,
    currencyCode: String(account.currencyCode ?? account.currency_code ?? ''),
    companyCode: String(account.companyCode ?? account.company_code ?? ''),
  };
}

export function hasSufficientReimbursementBalance(
  account: CashAccountPaymentLike | null | undefined,
  originalAmount: unknown,
): boolean {
  const normalized = normalizeCashAccountPayment(account);
  const rawBalance = account?.currentBalance ?? account?.current_balance;
  const parsedBalance = Number(rawBalance);
  const amount = Number(originalAmount);
  return Boolean(
    normalized
    && Number.isFinite(parsedBalance)
    && Number.isFinite(amount)
    && amount > 0
    && normalized.currentBalance >= amount,
  );
}
