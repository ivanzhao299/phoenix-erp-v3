'use client';
import { useCallback,useEffect,useMemo,useState } from 'react';
import { DataTableV3,ErrorState,PageShell,Panel,StatusBadge } from '@/components/design-system';
import { StoreMembershipSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { useLanguage } from '@/contexts/LanguageContext';
import { loadStorePosContexts,storePosRequest } from '@/lib/store-pos-api';
import { formatMasterData } from '@/lib/business-display';
import styles from './inventory.module.css';

type Tab='ALL'|'AVAILABLE'|'QUARANTINE';
type Row={batch_no:string;sku_code?:string;sku_name?:string;sku_name_en?:string;sku_name_lo?:string;product_code:string;quality_grade?:string;packaging_spec?:string;qty:number;qty_available:number;status:string;warehouse_code:string;warehouse_name?:string;warehouse_name_zh?:string;warehouse_name_en?:string;warehouse_name_lo?:string;location_code?:string;location_name?:string;zone_code?:string;zone_name?:string;zone_type?:string;source_type?:string;source_no?:string;created_at:string;ledger_id?:number;ledger_change_type?:string;ledger_qty_change?:number;ledger_created_at?:string};
type Response={store:{code:string;name:string};summary:{onHand:number;available:number;quarantine:number;reserved:number};rows:Row[];pagination:{total:number}};
const empty:Response={store:{code:'',name:''},summary:{onHand:0,available:0,quarantine:0,reserved:0},rows:[],pagination:{total:0}};
export default function Page(){
 const {t,lang}=useLanguage();const[store,setStore]=useState(''),[tab,setTab]=useState<Tab>('ALL'),[sku,setSku]=useState(''),[data,setData]=useState<Response>(empty),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{void loadStorePosContexts().then(c=>{if(c[0])setStore(c[0].storeCode);else{setLoading(false);setError(t('store.inventory.no_store','当前账号无有效门店 membership'))}}).catch(e=>{setLoading(false);setError(e.message||t('store.inventory.context_error','门店授权加载失败'))})},[t]);
 const load=useCallback(async()=>{if(!store)return;setLoading(true);setError('');try{const q=new URLSearchParams({storeCode:store,limit:'200'});if(tab!=='ALL')q.set('status',tab);if(sku.trim())q.set('sku',sku.trim());setData(await storePosRequest<Response>('GET',`/api/v2/store-sales/inventory?${q}`))}catch(e:any){setError(e.message||t('store.inventory.load_error','库存加载失败'))}finally{setLoading(false)}},[store,tab,sku,t]);
 useEffect(()=>{void load()},[load]);
 const columns=useMemo(()=>[
  {key:'status',title:t('ui.状态','状态'),render:(r:Row)=><StatusBadge status={r.status} label={r.status==='QUARANTINE'?t('store.inventory.pending_inspection','待质检'):r.status}/>},
  {key:'batch_no',title:t('ui.批次号','批次号')},{key:'sku_code',title:'SKU',render:(r:Row)=><span>{formatMasterData({...r,sku_name_zh:r.sku_name},'sku_name',r.sku_code||r.product_code,lang)}</span>},{key:'qty',title:t('store.inventory.on_hand','在库'),type:'number' as const},{key:'qty_available',title:t('store.inventory.available','可售'),type:'number' as const},
  {key:'warehouse_code',title:t('ui.仓库','仓库'),render:(r:Row)=><span>{formatMasterData(r,'warehouse_name',r.warehouse_code,lang)}</span>},{key:'zone_code',title:t('ui.库区','库区'),render:(r:Row)=><span>{formatMasterData(r,'zone_name',r.zone_code,lang)}</span>},{key:'location_code',title:t('ui.货位','货位'),render:(r:Row)=><span>{formatMasterData(r,'location_name',r.location_code,lang)}</span>},
  {key:'source_no',title:t('store.inventory.source_sale','来源销售单'),render:(r:Row)=><span>{r.source_no||'—'}{r.ledger_id&&<small className={styles.ledger}>ledger #{r.ledger_id} · {r.ledger_change_type}</small>}</span>},
  {key:'created_at',title:t('store.inventory.return_time','入库/退货时间'),render:(r:Row)=><span>{new Date(r.created_at).toLocaleString()}</span>},
 ],[t,lang]);
 return <PageShell title={t('store.inventory.title','门店库存')} subtitle={t('store.inventory.subtitle','只读事实查询 · inv_batches 唯一库存台账')} actions={<button onClick={()=>void load()} disabled={loading}>{t('ui.刷新','刷新')}</button>}>
  <Panel><div className={styles.filters}><StoreMembershipSelector value={store} onChange={setStore}/><input aria-label={t('store.inventory.search','搜索 SKU / 名称 / 产品 / 批次')} value={sku} onChange={e=>setSku(e.target.value)} placeholder={t('store.inventory.search','搜索 SKU / 名称 / 产品 / 批次')}/></div></Panel>
  {error?<ErrorState message={error} onRetry={()=>void load()}/>:<><div className={styles.kpis}>{([['onHand','store.inventory.on_hand','全部在库'],['available','store.inventory.available','可售'],['quarantine','store.inventory.quarantine','隔离'],['reserved','store.inventory.reserved','预留']] as const).map(([key,k,label])=><Panel key={key}><small>{t(k,label)}</small><strong>{data.summary[key].toLocaleString()}</strong></Panel>)}</div>
  <div className={styles.tabs} role="tablist">{([['ALL','store.inventory.all','全部在库'],['AVAILABLE','store.inventory.available','可售'],['QUARANTINE','store.inventory.quarantine_tab','隔离 / 待质检']] as const).map(([value,key,label])=><button key={value} role="tab" aria-selected={tab===value} className={tab===value?styles.active:''} onClick={()=>setTab(value)}>{t(key,label)}</button>)}</div>
  <Panel><div className={styles.desktop}><DataTableV3<Row> rows={data.rows} columns={columns} loading={loading} rowKey={r=>r.batch_no} pageSize={20} emptyText={tab==='QUARANTINE'?t('store.inventory.no_quarantine','暂无待质检批次'):t('store.inventory.empty','暂无在库批次')}/></div><div className={styles.mobile}>{loading?<div>{t('ui.加载中','加载中…')}</div>:data.rows.length===0?<div>{t('store.inventory.empty','暂无在库批次')}</div>:data.rows.map(r=><article key={r.batch_no} className={r.status==='QUARANTINE'?styles.quarantine:''}><header><b>{formatMasterData({...r,sku_name_zh:r.sku_name},'sku_name',r.sku_code||r.product_code,lang)}</b><StatusBadge status={r.status} label={r.status==='QUARANTINE'?t('store.inventory.pending_inspection','待质检'):r.status}/></header><p>{r.batch_no}</p><strong>{t('store.inventory.on_hand','在库')} {Number(r.qty).toLocaleString()}</strong><p>{formatMasterData(r,'warehouse_name',r.warehouse_code,lang)} / {formatMasterData(r,'zone_name',r.zone_code,lang)} / {formatMasterData(r,'location_name',r.location_code,lang)}</p>{r.source_no&&<p>{t('store.inventory.source_sale','来源销售单')}：{r.source_no}</p>}{r.ledger_id&&<p>ledger #{r.ledger_id} · {r.ledger_change_type}</p>}<time>{new Date(r.created_at).toLocaleString()}</time></article>)}</div></Panel></>}
 </PageShell>;
}
