import { createEnvironment, createFolder, createRequest, emptyAuth, row } from '@/lib/factories';
import { splitQuery, syncUrlParams } from '@/lib/query';
import type { Auth, BodyType, Environment, Folder, HttpMethod, KeyValue, RequestRecord } from '@/types';
import { HTTP_METHODS } from '@/types';

/**
 * Reading a Postman export.
 *
 * Two file shapes come out of Postman and both land here: a **collection**
 * (v2.1), which becomes folders and requests, and an **environment**, which
 * becomes an environment. They are told apart by their contents rather than by
 * what the person picked in a menu, because nothing in the file names says
 * which is which.
 *
 * The translation is mostly one-to-one — Postman's `{{variable}}` syntax is
 * already ours, and so is the folder tree. Where it is not, the choice is
 * always to keep what was in the file: an unrecognised body mode becomes raw
 * text rather than nothing, and scripts are carried across verbatim and run
 * against the `pm` shim in `lib/pm.ts`.
 */

type PostmanValue = { key?: string; value?: unknown; disabled?: boolean; enabled?: boolean; type?: string };

type PostmanScript = { listen?: string; script?: { exec?: string[] | string } };

type PostmanAuth = { type?: string } & Record<string, unknown>;

type PostmanUrl =
  | string
  | {
      raw?: string;
      protocol?: string;
      host?: string[] | string;
      path?: Array<string | { value?: string }> | string;
      query?: PostmanValue[];
      variable?: PostmanValue[];
    };

type PostmanBody = {
  mode?: string;
  raw?: string;
  options?: { raw?: { language?: string } };
  urlencoded?: PostmanValue[];
  formdata?: PostmanValue[];
  graphql?: { query?: string; variables?: string };
};

type PostmanRequest = {
  method?: string;
  header?: PostmanValue[] | string;
  url?: PostmanUrl;
  body?: PostmanBody;
  auth?: PostmanAuth;
  description?: string | { content?: string };
};

type PostmanItem = {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest | string;
  event?: PostmanScript[];
  auth?: PostmanAuth;
  variable?: PostmanValue[];
  description?: string | { content?: string };
};

type PostmanCollection = {
  info?: { name?: string; description?: string | { content?: string } };
  item?: PostmanItem[];
  variable?: PostmanValue[];
  auth?: PostmanAuth;
  event?: PostmanScript[];
};

type PostmanEnvironment = {
  name?: string;
  values?: PostmanValue[];
  _postman_variable_scope?: string;
};

export type PostmanImport = {
  /** What the collection or environment was called, for the toast. */
  name: string;
  folders: Folder[];
  requests: RequestRecord[];
  /** Present only for an environment file. */
  environment: Environment | null;
  /**
   * Variables the collection and its folders declared, for the **base**
   * environment rather than for the folder they came from.
   *
   * Postman resolves environment variables *before* collection ones; this app
   * resolves folder variables *before* environments. Mapping Postman's
   * collection variables onto a folder therefore inverts their priority, and
   * an imported collection stops working exactly where it used to: a token
   * left blank at collection level shadows the real one in the selected
   * environment, and every request 401s.
   *
   * The base environment is the one scope here that sits *below* the selected
   * environment, so it is where they belong.
   */
  variables: KeyValue[];
};

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

function description(value: string | { content?: string } | undefined): string {
  return typeof value === 'object' && value !== null ? text(value.content) : text(value);
}

/** Postman marks a row off with `disabled`; ours marks it on with `enabled`. */
function toRows(values: PostmanValue[] | undefined): KeyValue[] {
  return (values ?? [])
    .filter((item) => text(item.key).length > 0)
    .map((item) => row(text(item.key), text(item.value), item.disabled !== true && item.enabled !== false));
}

/** Pull one field out of Postman's `[{key, value}]` auth arrays. */
function authField(auth: PostmanAuth, kind: string, key: string): string {
  const entries = auth[kind];
  if (Array.isArray(entries)) {
    const found = (entries as PostmanValue[]).find((item) => item.key === key);
    if (found) return text(found.value);
  }
  // Some exports write the object form instead of the array form.
  if (entries && typeof entries === 'object') {
    return text((entries as Record<string, unknown>)[key]);
  }
  return '';
}

