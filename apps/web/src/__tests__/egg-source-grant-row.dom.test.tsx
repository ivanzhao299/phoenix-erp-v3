/** @vitest-environment jsdom */
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {EggSourceOrganizationGrants} from '@/components/egg-sources/EggSourceOrganizationControl';

const request=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/api-client',()=>({default:request}));
vi.mock('@/hooks/usePermission',()=>({usePermission:()=>({role:'ROLE_ADMIN',roles:['ROLE_ADMIN'],user:{}})}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({ lang:'zh', t:(key:string)=>key })}));

it.each(['role','set'] as const)('keeps %s organization grants on the standard matrix row',async subject=>{
  vi.stubGlobal('React',React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  request.mockReset();
  request.mockResolvedValue({data:{
    rows:[{scope_type:'HOUSE',scope_code:'H1',actions:['V','C']}],
    inherited:subject==='role' ? [{scope_type:'FARM',scope_code:'F1',actions:['V','A'],set_code:'PSET_SAMPLE'}] : [],
    digest:'fixture-revision',
  }});
  const host=document.createElement('div');
  document.body.append(host);
  const root=createRoot(host);
  try {
    await act(async()=>root.render(<EggSourceOrganizationGrants subject={subject} code="FIXTURE" name="蛋品来源档案"
      legacy={<label>旧版目标仓 <select aria-label="旧版目标仓"/></label>}/>));
    const buttons=[...host.querySelectorAll<HTMLButtonElement>('button[data-action]')];
    expect(buttons.map(button=>button.textContent)).toEqual(['V','C','E','D','A','X']);
    expect(buttons.filter(button=>button.disabled).map(button=>button.textContent)).toEqual(['D','X']);
    expect(buttons[1].dataset.configured).toBe('true');
    const legacy=host.querySelector('details');
    expect(legacy?.open).toBe(false);
    await act(async()=>buttons[1].click());
    expect(host.querySelector('fieldset')?.textContent).toContain('H1');
    if (subject==='role') expect(host.textContent).toContain('PSET_SAMPLE');
    expect(legacy?.open).toBe(false);
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/egg-source-organization-grants/'+subject+'/FIXTURE'),expect.anything());
    expect(request.mock.calls.every(([path])=>!String(path).includes('/permissions/role/'))).toBe(true);
  } finally {
    await act(async()=>root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
