import {
  classifyCapitalSource, endingBaseAmount, namesLikelyMatch, scoreVoucherCandidate,
} from './shareholder-accounting-reconciliation';

describe('shareholder accounting reconciliation', () => {
  it('keeps shareholder advances and payments outside paid-in capital', () => {
    expect(classifyCapitalSource('BANK_TRANSFER')).toBe('EQUITY');
    expect(classifyCapitalSource('SHAREHOLDER_ADVANCE')).toBe('DEBT_OR_ADVANCE');
    expect(classifyCapitalSource('GOODS_PAYMENT')).toBe('DEBT_OR_ADVANCE');
    expect(classifyCapitalSource('OTHER')).toBe('MANUAL_REVIEW');
  });

  it('matches shareholder subaccounts without currency suffix noise', () => {
    expect(namesLikelyMatch('朱兆存', '朱兆存（人民币）')).toBe(true);
    expect(namesLikelyMatch('宋雷', '宋雷总')).toBe(true);
    expect(namesLikelyMatch('宋雷', '赵永伟')).toBe(false);
  });

  it('reads base ending balances and scores an exact voucher line', () => {
    expect(endingBaseAmount({ baseEndingBalance: '123.45' })).toBe(123.45);
    expect(scoreVoucherCandidate({
      contributionAmount: 1000,
      contributionDate: '2026-06-01',
      shareholderName: '朱兆存',
      lineAmount: 1000,
      voucherDate: '2026-06-02',
      subjectName: '朱兆存（CNY）',
    })).toEqual({ score: 100, reasons: ['本位币金额一致', '股东名称与4001子科目一致', '日期相差不超过3天'] });
  });
});
