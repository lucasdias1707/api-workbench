import { describe, expect, it } from 'vitest';
import { reducer } from '@/state/reducer';
import { createSeedState } from '@/lib/seed';
import { createEnvironment, createFolder, createRequest, createWorkspace, row } from '@/lib/factories';
import { buildTree, countRequests, folderPath } from '@/state/selectors';
import type { ResponseRecord, WorkspaceState } from '@/types';

function seed(): WorkspaceState {
  return createSeedState();
}

function response(requestId: string, overrides: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    id: `res_${Math.random().toString(36).slice(2)}`,
    requestId,
    url: 'https://api.test/x',
    method: 'GET',
    status: 200,
    statusText: 'OK',
    headers: [],
    body: '{}',
    truncated: false,
    size: 2,
    durationMs: 10,
    sentAt: new Date().toISOString(),
    via: 'browser',
    ...overrides,
  };
}

describe('tabs', () => {
  it('opens a request once and focuses it', () => {
    const state = seed();
    const target = state.requests[3];
    const next = reducer(reducer(state, { type: 'request/open', id: target.id }), { type: 'request/open', id: target.id });
    expect(next.openTabIds.filter((id) => id === target.id)).toHaveLength(1);
    expect(next.activeRequestId).toBe(target.id);
  });

  it('focuses a neighbour when the active tab closes', () => {
    let state = seed();
    state = reducer(state, { type: 'request/open', id: state.requests[1].id });
    state = reducer(state, { type: 'request/open', id: state.requests[2].id });
    const closed = state.activeRequestId!;
    const next = reducer(state, { type: 'request/close-tab', id: closed });
    expect(next.openTabIds).not.toContain(closed);
    expect(next.activeRequestId).toBe(state.requests[1].id);
  });

  it('clears the active request when the last tab closes', () => {
    let state = seed();
    state = { ...state, openTabIds: [state.requests[0].id], activeRequestId: state.requests[0].id };
    const next = reducer(state, { type: 'request/close-tab', id: state.requests[0].id });
    expect(next.openTabIds).toEqual([]);
    expect(next.activeRequestId).toBeNull();
  });
});

describe('requests', () => {
  it('duplicating copies the fields but not the identity', () => {
    const state = seed();
    const source = state.requests[0];
    const next = reducer(state, { type: 'request/duplicate', id: source.id });
    const copy = next.requests.at(-1)!;
    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe(`${source.name} copy`);
    expect(copy.params).toEqual(source.params);
    expect(copy.params).not.toBe(source.params);
    expect(next.activeRequestId).toBe(copy.id);
  });

  it('deleting also drops its tab and responses', () => {
    let state = seed();
    const target = state.requests[0];
    state = reducer(state, { type: 'request/open', id: target.id });
    state = reducer(state, { type: 'response/add', response: response(target.id) });
    const next = reducer(state, { type: 'request/delete', id: target.id });
    expect(next.requests.find((request) => request.id === target.id)).toBeUndefined();
    expect(next.openTabIds).not.toContain(target.id);
    expect(next.responses.filter((item) => item.requestId === target.id)).toHaveLength(0);
  });

  it('updating stamps updatedAt', () => {
    const state = seed();
    const target = state.requests[0];
    const next = reducer(state, { type: 'request/update', id: target.id, patch: { name: 'Renamed' } });
    const updated = next.requests.find((request) => request.id === target.id)!;
    expect(updated.name).toBe('Renamed');
    expect(updated.updatedAt >= target.updatedAt).toBe(true);
  });
});

describe('folders', () => {
  it('deleting a folder removes nested folders and their requests', () => {
    const state = seed();
    const playground = state.folders.find((folder) => folder.name === 'Playground')!;
    const before = state.requests.length;
    const next = reducer(state, { type: 'folder/delete', id: playground.id });
    expect(next.folders.some((folder) => folder.name === 'Inspect')).toBe(false);
    expect(next.requests.length).toBeLessThan(before);
  });

  it('leaves sibling folders alone', () => {
    const state = seed();
    const playground = state.folders.find((folder) => folder.name === 'Playground')!;
    const next = reducer(state, { type: 'folder/delete', id: playground.id });
    expect(next.folders.some((folder) => folder.name === 'GitHub API')).toBe(true);
  });
});

