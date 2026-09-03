import { cloneRequest } from '@/lib/factories';
import { createId } from '@/lib/id';
import type { Action } from '@/state/actions';
import type { RequestRecord, WorkspaceState } from '@/types';

/** Keep at most this many responses per request so history stays useful but bounded. */
const MAX_RESPONSES_PER_REQUEST = 15;
const MAX_RESPONSES_TOTAL = 120;

function touch(request: RequestRecord, patch: Partial<RequestRecord>): RequestRecord {
  return { ...request, ...patch, updatedAt: new Date().toISOString() };
}

function withTabOpen(state: WorkspaceState, id: string): WorkspaceState {
  const openTabIds = state.openTabIds.includes(id) ? state.openTabIds : [...state.openTabIds, id];
  return { ...state, openTabIds, activeRequestId: id };
}

/** Pick the tab that should take focus after `closedId` goes away. */
function nextActiveId(openTabIds: string[], closedId: string, currentActive: string | null): string | null {
  if (currentActive !== closedId) return currentActive;
  const index = openTabIds.indexOf(closedId);
  const remaining = openTabIds.filter((tabId) => tabId !== closedId);
  if (remaining.length === 0) return null;
  return remaining[Math.min(index, remaining.length - 1)] ?? null;
}

/** Ids of a folder and every folder nested beneath it. */
function folderSubtree(state: WorkspaceState, rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of state.folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

function removeRequests(state: WorkspaceState, ids: Set<string>): WorkspaceState {
  const requests = state.requests.filter((request) => !ids.has(request.id));
  const openTabIds = state.openTabIds.filter((tabId) => !ids.has(tabId));
  const activeRequestId =
    state.activeRequestId && ids.has(state.activeRequestId) ? (openTabIds.at(-1) ?? null) : state.activeRequestId;
  return {
    ...state,
    requests,
    openTabIds,
    activeRequestId,
    responses: state.responses.filter((response) => !ids.has(response.requestId)),
  };
}

export function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'state/replace':
      return action.state;

    case 'request/open':
      return withTabOpen(state, action.id);

    case 'request/close-tab': {
      const openTabIds = state.openTabIds.filter((tabId) => tabId !== action.id);
      return { ...state, openTabIds, activeRequestId: nextActiveId(state.openTabIds, action.id, state.activeRequestId) };
    }

    case 'request/close-other-tabs':
      return { ...state, openTabIds: [action.id], activeRequestId: action.id };

    case 'request/update':
      return {
        ...state,
        requests: state.requests.map((request) => (request.id === action.id ? touch(request, action.patch) : request)),
      };

    case 'request/create':
      return withTabOpen({ ...state, requests: [...state.requests, action.request] }, action.request.id);

    case 'request/duplicate': {
      const source = state.requests.find((request) => request.id === action.id);
      if (!source) return state;
      const copy = cloneRequest(source);
      copy.id = createId('req');
      copy.name = `${source.name} copy`;
      copy.sortIndex = source.sortIndex + 1;
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      return withTabOpen({ ...state, requests: [...state.requests, copy] }, copy.id);
    }

    case 'request/delete':
      return removeRequests(state, new Set([action.id]));

    case 'request/move':
      return {
        ...state,
        requests: state.requests.map((request) =>
          request.id === action.id ? touch(request, { folderId: action.folderId }) : request,
        ),
      };

    case 'folder/create':
      return { ...state, folders: [...state.folders, action.folder] };

    case 'folder/rename':
      return {
        ...state,
        folders: state.folders.map((folder) => (folder.id === action.id ? { ...folder, name: action.name } : folder)),
      };

    case 'folder/delete': {
      const doomedFolders = folderSubtree(state, action.id);
      const doomedRequests = new Set(
        state.requests.filter((request) => request.folderId && doomedFolders.has(request.folderId)).map((request) => request.id),
      );
      const next = removeRequests(state, doomedRequests);
      return { ...next, folders: next.folders.filter((folder) => !doomedFolders.has(folder.id)) };
    }

    case 'environment/activate':
      return { ...state, activeEnvironmentId: action.id };

    case 'environment/create':
      return { ...state, environments: [...state.environments, action.environment] };

    case 'environment/update':
      return {
        ...state,
        environments: state.environments.map((environment) =>
          environment.id === action.id ? { ...environment, ...action.patch } : environment,
        ),
      };

    case 'environment/delete': {
      const target = state.environments.find((environment) => environment.id === action.id);
      if (!target || target.isBase) return state;
      return {
        ...state,
        environments: state.environments.filter((environment) => environment.id !== action.id),
        activeEnvironmentId: state.activeEnvironmentId === action.id ? null : state.activeEnvironmentId,
      };
    }

    case 'response/add': {
      const sameRequest = state.responses
        .filter((response) => response.requestId === action.response.requestId)
        .slice(0, MAX_RESPONSES_PER_REQUEST - 1);
      const others = state.responses.filter((response) => response.requestId !== action.response.requestId);
      const merged = [action.response, ...sameRequest, ...others]
        .sort((left, right) => right.sentAt.localeCompare(left.sentAt))
        .slice(0, MAX_RESPONSES_TOTAL);
      return { ...state, responses: merged };
    }

    case 'response/clear':
      return { ...state, responses: state.responses.filter((response) => response.requestId !== action.requestId) };

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    default:
      return state;
  }
}
