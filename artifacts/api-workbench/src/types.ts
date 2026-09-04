/**
 * Domain model for the workbench.
 *
 * The shape mirrors what a desktop HTTP client needs: a workspace holds a tree
 * of folders and requests, plus a set of environments whose variables are
 * interpolated into every outgoing request.
 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const BODY_TYPES = ['none', 'json', 'text', 'xml', 'form', 'multipart', 'graphql'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';

export type KeyValue = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

export type Auth = {
  type: AuthType;
  /** bearer */
  token: string;
  /** basic */
  username: string;
  password: string;
  /** apikey */
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyIn: 'header' | 'query';
};

export type GraphQLBody = {
  query: string;
  variables: string;
};

export type RequestRecord = {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  description: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyType: BodyType;
  /** Raw text payload used by the json/text/xml body types. */
  body: string;
  form: KeyValue[];
  multipart: KeyValue[];
  graphql: GraphQLBody;
  auth: Auth;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type Folder = {
  id: string;
  workspaceId: string;
  /** `null` means the folder sits at the root of the workspace. */
  parentId: string | null;
  name: string;
  color: string;
  sortIndex: number;
  /**
   * Variables scoped to this folder and everything under it. They are the
   * "local" scope: nearer folders win over outer ones, and any folder wins
   * over an environment.
   */
  variables: KeyValue[];
};

export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
};

export type Environment = {
  id: string;
  workspaceId: string;
  name: string;
  /**
   * The base environment is always applied; the active sub-environment is
   * layered on top of it, so shared values live in one place.
   */
  isBase: boolean;
  /** Colour its variables are drawn in, so staging never reads as production. */
  color: string;
  variables: KeyValue[];
};

/** Where a resolved variable came from. Folder scope is "local", the rest global. */
export type VariableScope = 'folder' | 'environment' | 'base';

export type VariableOrigin = {
  scope: VariableScope;
  sourceId: string;
  sourceName: string;
  color: string;
  value: string;
};

export type ResolvedVariable = VariableOrigin & {
  name: string;
  /** Definitions this one overrides, nearest first. */
  shadowed: VariableOrigin[];
};

export type VariableTable = Record<string, ResolvedVariable>;

/** Syntax colours for the response viewer, editable like an editor theme. */
export type JsonTheme = {
  key: string;
  string: string;
  number: string;
  boolean: string;
  null: string;
  punctuation: string;
};

/** How a request should reach the network. */
export type SendMode = 'auto' | 'browser' | 'proxy';
export type PaneLayout = 'horizontal' | 'vertical';
export type ThemeName = 'dark' | 'light' | 'system';

export type Settings = {
  theme: ThemeName;
  layout: PaneLayout;
  sendMode: SendMode;
  /** Follow redirects when sending through the proxy. */
  followRedirects: boolean;
  timeoutMs: number;
  /** Persist response bodies between reloads. */
  persistResponses: boolean;
  /**
   * Ask the release feed for a newer version when the app starts. Desktop only,
   * and it never downloads anything on its own.
   */
  autoCheckUpdates: boolean;
  jsonTheme: JsonTheme;
};

export type ResponseRecord = {
  id: string;
  requestId: string;
  /** Fully resolved URL that was actually sent. */
  url: string;
  method: HttpMethod;
  status: number;
  statusText: string;
  headers: KeyValue[];
  body: string;
  /** Set when the body was cut down before being persisted. */
  truncated: boolean;
  size: number;
  durationMs: number;
  sentAt: string;
  via: 'browser' | 'proxy' | 'desktop';
  error?: string;
};

export type WorkspaceState = {
  version: number;
  workspaces: Workspace[];
  folders: Folder[];
  requests: RequestRecord[];
  environments: Environment[];
  responses: ResponseRecord[];
  activeWorkspaceId: string;
  /** Active sub-environment id, or `null` for "base only". */
  activeEnvironmentId: string | null;
  openTabIds: string[];
  activeRequestId: string | null;
  settings: Settings;
};
