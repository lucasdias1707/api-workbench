import { describe, expect, it } from 'vitest';
import {
  allIds,
  importPostman,
  importTree,
  parsePostman,
  pruneImport,
  retargetImport,
  subtreeIds,
  toAuth,
  toBody,
  toUrl,
} from '@/lib/postman';

const collection = (overrides: Record<string, unknown> = {}) => ({
  info: { name: 'My API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [],
  ...overrides,
});

const importOf = (payload: unknown) => importPostman(payload, 'ws');

describe('toAuth', () => {
  it('maps a missing block to inheriting, which is what Postman means by it', () => {
    expect(toAuth(undefined).type).toBe('inherit');
  });

  it('keeps noauth explicit, because it is the opposite of inheriting', () => {
    expect(toAuth({ type: 'noauth' }).type).toBe('none');
  });

  it('reads a bearer token out of the array form', () => {
    const auth = toAuth({ type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] });
    expect(auth).toMatchObject({ type: 'bearer', token: '{{token}}' });
  });

  it('reads basic credentials', () => {
    const auth = toAuth({
      type: 'basic',
      basic: [
        { key: 'username', value: 'ada' },
        { key: 'password', value: 'hunter2' },
      ],
    });
    expect(auth).toMatchObject({ type: 'basic', username: 'ada', password: 'hunter2' });
  });

  it('reads an API key, including where it is sent', () => {
    const auth = toAuth({
      type: 'apikey',
      apikey: [
        { key: 'key', value: 'X-Api-Key' },
        { key: 'value', value: 'abc' },
        { key: 'in', value: 'query' },
      ],
    });
    expect(auth).toMatchObject({ type: 'apikey', apiKeyName: 'X-Api-Key', apiKeyValue: 'abc', apiKeyIn: 'query' });
  });

  it('falls back to inheriting for a scheme with no equivalent here', () => {
    // Sending nothing and saying so beats pretending an OAuth flow came across.
    expect(toAuth({ type: 'oauth2' }).type).toBe('inherit');
  });
});

describe('toUrl', () => {
  it('prefers the raw address, which is what was typed', () => {
    expect(toUrl({ raw: '{{baseUrl}}/users?page=1', query: [{ key: 'page', value: '1' }] }).url).toBe(
      '{{baseUrl}}/users?page=1',
    );
  });

  it('mirrors the query into rows', () => {
    const { params } = toUrl({ raw: '{{baseUrl}}/users?page=1', query: [{ key: 'page', value: '1' }] });
    expect(params).toHaveLength(1);
    expect(params[0]).toMatchObject({ key: 'page', value: '1', enabled: true });
  });

  it('carries a disabled parameter across as unticked, not as missing', () => {
    const { params } = toUrl({ raw: '/x', query: [{ key: 'debug', value: '1', disabled: true }] });
    expect(params[0].enabled).toBe(false);
  });

  it('rebuilds the address from its parts when there is no raw', () => {
    expect(
      toUrl({ protocol: 'https', host: ['api', 'test'], path: ['v1', 'users'] }).url,
    ).toBe('https://api.test/v1/users');
  });

  it('accepts a plain string, which older exports use', () => {
    expect(toUrl('https://api.test/x')).toEqual({ url: 'https://api.test/x', params: [] });
  });
});

describe('toBody', () => {
  it('reads a raw JSON body as JSON', () => {
    expect(toBody({ mode: 'raw', raw: '{"a":1}', options: { raw: { language: 'json' } } })).toMatchObject({
      bodyType: 'json',
      body: '{"a":1}',
    });
  });

  it('reads a raw body with no language as text', () => {
    expect(toBody({ mode: 'raw', raw: 'hello' }).bodyType).toBe('text');
  });

  it('treats an empty raw body as no body', () => {
    expect(toBody({ mode: 'raw', raw: '' }).bodyType).toBe('none');
  });

  it('reads url-encoded and form-data fields', () => {
    expect(toBody({ mode: 'urlencoded', urlencoded: [{ key: 'a', value: '1' }] }).form).toHaveLength(1);
    expect(toBody({ mode: 'formdata', formdata: [{ key: 'file', type: 'file' }] }).multipart).toHaveLength(1);
  });

  it('reads a GraphQL body', () => {
    expect(toBody({ mode: 'graphql', graphql: { query: '{ me }' } })).toMatchObject({
      bodyType: 'graphql',
      graphql: { query: '{ me }', variables: '{}' },
    });
  });
});

