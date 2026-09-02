import { localizedMasterName, masterNameWithCode, type AppLanguage } from './localized-master-data';

type Lang = 'zh' | 'en' | 'lo';
type Labels = Record<Lang, string>;
const l = (zh: string, en: string, lo: string): Labels => ({ zh, en, lo });

export const BUSINESS_ENUMS = {
  inventory: { AVAILABLE:l('可用','Available','ພ້ອມໃຊ້'), RESERVED:l('已预留','Reserved','ຈອງແລ້ວ'), QUARANTINE:l('隔离','Quarantine','ກັກກັນ'), DAMAGED:l('损坏','Damaged','ເສຍຫາຍ'), FROZEN:l('冻结','Frozen','ລະງັບ'), LOCKED:l('锁定','Locked','ລັອກ'), RETURNED:l('退货待检','Returned for inspection','ສົ່ງຄືນລໍຖ້າກວດ'), EXPIRED:l('已过期','Expired','ໝົດອາຍຸ'), WRITTEN_OFF:l('已核销','Written off','ຕັດອອກແລ້ວ') },
  wmsWorkflow: { PENDING:l('待处理','Pending','ລໍຖ້າດຳເນີນການ'), PROCESSING:l('处理中','Processing','ກຳລັງດຳເນີນການ'), COMPLETED:l('已完成','Completed','ສຳເລັດ') },
  salesOrder: { DRAFT:l('草稿','Draft','ຮ່າງ'), PENDING_APPROVAL:l('待审批','Pending approval','ລໍຖ້າອະນຸມັດ'), APPROVED:l('已批准','Approved','ອະນຸມັດແລ້ວ'), LOCKED:l('已锁定','Locked','ລັອກແລ້ວ'), ALLOCATED:l('已分配','Allocated','ຈັດສັນແລ້ວ'), PICKED:l('已拣货','Picked','ເກັບແລ້ວ'), LOADED:l('已装车','Loaded','ຂຶ້ນລົດແລ້ວ'), SHIPPED:l('已发货','Shipped','ສົ່ງແລ້ວ'), PARTIAL_SHIPPED:l('部分发货','Partially shipped','ສົ່ງບາງສ່ວນ'), DELIVERED:l('已送达','Delivered','ສົ່ງເຖິງແລ້ວ'), RECEIVED:l('已签收','Received','ຮັບແລ້ວ'), RECONCILED:l('已对账','Reconciled','ກວດສອບແລ້ວ'), REJECTED:l('已拒绝','Rejected','ປະຕິເສດ'), CANCELLED:l('已取消','Cancelled','ຍົກເລີກ') },
  posSale: { OPEN:l('待结算','Open','ລໍຖ້າຊຳລະ'), COMPLETED:l('已成交','Completed','ສຳເລັດ'), VOID:l('已作废','Void','ຍົກເລີກ'), RETURNED:l('已退货','Returned','ສົ່ງຄືນ') },
  ar: { OPEN:l('未结清','Open','ຍັງບໍ່ຊຳລະ'), PARTIALLY_RECEIVED:l('部分收款','Partially received','ຮັບເງິນບາງສ່ວນ'), RECEIVED:l('已收款','Received','ຮັບເງິນແລ້ວ'), OVERDUE:l('已逾期','Overdue','ກາຍກຳນົດ'), CANCELLED:l('已取消','Cancelled','ຍົກເລີກ') },
  salesReturn: { DRAFT:l('草稿','Draft','ຮ່າງ'), SUBMITTED:l('已提交','Submitted','ສົ່ງແລ້ວ'), PENDING_APPROVAL:l('待审批','Pending approval','ລໍຖ້າອະນຸມັດ'), INSPECTING:l('质检中','Inspecting','ກຳລັງກວດ'), RESTOCKING:l('回库中','Restocking','ກຳລັງຄືນສາງ'), COMPLETED:l('已完成','Completed','ສຳເລັດ'), REJECTED:l('已拒绝','Rejected','ປະຕິເສດ'), CANCELLED:l('已取消','Cancelled','ຍົກເລີກ') },
  returnType: { CUSTOMER_RETURN:l('客户退货','Customer return','ລູກຄ້າສົ່ງຄືນ'), DELIVERY_REJECT:l('配送拒收','Delivery rejected','ປະຕິເສດການສົ່ງ'), QUALITY_RETURN:l('质量退货','Quality return','ສົ່ງຄືນດ້ານຄຸນນະພາບ'), DAMAGE_RETURN:l('破损退货','Damaged return','ສົ່ງຄືນເນື່ອງຈາກເສຍຫາຍ') },
  inspection: { PENDING:l('待检','Pending','ລໍຖ້າກວດ'), ACCEPTED:l('合格','Accepted','ຜ່ານ'), PARTIAL:l('部分合格','Partially accepted','ຜ່ານບາງສ່ວນ'), REJECTED:l('不合格','Rejected','ບໍ່ຜ່ານ'), DAMAGED:l('破损','Damaged','ເສຍຫາຍ') },
  restock: { PENDING:l('待回库','Pending restock','ລໍຖ້າຄືນສາງ'), RESTOCKED:l('已回库','Restocked','ຄືນສາງແລ້ວ'), WRITTEN_OFF:l('已核销','Written off','ຕັດອອກແລ້ວ') },
  delivery: { PLANNED:l('已计划','Planned','ວາງແຜນແລ້ວ'), LOADING:l('装车中','Loading','ກຳລັງຂຶ້ນລົດ'), LOADED:l('已装车','Loaded','ຂຶ້ນລົດແລ້ວ'), DEPARTED:l('已出发','Departed','ອອກເດີນທາງ'), ARRIVED:l('已到达','Arrived','ຮອດແລ້ວ'), PARTIALLY_SIGNED:l('部分签收','Partially signed','ຮັບບາງສ່ວນ'), COMPLETED:l('已完成','Completed','ສຳເລັດ'), CANCELLED:l('已取消','Cancelled','ຍົກເລີກ') },
  credit: { NORMAL:l('正常','Normal','ປົກກະຕິ'), WARNING:l('预警','Warning','ເຕືອນ'), OVER_LIMIT:l('超限','Over limit','ເກີນວົງເງິນ'), OVERDUE:l('逾期','Overdue','ກາຍກຳນົດ'), FROZEN:l('冻结','Frozen','ລະງັບ') },
  productionInbound: { PACKAGING_INBOUND:l('包装入库','Packaging inbound','ຮັບເຂົ້າຈາກການບັນຈຸ'), TEMP_PRODUCTION_INBOUND:l('日产蛋入库','Daily production inbound','ຮັບເຂົ້າໄຂ່ປະຈຳວັນ') },
  medicationLedger: { MED_INBOUND:l('入库','Inbound','ຮັບເຂົ້າ'), MED_OUTBOUND:l('出库','Outbound','ຈ່າຍອອກ') },
  deviceOperation: { ACTIVE:l('启用','Active','ເປີດໃຊ້'), INACTIVE:l('停用','Inactive','ປິດໃຊ້'), SUCCESS:l('成功','Success','ສຳເລັດ'), RUNNING:l('运行中','Running','ກຳລັງເຮັດວຽກ'), FAILED:l('失败','Failed','ລົ້ມເຫຼວ'), PARTIAL:l('部分成功','Partial','ສຳເລັດບາງສ່ວນ') },
} as const;

export type BusinessEnumDomain = keyof typeof BUSINESS_ENUMS;
export function formatBusinessEnum(domain: BusinessEnumDomain, value: unknown, lang: AppLanguage = 'zh'): string {
  const code = String(value ?? '').trim();
  if (!code) return '—';
  const entry = (BUSINESS_ENUMS[domain] as Record<string, Labels>)[code.toUpperCase()];
  const locale: Lang = lang === 'en' || lang === 'lo' ? lang : 'zh';
  return entry?.[locale] ?? code;
}

export function formatMasterData(row: object | null | undefined, nameBase: string, code: unknown, lang: AppLanguage = 'zh'): string {
  return masterNameWithCode(localizedMasterName(row as Record<string, unknown> | null | undefined, nameBase, lang), String(code ?? '')) || '—';
}
