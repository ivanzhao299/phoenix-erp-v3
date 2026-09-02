import { localizedMasterName, masterNameWithCode, type AppLanguage } from './localized-master-data';

type Lang = 'zh' | 'en' | 'lo';
type Labels = Record<Lang, string>;
const l = (zh: string, en: string, lo: string): Labels => ({ zh, en, lo });

export const BUSINESS_ENUMS = {
  inventory: { AVAILABLE:l('可用','Available','ພ້ອມໃຊ້'), RESERVED:l('已预留','Reserved','ຈອງແລ້ວ'), QUARANTINE:l('隔离','Quarantine','ກັກກັນ'), DAMAGED:l('损坏','Damaged','ເສຍຫາຍ'), FROZEN:l('冻结','Frozen','ລະງັບ'), LOCKED:l('锁定','Locked','ລັອກ'), RETURNED:l('退货待检','Returned for inspection','ສົ່ງຄືນລໍຖ້າກວດ'), EXPIRED:l('已过期','Expired','ໝົດອາຍຸ'), WRITTEN_OFF:l('已核销','Written off','ຕັດອອກແລ້ວ') },
  wmsWorkflow: { PENDING:l('待处理','Pending','ລໍຖ້າດຳເນີນການ'), PROCESSING:l('处理中','Processing','ກຳລັງດຳເນີນການ'), COMPLETED:l('已完成','Completed','ສຳເລັດ') },
  salesOrder: { DRAFT:l('草稿','Draft','ຮ່າງ'), PENDING_APPROVAL:l('待审批','Pending approval','ລໍຖ້າອະນຸມັດ'), APPROVED:l('已批准','Approved','ອະນຸມັດແລ້ວ'), LOCKED:l('已锁定','Locked','ລັອກແລ້ວ'), ALLOCATED:l('已分配','Allocated','ຈັດສັນແລ້ວ'), PICKED:l('已拣货','Picked','ເກັບແລ້ວ'), LOADED:l('已装车','Loaded','ຂຶ້ນລົດແລ້ວ'), SHIPPED:l('已发货','Shipped','ສົ່ງແລ້ວ'), PARTIAL_SHIPPED:l('部分发货','Partially shipped','ສົ່ງບາງສ່ວນ'), DELIVERED:l('已送达','Delivered','ສົ່ງເຖິງແລ້ວ'), RECEIVED:l('已签收','Received','ຮັບແລ້ວ'), RECONCILED:l('已对账','Reconciled','ກວດສອບແລ້ວ'), REJECTED:l('已拒绝','Rejected','ປະຕິເສດ'), CANCELLED:l('已取消','Cancelled','ຍົກເລີກ') },
  salesReturn: { DRAFT:l('草稿','Draft','ຮ່າງ'), SUBMITTED:l('已提交','Submitted','ສົ່ງແລ້ວ'), PENDING_APPROVAL:l('待审批','Pending approval','ລໍຖ້າອະນຸມັດ'), INSPECTING:l('质检中','Inspecting','ກຳລັງກວດ'), RESTOCKING:l('回库中','Restocking','ກຳລັງຄືນສາງ'), COMPLETED:l('已完成','Completed','ສຳເລັດ'), REJECTED:l('已拒绝','Rejected','ປະຕິເສດ'), CANCELLED:l('已取消','Cancelled','ຍົກເລີກ') },
  delivery: { PLANNED:l('已计划','Planned','ວາງແຜນແລ້ວ'), LOADING:l('装车中','Loading','ກຳລັງຂຶ້ນລົດ'), LOADED:l('已装车','Loaded','ຂຶ້ນລົດແລ້ວ'), DEPARTED:l('已出发','Departed','ອອກເດີນທາງ'), ARRIVED:l('已到达','Arrived','ຮອດແລ້ວ'), PARTIALLY_SIGNED:l('部分签收','Partially signed','ຮັບບາງສ່ວນ'), COMPLETED:l('已完成','Completed','ສຳເລັດ'), CANCELLED:l('已取消','Cancelled','ຍົກເລີກ') },
  credit: { NORMAL:l('正常','Normal','ປົກກະຕິ'), WARNING:l('预警','Warning','ເຕືອນ'), OVER_LIMIT:l('超限','Over limit','ເກີນວົງເງິນ'), OVERDUE:l('逾期','Overdue','ກາຍກຳນົດ'), FROZEN:l('冻结','Frozen','ລະງັບ') },
} as const;

export type BusinessEnumDomain = keyof typeof BUSINESS_ENUMS;
export function formatBusinessEnum(domain: BusinessEnumDomain, value: unknown, lang: AppLanguage = 'zh'): string {
  const code = String(value ?? '').trim();
  if (!code) return '—';
  const entry = (BUSINESS_ENUMS[domain] as Record<string, Labels>)[code.toUpperCase()];
  const locale: Lang = lang === 'en' || lang === 'lo' ? lang : 'zh';
  return entry?.[locale] ?? code;
}

export function formatMasterData(row: Record<string, unknown> | null | undefined, nameBase: string, code: unknown, lang: AppLanguage = 'zh'): string {
  return masterNameWithCode(localizedMasterName(row, nameBase, lang), String(code ?? '')) || '—';
}