describe('environments', () => {
  it('refuses to delete the base environment', () => {
    const state = seed();
    const base = state.environments.find((environment) => environment.isBase)!;
    expect(reducer(state, { type: 'environment/delete', id: base.id }).environments).toHaveLength(
      state.environments.length,
    );
  });

  it('deactivates an environment that is removed', () => {
    let state = seed();
    const staging = createEnvironment(state.activeWorkspaceId, 'Staging', false, []);
    state = reducer(state, { type: 'environment/create', environment: staging });
    state = reducer(state, { type: 'environment/activate', id: staging.id });
    const next = reducer(state, { type: 'environment/delete', id: staging.id });
    expect(next.activeEnvironmentId).toBeNull();
  });

  it('ships with only the base environment, so the user adds their own', () => {
    const state = seed();
    expect(state.environments).toHaveLength(1);
    expect(state.environments[0].isBase).toBe(true);
    expect(state.activeEnvironmentId).toBeNull();
  });
});

describe('folder variables', () => {
  it('stores variables on the folder', () => {
    const state = seed();
    const folder = state.folders[0];
    const next = reducer(state, { type: 'folder/variables', id: folder.id, variables: [row('a', '1')] });
    expect(next.folders.find((item) => item.id === folder.id)!.variables).toEqual([
      expect.objectContaining({ key: 'a', value: '1' }),
    ]);
  });
});

describe('moving things around', () => {
  it('moves a request into another folder and renumbers the destination', () => {
    const state = seed();
    const github = state.folders.find((folder) => folder.name === 'GitHub API')!;
    const moving = state.requests.find((request) => request.name === 'Echo request')!;
    const next = reducer(state, { type: 'request/move', id: moving.id, folderId: github.id });
    const moved = next.requests.find((request) => request.id === moving.id)!;
    expect(moved.folderId).toBe(github.id);
    const inGithub = next.requests
      .filter((request) => request.folderId === github.id)
      .map((request) => request.sortIndex)
      .sort((a, b) => a - b);
    expect(inGithub).toEqual([0, 1]);
  });

  it('drops a request before a named sibling', () => {
    const state = seed();
    const inspect = state.folders.find((folder) => folder.name === 'Inspect')!;
    const first = state.requests.find((request) => request.name === 'Echo request')!;
    const last = state.requests.find((request) => request.name === 'Status 404')!;
    const next = reducer(state, { type: 'request/move', id: last.id, folderId: inspect.id, beforeId: first.id });
    const order = next.requests
      .filter((request) => request.folderId === inspect.id)
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((request) => request.name);
    expect(order[0]).toBe('Status 404');
  });

  it('moves a request out to the workspace root', () => {
    const state = seed();
    const moving = state.requests[0];
    const next = reducer(state, { type: 'request/move', id: moving.id, folderId: null });
    expect(next.requests.find((request) => request.id === moving.id)!.folderId).toBeNull();
  });

  it('reparents a folder', () => {
    const state = seed();
    const github = state.folders.find((folder) => folder.name === 'GitHub API')!;
    const playground = state.folders.find((folder) => folder.name === 'Playground')!;
    const next = reducer(state, { type: 'folder/move', id: github.id, parentId: playground.id });
    expect(next.folders.find((folder) => folder.id === github.id)!.parentId).toBe(playground.id);
  });

  it('refuses to drop a folder inside its own subtree', () => {
    const state = seed();
    const playground = state.folders.find((folder) => folder.name === 'Playground')!;
    const inspect = state.folders.find((folder) => folder.name === 'Inspect')!;
    expect(reducer(state, { type: 'folder/move', id: playground.id, parentId: inspect.id })).toBe(state);
  });
});

