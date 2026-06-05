'use client';

/**
 * ThemeSwitcher — Phoenix DS（UIX-3 P8）
 * 5 套主题在 Header 一键切换：
 *   默认 (default) / 深色 (dark) / 农牧绿 (brand-green) / 食品红 (brand-red) / 金融蓝 (brand-blue)
 * 主题写入 <html data-theme> + localStorage("phoenix-theme")
 */

import { useEffect, useState } from 'react';
import { Palette, Check } from 'lucide-react';

type Theme = '' | 'dark' | 'brand-green' | 'brand-red' | 'brand-blue';

const THEMES: Array<{ key: Theme; label: string; swatch: string }> = [
  { key: '',             label: '默认主题', swatch: 'var(--color-primary)' },
  { key: 'dark',         label: '深色模式', swatch: 'var(--brand-deep-1)' },
  { key: 'brand-green',  label: '农牧绿',   swatch: '#2E7D32' },
  { key: 'brand-red',    label: '食品红',   swatch: '#C62828' },
  { key: 'brand-blue',   label: '金融蓝',   swatch: '#1565C0' },
];

const STORAGE_KEY = 'phoenix-theme';

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  if (theme) html.setAttribute('data-theme', theme);
  else html.removeAttribute('data-theme');
}

export function ThemeSwitcher() {
  const [current, setCurrent] = useState<Theme>('');
  const [open, setOpen] = useState(false);

  // 启动：localStorage 读
  useEffect(() => {
    try {
      const saved = (localStorage.getItem(STORAGE_KEY) as Theme) || '';
      setCurrent(saved);
      applyTheme(saved);
    } catch { /* SSR no-op */ }
  }, []);

  const choose = (theme: Theme) => {
    setCurrent(theme);
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
    setOpen(false);
  };

  const currentMeta = THEMES.find(t => t.key === current) || THEMES[0];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label="切换主题"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 10px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-btn)',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          fontSize: 12,
        }}
      >
        <Palette size={14} />
        <span style={{
          display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
          background: currentMeta.swatch,
          border: '1px solid var(--border)',
        }} />
        <span>{currentMeta.label}</span>
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-card-hover)',
            minWidth: 180, padding: 4, zIndex: 1000,
          }}
        >
          {THEMES.map(t => (
            <button
              key={t.key || 'default'}
              type="button"
              role="menuitemradio"
              aria-checked={t.key === current}
              onClick={() => choose(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 10px',
                background: t.key === current ? 'var(--bg-muted)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-btn)', cursor: 'pointer',
                color: 'var(--text-primary)', fontSize: 13, textAlign: 'left',
              }}
            >
              <span style={{
                display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
                background: t.swatch, border: '1px solid var(--border)', flexShrink: 0,
              }} />
              <span style={{ flex: 1 }}>{t.label}</span>
              {t.key === current ? <Check size={14} color="var(--status-success)" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ThemeSwitcher;
