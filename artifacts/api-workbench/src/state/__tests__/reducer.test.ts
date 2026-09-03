import { describe, expect, it } from 'vitest';
import { reducer } from '@/state/reducer';
import { createSeedState } from '@/lib/seed';
import { createFolder, createRequest } from '@/lib/factories';
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
    const staging = state.environments.find((environment) => !environment.isBase)!;
    state = reducer(state, { type: 'environment/activate', id: staging.id });
    const next = reducer(state, { type: 'environment/delete', id: staging.id });
    expect(next.activeEnvironmentId).toBeNull();
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
