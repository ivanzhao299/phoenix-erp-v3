/** @vitest-environment jsdom */
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {EggSourceHouseRollout,EggSourceOrganizationGrants} from '@/components/egg-sources/EggSourceOrganizationControl';

const request=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/api-client',()=>({default:request}));
vi.mock('@/components/ui/RightDrawer',()=>({RightDrawer:({open,children,onClose}:{open:boolean;children:React.ReactNode;onClose:()=>void})=>
  open?<div><button type="button" onClick={onClose}>close</button>{children}</div>:null}));
vi.mock('@/hooks/usePermission',()=>({usePermission:()=>({role:'ROLE_ADMIN',roles:['ROLE_ADMIN'],user:{}})}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({ lang:'zh', t:(key:string)=>key })}));

it.each(['role','set'] as const)('shows %s existing limits and supports standard conversion without an organization picker',async subject=>{
  vi.stubGlobal('React',React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  request.mockReset();
  request.mockResolvedValue({data:{
    rows:[{scope_type:'HOUSE',scope_code:'H1',actions:['V','C']}],
    inherited:subject==='role' ? [{scope_type:'FARM',scope_code:'F1',actions:['V','A'],set_code:'PSET_SAMPLE'}] : [],
    digest:'fixture-revision',standardDigest:'fixture-dependencies',standard:null,actions:['V','C'],
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
    expect(host.textContent).toContain('H1');
    expect(host.querySelectorAll('select')).toHaveLength(1);
    expect(host.querySelector('select')?.getAttribute('aria-label')).toBe('旧版目标仓');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
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

it.each(['unknown','rejected','saved'] as const)('retains correct rollout state after a %s write and only reads on refresh',async outcome=>{
  vi.stubGlobal('React',React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  request.mockReset();
  const old={house_code:'H1',company_code:'OLD',enabled:true,revision:'old',change_reason:'Moved',changed_at:'2026-11-24T10:00:00Z'};
  const confirmed={...old,house_code:'H2',company_code:'CO',enabled:false,revision:'new',change_reason:'Approved pause'};
  let writes=0;
  let refreshes=0;
  request.mockImplementation(async (path:string,opts?:{method?:string})=>{
    if (path.includes('/egg-source-organizations?')) return {data:[{code:'H1',name:'First',companyCode:'CO'},{code:'H2',name:'Second',companyCode:'CO'}]};
    if (opts?.method==='PUT') {
      writes++;
      if (outcome==='unknown') throw Error('Connection interrupted');
      if (outcome==='rejected') throw Object.assign(Error('Changed by another administrator'),{status:409});
      return {data:confirmed};
    }
    if (path.endsWith('/egg-source-house-rollouts')) {
      refreshes++;
      if (outcome==='saved'&&refreshes===2) throw Error('Refresh failed');
      return {data:writes&&outcome!=='rejected'?[old,confirmed]:[old]};
    }
    throw Error('Unexpected request '+path);
  });
  const host=document.createElement('div');
  document.body.append(host);
  const root=createRoot(host);
  async function button(name:string) {
    const element=[...host.querySelectorAll('button')].find(node=>node.textContent===name);
    expect(element?.disabled,name).toBe(false);
    await act(async()=>element?.click());
  }
  async function setValue(selector:string,value:string) {
    const element=host.querySelector<HTMLSelectElement|HTMLTextAreaElement>(selector);
    expect(element,selector).toBeTruthy();
    if (!element) return;
    await act(async()=>{
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value')?.set?.call(element,value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement?'change':'input',{bubbles:true}));
    });
  }
  try {
    await act(async()=>root.render(<EggSourceHouseRollout/>));
    await button('eggSources.houseRollout');
    await button('eggSources.organizationFind');
    await setValue('select','H1');
    expect(host.textContent).not.toContain('Moved');
    await act(async()=>host.querySelector<HTMLInputElement>('input[type=checkbox]')?.click());
    await setValue('textarea','Wrong house');
    await button('eggSources.rolloutReview');
    expect(host.textContent).toContain('CO · H1');
    await setValue('select','H2');
    expect(host.textContent).not.toContain('CO · H1');
    expect(host.querySelector('textarea')?.value).toBe('');
    expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(false);
    await act(async()=>host.querySelector<HTMLInputElement>('input[type=checkbox]')?.click());
    await setValue('textarea','Approved pause');
    await button('eggSources.rolloutReview');
    expect(host.textContent).toContain('CO · H2');
    await button('eggSources.houseRolloutPause');
    expect(writes).toBe(1);
    if (outcome==='unknown') expect(host.textContent).toContain('eggSources.rolloutWriteUnknown CO · H2');
    if (outcome==='rejected') expect(host.textContent).toContain('Changed by another administrator');
    if (outcome==='saved') expect(host.textContent).toContain('eggSources.rolloutRecorded');
    await button('eggSources.writeControl.refresh');
    expect(writes).toBe(1);
    expect(refreshes).toBe(outcome==='saved'?3:2);
    if (outcome!=='rejected') expect(host.textContent).toContain('Approved pause');
  } finally {
    await act(async()=>root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
