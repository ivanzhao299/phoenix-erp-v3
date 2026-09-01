import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../../org/services/data-scope.service';

@Injectable()
export class StoreSettlementService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly cls: ClsService) {}

  private assertCompany(companyCode: string) {
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    if (!scope?.isGlobal && !scope?.allowedCompanyCodes?.includes(companyCode)) {
      throw new ForbiddenException(`无权访问公司 ${companyCode} 的门店日结`);
    }
  }

  private user() { try { return this.cls.get('user') as any ?? {}; } catch { return {}; } }

  async build(storeCode: string, businessDate: string) {
    return this.ds.transaction(async mgr => {
      const [store] = await mgr.query(`SELECT company_code FROM stores WHERE store_code=$1 AND status='ACTIVE'`, [storeCode]);
      if (!store) throw new NotFoundException(`门店 ${storeCode} 不存在`);
      this.assertCompany(store.company_code);
      await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`store-settlement:${storeCode}:${businessDate}`]);
      const [locked] = await mgr.query(`SELECT * FROM sal_store_settlements
        WHERE store_code=$1 AND business_date=$2::date FOR UPDATE`, [storeCode,businessDate]);
      if (locked?.status === 'POSTED') throw new BadRequestException('POSTED settlement 不可重开或改写');

      const shifts = await mgr.query(`SELECT id FROM sal_store_shift_closings
        WHERE store_code=$1 AND company_code=$2 AND business_date=$3::date AND status='CLOSED'`,
        [storeCode,store.company_code,businessDate]);
      if (!shifts.length) throw new BadRequestException('该营业日没有已关闭班次');

      const totals = await mgr.query(`SELECT t.currency_code,
          COALESCE(SUM(t.amount) FILTER (WHERE t.status='CAPTURED'),0) tender_total,
          COALESCE(SUM(t.amount) FILTER (WHERE t.status='CAPTURED' AND t.tender_type IN ('CASH','QR','TRANSFER')),0) cash_total,
          COALESCE(SUM(t.amount) FILTER (WHERE t.status='CAPTURED' AND t.tender_type='CREDIT'),0) ar_total
        FROM sal_store_sale_tenders t JOIN sal_store_sales s ON s.id=t.sale_id
        WHERE s.store_code=$1 AND s.business_date=$2::date GROUP BY t.currency_code`, [storeCode,businessDate]);
      if (totals.length !== 1) throw new BadRequestException('首期 settlement 仅支持单币种且必须存在 tender');
      const total = totals[0];
      const no = `SET-${businessDate.replaceAll('-','')}-${storeCode}`;
      const [settlement] = await mgr.query(`INSERT INTO sal_store_settlements
        (settlement_no,store_code,company_code,business_date,currency_code,tender_total,cash_total,ar_total)
        VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8)
        ON CONFLICT (store_code,business_date) DO UPDATE SET currency_code=EXCLUDED.currency_code,
          tender_total=EXCLUDED.tender_total,cash_total=EXCLUDED.cash_total,ar_total=EXCLUDED.ar_total,
          status='DRAFT',match_status='PENDING',updated_at=NOW() RETURNING *`,
        [no,storeCode,store.company_code,businessDate,total.currency_code,total.tender_total,total.cash_total,total.ar_total]);
      await mgr.query(`DELETE FROM sal_store_settlement_reconciliations WHERE settlement_id=$1`, [settlement.id]);
      await mgr.query(`DELETE FROM sal_store_settlement_shifts WHERE settlement_id=$1`, [settlement.id]);
      for (const shift of shifts) await mgr.query(`INSERT INTO sal_store_settlement_shifts(settlement_id,shift_id) VALUES ($1,$2)`, [settlement.id,shift.id]);

      const tenders = await mgr.query(`SELECT t.*,s.sale_no,s.cash_account_id,s.ar_invoice_id
        FROM sal_store_sale_tenders t JOIN sal_store_sales s ON s.id=t.sale_id
        WHERE s.store_code=$1 AND s.business_date=$2::date AND t.status='CAPTURED'`, [storeCode,businessDate]);
      let evidenceTotal = 0;
      let exception = false;
      for (const tender of tenders) {
        if (tender.tender_type === 'CASH' || tender.tender_type === 'CREDIT') {
          const reference = tender.external_reference || tender.sale_no;
          const [cash] = tender.tender_type === 'CASH' ? await mgr.query(`SELECT id,amount FROM fin_cash_transactions
            WHERE source_type='STORE_SALE' AND source_id=$1 AND currency_code=$2 ORDER BY id LIMIT 1`,
            [tender.sale_id,tender.currency_code]) : [null];
          const valid = tender.tender_type === 'CASH'
            ? !!cash && Number(cash.amount) === Number(tender.amount)
            : !!tender.ar_invoice_id;
          await mgr.query(`INSERT INTO sal_store_settlement_reconciliations
            (settlement_id,tender_id,cash_transaction_id,ar_invoice_id,reference,currency_code,matched_amount,status,reason)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [settlement.id,tender.id,cash?.id ?? null,
            tender.ar_invoice_id,reference,tender.currency_code,valid?tender.amount:0,valid?'MATCHED':'EXCEPTION',
            valid?null:'Cash/AR 实时流水缺失或金额不一致']);
          if (valid) evidenceTotal += Number(tender.amount); else exception = true;
          continue;
        }
        const payments = await mgr.query(`SELECT id,payment_no,amount FROM store_payment_records
          WHERE deleted_at IS NULL AND status='CONFIRMED' AND store_code=$1 AND company_code=$2
            AND currency=$3 AND (payment_no=$4 OR sale_no=$5)`,
          [storeCode,store.company_code,tender.currency_code,tender.external_reference,tender.sale_no]);
        const sum = payments.reduce((n: number, p: any) => n + Number(p.amount), 0);
        const [cash] = await mgr.query(`SELECT id FROM fin_cash_transactions
          WHERE source_type='STORE_SALE' AND source_id=$1 AND currency_code=$2 ORDER BY id LIMIT 1`,
          [tender.sale_id,tender.currency_code]);
        if (sum !== Number(tender.amount) || !cash) {
          exception = true;
          await mgr.query(`INSERT INTO sal_store_settlement_reconciliations
            (settlement_id,tender_id,reference,currency_code,matched_amount,status,reason)
            VALUES ($1,$2,$3,$4,$5,'EXCEPTION','Store Payment 金额或参考号未精确匹配')`,
            [settlement.id,tender.id,tender.external_reference || tender.sale_no,tender.currency_code,sum]);
        } else {
          for (const payment of payments) await mgr.query(`INSERT INTO sal_store_settlement_reconciliations
            (settlement_id,tender_id,store_payment_record_id,cash_transaction_id,reference,currency_code,matched_amount,status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'MATCHED')`, [settlement.id,tender.id,payment.id,cash?.id ?? null,
            tender.external_reference || tender.sale_no,tender.currency_code,payment.amount]);
          evidenceTotal += sum;
        }
      }
      const difference = Math.round((Number(total.tender_total)-evidenceTotal)*100)/100;
      const [result] = await mgr.query(`UPDATE sal_store_settlements SET evidence_total=$2,difference_amount=$3,
        match_status=$4,status=$5,updated_at=NOW() WHERE id=$1 RETURNING *`, [settlement.id,evidenceTotal,difference,
        exception || difference !== 0 ? 'EXCEPTION':'MATCHED', exception || difference !== 0 ? 'EXCEPTION':'READY']);
      return result;
    });
  }

  async get(id: number) {
    const [row] = await this.ds.query(`SELECT * FROM sal_store_settlements WHERE id=$1`, [id]);
    if (!row) throw new NotFoundException(`settlement ${id} 不存在`);
    this.assertCompany(row.company_code);
    const [shifts,reconciliations] = await Promise.all([
      this.ds.query(`SELECT sc.* FROM sal_store_shift_closings sc JOIN sal_store_settlement_shifts ss ON ss.shift_id=sc.id WHERE ss.settlement_id=$1`, [id]),
      this.ds.query(`SELECT * FROM sal_store_settlement_reconciliations WHERE settlement_id=$1 ORDER BY id`, [id]),
    ]);
    return {...row,shifts,reconciliations};
  }

  async reconcile(id: number, dto: {tenderId:number;paymentRecordIds:number[];reason:string;evidence:string}) {
    if (!dto.reason?.trim() || !dto.evidence?.trim()) throw new BadRequestException('人工匹配必须填写原因和凭证');
    if (!dto.paymentRecordIds?.length) throw new BadRequestException('请选择 Store Payment 凭证');
    return this.ds.transaction(async mgr => {
      const [settlement] = await mgr.query(`SELECT * FROM sal_store_settlements WHERE id=$1 FOR UPDATE`, [id]);
      if (!settlement) throw new NotFoundException(`settlement ${id} 不存在`);
      this.assertCompany(settlement.company_code);
      if (settlement.status === 'POSTED') throw new BadRequestException('POSTED settlement 不可改写');
      const [tender] = await mgr.query(`SELECT t.*,s.sale_no FROM sal_store_sale_tenders t
        JOIN sal_store_sales s ON s.id=t.sale_id WHERE t.id=$1 AND s.store_code=$2 AND s.business_date=$3`,
        [dto.tenderId,settlement.store_code,settlement.business_date]);
      if (!tender) throw new BadRequestException('tender 不属于该 settlement');
      const payments = await mgr.query(`SELECT * FROM store_payment_records WHERE id=ANY($1::bigint[])
        AND deleted_at IS NULL AND status='CONFIRMED' AND store_code=$2 AND company_code=$3 AND currency=$4 FOR UPDATE`,
        [dto.paymentRecordIds,settlement.store_code,settlement.company_code,tender.currency_code]);
      if (payments.length !== dto.paymentRecordIds.length ||
          payments.reduce((n:number,p:any)=>n+Number(p.amount),0) !== Number(tender.amount)) {
        throw new BadRequestException('人工匹配凭证必须同店、同币种、已确认且金额精确等于 tender');
      }
      const user=this.user();
      await mgr.query(`DELETE FROM sal_store_settlement_reconciliations WHERE settlement_id=$1 AND tender_id=$2`, [id,tender.id]);
      const [cash] = await mgr.query(`SELECT id FROM fin_cash_transactions WHERE source_type='STORE_SALE' AND source_id=$1 ORDER BY id LIMIT 1`, [tender.sale_id]);
      for (const payment of payments) await mgr.query(`INSERT INTO sal_store_settlement_reconciliations
        (settlement_id,tender_id,store_payment_record_id,cash_transaction_id,reference,currency_code,matched_amount,status,reason,evidence,matched_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'MATCHED',$8,$9,$10)`, [id,tender.id,payment.id,cash?.id ?? null,
        tender.external_reference||tender.sale_no,tender.currency_code,payment.amount,dto.reason.trim(),dto.evidence.trim(),
        user.userId??user.id??null]);
      const [summary] = await mgr.query(`SELECT COALESCE(SUM(matched_amount) FILTER (WHERE status='MATCHED'),0) evidence,
        COUNT(*) FILTER (WHERE status<>'MATCHED') exceptions FROM sal_store_settlement_reconciliations WHERE settlement_id=$1`, [id]);
      const difference=Math.round((Number(settlement.tender_total)-Number(summary.evidence))*100)/100;
      const ready=Number(summary.exceptions)===0&&difference===0;
      const [row]=await mgr.query(`UPDATE sal_store_settlements SET evidence_total=$2,difference_amount=$3,
        match_status=$4,status=$5,updated_at=NOW() WHERE id=$1 RETURNING *`, [id,summary.evidence,difference,
        ready?'MATCHED':'EXCEPTION',ready?'READY':'EXCEPTION']);
      return row;
    });
  }

  async post(id: number) {
    const current = await this.get(id);
    if (current.status === 'POSTED') return current;
    if (current.status !== 'READY' || current.match_status !== 'MATCHED' || Number(current.difference_amount) !== 0) {
      throw new BadRequestException('仅零差异且已勾稽的 READY settlement 可过账');
    }
    const user = this.user();
    const [row] = await this.ds.query(`UPDATE sal_store_settlements SET status='POSTED',posted_at=NOW(),
      posted_by=$2,posted_by_name=$3,updated_at=NOW() WHERE id=$1 AND status='READY' RETURNING *`,
      [id,user.userId ?? user.id ?? null,user.name ?? user.username ?? null]);
    if (!row) throw new BadRequestException('settlement 状态已变化');
    return row;
  }
}
