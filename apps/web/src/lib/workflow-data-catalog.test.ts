import { describe, expect, it } from 'vitest';
import { WORKFLOW_DATA_CATALOG, dataSourceConfig, dataSourceLabel } from './workflow-data-catalog';

describe('workflow data catalog', () => {
  it('has unique non-empty codes', () => {
    const codes = WORKFLOW_DATA_CATALOG.map(x => x.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every(Boolean)).toBe(true);
  });
  it.each(WORKFLOW_DATA_CATALOG.map(item => [item.code, item.name] as const))(
    'labels %s', (code, name) => expect(dataSourceLabel(code)).toBe(name),
  );
  it('falls back for unknown and empty codes', () => {
    expect(dataSourceLabel('UNKNOWN')).toBe('UNKNOWN');
    expect(dataSourceLabel()).toBe('');
  });
  it('builds dictionary config', () => expect(dataSourceConfig({ source_type: 'DICT', dict_type: 'SYS_CURRENCY' } as never)).toEqual({ dict_type: 'SYS_CURRENCY' }));
  it('builds static config', () => expect(dataSourceConfig({ source_type: 'STATIC' } as never)).toEqual({ options: [] }));
  it('builds table config without presentation-only fields', () => expect(dataSourceConfig({ source_type: 'TABLE', table: 't', valueField: 'id', labelField: 'name' } as never)).toEqual({ table: 't', valueField: 'id', labelField: 'name', valueFields: undefined, labelFields: undefined, statusFields: undefined, activeValues: undefined }));
});
