'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CashAccountSelector, StoreMembershipSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { useAuth } from '@/contexts/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import { loadStorePosContexts, storePosRequest } from '@/lib/store-pos-api';
import { T } from '@/styles/terminal-theme';
import { addTerminalCartLine, canTerminalSettle, changeTerminalCartQty, terminalPosDraftKey } from '@/lib/terminal-store-pos-state';

type PayType = 'CASH' | 'CREDIT' | 'MIXED';
type Product = { product_code:string; product_name:string; sku_code?:string; unit_price:number; currency_code?:string; grade_code?:string; packaging_spec?:string };
type CartLine = Product & { qty:number };

export default function TerminalStorePosPage() {
  const { user } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermission('MENU_STORE_POS');
  const [storeCode,setStoreCode] = useState(''); const [storeName,setStoreName] = useState(''); const [companyCode,setCompanyCode] = useState('');
  const [products,setProducts] = useState<Product[]>([]); const [cart,setCart] = useState<CartLine[]>([]);
  const [shift,setShift] = useState<any>(null); const [payType,setPayType] = useState<PayType>('CASH');
  const [cashAccountId,setCashAccountId] = useState(0); const [paidAmount,setPaidAmount] = useState('');
  const [busy,setBusy] = useState(false); const [message,setMessage] = useState(''); const [online,setOnline] = useState(true);
  const [sales,setSales] = useState<any[]>([]); const [showReturns,setShowReturns] = useState(false);
  const total = useMemo(() => cart.reduce((sum,line)=>sum+Number(line.unit_price)*line.qty,0),[cart]);
  const currency = cart[0]?.currency_code || '';
  const registerId = typeof window === 'undefined' ? 'unknown' : (localStorage.getItem('phoenix_terminal_id') || 'unregistered');
  const userId = String((user as any)?.userId || (user as any)?.id || (user as any)?.username || 'anonymous');
  const draftKey = terminalPosDraftKey(userId, storeCode, registerId);

  useEffect(()=>{ const sync=()=>setOnline(navigator.onLine); sync(); addEventListener('online',sync); addEventListener('offline',sync); return()=>{removeEventListener('online',sync);removeEventListener('offline',sync)}; },[]);
  useEffect(()=>{ void loadStorePosContexts().then(cs=>{ const c=cs[0]; if(c){setStoreCode(c.storeCode);setStoreName(c.storeName);setCompanyCode(c.companyCode);} else setMessage('当前账号无门店授权，请使用店长/收银账号或联系管理员配置 membership'); }).catch(()=>setMessage('门店授权服务加载失败，请刷新重试')); },[]);
  const refresh = useCallback(async()=>{ if(!storeCode||!companyCode)return; try { const [p,s,h]:any = await Promise.all([
    storePosRequest('GET',`/api/v2/store-sales/products?storeCode=${encodeURIComponent(storeCode)}&companyCode=${encodeURIComponent(companyCode)}`),
    storePosRequest('GET',`/api/v2/store-sales/shift?storeCode=${encodeURIComponent(storeCode)}`),
    storePosRequest('GET',`/api/v2/store-sales?storeCode=${encodeURIComponent(storeCode)}&status=COMPLETED&page=1&limit=8`)]);
    setProducts(Array.isArray(p)?p:[]); setShift(s); setSales(Array.isArray(h)?h:(h?.data||[]));
  } catch(e:any){setMessage(e.message||'加载失败')} },[storeCode,companyCode]);
  useEffect(()=>{void refresh()},[refresh]);
  useEffect(()=>{ if(!storeCode)return; try { const saved=JSON.parse(localStorage.getItem(draftKey)||'null'); if(saved?.storeCode===storeCode&&Array.isArray(saved.cart)) setCart(saved.cart); } catch{} },[draftKey,storeCode]);
  useEffect(()=>{ if(!storeCode)return; if(cart.length)localStorage.setItem(draftKey,JSON.stringify({schemaVersion:1,storeCode,registerId,userId,cart,updatedAt:new Date().toISOString()})); else localStorage.removeItem(draftKey); },[cart,draftKey,registerId,storeCode,userId]);

  const chooseStore = async(code:string)=>{ const cs=await loadStorePosContexts(); const c=cs.find(x=>x.storeCode===code); setStoreCode(code);setStoreName(c?.storeName||code);setCompanyCode(c?.companyCode||'');setCart([]); };
  const add=(p:Product)=>setCart(prev=>addTerminalCartLine(prev,p));
  const qty=(i:number,d:number)=>setCart(prev=>changeTerminalCartQty(prev,i,d));
  const checkout=async()=>{ if(!online){setMessage('离线状态仅保存草稿，禁止成交');return} if(!shift){setMessage('请先开班');return} if(!cart.length)return;
    if(payType!=='CREDIT'&&!cashAccountId){setMessage('请选择收款账户');return} setBusy(true); try { const sale:any=await storePosRequest('POST','/api/v2/store-sales',{storeCode,storeName,companyCode,saleType:payType,paymentMethod:payType==='CREDIT'?undefined:'CASH',items:cart.map((x,i)=>({productCode:x.product_code,productName:x.product_name,skuCode:x.sku_code,gradeCode:x.grade_code,packagingSpec:x.packaging_spec,qty:x.qty,unitPrice:Number(x.unit_price),amount:Number(x.unit_price)*x.qty,sortOrder:i}))});
      const key=crypto.randomUUID(); const paid=Number(paidAmount)||total;
      if(payType==='CASH')await storePosRequest('POST',`/api/v2/store-sales/${sale.id}/pay-cash`,{cashAccountId,paidAmount:paid,paymentMethod:'CASH',idempotencyKey:key});
      else if(payType==='CREDIT')await storePosRequest('POST',`/api/v2/store-sales/${sale.id}/pay-credit`,{idempotencyKey:key});
      else await storePosRequest('POST',`/api/v2/store-sales/${sale.id}/pay-mixed`,{cashAccountId,paidAmount:paid,paymentMethod:'CASH',idempotencyKey:key});
      setCart([]);setPaidAmount('');setMessage(`成交成功 ${sale.sale_no}`);await refresh();
    }catch(e:any){setMessage(e.message||'结账失败')}finally{setBusy(false)} };
  const openShift=async()=>{if(!online)return setMessage('离线禁止开班');await storePosRequest('POST','/api/v2/store-sales/shift/open',{storeCode,companyCode,openingCash:0});await refresh()};
  const closeShift=async()=>{if(!online)return setMessage('离线禁止交班');await storePosRequest('POST',`/api/v2/store-sales/shift/close?storeCode=${encodeURIComponent(storeCode)}`,{closingCash:0});setCart([]);await refresh()};
  const returnSale=async(id:number)=>{const reason=prompt('整单退货原因');if(!reason)return;await storePosRequest('POST',`/api/v2/store-sales/${id}/return`,{reason});setMessage('整单退货完成，库存按原 allocation 反向处理');await refresh()};

  const btn:React.CSSProperties={minHeight:52,border:0,borderRadius:10,padding:'10px 16px',fontWeight:800,fontSize:16,cursor:'pointer'};
  return <main style={{height:'100%',padding:18,color:T.TXT,background:T.BG,overflow:'auto'}}>
    <header style={{display:'flex',gap:14,alignItems:'center',padding:'12px 16px',background:T.CARD,borderRadius:14,marginBottom:14}}>
      <b style={{fontSize:22}}>门店触屏收银</b><div style={{width:320}}><StoreMembershipSelector value={storeCode} onChange={chooseStore}/></div>
      <span>{storeName} · {shift?`班次 OPEN ${shift.closing_no||''}`:'未开班'}</span><span style={{color:online?T.GRN:T.RED}}>{online?'在线':'离线草稿'}</span>
      <div style={{marginLeft:'auto',display:'flex',gap:8}}>{!shift?<button style={{...btn,background:T.GRN,color:'#06150d'}} onClick={openShift}>开班</button>:<button style={{...btn,background:T.ACC,color:'#241500'}} onClick={closeShift}>交班</button>}<button style={{...btn,background:T.CARD,color:T.TXT}} onClick={()=>setShowReturns(!showReturns)}>整单退货</button></div>
    </header>
    {message&&<div style={{padding:10,background:T.CARD,borderRadius:8,marginBottom:10}} onClick={()=>setMessage('')}>{message}</div>}
    {showReturns&&<section style={{background:T.CARD,padding:12,borderRadius:12,marginBottom:12}}><b>最近已完成销售</b>{sales.map(s=><div key={s.id} style={{display:'flex',gap:12,padding:8,borderBottom:`1px solid ${T.BOR}`}}><span>{s.sale_no}</span><span>{Number(s.total_amount).toFixed(2)}</span>{canDelete&&<button onClick={()=>returnSale(s.id)}>整单退货</button>}</div>)}</section>}
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(360px,1fr)',gap:14}}>
      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12,alignContent:'start'}}>{products.map(p=><button key={p.sku_code||p.product_code} onClick={()=>add(p)} style={{...btn,minHeight:112,background:T.CARD,color:T.TXT,textAlign:'left',border:`1px solid ${T.BOR}`}}><div style={{fontSize:18}}>{p.product_name}</div><small>{p.sku_code||p.product_code}</small><div style={{fontSize:22,color:T.ACC,marginTop:8}}>{Number(p.unit_price).toFixed(2)}</div></button>)}</section>
      <aside style={{background:T.CARD,borderRadius:14,padding:14,position:'sticky',top:0,height:'fit-content'}}><h2 style={{marginTop:0}}>购物车</h2>{cart.map((x,i)=><div key={x.sku_code||x.product_code} style={{padding:'10px 0',borderBottom:`1px solid ${T.BOR}`}}><div>{x.product_name}</div><div style={{display:'flex',alignItems:'center',gap:9,marginTop:6}}><button style={btn} onClick={()=>qty(i,-1)}>−</button><b style={{fontSize:22}}>{x.qty}</b><button style={btn} onClick={()=>qty(i,1)}>＋</button><span style={{marginLeft:'auto'}}>{(x.qty*Number(x.unit_price)).toFixed(2)}</span></div></div>)}
        <div style={{fontSize:36,fontWeight:900,textAlign:'right',padding:'16px 0'}}>{currency} {total.toFixed(2)}</div><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>{(['CASH','CREDIT','MIXED'] as PayType[]).map(x=><button key={x} style={{...btn,background:payType===x?T.ACC:T.BOR,color:payType===x?'#07131c':T.TXT}} onClick={()=>setPayType(x)}>{x}</button>)}</div>
        {payType!=='CREDIT'&&<><div style={{marginTop:10}}><CashAccountSelector valueField="id" companyCode={companyCode} currencyCode={currency||undefined} value={cashAccountId?String(cashAccountId):''} onChange={v=>setCashAccountId(Number(v)||0)}/></div><input aria-label="实收金额" value={paidAmount} onChange={e=>setPaidAmount(e.target.value)} placeholder={`实收 ${total.toFixed(2)}`} inputMode="decimal" style={{width:'100%',boxSizing:'border-box',fontSize:28,padding:12,marginTop:10,borderRadius:8}}/></>}
        <button disabled={busy||!canTerminalSettle({online,shiftOpen:!!shift,cartSize:cart.length,canCreate,canEdit})} onClick={checkout} style={{...btn,width:'100%',marginTop:12,minHeight:70,fontSize:24,background:T.GRN,color:'#07150d',opacity:busy||!canTerminalSettle({online,shiftOpen:!!shift,cartSize:cart.length,canCreate,canEdit})?.45:1}}>{online?'结账':'离线：仅保存草稿'}</button>
      </aside>
    </div>
  </main>;
}
