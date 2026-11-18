import { BadRequestException } from '@nestjs/common';

/** The persisted unit price and amount are numeric(18,6). No implicit rounding or JS money multiplication. */
export function openingCostDecimal(value:unknown,quantity=1):string{
  if(typeof value!=='string'&&typeof value!=='number'||typeof value==='number'&&(!Number.isFinite(value)||value<0)
    ||!Number.isSafeInteger(quantity)||quantity<1)throw new BadRequestException('财务核定成本须为有效非负十进制数');
  // Above this compatibility range binary JSON numbers cannot reliably distinguish six decimal places.
  if(typeof value==='number'&&value>1000000000)throw new BadRequestException('大额核定成本须使用精确十进制字符串');
  const source=String(value);
  if(source.length>32||!/^(?:\d{1,12}(?:\.\d{0,6})?|\.\d{1,6})$/.test(source))
    throw new BadRequestException('财务核定单位成本最多十二位整数、六位小数');
  const [whole,fraction='']=source.split('.'),decimal=BigInt(whole||'0').toString()+'.'+fraction.padEnd(6,'0');
  const scaled=BigInt(whole||'0')*1000000n+BigInt(fraction.padEnd(6,'0'));
  if(scaled*BigInt(quantity)>999999999999999999n)throw new BadRequestException('财务核定期初金额超出账本精度范围');
  return decimal;
}