describe('importPostman', () => {
  it('refuses something that is neither a collection nor an environment', () => {
    expect(() => importOf({ hello: 'world' })).toThrow(/not a Postman collection/);
  });

  it('makes the collection itself a folder, so its auth and scripts have somewhere to live', () => {
    const result = importOf(collection({ variable: [{ key: 'baseUrl', value: 'https://api.test' }] }));
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0]).toMatchObject({ name: 'My API', parentId: null });
  });

  it('nests folders the way the collection nests them', () => {
    const result = importOf(
      collection({
        item: [{ name: 'Users', item: [{ name: 'Admin', item: [] }] }],
      }),
    );
    const [root, users, admin] = result.folders;
    expect(users).toMatchObject({ name: 'Users', parentId: root.id });
    expect(admin).toMatchObject({ name: 'Admin', parentId: users.id });
  });

  it('imports a request with its method, address, headers and body', () => {
    const result = importOf(
      collection({
        item: [
          {
            name: 'Create user',
            request: {
              method: 'POST',
              header: [{ key: 'Accept', value: 'application/json' }],
              url: { raw: '{{baseUrl}}/users' },
              body: { mode: 'raw', raw: '{"name":"ada"}', options: { raw: { language: 'json' } } },
            },
          },
        ],
      }),
    );
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      name: 'Create user',
      method: 'POST',
      url: '{{baseUrl}}/users',
      bodyType: 'json',
      body: '{"name":"ada"}',
      folderId: result.folders[0].id,
    });
    expect(result.requests[0].headers[0]).toMatchObject({ key: 'Accept' });
  });

  it('leaves a request with no auth block inheriting from its folder', () => {
    const result = importOf(
      collection({
        auth: { type: 'bearer', bearer: [{ key: 'token', value: 'abc' }] },
        item: [{ name: 'Get', request: { method: 'GET', url: 'https://api.test/x' } }],
      }),
    );
    expect(result.folders[0].auth).toMatchObject({ type: 'bearer', token: 'abc' });
    expect(result.requests[0].auth.type).toBe('inherit');
  });

  it('keeps a request that set its own auth', () => {
    const result = importOf(
      collection({
        auth: { type: 'bearer', bearer: [{ key: 'token', value: 'folder' }] },
        item: [
          {
            name: 'Get',
            request: {
              method: 'GET',
              url: 'https://api.test/x',
              auth: { type: 'bearer', bearer: [{ key: 'token', value: 'mine' }] },
            },
          },
        ],
      }),
    );
    expect(result.requests[0].auth).toMatchObject({ type: 'bearer', token: 'mine' });
  });

  it('carries scripts across, joining the lines back into one program', () => {
    const result = importOf(
      collection({
        event: [{ listen: 'prerequest', script: { exec: ['const a = 1;', 'console.log(a);'] } }],
        item: [
          {
            name: 'Get',
            request: { method: 'GET', url: 'https://api.test/x' },
            event: [{ listen: 'test', script: { exec: ["pm.test('ok', function () {});"] } }],
          },
        ],
      }),
    );
    expect(result.folders[0].preScript).toBe('const a = 1;\nconsole.log(a);');
    expect(result.requests[0].postScript).toContain("pm.test('ok'");
  });

  it('reads a request written as a bare URL string', () => {
    const result = importOf(collection({ item: [{ name: 'Ping', request: 'https://api.test/ping' }] }));
    expect(result.requests[0]).toMatchObject({ method: 'GET', url: 'https://api.test/ping' });
  });

  it('imports an environment export as an environment', () => {
    const result = importOf({
      name: 'Staging',
      values: [
        { key: 'baseUrl', value: 'https://staging.test', enabled: true },
        { key: 'old', value: 'x', enabled: false },
      ],
      _postman_variable_scope: 'environment',
    });
    expect(result.folders).toEqual([]);
    expect(result.environment).toMatchObject({ name: 'Staging', isBase: false });
    expect(result.environment!.variables.map((item) => item.enabled)).toEqual([true, false]);
  });
});

