import { createEnvironment, createFolder, createRequest, createWorkspace, emptyAuth, row } from '@/lib/factories';
import { defaultSettings } from '@/lib/settings';
import { STATE_VERSION } from '@/lib/storage';
import type { BodyType, HttpMethod, KeyValue, WorkspaceState } from '@/types';
import { HTTP_METHODS, BODY_TYPES } from '@/types';

/** Storage keys written by the first version of the app. */
const LEGACY_KEYS = {
  requests: 'api-workbench-requests',
  environments: 'api-workbench-environments',
  selected: 'api-workbench-selected',
  history: 'api-workbench-history',
} as const;

type LegacyRequest = {
  id?: string;
  name?: string;
  method?: string;
  url?: string;
  collection?: string;
  folder?: string;
  headers?: Array<{ key?: string; value?: string; enabled?: boolean }>;
  params?: Array<{ key?: string; value?: string; enabled?: boolean }>;
  body?: string;
  bodyType?: string;
  updatedAt?: string;
};

type LegacyEnvironment = {
  id?: string;
  name?: string;
  variables?: Record<string, string>;
  active?: boolean;
};

function asMethod(value: unknown): HttpMethod {
  return HTTP_METHODS.includes(value as HttpMethod) ? (value as HttpMethod) : 'GET';
}

function asBodyType(value: unknown): BodyType {
  return BODY_TYPES.includes(value as BodyType) ? (value as BodyType) : 'none';
}

function toRows(items: Array<{ key?: string; value?: string; enabled?: boolean }> | undefined): KeyValue[] {
  return (items ?? []).map((item) => row(item.key ?? '', item.value ?? '', item.enabled !== false));
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Rebuild a v2 workspace from the flat v1 localStorage keys. Collections and
 * folders used to be plain strings on each request; they become real folder
 * records here.
 */
export function migrateLegacyState(): WorkspaceState | null {
  if (typeof window === 'undefined') return null;
  const legacyRequests = readJson<LegacyRequest[]>(LEGACY_KEYS.requests);
  if (!legacyRequests || legacyRequests.length === 0) return null;

  const workspace = createWorkspace('Personal');
  const folders = [];
  const collectionFolders = new Map<string, string>();
  const subFolders = new Map<string, string>();
  const requests = [];

  for (const legacy of legacyRequests) {
    const collectionName = legacy.collection?.replace(/^col-/, '') ?? 'Imported';
    let collectionId = collectionFolders.get(collectionName);
    if (!collectionId) {
      const folder = createFolder(workspace.id, titleCase(collectionName), null, folders.length);
      folders.push(folder);
      collectionFolders.set(collectionName, folder.id);
      collectionId = folder.id;
    }

    let parentId = collectionId;
    if (legacy.folder) {
      const subKey = `${collectionId}/${legacy.folder}`;
      let subId = subFolders.get(subKey);
      if (!subId) {
        const folder = createFolder(workspace.id, legacy.folder, collectionId, folders.length);
        folders.push(folder);
        subFolders.set(subKey, folder.id);
        subId = folder.id;
      }
      parentId = subId;
    }

    requests.push(
      createRequest({
        workspaceId: workspace.id,
        folderId: parentId,
        name: legacy.name ?? 'Imported request',
        method: asMethod(legacy.method),
        url: legacy.url ?? '',
        headers: toRows(legacy.headers),
        params: toRows(legacy.params),
        bodyType: asBodyType(legacy.bodyType),
        body: legacy.body ?? '',
        auth: emptyAuth(),
        sortIndex: requests.length,
        updatedAt: legacy.updatedAt ?? new Date().toISOString(),
      }),
    );
  }

  const legacyEnvironments = readJson<LegacyEnvironment[]>(LEGACY_KEYS.environments) ?? [];
  const environments = [createEnvironment(workspace.id, 'Base', true, [])];
  for (const legacy of legacyEnvironments) {
    const variables = Object.entries(legacy.variables ?? {}).map(([key, value]) => row(key, value));
    environments.push(createEnvironment(workspace.id, legacy.name ?? 'Environment', false, variables));
  }

  return {
    version: STATE_VERSION,
    workspaces: [workspace],
    folders,
    requests,
    environments,
    responses: [],
    activeWorkspaceId: workspace.id,
    activeEnvironmentId: environments[1]?.id ?? null,
    openTabIds: requests[0] ? [requests[0].id] : [],
    activeFolderId: null,
    activeRequestId: requests[0]?.id ?? null,
    settings: defaultSettings(),
  };
}

export function dropLegacyState(): void {
  if (typeof window === 'undefined') return;
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore: storage may be unavailable.
    }
  }
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
