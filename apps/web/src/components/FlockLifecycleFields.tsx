'use client';

import { useState, type ReactNode } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { DictSelect } from '@/components/shared-selectors/DictSelect';
import { CustomerSelector, FarmSelector, GradeSelector, SupplierSelector, UserSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { flockCountKinds, flockDifferenceKinds, flockEvidenceKinds, flockReverseKinds, type FlockLifecycleKind, type FlockRow } from './flock-lifecycle-form';
import css from './FlockLifecycleForm.module.css';

export interface FlockLifecycleInput {
  reportHash?: string;
  actual: string;
  sourceKind: string;
  sourceCode: string;
  sourceFarmCode: string;
  sourceReceipt: string;
  breedCode: string;
  placementAge: string;
  plannedEliminationDate: string;
  targetHouseCode: string;
  positionCode: string;
  salesRef: string;
  disposalMethod: string;
  receiver: string;
  differenceReceipt: string;
  replacementKind: string;
  replacementQuantity: string;
  customerCode: string;
  currencyCode: string;
  unitPrice: string;
  finalProductionStatus: string;
  reason: string;
  responsible: string;
  grades: Record<string, string>;
  feed: string;
  water: string;
  notes: string;
  evidence: string[];
}

type TextField = Exclude<keyof FlockLifecycleInput, 'grades' | 'evidence' | 'reportHash'>;
const formLabelKey = (name: string) => 'flockForm.' + name;

interface Props {
  kind: FlockLifecycleKind;
  value: FlockLifecycleInput;
  edit: <K extends keyof FlockLifecycleInput>(name: K, value: FlockLifecycleInput[K]) => void;
  setSourceKind: (value: string) => void;
  originalReport?: FlockRow;
  originalHeldId?: string;
  transferTargets: FlockRow[];
}

export function FlockLifecycleFields({ kind, value, edit, setSourceKind, originalReport, originalHeldId, transferTargets }: Props) {
  const { t } = useLanguage();
  const label = (key: string) => t(formLabelKey(key));
  const text = (key: TextField, required = true, type = 'text', options?: { min?: string; step?: string; max?: string; hint?: string }) =>
    <label>{label(key)}{required ? ' *' : ''}
      <input type={type} required={required} value={value[key]}
        min={options?.min} step={options?.step} max={options?.max}
        maxLength={type === 'text' ? 1000 : undefined} onChange={event => edit(key, event.target.value)} />
      {options?.hint && <small>{label(options.hint)}</small>}
    </label>;
  const textarea = (key: 'reason' | 'differenceReceipt', required = true) => <label className={css.allColumns}>{label(key)}{required ? ' *' : ''}
    <textarea required={required} value={value[key]} maxLength={1000} onChange={event => edit(key, event.target.value)} />
  </label>;
  const dict = (key: TextField, type: string, allowEmpty = true, allowedValues?: string[], change?: (next: string) => void) =>
    <label>{label(key)}
      <DictSelect dictType={type} value={value[key]} ariaLabel={label(key)} allowEmpty={allowEmpty} allowedValues={allowedValues}
        onChange={change ?? (next => edit(key, next))} />
    </label>;
  const count = flockCountKinds.includes(kind) || kind === 'ADJUST';
  const positive = !['BASELINE', 'ADJUST'].includes(kind);
  const responsibilityRequired = flockEvidenceKinds.includes(kind);
  const sections: Partial<Record<FlockLifecycleKind, ReactNode>> = {
    ADMIT: <>
      {dict('sourceKind', 'BRD_FLOCK_SOURCE', false, undefined, setSourceKind)}
      {value.sourceKind === 'SUPPLIER' ? <label>{label('sourceCode')}
        <SupplierSelector ariaLabel={label('sourceCode')} value={value.sourceCode} onChange={next => edit('sourceCode', next)} />
      </label> : <label>{label('sourceFarmCode')}
        <FarmSelector ariaLabel={label('sourceFarmCode')} value={value.sourceFarmCode} onChange={next => edit('sourceFarmCode', next)} />
      </label>}
      {text('sourceReceipt')}
      {dict('breedCode', 'BRD_BREED')}
      {text('placementAge', true, 'number', { min: '0', step: '1' })}
      {text('plannedEliminationDate', false, 'date')}
    </>,
    MORTALITY: <>{text('disposalMethod')}{text('receiver')}</>,
    CULL: text('positionCode'),
    TRANSFER: <label>{label('targetHouseCode')} *
      <select value={value.targetHouseCode} required onChange={event => edit('targetHouseCode', event.target.value)}>
        <option value="">{t('flockEntry.pickTransfer')}</option>
        {transferTargets.map(row => <option key={String(row.house_code)} value={String(row.house_code)}>
          {String(row.house_name)} · {String(row.house_code)}
        </option>)}
      </select>
    </label>,
    SELL_HELD: <>
      <label>{label('customerCode')}
        <CustomerSelector ariaLabel={label('customerCode')} value={value.customerCode} onChange={next => edit('customerCode', next)} />
      </label>
      {dict('currencyCode', 'SYS_CURRENCY')}
      {text('unitPrice', true, 'number', { min: '0.000001', step: '0.000001', max: '999999999', hint: 'unitPriceScale' })}
      {text('salesRef')}{text('receiver')}
    </>,
    CLOSE: dict('finalProductionStatus', 'BRD_FINAL_PRODUCTION_CONFIRM', false),
    REVERSE: <>
      {dict('replacementKind', 'BRD_LIFECYCLE_KIND', true, flockReverseKinds)}
      {value.replacementKind && text('replacementQuantity', true, 'number', { min: value.replacementKind === 'ADJUST' ? undefined : '0', step: '1' })}
      {value.replacementKind === 'MORTALITY' && <>{text('disposalMethod')}{text('receiver')}</>}
      {value.replacementKind === 'CULL' && text('positionCode', !originalHeldId)}
    </>,
  };

  return <>
    {kind === 'REPORT_CORRECTION' && <ReportDifferences key={String(originalReport?.id ?? 'supplement')} original={originalReport} value={value} edit={edit} />}
    <fieldset className={css.fieldset}>
      <legend>{label('details')}</legend>
      <div className={css.fields}>
        {count && text('actual', true, 'number', { min: positive ? '1' : '0', step: '1' })}
        {sections[kind]}
        {flockDifferenceKinds.includes(kind) && textarea('differenceReceipt')}
        <label>{label('responsible')}{responsibilityRequired ? ' *' : ''}
          <UserSelector ariaLabel={label('responsible')} value={value.responsible} onChange={next => edit('responsible', next)} />
        </label>
        {textarea('reason')}
      </div>
    </fieldset>
  </>;
}

function ReportDifferences({ original, value, edit }: { original?: FlockRow; value: FlockLifecycleInput; edit: Props['edit'] }) {
  const { t } = useLanguage();
  const [addedGrade, setAddedGrade] = useState('');
  const label = (key: string) => t(formLabelKey(key));
  const originalGrades = (original?.eggs_by_grade ?? {}) as FlockRow;
  return <fieldset className={css.fieldset}>
    <legend>{label('reportComparison')}</legend>
    {original && <p className={css.callout}>{label('report')} {String(original.id)} · {label('occupancy')} {String(original.occupancy_id)}</p>}
    <div className={css.differences}>
      <span aria-hidden />
      <strong>{label('before')}</strong>
      <strong>{label('after')}</strong>
      {Object.entries(value.grades).map(([grade, current]) => <ReportComparisonRow key={grade}
        title={label('grade').replace('{grade}', grade)} before={originalGrades[grade]}>
        <input aria-label={label('grade').replace('{grade}', grade)} type="number" min="0" step="1" required value={current}
          onChange={event => edit('grades', { ...value.grades, [grade]: event.target.value })} />
      </ReportComparisonRow>)}
      <ReportComparisonRow title={label('feed')} before={original?.feed_consumed}>
        <input aria-label={label('feed')} type="number" min="0" step="0.01" value={value.feed} onChange={event => edit('feed', event.target.value)} />
      </ReportComparisonRow>
      <ReportComparisonRow title={label('water')} before={original?.water_consumed}>
        <input aria-label={label('water')} type="number" min="0" step="0.01" value={value.water} onChange={event => edit('water', event.target.value)} />
      </ReportComparisonRow>
      <ReportComparisonRow title={label('notes')} before={original?.notes}>
        <textarea aria-label={label('notes')} value={value.notes} maxLength={4000} onChange={event => edit('notes', event.target.value)} />
      </ReportComparisonRow>
    </div>
    <label className={css.gradePicker}>{label('addGrade')}
      <GradeSelector ariaLabel={label('addGrade')} value={addedGrade} onChange={grade => {
        setAddedGrade(grade);
        if (grade && !Object.prototype.hasOwnProperty.call(value.grades, grade)) edit('grades', { ...value.grades, [grade]: '' });
      }} />
    </label>
    <p className={css.callout}>{label('reportHint')}</p>
  </fieldset>;
}

function ReportComparisonRow({ title, before, children }: { title: string; before: unknown; children: ReactNode }) {
  return <>
    <span>{title}</span>
    <output>{before == null ? '—' : String(before)}</output>
    {children}
  </>;
}