describe('workspaces', () => {
  it('creates one with its own base environment and switches to it', () => {
    const state = seed();
    const workspace = createWorkspace('Second');
    const environment = createEnvironment(workspace.id, 'Base', true, []);
    const next = reducer(state, { type: 'workspace/create', workspace, environment });
    expect(next.activeWorkspaceId).toBe(workspace.id);
    expect(next.openTabIds).toEqual([]);
    expect(next.environments.filter((item) => item.workspaceId === workspace.id)).toHaveLength(1);
  });

  it('clears tabs when switching, since they belong to the other workspace', () => {
    let state = seed();
    state = reducer(state, { type: 'request/open', id: state.requests[2].id });
    const workspace = createWorkspace('Second');
    state = reducer(state, { type: 'workspace/create', workspace, environment: createEnvironment(workspace.id, 'Base', true, []) });
    const back = reducer(state, { type: 'workspace/activate', id: state.workspaces[0].id });
    expect(back.openTabIds).toEqual([]);
    expect(back.activeRequestId).toBeNull();
  });

  it('refuses to delete the only workspace', () => {
    const state = seed();
    expect(reducer(state, { type: 'workspace/delete', id: state.activeWorkspaceId })).toBe(state);
  });

  it('deleting one takes its folders, requests and environments with it', () => {
    let state = seed();
    const original = state.activeWorkspaceId;
    const workspace = createWorkspace('Second');
    state = reducer(state, { type: 'workspace/create', workspace, environment: createEnvironment(workspace.id, 'Base', true, []) });
    const next = reducer(state, { type: 'workspace/delete', id: original });
    expect(next.workspaces).toHaveLength(1);
    expect(next.requests.filter((request) => request.workspaceId === original)).toHaveLength(0);
    expect(next.folders.filter((folder) => folder.workspaceId === original)).toHaveLength(0);
    expect(next.environments.filter((item) => item.workspaceId === original)).toHaveLength(0);
    expect(next.activeWorkspaceId).toBe(workspace.id);
  });
});

describe('responses', () => {
  it('keeps the newest response first', () => {
    let state = seed();
    const id = state.requests[0].id;
    state = reducer(state, { type: 'response/add', response: response(id, { sentAt: '2024-01-01T00:00:00.000Z', status: 500 }) });
    state = reducer(state, { type: 'response/add', response: response(id, { sentAt: '2024-01-02T00:00:00.000Z', status: 200 }) });
    expect(state.responses[0].status).toBe(200);
  });

  it('caps how many responses one request keeps', () => {
    let state = seed();
    const id = state.requests[0].id;
    for (let index = 0; index < 25; index += 1) {
      state = reducer(state, {
        type: 'response/add',
        response: response(id, { sentAt: new Date(Date.UTC(2024, 0, index + 1)).toISOString() }),
      });
    }
    expect(state.responses.filter((item) => item.requestId === id).length).toBeLessThanOrEqual(15);
  });
});

describe('selectors', () => {
  it('builds a nested tree and counts requests through it', () => {
    const state = seed();
    const tree = buildTree(state, '');
    expect(countRequests(tree)).toBe(state.requests.length);
    expect(tree.some((node) => node.kind === 'folder' && node.folder.name === 'Playground')).toBe(true);
  });

  it('prunes folders with no matches while searching', () => {
    const state = seed();
    const tree = buildTree(state, 'Public repo');
    expect(countRequests(tree)).toBe(1);
    expect(tree).toHaveLength(1);
  });

  it('reports the path to a nested folder', () => {
    const state = seed();
    const inspect = state.folders.find((folder) => folder.name === 'Inspect')!;
    expect(folderPath(state, inspect.id)).toEqual(['Playground', 'Inspect']);
  });

  it('places a request created at the root at depth zero', () => {
    let state = seed();
    const loose = createRequest({ workspaceId: state.activeWorkspaceId, name: 'Loose', sortIndex: 99 });
    state = reducer(state, { type: 'request/create', request: loose });
    const tree = buildTree(state, 'Loose');
    expect(tree).toEqual([expect.objectContaining({ kind: 'request', depth: 0 })]);
  });

  it('ignores folders from another workspace', () => {
    const state = seed();
    const foreign = createFolder('other-workspace', 'Elsewhere', null, 0);
    const tree = buildTree({ ...state, folders: [...state.folders, foreign] }, '');
    expect(tree.some((node) => node.kind === 'folder' && node.folder.name === 'Elsewhere')).toBe(false);
  });
});
