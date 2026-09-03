import { createId } from '@/lib/id';
import type { Auth, Environment, Folder, KeyValue, RequestRecord, Workspace } from '@/types';

export function emptyAuth(): Auth {
  return {
    type: 'none',
    token: '',
    username: '',
    password: '',
    apiKeyName: '',
    apiKeyValue: '',
    apiKeyIn: 'header',
  };
}

export function row(key = '', value = '', enabled = true): KeyValue {
  return { id: createId('kv'), key, value, enabled };
}

export function createWorkspace(name: string): Workspace {
  return { id: createId('ws'), name, createdAt: new Date().toISOString() };
}

export function createFolder(workspaceId: string, name: string, parentId: string | null, sortIndex: number, color = '#6d8fff'): Folder {
  return { id: createId('fld'), workspaceId, parentId, name, color, sortIndex, variables: [] };
}

export function createRequest(overrides: Partial<RequestRecord> & { workspaceId: string }): RequestRecord {
  const now = new Date().toISOString();
  return {
    id: createId('req'),
    folderId: null,
    name: 'New request',
    method: 'GET',
    url: '',
    description: '',
    params: [],
    headers: [],
    bodyType: 'none',
    body: '',
    form: [],
    multipart: [],
    graphql: { query: 'query {\n  \n}', variables: '{}' },
    auth: emptyAuth(),
    sortIndex: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Palette offered when creating an environment, so each one reads differently. */
export const ENVIRONMENT_COLORS = ['#8b93a1', '#57b981', '#d7ac4d', '#e0913f', '#e2645f', '#a97ad6', '#46b3b8'];

export function createEnvironment(
  workspaceId: string,
  name: string,
  isBase = false,
  variables: KeyValue[] = [],
  color = ENVIRONMENT_COLORS[0],
): Environment {
  return { id: createId('env'), workspaceId, name, isBase, color, variables };
}

/** Deep-enough copy so edits to a draft never mutate stored state. */
export function cloneRequest(request: RequestRecord): RequestRecord {
  return {
    ...request,
    params: request.params.map((item) => ({ ...item })),
    headers: request.headers.map((item) => ({ ...item })),
    form: request.form.map((item) => ({ ...item })),
    multipart: request.multipart.map((item) => ({ ...item })),
    graphql: { ...request.graphql },
    auth: { ...request.auth },
  };
}
