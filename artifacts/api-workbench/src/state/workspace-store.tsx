import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { emptyAuth } from '@/lib/factories';
import { dropLegacyState, migrateLegacyState } from '@/lib/migrate';
import { createSeedState } from '@/lib/seed';
import { defaultSettings } from '@/lib/settings';
import { readState, writeState, STATE_VERSION } from '@/lib/storage';
import { buildVariableTable, valuesOf } from '@/lib/template';
import { reducer } from '@/state/reducer';
import { folderChain } from '@/state/selectors';
import type { Action } from '@/state/actions';
import type { Folder, RequestRecord, ResponseRecord, VariableTable, WorkspaceState } from '@/types';

type StoreValue = {
  state: WorkspaceState;
  dispatch: (action: Action) => void;
  activeRequest: RequestRecord | null;
  /** Set while a folder's own pane is open. */
  activeFolder: Folder | null;
  /** The folders a request sits in, nearest first — what auth and scripts inherit through. */
  chainFor: (folderId: string | null) => Folder[];
  /** Values only, for building the outgoing request. */
  variables: Record<string, string>;
  /** Values plus where each came from, for the UI. */
  variableTable: VariableTable;
  /** Resolve in the context of any folder, not just the active request's. */
  tableFor: (folderId: string | null) => VariableTable;
  responsesFor: (requestId: string) => ResponseRecord[];
};

const WorkspaceContext = createContext<StoreValue | null>(null);

/**
 * Fill in anything a stored state is missing so older payloads stay loadable.
 *
 * Auth and scripts arrived on folders after people already had folders stored,
 * so they are filled in here rather than by a version bump. A folder written
 * before they existed gets `inherit`, which is what it effectively already was;
 * a *request* written back then keeps its own concrete auth, so nothing that
 * used to send a token silently stops.
 */
function hydrate(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    version: STATE_VERSION,
    responses: state.responses ?? [],
    openTabIds: state.openTabIds ?? [],
    folders: (state.folders ?? []).map((folder) => ({
      ...folder,
      variables: folder.variables ?? [],
      auth: folder.auth ?? { ...emptyAuth(), type: 'inherit' },
      preScript: folder.preScript ?? '',
      postScript: folder.postScript ?? '',
    })),
    requests: (state.requests ?? []).map((request) => ({
      ...request,
      auth: request.auth ?? emptyAuth(),
      preScript: request.preScript ?? '',
      postScript: request.postScript ?? '',
    })),
    environments: state.environments ?? [],
    activeFolderId: state.activeFolderId ?? null,
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
    const chainFor = (folderId: string | null) => folderChain(state, folderId);
    const tableFor = (folderId: string | null) =>
      buildVariableTable(chainFor(folderId), environments, state.activeEnvironmentId);
    const variableTable = tableFor(activeRequest?.folderId ?? null);
    return {
      state,
      dispatch,
      activeRequest,
      activeFolder: state.folders.find((folder) => folder.id === state.activeFolderId) ?? null,
      chainFor,
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
