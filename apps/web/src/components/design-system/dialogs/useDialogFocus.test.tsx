// @vitest-environment jsdom

import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDialogFocus } from './useDialogFocus';

function Dialog({ close, busy = false, children }: { close: () => void; busy?: boolean; children: React.ReactNode }) {
  const { dialogRef, requestClose } = useDialogFocus(true, close, busy);
  return <section>
    <div ref={dialogRef} tabIndex={-1} role="dialog">
      {children}
      <button type="button" onClick={requestClose} disabled={busy}>Close</button>
    </div>
  </section>;
}

function Example({ busy = false }: { busy?: boolean }) {
  const [outer, setOuter] = useState(false);
  const [inner, setInner] = useState(false);
  return <>
    <button type="button" id="launch" onClick={() => setOuter(true)}>Review</button>
    {outer && <Dialog close={() => setOuter(false)}>
      <button type="button" id="confirm" onClick={() => setInner(true)}>Confirm</button>
    </Dialog>}
    {inner && <Dialog close={() => setInner(false)} busy={busy}>
      <button type="button" id="commit">Commit</button>
    </Dialog>}
  </>;
}

describe('shared dialog focus', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function activate(id: string) {
    const button = container.querySelector<HTMLButtonElement>('#' + id)!;
    button.focus();
    act(() => button.click());
  }

  function key(key: string, shiftKey = false) {
    act(() => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })); });
  }

  it('moves focus inside, traps Tab, and closes the top layer before returning to its invoker', () => {
    act(() => root.render(<Example />));
    activate('launch');
    expect(document.activeElement?.getAttribute('role')).toBe('dialog');
    key('Tab');
    expect(document.activeElement?.id).toBe('confirm');
    key('Tab', true);
    expect(document.activeElement?.textContent).toBe('Close');
    activate('confirm');
    expect(container.querySelectorAll('[role=dialog]')).toHaveLength(2);
    key('Escape');
    expect(container.querySelectorAll('[role=dialog]')).toHaveLength(1);
    expect(document.activeElement?.id).toBe('confirm');
    key('Escape');
    expect(container.querySelectorAll('[role=dialog]')).toHaveLength(0);
    expect(document.activeElement?.id).toBe('launch');
  });

  it('treats a native disclosure as a tab stop even while its content is collapsed', () => {
    act(() => root.render(<Dialog close={vi.fn()}>
      <details><summary id="evidence">Evidence</summary><button id="hidden">Open file</button></details>
    </Dialog>));
    key('Tab');
    expect(document.activeElement?.id).toBe('evidence');
    const next = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(next);
    expect(next.defaultPrevented).toBe(false);
    key('Tab', true);
    expect(document.activeElement?.textContent).toBe('Close');
    key('Tab');
    expect(document.activeElement?.id).toBe('evidence');
  });

  it('holds both layers open while the active confirmation is saving', () => {
    act(() => root.render(<Example busy />));
    activate('launch');
    activate('confirm');
    key('Escape');
    expect(container.querySelectorAll('[role=dialog]')).toHaveLength(2);
    expect(container.querySelector<HTMLButtonElement>('[role=dialog]:last-child button:last-child')?.disabled).toBe(false);
    expect(container.querySelectorAll<HTMLButtonElement>('[role=dialog] button:disabled')).toHaveLength(1);
  });
});
