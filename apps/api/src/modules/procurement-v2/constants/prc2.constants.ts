/** 采购 V2 状态常量 */

export enum Prc2ReqStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CONVERTED = 'CONVERTED',
  CANCELLED = 'CANCELLED',
}

export enum Prc2PoStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  PARTIAL_PAID = 'PARTIAL_PAID',
  FULLY_PAID = 'FULLY_PAID',
  PARTIAL_RECEIVED = 'PARTIAL_RECEIVED',
  RECEIVED = 'RECEIVED',
  CLOSED = 'CLOSED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum Prc2ShipmentStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  SHIPPED = 'SHIPPED',
  CUSTOMS_CLEARANCE = 'CUSTOMS_CLEARANCE',
  ARRIVED = 'ARRIVED',
  DELIVERED = 'DELIVERED',
}

export enum Prc2ReceiptStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  POSTED = 'POSTED',
}

export enum Prc2PaymentStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  EXECUTED = 'EXECUTED',
  REJECTED = 'REJECTED',
  VOID = 'VOID',
}

export enum Prc2ApStatus {
  OPEN = 'OPEN',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  VOID = 'VOID',
}

export enum Prc2FundStatus {
  ACTIVE = 'ACTIVE',
  PARTIALLY_SETTLED = 'PARTIALLY_SETTLED',
  SETTLED = 'SETTLED',
  VOID = 'VOID',
}

export enum Prc2PaymentType {
  COMPANY = 'COMPANY',
  SHAREHOLDER = 'SHAREHOLDER',
  THIRD_PARTY = 'THIRD_PARTY',
}

export enum Prc2SupplierType {
  LOCAL = 'LOCAL',
  OVERSEAS = 'OVERSEAS',
  AGENT = 'AGENT',
}

export enum Prc2Urgency {
  NORMAL = 'NORMAL',
  URGENT = 'URGENT',
  CRITICAL = 'CRITICAL',
}

export enum Prc2ApprovalAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  RETURN = 'RETURN',
  COMMENT = 'COMMENT',
}

export enum Prc2BizType {
  PR = 'PR',
  PO = 'PO',
  PAYMENT = 'PAYMENT',
}

export enum Prc2SupplierSharedScope {
  GROUP   = 'GROUP',    // 集团共享
  COMPANY = 'COMPANY',  // 单公司专用
  PROJECT = 'PROJECT',  // 项目专用
}

export const PRC2_PHASE = 0;
export const PRC2_TABLE_COUNT = 15;
