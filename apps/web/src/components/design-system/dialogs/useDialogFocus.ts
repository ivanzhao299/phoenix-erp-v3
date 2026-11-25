'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

// The portal target is only available after client hydration.
const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function useDialogPortalReady() {
  return useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
}

const openDialogs: HTMLElement[] = [];
const summary = 'details > summary:first-of-type';
const focusable = `button, input, select, textarea, a[href], [tabindex], [contenteditable="true"], ${summary}`;

function isVisibleInDetails(element: HTMLElement) {
  for(let parent=element.parentElement;parent;parent=parent.parentElement) {
    if(parent.matches('details:not([open])')&&!parent.querySelector(':scope > summary')?.contains(element)) return false;
  }
  return true;
}

function tabStops(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter(element =>
    (element.tabIndex >= 0 || (element.matches(summary)&&!element.hasAttribute('tabindex'))) &&
    isVisibleInDetails(element) && !element.matches(':disabled, input[type="hidden"]') &&
    !element.closest('[hidden], [inert]') && element.getClientRects().length > 0);
}

export function useDialogFocus(open: boolean, onClose: () => void, closeDisabled: boolean) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useRef({ onClose, closeDisabled });

  useEffect(() => {
    close.current = { onClose, closeDisabled };
  }, [onClose, closeDisabled]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(dialog);
    openDialogs.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    if (openDialogs.at(-1) === dialog) {
      (dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]') ?? dialog).focus({ preventScroll: true });
    }

    function onKey(event: KeyboardEvent) {
      if (openDialogs.at(-1) !== dialog || !dialog || event.defaultPrevented) return;
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        if (!close.current.closeDisabled) close.current.onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = tabStops(dialog);
      const active = document.activeElement;
      const current = stops.findIndex(element => element === active);
      if (current === -1 || (event.shiftKey ? current === 0 : current === stops.length - 1)) {
        event.preventDefault();
        (stops[event.shiftKey ? stops.length - 1 : 0] ?? dialog).focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      const wasTop = openDialogs.at(-1) === dialog;
      const index = openDialogs.indexOf(dialog);
      if (index !== -1) openDialogs.splice(index, 1);
      document.removeEventListener('keydown', onKey);
      if (wasTop) {
        const parent = openDialogs.at(-1);
        if (trigger?.isConnected && (!parent || parent.contains(trigger))) trigger.focus({ preventScroll: true });
        else parent?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog && openDialogs.at(-1) === dialog && !closeDisabled) onClose();
  }

  return { dialogRef, requestClose };
}
