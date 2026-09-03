import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { dropLegacyState, migrateLegacyState } from '@/lib/migrate';
import { createSeedState } from '@/lib/seed';
import { defaultSettings } from '@/lib/settings';
import { readState, writeState, STATE_VERSION } from '@/lib/storage';
import { buildVariableTable, valuesOf } from '@/lib/template';
import { reducer } from '@/state/reducer';
import { folderChain } from '@/state/selectors';
import type { Action } from '@/state/actions';
import type { RequestRecord, ResponseRecord, VariableTable, WorkspaceState } from '@/types';

type StoreValue = {
  state: WorkspaceState;
  dispatch: (action: Action) => void;
  activeRequest: RequestRecord | null;
  /** Values only, for building the outgoing request. */
  variables: Record<string, string>;
  /** Values plus where each came from, for the UI. */
  variableTable: VariableTable;
  /** Resolve in the context of any folder, not just the active request's. */
  tableFor: (folderId: string | null) => VariableTable;
  responsesFor: (requestId: string) => ResponseRecord[];
};

const WorkspaceContext = createContext<StoreValue | null>(null);

/** Fill in anything a stored state is missing so older payloads stay loadable. */
function hydrate(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    version: STATE_VERSION,
    responses: state.responses ?? [],
    openTabIds: state.openTabIds ?? [],
    folders: state.folders ?? [],
    environments: state.environments ?? [],
    settings: { ...defaultSettings(), ...(state.settings ?? {}) },
  };
}

function initialState(): WorkspaceState {
  const stored = readState();
  if (stored) return hydrate(stored);
  const migrated = migrateLegacyState();
  if (migrated) {
    dropLegacyState();
    return migrated;
  }
  return createSeedState();
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const writeTimer = useRef<number | null>(null);

  // Persist on a short debounce: typing in the composer updates state on every
  // keystroke and localStorage writes are synchronous.
  useEffect(() => {
    if (writeTimer.current !== null) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => writeState(state), 250);
    return () => {
      if (writeTimer.current !== null) window.clearTimeout(writeTimer.current);
    };
  }, [state]);

  useEffect(() => {
    const flush = () => writeState(state);
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [state]);

  const value = useMemo<StoreValue>(() => {
    const activeRequest = state.requests.find((request) => request.id === state.activeRequestId) ?? null;
    const environments = state.environments.filter(
      (environment) => environment.workspaceId === state.activeWorkspaceId,
    );
    const tableFor = (folderId: string | null) =>
      buildVariableTable(folderChain(state, folderId), environments, state.activeEnvironmentId);
    const variableTable = tableFor(activeRequest?.folderId ?? null);
    return {
      state,
      dispatch,
      activeRequest,
      variables: valuesOf(variableTable),
      variableTable,
      tableFor,
      responsesFor: (requestId: string) => state.responses.filter((response) => response.requestId === requestId),
    };
  }, [state]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): StoreValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside a WorkspaceProvider');
  return context;
}
