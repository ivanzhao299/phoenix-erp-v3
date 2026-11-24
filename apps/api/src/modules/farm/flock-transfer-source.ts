import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export const FLOCK_TRANSFER_SOURCE = `
  LEFT JOIN brd_flock_occupancies o ON o.flock_no=b.flock_no AND o.house_code=b.house_code
    AND o.company_code=b.company_code AND o.farm_code=b.farm_code AND o.site_code=b.site_code
    AND o.ended_on IS NULL AND b.closed_on IS NULL
  LEFT JOIN brd_flock_documents opened ON opened.id=o.opened_document_id AND opened.status='POSTED'
    AND opened.company_code=b.company_code AND opened.flock_no=b.flock_no AND opened.business_date=o.began_on
    AND ((opened.kind IN ('BASELINE','ADMIT') AND opened.house_code=o.house_code AND b.baseline_on=o.began_on)
      OR (opened.kind='TRANSFER' AND opened.payload->>'targetHouseCode'=o.house_code))`;

export const FLOCK_TRANSFER_DATES = `
  opened.kind AS transfer_source_kind,
  CASE WHEN opened.id IS NOT NULL THEN o.began_on::text END AS transfer_source_began_on,
  CASE WHEN opened.id IS NOT NULL THEN GREATEST(o.began_on+1,b.last_business_date)::text END AS transfer_earliest_on`;

export async function assertFlockTransferSource(manager: EntityManager, flockNo: string, houseCode: string, day: string) {
  const [source]=await manager.query(`SELECT b.baseline_on::text AS baseline_on,${FLOCK_TRANSFER_DATES}
    FROM brd_flock_balances b ${FLOCK_TRANSFER_SOURCE} WHERE b.flock_no=$1 AND b.house_code=$2`,[flockNo,houseCode]);
  if (!source?.transfer_earliest_on) {
    throw new ConflictException({code:'FLOCK_TRANSFER_SOURCE_REVIEW',houseCode,message:'当前来源舍的有效占栏或原始单据待核，请刷新并核对鸡群档案'});
  }
  if (day>=source.transfer_earliest_on) return;
  const {baseline_on,transfer_source_kind,transfer_source_began_on,transfer_earliest_on}=source;
  let code='FLOCK_TRANSFER_AFTER_LAST_EVENT';
  let reason='转舍业务日期早于鸡群最近已过账事件';
  if (day<baseline_on) {
    code='FLOCK_TRANSFER_BEFORE_BASELINE';
    reason=`转舍业务日期早于本群账本起始日（${baseline_on}）`;
  } else if (day===transfer_source_began_on) {
    const opening={
      BASELINE:['FLOCK_TRANSFER_ON_BASELINE_DAY','历史实盘基线日'],
      ADMIT:['FLOCK_TRANSFER_ON_ADMISSION_DAY','正式入栏日'],
      TRANSFER:['FLOCK_TRANSFER_ON_TRANSFER_IN_DAY','上次转入日'],
    } as const;
    const [openingCode,label]=opening[transfer_source_kind as keyof typeof opening];
    code=openingCode;
    reason=`转舍业务日期与${label}同日（${transfer_source_began_on}）`;
  }
  throw new BadRequestException({code,houseCode,sourceBeganOn:transfer_source_began_on,earliestBusinessDate:transfer_earliest_on,
    message:`${reason}。当前按日账本最早可办理日期为 ${transfer_earliest_on}，请核对实际转舍日期`});
}
