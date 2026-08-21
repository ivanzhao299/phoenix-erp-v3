import { describe, expect, it } from 'vitest';
import { dictTypeLabel } from './dict-type-labels';

describe('dictTypeLabel', () => {
  it.each([
    ['SYS_CURRENCY', '币种'], ['INV_STOCK_STATUS', '库存状态'], ['PKG_SHIFT', '包装班次'],
    ['FIN_UNKNOWN_CODE', '财务·UNKNOWNCODE'], ['WMS_NEW_KIND', '仓储·NEWKIND'],
    ['OTHER_CODE', 'OTHER_CODE'], ['', '未分类'],
  ])('%s => %s', (code, label) => expect(dictTypeLabel(code)).toBe(label));
});
