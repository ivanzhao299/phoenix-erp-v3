/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EggWithdrawalReviews from './EggWithdrawalReviews';

const {request} = vi.hoisted(() => ({request: vi.fn()}));
vi.mock('@/lib/api-client', () => ({default:request}));
vi.mock('@/hooks/usePermission', () => ({usePermission: () => ({canEdit:true,canView:true})}));
vi.mock('@/contexts/LanguageContext', () => ({useLanguage: () => ({t: (_key:string, fallback:string) => fallback})}));
vi.mock('@/components/design-system/forms/AttachmentUploader', () => ({
  AttachmentUploader: ({onChange,ownership}: {onChange:(ids:string[])=>void;ownership:{ownerId:string}}) =>
    <button onClick={() => onChange(['PROOF'])}>{ownership.ownerId}</button>
}));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);request.mockReset();
});
afterEach(async () => { await act(async () => root.unmount());host.remove();vi.unstubAllGlobals(); });
it('keeps QA actions and evidence on the selected laying shift and suppresses release for an active course', async () => {
  const source={medication_id:1,daily_log_id:'11',production_date:'2026-11-10',shift:'AM',flock_no:'TEST-F',
    medication_code:null,material_code:'MAT-RX',material_name:'实际物料名称',house_code:'TEST-LAY',treatment_house:'TEST-TREAT',held:true,review_id:'R-AM',
    course_status:'USING',vet_name:'fixture vet',vet_reason:'fixture evidence',outcome:null};
  request.mockResolvedValue({data:[source,{...source,daily_log_id:'12',shift:'PM',review_id:'R-PM',course_status:'CANCELLED'}]});
  await act(async () => root.render(<EggWithdrawalReviews quality/>));
  const rows=host.querySelectorAll('article');
  expect(rows[0].textContent).toContain('实际物料名称');
  expect(rows[0].textContent).toContain('AM');expect(rows[1].textContent).toContain('PM');
  const buttons=(index:number)=>Array.from(rows[index].querySelectorAll('button'));
  expect(buttons(0).some(b=>b.textContent==='解除本单隔离')).toBe(false);
  const release=buttons(1).find(b=>b.textContent==='解除本单隔离')!;
  expect(release.disabled).toBe(true);
  await act(async () => buttons(1).find(b=>b.textContent==='R-PM')!.click());
  expect(release.disabled).toBe(false);
  await act(async () => release.click());
  expect(request).toHaveBeenCalledWith('/v3/farm/egg-withdrawal/reviews/R-PM/decision',
    {method:'POST',body:JSON.stringify({outcome:'RELEASE',evidence:'PROOF'})});
});
