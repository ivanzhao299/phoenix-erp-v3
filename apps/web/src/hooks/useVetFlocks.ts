'use client';

import { useEffect, useState } from 'react';
import { farmProductionApi } from '@/lib/api-client';

export interface VetFlock {
  flock_no: string;
  house_code: string;
  farm_code: string;
  site_code: string;
  company_code: string;
  current_qty: number;
}

export function useVetFlocks() {
  const [flocks, setFlocks] = useState<VetFlock[]>([]);
  useEffect(() => {
    let active = true;
    farmProductionApi.listVetFlocks().then(({data}) => {
      if (active) setFlocks(data.map(row => ({
        flock_no: String(row.flock_no), house_code: String(row.house_code),
        farm_code: String(row.farm_code), site_code: String(row.site_code),
        company_code: String(row.company_code), current_qty: Number(row.current_qty),
      })));
    }).catch(() => { if (active) setFlocks([]); });
    return () => { active = false; };
  }, []);
  return flocks;
}

export function useVetChoices(flock: VetFlock | undefined, material: string, kind: 'VACCINE'|'MEDICATION',
  drawerKey: string, startDate?: string) {
  type Rows = Record<string,unknown>[];
  const [catalog,setCatalog] = useState<{key:string;rows:Rows;error?:string}>();
  const [stock,setStock] = useState<{key:string;rows:Rows;error?:string}>();
  const site = flock?.site_code, company = flock?.company_code;
  const catalogKey = JSON.stringify([site,company,kind,drawerKey]);
  const lotKey = JSON.stringify([catalogKey,material,startDate]);
  useEffect(() => {
    if (!site || !company || !drawerKey) return;
    let active = true;
    const list = kind === 'VACCINE' ? farmProductionApi.listImmuneVaccines : farmProductionApi.listVetMedications;
    list({site_code:site,company_code:company})
      .then(({data})=>{if (active) setCatalog({key:catalogKey,rows:data});})
      .catch((e:Error)=>{if (active) setCatalog({key:catalogKey,rows:[],error:e.message});});
    return () => {active=false;};
  }, [catalogKey,company,site,kind,drawerKey]);
  useEffect(() => {
    if (!site || !company || !material || !drawerKey) return;
    let active = true;
    const list = kind === 'VACCINE' ? farmProductionApi.listImmuneInventoryBatches : farmProductionApi.listMedicineLots;
    list({site_code:site,company_code:company,material_code:material,...(startDate ? {start_date:startDate} : {})})
      .then(({data})=>{if(active) setStock({key:lotKey,rows:data});})
      .catch((e:Error)=>{if(active) setStock({key:lotKey,rows:[],error:e.message});});
    return () => {active=false;};
  },[lotKey,company,site,material,startDate,kind,drawerKey]);
  return {materials:catalog?.key===catalogKey ? catalog.rows : [], lots:stock?.key===lotKey ? stock.rows : [],
    error:(catalog?.key===catalogKey && catalog.error) || (stock?.key===lotKey && stock.error) || ''};
}
