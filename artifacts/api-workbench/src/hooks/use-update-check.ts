import { useCallback, useEffect, useRef, useState } from 'react';
import { isDesktop } from '@/lib/http';
import {
  canSelfUpdate,
  checkForUpdate,
  readInstallKind,
  type AvailableUpdate,
  type InstallKind,
} from '@/lib/updates';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export type UpdateState = {
  phase: UpdatePhase;
  /** How this copy was installed, which decides whether it can update itself. */
  installKind: InstallKind | null;
  update: AvailableUpdate | null;
  /** Bytes so far and the total, both zero until a download starts. */
  progress: { received: number; total: number };
  error: string | null;
};

export type UpdateApi = UpdateState & {
  check: () => void;
  download: () => void;
};

function detail(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'No further detail was given.';
}

const IDLE: UpdateState = {
  phase: 'idle',
  installKind: null,
  update: null,
  progress: { received: 0, total: 0 },
  error: null,
};

/**
 * Finds out whether a newer release exists, and downloads it when asked to.
 *
 * It never downloads on its own. The check runs once on mount if `autoCheck` is
 * on, because a check is one request and the alternative is that nobody ever
 * learns a new version exists; the download is always a decision.
 */
export function useUpdateCheck(autoCheck: boolean): UpdateApi {
  const [state, setState] = useState<UpdateState>(IDLE);
  /** Guards against a second check landing after the component is gone. */
  const alive = useRef(true);
  /** One automatic check per app run, however often settings re-render. */
  const checkedOnce = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const check = useCallback(() => {
    if (!isDesktop()) return;
    setState((current) => ({ ...current, phase: 'checking', error: null }));

    void (async () => {
      try {
        const installKind = await readInstallKind();
        const update = await checkForUpdate();
        if (!alive.current) return;
        setState({
          ...IDLE,
          installKind,
          update,
          phase: update ? 'available' : 'current',
        });
      } catch (error) {
        if (!alive.current) return;
        setState({
          ...IDLE,
          phase: 'error',
          // Framed rather than raw: the underlying message is worth keeping for
          // anyone diagnosing this, but on its own it reads like a crash.
          error: `Could not check for updates. ${detail(error)}`,
        });
      }
    })();
  }, []);

  const download = useCallback(() => {
    setState((current) => {
      if (!current.update || !current.installKind || !canSelfUpdate(current.installKind)) {
        return current;
      }
      const { update } = current;

      void (async () => {
        try {
          await update.install((received, total) => {
            if (!alive.current) return;
            setState((inner) => ({ ...inner, progress: { received, total } }));
          });
          if (!alive.current) return;
          setState((inner) => ({ ...inner, phase: 'ready' }));
        } catch (error) {
          if (!alive.current) return;
          setState((inner) => ({
            ...inner,
            phase: 'error',
            error: `The download did not finish. ${detail(error)}`,
          }));
        }
      })();

      return { ...current, phase: 'downloading', error: null, progress: { received: 0, total: 0 } };
    });
  }, []);

  useEffect(() => {
    if (!autoCheck || checkedOnce.current || !isDesktop()) return;
    checkedOnce.current = true;
    check();
  }, [autoCheck, check]);

  return { ...state, check, download };
}
