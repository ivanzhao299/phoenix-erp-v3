'use client';

import { useEffect, useState } from 'react';
import RightDrawer from '@/components/RightDrawer';
import { DictSelect } from '@/components/shared-selectors/DictSelect';
import { primaryActionButton } from '@/components/design-system/cockpit-styles';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermission } from '@/hooks/usePermission';
import request from '@/lib/api-client';
import s from '@/components/ui/admin-ui.module.css';

type BreedStatus = {
  houseCode: string;
  breedCode: string | null;
  historicalNames: string[];
  hasReports: boolean;
  receiptId?: string;
  status: 'MISSING' | 'CONFIRMED' | 'CATALOG_REVIEW' | 'RETIRED';
};

type Confirmation = { breedCode: string; receiptId?: string };

export default function FlockBreedConfirmation({ flockNo, onClose, onConfirmed }: {
  flockNo: string;
  onClose: () => void;
  onConfirmed: (confirmation: Confirmation) => void;
}) {
  const { t } = useLanguage();
  const { user, canApprove: canReview } = usePermission('MENU_FLOCK_APPROVE');
  const { canApprove: canConfirmBaseline } = usePermission('MENU_FLOCK_BASELINE');
  const endpoint = `/v3/farm/flock-lifecycle/flocks/${encodeURIComponent(flockNo)}/breed-confirmation`;
  const [status, setStatus] = useState<BreedStatus>();
  const [breedCode, setBreedCode] = useState('');
  const [basis, setBasis] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const actor = String(user.userId ?? user.id ?? user.username ?? '');

  useEffect(() => {
    let current = true;
    request<{ data: BreedStatus }>(endpoint).then(({ data }) => {
      if (current) setStatus(data);
    }).catch(error => {
      if (current) setError(error.message);
    });
    return () => { current = false; };
  }, [endpoint, actor]);

  const confirm = async () => {
    if (!status || busy || !breedCode || !basis.trim() || !canReview || !canConfirmBaseline) return;
    setBusy(true);
    setError('');
    let result: Confirmation;
    try {
      const response = await request<{ data: Confirmation }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ houseCode: status.houseCode, breedCode, basis: basis.trim() }),
      });
      result = response.data;
    } catch (error) {
      setError(error instanceof Error ? error.message : t('ui.品种确认失败', '品种确认失败'));
      return;
    } finally {
      setBusy(false);
    }
    onConfirmed(result);
  };

  return <RightDrawer isOpen onClose={onClose} closeDisabled={busy}
    title={t('ui.确认遗传品种', '确认遗传品种')}>
    <p>{flockNo}{status && ` · ${status.houseCode}`}</p>
    {!status && !error && <p role="status">{t('ui.正在核对品种状态', '正在核对品种状态')}</p>}
    {error && <p role="alert">{error}</p>}
    {status && <>
      <dl>
        <dt>{t('ui.历史品种原值', '历史品种原值')}</dt>
        <dd>{status.historicalNames.join(' / ') || '—'}</dd>
        <dt>{t('ui.遗传品种标准码', '遗传品种标准码')}</dt>
        <dd>{status.breedCode?.trim() || '—'}</dd>
      </dl>
      {status.status === 'CONFIRMED' && <p>{t('ui.该鸡群已有有效品种标准码', '该鸡群已有有效品种标准码。')}</p>}
      {status.receiptId && <p>{t('ui.审计编号', '审计编号')} {status.receiptId}</p>}
      {status.status === 'CATALOG_REVIEW' && <p>{t('ui.历史品种字典待核对', '原标准码当前无有效字典项。请联系品种字典管理员核对该码和原始资料。')}</p>}
      {status.status === 'RETIRED' && <p>{t('ui.关闭鸡群品种更正', '已关闭鸡群的品种须由生产管理审核人核对原始资料并办理历史追溯更正。')}</p>}
      {status.status === 'MISSING' && (canReview && canConfirmBaseline ? <form onSubmit={event => {
        event.preventDefault();
        void confirm();
      }}>
        <p>{status.hasReports
          ? t('ui.确认品种保留日报', '该鸡群已有日报。确认只补录档案标准码，原日报和库存记录保留。')
          : t('ui.确认品种以原始资料为准', '请根据入栏、供应商或实盘记录核对遗传品种。')}</p>
        <label className={s.lbl}>{t('ui.遗传品种', '遗传品种')}</label>
        <DictSelect dictType="BRD_BREED" value={breedCode} onChange={setBreedCode} disabled={busy}
          ariaLabel={t('ui.遗传品种', '遗传品种')} allowEmpty className={s.inp} />
        <label className={s.lbl} htmlFor="flock-breed-basis">{t('ui.品种核对依据', '核对依据（填写原始凭证编号或出处）')}</label>
        <textarea id="flock-breed-basis" className={s.inp} value={basis} onChange={e => setBasis(e.target.value)}
          required maxLength={1000} rows={3} disabled={busy} />
        <button type="submit" style={primaryActionButton} disabled={busy || !breedCode || !basis.trim()}>
          {t('ui.确认遗传品种', '确认遗传品种')}
        </button>
      </form> : <p>{t('ui.联系鸡群基线审核人', '请将鸡群编号交给拥有鸡群审核和历史盘点接续审批权限的人员确认。')}</p>)}
    </>}
  </RightDrawer>;
}
