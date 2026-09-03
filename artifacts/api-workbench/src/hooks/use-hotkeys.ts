import { useEffect, useRef } from 'react';

export type Hotkey = {
  /** Lower-case `KeyboardEvent.key`, e.g. `k`, `enter`, `\\`. */
  key: string;
  mod?: boolean;
  shift?: boolean;
  /** Fire even when focus sits in a text field. */
  allowInInput?: boolean;
  handler: () => void;
};

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Register global shortcuts. `mod` maps to ⌘ on macOS and Ctrl elsewhere. */
export function useHotkeys(hotkeys: Hotkey[]): void {
  const ref = useRef(hotkeys);
  ref.current = hotkeys;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      for (const hotkey of ref.current) {
        if (key !== hotkey.key) continue;
        if (Boolean(hotkey.mod) !== mod) continue;
        if (Boolean(hotkey.shift) !== event.shiftKey) continue;
        if (!hotkey.allowInInput && !hotkey.mod && isTextEntry(event.target)) continue;
        event.preventDefault();
        hotkey.handler();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export const MOD_LABEL = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
