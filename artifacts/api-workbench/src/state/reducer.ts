import { cloneRequest } from '@/lib/factories';
import { createId } from '@/lib/id';
import type { Action } from '@/state/actions';
import type { RequestRecord, WorkspaceState } from '@/types';
import { isDescendantFolder } from '@/state/selectors';

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

    case 'request/move': {
      const moving = state.requests.find((request) => request.id === action.id);
      if (!moving) return state;

      // Rebuild the destination's order with the dragged request inserted at
      // the drop point, then renumber so sortIndex stays dense and stable.
      const siblings = state.requests
        .filter((request) => request.folderId === action.folderId && request.id !== action.id)
        .sort((left, right) => left.sortIndex - right.sortIndex);
      const at = action.beforeId ? siblings.findIndex((request) => request.id === action.beforeId) : -1;
      const ordered = [...siblings];
      ordered.splice(at === -1 ? ordered.length : at, 0, moving);

      const order = new Map(ordered.map((request, index) => [request.id, index]));
      return {
        ...state,
        requests: state.requests.map((request) => {
          const index = order.get(request.id);
          if (index === undefined) return request;
          return request.id === action.id
            ? touch(request, { folderId: action.folderId, sortIndex: index })
            : { ...request, sortIndex: index };
        }),
      };
    }

    case 'folder/move': {
      // Refuse to drop a folder into its own subtree, which would detach it.
      if (action.parentId && isDescendantFolder(state, action.parentId, action.id)) return state;
      return {
        ...state,
        folders: state.folders.map((folder) =>
          folder.id === action.id ? { ...folder, parentId: action.parentId } : folder,
        ),
      };
    }

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

    case 'folder/variables':
      return {
        ...state,
        folders: state.folders.map((folder) =>
          folder.id === action.id ? { ...folder, variables: action.variables } : folder,
        ),
      };

    case 'workspace/create':
      return {
        ...state,
        workspaces: [...state.workspaces, action.workspace],
        environments: [...state.environments, action.environment],
        activeWorkspaceId: action.workspace.id,
        activeEnvironmentId: null,
        openTabIds: [],
        activeRequestId: null,
      };

    case 'workspace/activate': {
      if (action.id === state.activeWorkspaceId) return state;
      // Tabs belong to the workspace they were opened from.
      return { ...state, activeWorkspaceId: action.id, activeEnvironmentId: null, openTabIds: [], activeRequestId: null };
    }

    case 'workspace/rename':
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) =>
          workspace.id === action.id ? { ...workspace, name: action.name } : workspace,
        ),
      };

    case 'workspace/delete': {
      // The last workspace stays: there is nowhere to send the user otherwise.
      if (state.workspaces.length <= 1) return state;
      const remaining = state.workspaces.filter((workspace) => workspace.id !== action.id);
      const doomedRequests = new Set(
        state.requests.filter((request) => request.workspaceId === action.id).map((request) => request.id),
      );
      const next = removeRequests(state, doomedRequests);
      const activeWorkspaceId = state.activeWorkspaceId === action.id ? remaining[0].id : state.activeWorkspaceId;
      return {
        ...next,
        workspaces: remaining,
        folders: next.folders.filter((folder) => folder.workspaceId !== action.id),
        environments: next.environments.filter((environment) => environment.workspaceId !== action.id),
        activeWorkspaceId,
        activeEnvironmentId: null,
      };
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
