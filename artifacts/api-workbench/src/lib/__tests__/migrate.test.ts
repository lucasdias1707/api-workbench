import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dropLegacyState, migrateLegacyState } from '@/lib/migrate';

/** Minimal in-memory stand-in so the migration can run outside a browser. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  get size() {
    return this.data.size;
  }
}

const LEGACY_REQUESTS = [
  {
    id: 'req-me',
    name: 'Get current user',
    method: 'GET',
    url: '{{baseUrl}}/api/me',
    collection: 'col-platform',
    folder: 'Identity',
    headers: [{ key: 'Accept', value: 'application/json' }],
    params: [],
    body: '',
    bodyType: 'none',
    updatedAt: '2024-06-18T11:42:00.000Z',
  },
  {
    id: 'req-refund',
    name: 'Issue refund',
    method: 'POST',
    url: '{{baseUrl}}/v1/refunds',
    collection: 'col-billing',
    folder: 'Payments',
    headers: [{ key: 'Content-Type', value: 'application/json' }],
    params: [],
    body: '{"amount":4800}',
    bodyType: 'json',
    updatedAt: '2024-06-14T09:04:00.000Z',
  },
];

const LEGACY_ENVIRONMENTS = [
  { id: 'env-local', name: 'Local development', variables: { baseUrl: 'http://localhost:4000' }, active: true },
];

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: storage },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('migrateLegacyState', () => {
  it('returns null when there is nothing to migrate', () => {
    expect(migrateLegacyState()).toBeNull();
  });

  it('rebuilds collections and folders as a folder tree', () => {
    storage.setItem('api-workbench-requests', JSON.stringify(LEGACY_REQUESTS));
    storage.setItem('api-workbench-environments', JSON.stringify(LEGACY_ENVIRONMENTS));

    const state = migrateLegacyState()!;
    expect(state.requests).toHaveLength(2);

    const platform = state.folders.find((folder) => folder.name === 'Platform')!;
    expect(platform.parentId).toBeNull();
    const identity = state.folders.find((folder) => folder.name === 'Identity')!;
    expect(identity.parentId).toBe(platform.id);

    const me = state.requests.find((request) => request.name === 'Get current user')!;
    expect(me.folderId).toBe(identity.id);
    expect(me.method).toBe('GET');
    expect(me.headers[0]).toMatchObject({ key: 'Accept', value: 'application/json', enabled: true });
  });

  it('always creates a base environment and keeps the old ones as overlays', () => {
    storage.setItem('api-workbench-requests', JSON.stringify(LEGACY_REQUESTS));
    storage.setItem('api-workbench-environments', JSON.stringify(LEGACY_ENVIRONMENTS));

    const state = migrateLegacyState()!;
    expect(state.environments[0].isBase).toBe(true);
    const local = state.environments.find((environment) => environment.name === 'Local development')!;
    expect(local.variables).toEqual([expect.objectContaining({ key: 'baseUrl', value: 'http://localhost:4000' })]);
    expect(state.activeEnvironmentId).toBe(local.id);
  });

  it('falls back to safe defaults for unknown methods and body types', () => {
    storage.setItem(
      'api-workbench-requests',
      JSON.stringify([{ name: 'Odd', method: 'TRACE', bodyType: 'binary', url: 'https://x.test' }]),
    );
    const state = migrateLegacyState()!;
    expect(state.requests[0].method).toBe('GET');
    expect(state.requests[0].bodyType).toBe('none');
  });

  it('survives corrupt JSON in storage', () => {
    storage.setItem('api-workbench-requests', '{not json');
    expect(migrateLegacyState()).toBeNull();
  });

  it('clears the old keys once migrated', () => {
    storage.setItem('api-workbench-requests', JSON.stringify(LEGACY_REQUESTS));
    storage.setItem('api-workbench-selected', '"req-me"');
    dropLegacyState();
    expect(storage.size).toBe(0);
  });
});