/**
 * Translate Postman's auth block.
 *
 * A missing block means the item inherits, which is exactly what our own
 * `inherit` means, so it maps across rather than being flattened to "none".
 * `noauth` is the explicit opposite and stays explicit.
 */
export function toAuth(auth: PostmanAuth | undefined): Auth {
  const base = emptyAuth();
  if (!auth || !auth.type) return { ...base, type: 'inherit' };

  switch (auth.type) {
    case 'noauth':
      return { ...base, type: 'none' };
    case 'bearer':
      return { ...base, type: 'bearer', token: authField(auth, 'bearer', 'token') };
    case 'basic':
      return {
        ...base,
        type: 'basic',
        username: authField(auth, 'basic', 'username'),
        password: authField(auth, 'basic', 'password'),
      };
    case 'apikey': {
      const where = authField(auth, 'apikey', 'in');
      return {
        ...base,
        type: 'apikey',
        apiKeyName: authField(auth, 'apikey', 'key'),
        apiKeyValue: authField(auth, 'apikey', 'value'),
        apiKeyIn: where === 'query' ? 'query' : 'header',
      };
    }
    default:
      // OAuth, AWS, NTLM and friends have no equivalent here. Inheriting is the
      // honest answer: it sends nothing, and the Auth tab shows what happened.
      return { ...base, type: 'inherit' };
  }
}

/** Join a script's lines back into one program. */
function toScript(events: PostmanScript[] | undefined, listen: 'prerequest' | 'test'): string {
  const event = (events ?? []).find((item) => item.listen === listen);
  const exec = event?.script?.exec;
  if (!exec) return '';
  return (Array.isArray(exec) ? exec.join('\n') : text(exec)).trim();
}

/** Rebuild the address. `raw` is authoritative when present; the parts are the fallback. */
export function toUrl(url: PostmanUrl | undefined): { url: string; params: KeyValue[] } {
  if (!url) return { url: '', params: [] };
  if (typeof url === 'string') return { url, params: [] };

  const params = toRows(url.query);

  if (url.raw) {
    // The query stays in the URL, and the table mirrors it — exactly as it
    // does for a URL typed by hand.
    //
    // The mirrored rows have to be built by `syncUrlParams`, not by `toRows`,
    // because a mirrored row is marked `source: 'url'` and a plain one is not.
    // Importing plain rows produced a table the mirror did not recognise as
    // its own, so on first opening the request it appended a second copy of
    // every parameter: delete the mirrored pair and it came straight back,
    // delete the imported pair and it did not.
    //
    // Anything Postman lists that the raw URL does not carry — a disabled
    // parameter, which Postman keeps in `query` but leaves out of `raw` —
    // stays a manual row, so unticking it survives.
    const inUrl = splitQuery(url.raw).params;
    const keysInUrl = new Set(inUrl.map((param) => param.key));
    const manual = params.filter((param) => !param.enabled || !keysInUrl.has(param.key.trim()));
    return { url: url.raw, params: syncUrlParams(manual, inUrl) };
  }

  const host = Array.isArray(url.host) ? url.host.join('.') : text(url.host);
  const path = Array.isArray(url.path)
    ? url.path.map((part) => (typeof part === 'string' ? part : text(part.value))).join('/')
    : text(url.path);
  const protocol = url.protocol ? `${url.protocol}://` : '';
  const joined = `${protocol}${host}${path ? `/${path}` : ''}`;
  return { url: joined, params };
}

function toMethod(value: unknown): HttpMethod {
  const method = text(value).toUpperCase();
  return HTTP_METHODS.includes(method as HttpMethod) ? (method as HttpMethod) : 'GET';
}

type BodyResult = {
  bodyType: BodyType;
  body: string;
  form: KeyValue[];
  multipart: KeyValue[];
  graphql: { query: string; variables: string };
};

