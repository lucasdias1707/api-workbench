import { describe, expect, it } from 'vitest';
import { createFolder, createRequest, createWorkspace } from '@/lib/factories';
import { exportFileName, exportFolder, exportRequest, isSubtreeExport, subtreeFolderIds } from '@/lib/export';
import { defaultSettings } from '@/lib/settings';
import type { Folder, RequestRecord, WorkspaceState } from '@/types';

function stateWith(folders: Folder[], requests: RequestRecord[], workspaceId: string): WorkspaceState {
  return {
    version: 2,
    workspaces: [{ id: workspaceId, name: 'W', createdAt: new Date().toISOString() }],
    activeWorkspaceId: workspaceId,
    folders,
    requests,
    environments: [],
    activeEnvironmentId: null,
    responses: [],
    activeRequestId: null,
    settings: defaultSettings(),
  } as WorkspaceState;
}

/** api / v2 / pokemon, plus an unrelated sibling that must never come along. */
function fixture() {
  const workspace = createWorkspace('W');
  const api = createFolder(workspace.id, 'API', null, 0);
  const v2 = createFolder(workspace.id, 'v2', api.id, 0);
  const pokemon = createFolder(workspace.id, 'pokemon', v2.id, 0);
  const other = createFolder(workspace.id, 'Other', null, 1);

  const make = (name: string, folderId: string | null) =>
    createRequest({ workspaceId: workspace.id, folderId, name });
  const atApi = make('at api', api.id);
  const atV2 = make('at v2', v2.id);
  const deep = make('deep', pokemon.id);
  const outside = make('outside', other.id);
  const atRoot = make('at root', null);

  return {
    workspace,
    api,
    v2,
    pokemon,
    other,
    requests: { atApi, atV2, deep, outside, atRoot },
    state: stateWith([api, v2, pokemon, other], [atApi, atV2, deep, outside, atRoot], workspace.id),
  };
}

describe('subtreeFolderIds', () => {
  it('collects the folder and every folder beneath it', () => {
    const { state, api, v2, pokemon } = fixture();
    expect(subtreeFolderIds(state, api.id).sort()).toEqual([api.id, v2.id, pokemon.id].sort());
  });

  it('starts where it is asked to, not at the root', () => {
    const { state, v2, pokemon } = fixture();
    expect(subtreeFolderIds(state, v2.id).sort()).toEqual([v2.id, pokemon.id].sort());
  });

  it('terminates when the parent chain loops back on itself', () => {
    const { state, api, v2 } = fixture();
    const looped = {
      ...state,
      folders: state.folders.map((folder) => (folder.id === api.id ? { ...folder, parentId: v2.id } : folder)),
    };
    expect(subtreeFolderIds(looped, api.id)).toHaveLength(3);
  });

  it('returns nothing for a folder that is not there', () => {
    const { state } = fixture();
    expect(subtreeFolderIds(state, 'missing')).toEqual([]);
  });
});

describe('exportFolder', () => {
  it('takes the nested folders and their requests', () => {
    const { state, api, v2, pokemon, requests } = fixture();
    const result = exportFolder(state, api.id);
    expect(result?.folders.map((folder) => folder.id).sort()).toEqual([api.id, v2.id, pokemon.id].sort());
    expect(result?.requests.map((request) => request.name).sort()).toEqual(['at api', 'at v2', 'deep']);
  });

  it('leaves a sibling folder and its requests behind', () => {
    const { state, api, other } = fixture();
    const result = exportFolder(state, api.id);
    expect(result?.folders.some((folder) => folder.id === other.id)).toBe(false);
    expect(result?.requests.some((request) => request.name === 'outside')).toBe(false);
  });

  it('leaves requests that sit at the workspace root behind', () => {
    const { state, api } = fixture();
    expect(exportFolder(state, api.id)?.requests.some((request) => request.name === 'at root')).toBe(false);
  });

  it('names the export after the folder and marks the format', () => {
    const { state, v2 } = fixture();
    const result = exportFolder(state, v2.id);
    expect(result?.name).toBe('v2');
    expect(isSubtreeExport(result)).toBe(true);
  });

  it('is null for a folder that is not there', () => {
    const { state } = fixture();
    expect(exportFolder(state, 'missing')).toBeNull();
  });
});

describe('exportRequest', () => {
  it('takes the one request and no folders', () => {
    const { state, requests } = fixture();
    const result = exportRequest(state, requests.deep.id);
    expect(result?.requests).toHaveLength(1);
    expect(result?.requests[0].id).toBe(requests.deep.id);
    expect(result?.folders).toEqual([]);
  });

  it('is null for a request that is not there', () => {
    const { state } = fixture();
    expect(exportRequest(state, 'missing')).toBeNull();
  });
});

describe('exportFileName', () => {
  it('lowercases and joins words with a single dash', () => {
    expect(exportFileName('Pokemon API')).toBe('pokemon-api.json');
  });

  it('collapses runs of punctuation instead of emitting them', () => {
    expect(exportFileName('Pokémon / v2!!')).toBe('pok-mon-v2.json');
  });

  it('falls back rather than producing a nameless file', () => {
    expect(exportFileName('///')).toBe('export.json');
    expect(exportFileName('')).toBe('export.json');
  });
});

describe('isSubtreeExport', () => {
  it('rejects a full workspace export, which has no marker', () => {
    const { state } = fixture();
    expect(isSubtreeExport(state)).toBe(false);
  });

  it('rejects values that are not objects', () => {
    expect(isSubtreeExport(null)).toBe(false);
    expect(isSubtreeExport('workspace-subtree')).toBe(false);
  });
});