describe('choosing what to import', () => {
  const nested = () =>
    importOf(
      collection({
        item: [
          {
            name: 'Users',
            item: [
              { name: 'List users', request: { method: 'GET', url: '/users' } },
              { name: 'Create user', request: { method: 'POST', url: '/users' } },
              { name: 'Admin', item: [{ name: 'Ban user', request: { method: 'POST', url: '/ban' } }] },
            ],
          },
          { name: 'Ping', request: { method: 'GET', url: '/ping' } },
        ],
      }),
    );

  it('builds the tree the dialog draws, nested as the collection was', () => {
    const tree = importTree(nested());
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: 'folder', name: 'My API', depth: 0 });

    const users = tree[0].kind === 'folder' ? tree[0].children[0] : null;
    expect(users).toMatchObject({ kind: 'folder', name: 'Users', depth: 1 });
    if (users?.kind !== 'folder') throw new Error('expected a folder');
    expect(users.children.map((node) => node.name)).toEqual(['Admin', 'List users', 'Create user']);
  });

  it('carries the method through, so a row reads like the sidebar', () => {
    const tree = importTree(nested());
    const ping = tree[0].kind === 'folder' ? tree[0].children.at(-1) : null;
    expect(ping).toMatchObject({ kind: 'request', name: 'Ping', method: 'GET' });
  });

  it('lists every id once, which is what "select all" ticks', () => {
    const imported = nested();
    const ids = allIds(importTree(imported));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(imported.folders.length + imported.requests.length);
  });

  it('ticking a folder means everything under it', () => {
    const tree = importTree(nested());
    const users = tree[0].kind === 'folder' ? tree[0].children[0] : null;
    if (users?.kind !== 'folder') throw new Error('expected a folder');
    // Users, its three children, Admin's own request.
    expect(subtreeIds(users)).toHaveLength(5);
  });

  it('keeps only what was ticked', () => {
    const imported = nested();
    const ping = imported.requests.find((request) => request.name === 'Ping')!;
    const pruned = pruneImport(imported, new Set([ping.id]));
    expect(pruned.requests.map((request) => request.name)).toEqual(['Ping']);
  });

  it('brings an unticked folder along when something inside it was ticked', () => {
    // Otherwise the request would have nowhere to sit, or would silently move.
    const imported = nested();
    const ban = imported.requests.find((request) => request.name === 'Ban user')!;
    const pruned = pruneImport(imported, new Set([ban.id]));
    expect(pruned.folders.map((folder) => folder.name)).toEqual(['My API', 'Users', 'Admin']);
    expect(pruned.requests).toHaveLength(1);
  });

  it('does not infer the other way: an unticked request inside a ticked folder stays out', () => {
    const imported = nested();
    const users = imported.folders.find((folder) => folder.name === 'Users')!;
    const list = imported.requests.find((request) => request.name === 'List users')!;
    const pruned = pruneImport(imported, new Set([users.id, list.id]));
    expect(pruned.requests.map((request) => request.name)).toEqual(['List users']);
  });

  it('keeps an empty folder that was ticked on its own', () => {
    const imported = nested();
    const admin = imported.folders.find((folder) => folder.name === 'Admin')!;
    const pruned = pruneImport(imported, new Set([admin.id]));
    expect(pruned.folders.map((folder) => folder.name)).toEqual(['My API', 'Users', 'Admin']);
    expect(pruned.requests).toEqual([]);
  });

  it('takes nothing when nothing is ticked', () => {
    expect(pruneImport(nested(), new Set())).toEqual({ folders: [], requests: [] });
  });
});

