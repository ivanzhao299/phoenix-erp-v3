import { EntityManager } from 'typeorm';
import { openingCostDecimal } from './opening-cost-decimal';

export type TransferCost = { unitPrice: string; currency: string; sourceCompany: string };

export async function readTransferCost(manager: EntityManager, batchNo: string): Promise<TransferCost | null> {
  const [schema] = await manager.query(
    "SELECT to_regprocedure('official_inventory_proven_currency(text)') IS NOT NULL AS supported");
  if (!schema?.supported) return null;
  const [row] = await manager.query(
    `SELECT unit_cost::text AS value,company_code,official_inventory_proven_currency(batch_no) AS currency
       FROM inv_batches WHERE batch_no=$1 AND official_inventory_cost_known(batch_no)`, [batchNo]);
  return row?.currency && row?.company_code
    ? { unitPrice: openingCostDecimal(row.value), currency: row.currency, sourceCompany: row.company_code }
    : null;
}

export function acceptedTransferCost(
  source: { transfer_cost?: TransferCost | null }, company: string,
): TransferCost | null {
  return source.transfer_cost?.sourceCompany === company ? source.transfer_cost : null;
}

export async function transferCostAmount(manager: EntityManager, qty: number, cost: TransferCost | null) {
  if (!cost) return null;
  const [row] = await manager.query('SELECT ($1::numeric*$2::numeric)::numeric(18,6)::text AS amount', [qty, cost.unitPrice]);
  return row.amount as string;
}
