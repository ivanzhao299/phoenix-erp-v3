import { matchChanjetShareholderName, normalizeShareholderAccountingName } from './chanjet-shareholder-inbound-matcher';

const candidates = [
  { shareholderCode: 'SHR-ZHAO-YONGWEI', shareholderName: '赵永伟' },
  { shareholderCode: 'SHR-ZHU-ZHAOCUN', shareholderName: '朱兆存' },
  { shareholderCode: 'SHR-SONG-LEI', shareholderName: '宋雷' },
];

describe('Chanjet shareholder inbound matcher', () => {
  it('removes a currency suffix without weakening the actual name', () => {
    expect(normalizeShareholderAccountingName('朱兆存（老挝币）')).toBe('朱兆存');
    expect(matchChanjetShareholderName('朱兆存（老挝币）', candidates)).toMatchObject({
      status: 'EXACT', shareholderCode: 'SHR-ZHU-ZHAOCUN', confidence: 100,
    });
  });

  it('accepts a unique honorific alias but rejects a non-person account', () => {
    expect(matchChanjetShareholderName('赵总', candidates)).toMatchObject({
      status: 'ALIAS', shareholderCode: 'SHR-ZHAO-YONGWEI', confidence: 92,
    });
    expect(matchChanjetShareholderName('直营店投资', candidates)).toMatchObject({ status: 'SOURCE_ONLY' });
  });

  it('fails closed when an honorific alias is ambiguous', () => {
    expect(matchChanjetShareholderName('朱总', [
      ...candidates,
      { shareholderCode: 'SHR-ZHU-ZHAOAN', shareholderName: '朱召安' },
    ])).toMatchObject({ status: 'CONFLICT', confidence: 0 });
  });

  it('uses an exact accounting amount only to disambiguate same-surname title candidates', () => {
    expect(matchChanjetShareholderName('朱总', [
      { shareholderCode: 'SHR-ZHU-ZHAOCUN', shareholderName: '朱兆存', paidInAmount: 23609134.01 },
      { shareholderCode: 'SHR-ZHU-ZHAOAN', shareholderName: '朱召安', paidInAmount: 1617318.75 },
    ], 23609134.01)).toMatchObject({
      status: 'ALIAS', shareholderCode: 'SHR-ZHU-ZHAOCUN', confidence: 98,
    });
  });

  it('reconciles the current production name variants without assigning the non-person account', () => {
    const companyCases = [
      ['赵总', [{ shareholderCode: 'SHR-ZHAO-YONGWEI', shareholderName: '赵永伟' }], 11451086.98, 'SHR-ZHAO-YONGWEI'],
      ['宋总', [{ shareholderCode: 'SHR-SONG-LEI', shareholderName: '宋雷' }], 6774622.89, 'SHR-SONG-LEI'],
      ['朱兆存（人民币）', [{ shareholderCode: 'SHR-ZHU-ZHAOCUN', shareholderName: '朱兆存' }], 1863665.27, 'SHR-ZHU-ZHAOCUN'],
      ['薛刚（人民币）', [{ shareholderCode: 'SHR-XUE-GANG', shareholderName: '薛刚' }], 3019196.39, 'SHR-XUE-GANG'],
      ['伏强', [{ shareholderCode: 'SHR-FU-QIANG', shareholderName: '伏强' }], 2560000, 'SHR-FU-QIANG'],
      ['陈逸飞', [{ shareholderCode: 'SHR-CHEN-YIFEI', shareholderName: '陈逸飞' }], 1617318.75, 'SHR-CHEN-YIFEI'],
    ] as const;
    for (const [sourceName, identities, amount, expectedCode] of companyCases) {
      expect(matchChanjetShareholderName(sourceName, [...identities], amount).shareholderCode).toBe(expectedCode);
    }
    expect(matchChanjetShareholderName('直营店投资', candidates, 1775714.19)).toMatchObject({
      status: 'SOURCE_ONLY', shareholderCode: '',
    });
  });
});