describe("where a collection's own variables land", () => {
  /**
   * Postman resolves an environment variable *before* a collection one; this
   * app resolves a folder variable *before* an environment. Putting Postman's
   * collection variables on the imported folder therefore inverts their
   * priority — a blank `token` at collection level shadows the real one in the
   * selected environment, and every request comes back 401 despite working in
   * Postman. They belong in the base environment, which is the one scope that
   * sits below the selected environment.
   */
  it('keeps them off the folder, where they would outrank the environment', () => {
    const result = importOf(collection({ variable: [{ key: 'token', value: '' }] }));
    expect(result.folders[0].variables).toEqual([]);
  });

  it('hands them over for the base environment instead', () => {
    const result = importOf(collection({ variable: [{ key: 'baseUrl', value: 'https://api.test' }] }));
    expect(result.variables).toHaveLength(1);
    expect(result.variables[0]).toMatchObject({ key: 'baseUrl', value: 'https://api.test', enabled: true });
  });

  it('takes the variables of nested folders too, outermost first', () => {
    const result = importOf(
      collection({
        variable: [{ key: 'a', value: 'collection' }],
        item: [{ name: 'Users', item: [], variable: [{ key: 'b', value: 'folder' }] }],
      }),
    );
    expect(result.variables.map((item) => item.key)).toEqual(['a', 'b']);
    expect(result.folders.every((folder) => folder.variables.length === 0)).toBe(true);
  });

  it('keeps the first definition when a name is declared twice', () => {
    // Postman scopes folder variables to their folder; flattening them has to
    // pick one, and the outermost is what the collection as a whole meant.
    const result = importOf(
      collection({
        variable: [{ key: 'host', value: 'outer' }],
        item: [{ name: 'Inner', item: [], variable: [{ key: 'host', value: 'inner' }] }],
      }),
    );
    expect(result.variables).toHaveLength(1);
    expect(result.variables[0].value).toBe('outer');
  });

  it('carries a disabled collection variable across as unticked', () => {
    const result = importOf(collection({ variable: [{ key: 'debug', value: '1', disabled: true }] }));
    expect(result.variables[0]).toMatchObject({ key: 'debug', enabled: false });
  });

  it('reports none for an environment file, which has no collection scope', () => {
    const result = importOf({ name: 'Staging', values: [{ key: 'a', value: '1' }], _postman_variable_scope: 'environment' });
    expect(result.variables).toEqual([]);
  });
});

describe('retargetImport', () => {
  it('points every record at another workspace', () => {
    const imported = importOf(collection({ item: [{ name: 'Ping', request: '/ping' }] }));
    const moved = retargetImport(imported, 'other');
    expect(moved.folders.every((folder) => folder.workspaceId === 'other')).toBe(true);
    expect(moved.requests.every((request) => request.workspaceId === 'other')).toBe(true);
  });

  it('leaves the ids alone, so a selection survives changing the destination', () => {
    const imported = importOf(collection({ item: [{ name: 'Ping', request: '/ping' }] }));
    const moved = retargetImport(imported, 'other');
    expect(moved.requests[0].id).toBe(imported.requests[0].id);
    expect(moved.folders[0].id).toBe(imported.folders[0].id);
  });

  it('moves an imported environment too', () => {
    const imported = importOf({ name: 'Staging', values: [], _postman_variable_scope: 'environment' });
    expect(retargetImport(imported, 'other').environment!.workspaceId).toBe('other');
  });
});

describe('parsePostman', () => {
  it('says what to export when the text is not JSON at all', () => {
    expect(() => parsePostman('not json', 'ws')).toThrow(/Collection v2.1/);
  });

  it('parses a real file body', () => {
    expect(parsePostman(JSON.stringify(collection()), 'ws').name).toBe('My API');
  });
});
