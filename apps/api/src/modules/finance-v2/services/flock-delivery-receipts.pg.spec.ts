import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import type { ClsService } from 'nestjs-cls';
import { ArInvoicesService } from './ar-invoices.service';
import { ArReceiptsService } from './ar-receipts.service';
import { flockMoneyNumber } from './flock-ar-receipts';
import { CashAccountsService } from './cash-accounts.service';
import { CashTransactionsService } from './cash-transactions.service';
import { RestoreFinanceSourceTypeChecks1787304000000 } from '../../../database/migrations/1787304000000-RestoreFinanceSourceTypeChecks';

const url=process.env.FLOCK_FINANCE_PG_URL;
const suite=url?describe:describe.skip;
const delivery='31ab214d-4192-4804-8bad-66d54eb18b09';

suite('flock delivery finance on isolated PostgreSQL',()=>{
  let db:DataSource;
  const schema='flock_finance_' + process.pid + '_' + randomUUID().slice(0,8);
  let invoices:ArInvoicesService;
  let receipts:ArReceiptsService;
  let companies=['CA'];
  let scopeLevel='COMPANY';
  let accounts:CashAccountsService;
  let transactions:CashTransactionsService;
  beforeAll(async()=>{
    const parsed=new URL(url!);
    if (parsed.hostname!=='127.0.0.1' || parsed.pathname!=='/phoenix_flock_followup_finance') throw Error('Owned loopback finance fixture required');
    db=await new DataSource({type:'postgres',url,synchronize:false,migrationsRun:false,installExtensions:false,extra:{options:'-c search_path=' + schema}}).initialize();
    await db.query('CREATE SCHEMA ' + schema);
    await db.query(readFileSync(resolve(__dirname,'../../../../ddl/22_finance_v2_tables.sql'),'utf8'));
    const migration=db.createQueryRunner();
    try { await new RestoreFinanceSourceTypeChecks1787304000000().up(migration); } finally { await migration.release(); }
    await db.query(`CREATE TABLE brd_flock_documents(id text PRIMARY KEY,company_code text,kind text,status text,business_date date);
      CREATE TABLE brd_flock_sales_settlements(document_id text PRIMARY KEY,company_code text,customer_code text,currency_code text,amount numeric(18,2),receipt_reference text);
      CREATE TABLE sal_customers(customer_no text,company_code text,customer_name text);
      INSERT INTO sal_customers VALUES('K','CA','Fixture customer');
      INSERT INTO brd_flock_documents VALUES('${delivery}','CA','SELL_HELD','POSTED','2026-11-16');
      INSERT INTO brd_flock_sales_settlements VALUES('${delivery}','CA','K','LAK',100.00,'SIGNED-FLOCK-1');
      INSERT INTO fin_cash_accounts(account_code,account_name,company_code,currency_code) VALUES
        ('CA-LAK','Local fixture','CA','LAK'),('CA-CNY','Wrong currency','CA','CNY'),('OTHER-LAK','Fixture other','CA','LAK')`);
    const cls={get:(key:string)=>key==='user'?{userId:'1'}:{allowedCompanyCodes:companies,scopeLevel,isGlobal:false}} as unknown as ClsService;
    invoices=new ArInvoicesService(db,cls);
    accounts=new CashAccountsService({findOne:async({where}:{where:{id:string}})=>{
      const [account]=await db.query(`SELECT id,account_code AS "accountCode",account_name AS "accountName",
        company_code AS "companyCode",currency_code AS "currencyCode",status FROM fin_cash_accounts WHERE id=$1`,[where.id]);
      return account;
    }} as never,db,cls);
    transactions=new CashTransactionsService({} as never,db);
    receipts=new ArReceiptsService(db,cls,invoices,accounts,transactions);
  });
  afterAll(async()=>{ if (db?.isInitialized) { await db.query('DROP SCHEMA ' + schema + ' CASCADE'); await db.destroy(); } });

  it('links one receivable, recognizes two cash-backed receipts and restores cash and AR upon one controlled reversal',async()=>{
    const before=await db.query('SELECT * FROM brd_flock_sales_settlements');
    expect((await invoices.flockSettlement(delivery)).collection_status).toBe('PENDING_FINANCE');
    const [invoice,replay]=await Promise.all([invoices.flockSettlement(delivery,true),invoices.flockSettlement(delivery,true)]);
    expect(invoice.invoice_id).toBe(replay.invoice_id);
    expect(invoice.received_amount).toBe('0.00');
    await expect(invoices.update(invoice.invoice_id,{amountOriginal:90})).rejects.toThrow('禁止直接修改');

    const receipt=(amount:number,account='CA-LAK',customerCode='K',paymentKey=randomUUID())=>receipts.create({companyCode:'CA',customerCode,
      customerName:'Fixture customer',amountOriginal:amount,receiptDate:'2026-11-18',currencyCode:'LAK',
      baseCurrency:'LAK',exchangeRate:1,receivedAccountCode:account,flockInvoiceId:invoice.invoice_id,paymentKey});
    const confirm=(id:number,amount:number)=>receipts.confirm(String(id),{allocations:[{arInvoiceId:invoice.invoice_id,allocatedAmountOriginal:amount}]});
    await expect(confirm((await receipt(25.5,'CA-CNY')).id,25.5)).rejects.toThrow('同币种');
    await expect(receipt(25.5,'CA-LAK','OTHER')).rejects.toThrow('不一致');
    const paymentKey=randomUUID();
    const partial=await receipt(25.5,'CA-LAK','K',paymentKey);
    await expect(receipts.confirm(String(partial.id),{
      receiveAccountId:'3',allocations:[{arInvoiceId:invoice.invoice_id,allocatedAmountOriginal:25.5}],
    })).rejects.toThrow('原资金账户');
    await confirm(partial.id,25.5);
    expect((await receipt(25.5,'CA-LAK','K',paymentKey)).id).toBe(partial.id);
    await confirm(partial.id,25.5);
    await expect(receipt(25.6,'CA-LAK','K',paymentKey)).rejects.toThrow('其他内容');
    expect(await invoices.flockSettlement(delivery)).toMatchObject({collection_status:'PARTIAL',received_amount:'25.50',outstanding_amount:'74.50'});
    const final=await receipt(74.5);
    await confirm(final.id,74.5);
    expect(await invoices.flockSettlement(delivery)).toMatchObject({collection_status:'RECEIVED',received_amount:'100.00',outstanding_amount:'0.00'});
    expect((await receipts.reverseFlockReceipt(String(partial.id),'Fixture reversal')).reversed).toBe(true);
    expect((await receipts.reverseFlockReceipt(String(partial.id),'Fixture same result')).reversed).toBe(true);
    expect(await invoices.flockSettlement(delivery)).toMatchObject({collection_status:'PARTIAL',received_amount:'74.50',outstanding_amount:'25.50'});
    expect(await db.query('SELECT direction,amount FROM fin_cash_transactions ORDER BY id')).toEqual([
      {direction:'IN',amount:'25.50'},{direction:'IN',amount:'74.50'},{direction:'OUT',amount:'25.50'}]);
    expect(await db.query('SELECT current_balance FROM fin_cash_accounts WHERE account_code=$1',['CA-LAK'])).toEqual([{current_balance:'74.50'}]);
    expect(await db.query('SELECT * FROM brd_flock_sales_settlements')).toEqual(before);
    expect((await invoices.findById(invoice.invoice_id)).allocations).toHaveLength(2);
    const txns=await db.query('SELECT id FROM fin_cash_transactions ORDER BY id');
    for (const txn of txns) await expect(accounts.reassignTransaction(txn.id,'3',{dataScope:{scopeAll:true}})).rejects.toThrow('禁止改挂');
    expect(()=>flockMoneyNumber(9007199254740991n)).toThrow();
    scopeLevel='PROJECT';
    expect((await invoices.list({})).items).toEqual([]);
    expect((await receipts.list({})).items).toEqual([]);
    expect((await transactions.list({},['CA'],false)).items).toEqual([]);
    expect((await transactions.list({},['CA'],true)).items).toHaveLength(3);
    await expect(invoices.findById(invoice.invoice_id)).rejects.toThrow('公司级');
    await expect(receipts.findById(String(final.id))).rejects.toThrow('公司级');
    scopeLevel='COMPANY';
    companies=['CB'];
    await expect(invoices.flockSettlement(delivery,true)).rejects.toThrow('不可见');
    await expect(receipts.reverseFlockReceipt(String(final.id),'Other scope')).rejects.toThrow('无权');
  });
  it('keeps exact original and base amounts through large receipts, account rebuild and reversal',async()=>{
    companies=['CA'];scopeLevel='COMPANY';
    const id=randomUUID();
    await db.query("INSERT INTO brd_flock_documents VALUES($1,'CA','SELL_HELD','POSTED','2026-11-16')",[id]);
    await db.query("INSERT INTO brd_flock_sales_settlements VALUES($1,'CA','K','LAK',35184372088832.23,'SIGNED-FLOCK-PRECISION')",[id]);
    const invoice=await invoices.flockSettlement(id,true);
    const receipt=await receipts.create({companyCode:'CA',customerCode:'K',customerName:'Fixture customer',
      amountOriginal:35184372088832.02,receiptDate:'2026-11-18',currencyCode:'LAK',baseCurrency:'LAK',
      receivedAccountCode:'OTHER-LAK',flockInvoiceId:invoice.invoice_id,paymentKey:randomUUID()});
    expect(receipt.amount_base).toBe('35184372088832.02');
    await receipts.confirm(String(receipt.id),{allocations:[{arInvoiceId:invoice.invoice_id,allocatedAmountOriginal:35184372088832.02}]});
    expect(await db.query('SELECT allocated_amount_original,allocated_amount_base FROM fin_ar_receipt_allocations WHERE receipt_id=$1',[receipt.id]))
      .toEqual([{allocated_amount_original:'35184372088832.02',allocated_amount_base:'35184372088832.02'}]);
    expect((await invoices.flockSettlement(id)).outstanding_amount).toBe('0.21');
    await receipts.reverseFlockReceipt(String(receipt.id),'Precision fixture reversal');
    expect((await invoices.flockSettlement(id)).outstanding_amount).toBe('35184372088832.23');

    const [account]=await db.query(`WITH inserted AS (INSERT INTO fin_cash_accounts(account_code,account_name,company_code,currency_code,opening_balance,current_balance)
      VALUES('LARGE-LAK','Precision fixture','CA','LAK',70368744177664.02,70368744177664.02) RETURNING id) SELECT id FROM inserted`);
    const small=await receipts.create({companyCode:'CA',customerCode:'K',customerName:'Fixture customer',
      amountOriginal:0.21,receiptDate:'2026-11-19',currencyCode:'LAK',baseCurrency:'LAK',
      receivedAccountCode:'LARGE-LAK',flockInvoiceId:invoice.invoice_id,paymentKey:randomUUID()});
    await receipts.confirm(String(small.id),{allocations:[{arInvoiceId:invoice.invoice_id,allocatedAmountOriginal:0.21}]});
    await accounts.recalcBalance(account.id,{dataScope:{scopeAll:true}});
    expect(await db.query('SELECT current_balance FROM fin_cash_accounts WHERE id=$1',[account.id])).toEqual([{current_balance:'70368744177664.23'}]);
    expect(await db.query('SELECT balance_after FROM fin_cash_transactions WHERE account_id=$1',[account.id])).toEqual([{balance_after:'70368744177664.23'}]);
  });

});
