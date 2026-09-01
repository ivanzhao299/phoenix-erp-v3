'use client';

import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import request from '@/lib/api-client';
import { StoreMembershipSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { usePermission } from '@/hooks/usePermission';

type Settlement = {
  id:number; settlement_no:string; store_code:string; business_date:string; currency_code:string;
  tender_total:number; evidence_total:number; difference_amount:number; match_status:string; status:string;
  reconciliations?:Array<{id:number;reference:string;matched_amount:number;status:string;reason?:string}>;
};

export default function StoreSettlementPage() {
  const { canView, canEdit } = usePermission('MENU_STORE_SETTLEMENT');
  const [storeCode,setStoreCode]=useState('');
  const [businessDate,setBusinessDate]=useState(new Date().toISOString().slice(0,10));
  const [data,setData]=useState<Settlement|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const build=async()=>{setBusy(true);setError('');try{setData(await request<Settlement>('/v2/store-settlements/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeCode,businessDate})}))}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  const post=async()=>{if(!data)return;setBusy(true);setError('');try{setData(await request<Settlement>(`/v2/store-settlements/${data.id}/post`,{method:'POST'}))}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  if(!canView)return <div style={{padding:24}}>无权查看门店日结</div>;
  return <main style={{padding:24}}><PageHeader title="门店营业日日结" subtitle="Tender / Store Payment / Cash / AR 勾稽；过账只锁定，不重复入账" />
    <section style={{display:'flex',gap:12,alignItems:'end',margin:'20px 0'}}>
      <label>门店<StoreMembershipSelector value={storeCode} onChange={setStoreCode}/></label>
      <label>营业日<input type="date" value={businessDate} onChange={e=>setBusinessDate(e.target.value)}/></label>
      <button disabled={busy||!canEdit||!storeCode} onClick={build}>生成/重算日结</button>
    </section>
    {error&&<p style={{color:'var(--status-danger)'}}>{error}</p>}
    {data&&<section><h2>{data.settlement_no} · {data.status}</h2>
      <p>{data.currency_code} Tender {Number(data.tender_total).toFixed(2)} / 凭证 {Number(data.evidence_total).toFixed(2)} / 差异 {Number(data.difference_amount).toFixed(2)} · {data.match_status}</p>
      <button disabled={busy||!canEdit||data.status!=='READY'} onClick={post}>财务审核过账（锁定）</button>
      <table><thead><tr><th>参考号</th><th>匹配金额</th><th>状态</th><th>原因</th></tr></thead><tbody>{data.reconciliations?.map(r=><tr key={r.id}><td>{r.reference}</td><td>{Number(r.matched_amount).toFixed(2)}</td><td>{r.status}</td><td>{r.reason||'—'}</td></tr>)}</tbody></table>
    </section>}
  </main>;
}