export function toBody(body: PostmanBody | undefined): BodyResult {
  const empty: BodyResult = {
    bodyType: 'none',
    body: '',
    form: [],
    multipart: [],
    graphql: { query: '', variables: '{}' },
  };
  if (!body || !body.mode) return empty;

  switch (body.mode) {
    case 'raw': {
      const language = body.options?.raw?.language;
      const type: BodyType = language === 'json' ? 'json' : language === 'xml' ? 'xml' : 'text';
      return { ...empty, bodyType: text(body.raw).trim() ? type : 'none', body: text(body.raw) };
    }
    case 'urlencoded':
      return { ...empty, bodyType: 'form', form: toRows(body.urlencoded) };
    case 'formdata':
      // A file field has no value to carry across; only its name survives, and
      // an empty value is more honest than dropping the row silently.
      return { ...empty, bodyType: 'multipart', multipart: toRows(body.formdata) };
    case 'graphql':
      return {
        ...empty,
        bodyType: 'graphql',
        graphql: { query: text(body.graphql?.query), variables: text(body.graphql?.variables) || '{}' },
      };
    default:
      // `file` and anything newer: keep whatever raw text came with it.
      return { ...empty, bodyType: text(body.raw).trim() ? 'text' : 'none', body: text(body.raw) };
  }
}

/** True for the two shapes this module understands. */
export function isPostmanCollection(value: unknown): value is PostmanCollection {
  return typeof value === 'object' && value !== null && Array.isArray((value as PostmanCollection).item);
}

export function isPostmanEnvironment(value: unknown): value is PostmanEnvironment {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as PostmanEnvironment).values) &&
    !Array.isArray((value as PostmanCollection).item)
  );
}

/**
 * Turn a parsed Postman file into records for one workspace.
 *
 * The collection itself becomes a folder rather than being spread across the
 * root: a collection is a unit in Postman, it carries its own variables, auth
 * and scripts, and there is nowhere else for those to live.
 */
export function importPostman(payload: unknown, workspaceId: string, startIndex = 0): PostmanImport {
  if (isPostmanEnvironment(payload)) {
    const name = text(payload.name) || 'Imported environment';
    return {
      name,
      folders: [],
      requests: [],
      environment: createEnvironment(workspaceId, name, false, toRows(payload.values)),
      variables: [],
    };
  }

  if (!isPostmanCollection(payload)) {
    throw new Error('This file is not a Postman collection or environment export.');
  }

  const folders: Folder[] = [];
  const requests: RequestRecord[] = [];
  const name = text(payload.info?.name) || 'Imported collection';

  // Collected as we walk, and handed to the base environment by the caller.
  const variables: KeyValue[] = [];
  const seenVariable = new Set<string>();
  const takeVariables = (values: PostmanValue[] | undefined) => {
    for (const item of toRows(values)) {
      const key = item.key.trim();
      // First definition wins. Postman scopes folder variables to their folder
      // and these are being flattened, so a name used twice has to pick one;
      // the outermost is the one the collection as a whole meant.
      if (!key || seenVariable.has(key)) continue;
      seenVariable.add(key);
      variables.push(item);
    }
  };

  const rootFolder = createFolder(workspaceId, name, null, startIndex + folders.length);
  takeVariables(payload.variable);
  rootFolder.auth = toAuth(payload.auth);
  rootFolder.preScript = toScript(payload.event, 'prerequest');
  rootFolder.postScript = toScript(payload.event, 'test');
  folders.push(rootFolder);

  const walk = (items: PostmanItem[], parentId: string) => {
    for (const item of items) {
      if (Array.isArray(item.item)) {
        const folder = createFolder(
          workspaceId,
          text(item.name) || 'Folder',
          parentId,
          startIndex + folders.length,
        );
        takeVariables(item.variable);
        folder.auth = toAuth(item.auth);
        folder.preScript = toScript(item.event, 'prerequest');
        folder.postScript = toScript(item.event, 'test');
        folders.push(folder);
        walk(item.item, folder.id);
        continue;
      }

      if (item.request === undefined) continue;
      // A request can be written as a bare URL string instead of an object.
      const source: PostmanRequest = typeof item.request === 'string' ? { url: item.request } : item.request;
      const { url, params } = toUrl(source.url);
      const body = toBody(source.body);

      requests.push(
        createRequest({
          workspaceId,
          folderId: parentId,
          name: text(item.name) || url || 'Imported request',
          method: toMethod(source.method),
          url,
          description: description(item.description ?? source.description),
          params,
          headers: toRows(typeof source.header === 'string' ? undefined : source.header),
          auth: toAuth(source.auth),
          preScript: toScript(item.event, 'prerequest'),
          postScript: toScript(item.event, 'test'),
          sortIndex: startIndex + requests.length,
          ...body,
        }),
      );
    }
  };

  walk(payload.item ?? [], rootFolder.id);

  return { name, folders, requests, environment: null, variables };
}

