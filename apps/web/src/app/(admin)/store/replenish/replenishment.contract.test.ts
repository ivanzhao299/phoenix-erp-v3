import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const tokens = readFileSync(resolve(__dirname, '../../../../lib/design-tokens.ts'), 'utf8');
const locales = ['zh', 'en', 'lo'].map(lang => JSON.parse(readFileSync(resolve(__dirname, `../../../../locales/${lang}.json`), 'utf8')));

describe('replenishment UI source contract', () => {
  it('does not regress to unsafe native interactions', () => {
    expect(page).not.toContain('<button');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('--surface-card');
    expect(page).not.toContain('--border-default');
  });
  it('uses the approved design-system workflow components', () => {
    for (const component of ['PageShell', 'Panel', 'DataTableV3', 'StatusBadge', 'DrawerV2', 'ModalV2', 'FormField', 'Button']) expect(page).toContain(component);
    expect(tokens).toContain('DISPATCHED:');
    for (const state of ['DRAFT','SUBMITTED','APPROVED','DISPATCHED','RECEIVED','CLOSED','REJECTED','CANCELLED']) expect(page).toContain(state);
  });
  it('keeps stable replenishment keys aligned in all three locales', () => {
    const referenced = [...page.matchAll(/tr\(\s*['`]([^'`]+)['`]/g)].map(match => match[1]).filter(key => !key.includes('${'));
    const dynamic = ['action.submit','action.approve','action.dispatch','action.receive','action.close','confirm.submit','confirm.approve','confirm.dispatch','filter.store','filter.source','filter.no','filter.storePlaceholder','filter.sourcePlaceholder','filter.noPlaceholder'].map(key => `store.replenish.${key}`);
    const keys = [...new Set([...referenced, ...dynamic])];
    for (const locale of locales) {
      expect(keys.filter(key => !(key in locale)), `missing replenishment keys`).toEqual([]);
      expect(keys.filter(key => /[\u4e00-\u9fff]/.test(locale[key]) && locale !== locales[0]), `Chinese fallback leaked into a translated locale`).toEqual([]);
    }
    const variables = (value: string) => [...value.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort();
    for (const key of keys) for (const locale of locales.slice(1)) expect(variables(locale[key]), key).toEqual(variables(locales[0][key]));
  });
  it('retains partial-success and controlled discrepancy contracts', () => {
    expect(page).toContain('create.partial');
    expect(page).toContain("type:'LOSS'|'ADJUSTMENT'");
    expect(page).toContain('resolution_ref');
    expect(page).toContain('validateReceive');
  });
});
