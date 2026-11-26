/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { EggSourceWriteControl } from '@/components/egg-sources/EggSourceWriteControl';

const requestMock=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/api-client',()=>({default:requestMock}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({lang:'zh',t:(key:string,fallback?:string)=>fallback||key})}));

it('opens writes against the observed paused state and reads the receipt after an uncertain response',async()=>{
  vi.stubGlobal('React',React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('div');
  document.body.append(host);
  const root=createRoot(host);
  const paused={writes_enabled:false,changed_at:'2026-11-26T00:00:00Z',changed_by:null,change_reason:null};
  const published={...paused,writes_enabled:true,changed_by:'26',change_reason:'Release #638'};
  requestMock.mockResolvedValueOnce({code:200,data:paused})
    .mockRejectedValueOnce(new Error('Unknown response'))
    .mockResolvedValueOnce({code:200,data:published});
  async function click(name:string) {
    const button=[...document.querySelectorAll('button')].find(element=>element.textContent?.trim()===name);
    expect(button?.disabled,name).toBe(false);
    await act(async()=>button?.click());
  }
  try {
    await act(async()=>root.render(<EggSourceWriteControl/>));
    await click('来源变更写入控制');
    expect(document.body.textContent).toContain('当前状态为暂停写入');
    const reason=document.querySelector('textarea')!;
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(reason,'Release #638');
      reason.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await click('恢复写入');
    expect(requestMock.mock.calls[1][1]).toMatchObject({
      method:'POST',retry:false,bindSession:true,
      body:JSON.stringify({expectedEnabled:false,enabled:true,reason:'Release #638'}),
    });
    expect(document.querySelector('[role=alert]')?.textContent).toContain('状态未确认');
    await click('重新读取状态');
    expect(document.body.textContent).toContain('当前状态为允许写入');
    expect(document.body.textContent).toContain('Release #638');
  } finally {
    await act(async()=>root.unmount());
    host.remove();
    requestMock.mockReset();
    vi.unstubAllGlobals();
  }
});