/** Parse the file text, with a message worth reading when it is not JSON. */
export function parsePostman(raw: string, workspaceId: string, startIndex = 0): PostmanImport {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error('That file is not valid JSON. Export from Postman with “Collection v2.1”.');
  }
  return importPostman(payload, workspaceId, startIndex);
}

/**
 * A node in the tree the import dialog shows, so someone can see what is in a
 * collection before agreeing to take all of it.
 */
export type ImportNode =
  | { kind: 'folder'; id: string; name: string; depth: number; children: ImportNode[] }
  | { kind: 'request'; id: string; name: string; method: HttpMethod; depth: number };

/** Build that tree out of an already-parsed import. */
export function importTree(imported: PostmanImport): ImportNode[] {
  const build = (parentId: string | null, depth: number): ImportNode[] => [
    ...imported.folders
      .filter((folder) => folder.parentId === parentId)
      .map<ImportNode>((folder) => ({
        kind: 'folder',
        id: folder.id,
        name: folder.name,
        depth,
        children: build(folder.id, depth + 1),
      })),
    ...imported.requests
      .filter((request) => request.folderId === parentId)
      .map<ImportNode>((request) => ({
        kind: 'request',
        id: request.id,
        name: request.name,
        method: request.method,
        depth,
      })),
  ];
  return build(null, 0);
}

/** Every id at or below a node — what ticking a folder ticks. */
export function subtreeIds(node: ImportNode): string[] {
  if (node.kind === 'request') return [node.id];
  return [node.id, ...node.children.flatMap(subtreeIds)];
}

/** Every id in the tree, for "select all". */
export function allIds(nodes: ImportNode[]): string[] {
  return nodes.flatMap(subtreeIds);
}

/**
 * Keep only what was ticked.
 *
 * A folder that was not ticked itself still comes along when something under it
 * was: it is the path to that request, and dropping it would either orphan the
 * request or silently move it somewhere it never was. Nothing else is inferred
 * — unticking one request inside a ticked folder leaves the rest alone, which
 * is the whole point of a per-row checkbox.
 */
export function pruneImport(
  imported: PostmanImport,
  selected: ReadonlySet<string>,
): { folders: Folder[]; requests: RequestRecord[] } {
  const requests = imported.requests.filter((request) => selected.has(request.id));
  const byId = new Map(imported.folders.map((folder) => [folder.id, folder]));

  const keep = new Set<string>();
  const keepWithAncestors = (folderId: string | null) => {
    let current = folderId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      keep.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
  };

  for (const folder of imported.folders) {
    if (selected.has(folder.id)) keepWithAncestors(folder.id);
  }
  for (const request of requests) keepWithAncestors(request.folderId);

  return {
    folders: imported.folders.filter((folder) => keep.has(folder.id)),
    requests,
  };
}

/**
 * Point everything at another workspace.
 *
 * Ids are left alone on purpose: the dialog's tick boxes are keyed on them, and
 * changing the destination must not throw the selection away.
 */
export function retargetImport(imported: PostmanImport, workspaceId: string): PostmanImport {
  return {
    ...imported,
    folders: imported.folders.map((folder) => ({ ...folder, workspaceId })),
    requests: imported.requests.map((request) => ({ ...request, workspaceId })),
    environment: imported.environment ? { ...imported.environment, workspaceId } : null,
  };
}
