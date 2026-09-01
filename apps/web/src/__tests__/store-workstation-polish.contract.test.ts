import fs from 'node:fs';
import path from 'node:path';
import { describe,expect,it } from 'vitest';
const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');
describe('store workstation polish contracts',()=>{
 it('Terminal return uses ModalV2 with required reason, busy lock, permission gate and quarantine feedback',()=>{const src=read('src/app/(terminal)/terminal/store-pos/page.tsx');expect(src).toContain('<ModalV2');expect(src).not.toContain('prompt(');expect(src).toContain('returnReason.trim()');expect(src).toContain('returning');expect(src).toContain('canDelete');expect(src).toContain('terminal.pos_quarantine_notice')});
 it('POS has desktop, tablet and 390px responsive contracts',()=>{const css=read('src/app/(terminal)/terminal/store-pos/store-pos.module.css');expect(css).toContain('grid-template-columns:minmax(0,2fr) minmax(360px,1fr)');expect(css).toContain('@media(max-width:900px)');expect(css).toContain('grid-template-columns:1fr');expect(css).toContain('@media(max-width:520px)')});
 it('inventory is read-only inv_batches tabs with mobile cards and no Generic CRUD editor',()=>{const src=read('src/app/(admin)/store/inventory/page.tsx'),css=read('src/app/(admin)/store/inventory/inventory.module.css');expect(src).toContain("type Tab='ALL'|'AVAILABLE'|'QUARANTINE'");expect(src).toContain('/api/v2/store-sales/inventory');expect(src).toContain('DataTableV3');expect(src).not.toContain('crudApi');expect(src).not.toContain('CrudForm');expect(css).toContain('@media(max-width:768px)');expect(css).toContain('@media(max-width:390px)')});
 it('terminal content permits vertical touch scrolling and packaging opens responsively',()=>{expect(read('src/app/(terminal)/layout.tsx')).toContain("touchAction: 'pan-y'");const css=read('src/app/(terminal)/terminal/packaging/shift-open/shift-open.module.css');expect(css).toContain('@media(max-width:760px)');expect(css).toContain('flex-direction:column')});
 it('all three locales contain the new POS and inventory keys',()=>{for(const lang of ['zh','en','lo']){const locale=JSON.parse(read(`src/locales/${lang}.json`));expect(locale['terminal.pos_quarantine_notice']).toBeTruthy();expect(locale['store.inventory.pending_inspection']).toBeTruthy()}});
});
