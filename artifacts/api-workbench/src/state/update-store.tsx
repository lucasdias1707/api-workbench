import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useToast } from '@/components/common/Toaster';
import { useUpdateCheck, type UpdateApi } from '@/hooks/use-update-check';
import { useWorkspace } from '@/state/workspace-store';

/**
 * One update check for the whole app.
 *
 * It used to live inside the Settings dialog, which meant the check only ran
 * while that dialog was open — so nobody who never opened Settings ever learned
 * a new version existed. Hoisting it here is what lets the topbar carry the
 * badge and the toast fire on startup, and keeps a download's progress in one
 * place instead of one copy per mounted component.
 */
const UpdateContext = createContext<UpdateApi | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { state } = useWorkspace();
  const { toast } = useToast();
  const updates = useUpdateCheck(state.settings.autoCheckUpdates);
  /** Versions already announced, so a re-check does not re-announce. */
  const announced = useRef(new Set<string>());

  useEffect(() => {
    const version = updates.update?.version;
    if (!version || updates.phase !== 'available' || announced.current.has(version)) return;
    announced.current.add(version);
    toast({
      title: `Carom ${version} is available`,
      description: 'Use the download button in the top bar, or open Settings.',
      kind: 'info',
    });
  }, [updates.phase, updates.update?.version, toast]);

  return <UpdateContext.Provider value={updates}>{children}</UpdateContext.Provider>;
}

export function useUpdates(): UpdateApi {
  const context = useContext(UpdateContext);
  if (!context) throw new Error('useUpdates must be used inside an UpdateProvider');
  return context;
}
