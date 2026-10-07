import u from '@/styles/uix-utils.module.css';

export function MasterLabel({ children }: { children: string }) {
  return <span data-i18n-skip="true">{children}</span>;
}

/** Business name first; keep the unchanged identifier once, even without a name. */
export default function MasterNameCode({ name, code }: { name?: string; code?: string }) {
  const cleanName = name?.trim() || '';
  const cleanCode = code?.trim() || '';
  return <div data-i18n-skip="true">
    <div className={u.fw600}>{cleanName || cleanCode || '—'}</div>
    {cleanName && cleanCode && cleanName !== cleanCode && <div className={`${u.fs11} ${u.muted}`}>{cleanCode}</div>}
  </div>;
}
