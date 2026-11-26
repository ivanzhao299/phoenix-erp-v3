'use client';

import { useId, useState } from 'react';
import { RightDrawer } from '@/components/ui/RightDrawer';
import { inputField, primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';
import { useLanguage } from '@/contexts/LanguageContext';
import request from '@/lib/api-client';
import { useSourceText } from './parts';
import s from './EggSources.module.css';

type WriteControl = { writes_enabled: boolean; changed_at: string; changed_by: string|null; change_reason: string|null };
export function EggSourceWriteControl({houseContract=false}:{houseContract?:boolean}) {
  const endpoint = houseContract ? '/sys/menu-registry/egg-source-house-write-control' : '/sys/menu-registry/egg-source-write-control';
  const { t } = useLanguage();
  const { time } = useSourceText();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<WriteControl|null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [failed, setFailed] = useState(false);

  async function read() {
    setBusy(true);
    setFailed(false);
    setState(null);
    try {
      const result = await request<{code:number;data:WriteControl}>(endpoint,{silent:true,bindSession:true,cache:'no-store'});
      if (result.code!==200 || typeof result.data?.writes_enabled!=='boolean') throw new Error();
      setState(result.data);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!state || busy || !reason.trim()) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await request<{code:number;data:WriteControl}>(endpoint,{
        method:'POST', body:JSON.stringify({expectedEnabled:state.writes_enabled,enabled:!state.writes_enabled,reason:reason.trim()}),
        silent:true,bindSession:true,retry:false,
      });
      if (result.code!==200 || typeof result.data?.writes_enabled!=='boolean') throw new Error();
      setState(result.data);
      setReason('');
    } catch {
      setState(null);
      setFailed(true);
    } finally { setBusy(false); }
  }

  const title=houseContract ? t('eggSources.houseWriteControl','新版来源写入控制') : t('eggSources.writeControl.title','来源变更写入控制');
  return <>
    <button type="button" style={secondaryActionButton} onClick={()=>{ setOpen(true); setReason(''); void read(); }}>{title}</button>
    <RightDrawer open={open} title={title} onClose={()=>{if (!busy) setOpen(false);}}>
      <div className={s.stack} aria-busy={busy}>
        {busy && <p role="status">{t('eggSources.writeControl.working','正在读取或保存')}</p>}
        {failed && <div className={s.stack}>
          <p role="alert">{t('eggSources.writeControl.failed','状态未确认。请重新读取后再操作。')}</p>
          <button type="button" style={secondaryActionButton} onClick={()=>void read()}>{t('eggSources.writeControl.refresh','重新读取状态')}</button>
        </div>}
        {state && <form className={s.stack} onSubmit={event=>{event.preventDefault(); void save();}}>
          <p role="status">{state.writes_enabled
            ? t('eggSources.writeControl.enabled','当前状态为允许写入')
            : t('eggSources.writeControl.paused','当前状态为暂停写入')}</p>
          {state.changed_by && <p className={s.hint}>{time(state.changed_at)} · {state.changed_by} · {state.change_reason}</p>}
          <label htmlFor={fieldId}>{t('eggSources.writeControl.reason','发布或维护依据')}</label>
          <textarea id={fieldId} style={inputField} value={reason} disabled={busy} required maxLength={500}
            onChange={event=>setReason(event.target.value)}/>
          <button type="submit" style={primaryActionButton} disabled={busy || !reason.trim()}>
            {state.writes_enabled ? t('eggSources.writeControl.pause','暂停写入') : t('eggSources.writeControl.resume','恢复写入')}
          </button>
        </form>}
      </div>
    </RightDrawer>
  </>;
}
