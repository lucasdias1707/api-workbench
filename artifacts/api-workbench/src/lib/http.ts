import { byteLength } from '@/lib/format';
import { createId } from '@/lib/id';
import { interpolate } from '@/lib/template';
import type { HttpMethod, KeyValue, RequestRecord, ResponseRecord, SendMode } from '@/types';

export type PreparedBody =
  | { type: 'none' }
  | { type: 'text'; text: string; contentType: string }
  | { type: 'form'; fields: Array<{ key: string; value: string }> }
  | { type: 'multipart'; fields: Array<{ key: string; value: string }> };

export type PreparedRequest = {
  method: HttpMethod;
  url: string;
  headers: Array<{ key: string; value: string }>;
  body: PreparedBody;
};

const METHODS_WITHOUT_BODY: HttpMethod[] = ['GET', 'HEAD'];

function activeRows(rows: KeyValue[], variables: Record<string, string>) {
  return rows
    .filter((rowItem) => rowItem.enabled && rowItem.key.trim())
    .map((rowItem) => ({ key: interpolate(rowItem.key, variables).trim(), value: interpolate(rowItem.value, variables) }));
}

function encodeBasic(username: string, password: string): string {
  const raw = `${username}:${password}`;
  if (typeof btoa === 'function') {
    // btoa only handles latin1, so widen through UTF-8 first.
    const bytes = new TextEncoder().encode(raw);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(raw, 'utf8').toString('base64');
}

function defaultContentType(request: RequestRecord): string {
  switch (request.bodyType) {
    case 'json':
    case 'graphql':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    case 'text':
      return 'text/plain';
    default:
      return '';
  }
}

function buildBody(request: RequestRecord, variables: Record<string, string>, hasExplicitContentType: boolean): PreparedBody {
  if (request.bodyType === 'none' || METHODS_WITHOUT_BODY.includes(request.method)) return { type: 'none' };
  if (request.bodyType === 'form') return { type: 'form', fields: activeRows(request.form, variables) };
  if (request.bodyType === 'multipart') return { type: 'multipart', fields: activeRows(request.multipart, variables) };
  if (request.bodyType === 'graphql') {
    let parsedVariables: unknown = {};
    const rawVariables = interpolate(request.graphql.variables, variables).trim();
    if (rawVariables) {
      try {
        parsedVariables = JSON.parse(rawVariables);
      } catch {
        throw new Error('GraphQL variables are not valid JSON.');
      }
    }
    return {
      type: 'text',
      text: JSON.stringify({ query: interpolate(request.graphql.query, variables), variables: parsedVariables }),
      contentType: 'application/json',
    };
  }
  const text = interpolate(request.body, variables);
  if (!text.trim()) return { type: 'none' };
  return { type: 'text', text, contentType: hasExplicitContentType ? '' : defaultContentType(request) };
}

/**
 * Resolve a stored request into exactly what should go on the wire: variables
 * interpolated, disabled rows dropped, query params merged into the URL and
 * auth turned into concrete headers or query parameters.
 */
export function prepareRequest(request: RequestRecord, variables: Record<string, string>): PreparedRequest {
  const headers = activeRows(request.headers, variables);
  const params = activeRows(request.params, variables);
  const auth = request.auth;

  if (auth.type === 'bearer' && auth.token.trim()) {
    headers.push({ key: 'Authorization', value: `Bearer ${interpolate(auth.token, variables).trim()}` });
  } else if (auth.type === 'basic' && (auth.username || auth.password)) {
    const encoded = encodeBasic(interpolate(auth.username, variables), interpolate(auth.password, variables));
    headers.push({ key: 'Authorization', value: `Basic ${encoded}` });
  } else if (auth.type === 'apikey' && auth.apiKeyName.trim()) {
    const key = interpolate(auth.apiKeyName, variables).trim();
    const value = interpolate(auth.apiKeyValue, variables);
    if (auth.apiKeyIn === 'header') headers.push({ key, value });
    else params.push({ key, value });
  }

  const hasExplicitContentType = headers.some((header) => header.key.toLowerCase() === 'content-type');
  const body = buildBody(request, variables, hasExplicitContentType);
  if (body.type === 'text' && body.contentType && !hasExplicitContentType) {
    headers.push({ key: 'Content-Type', value: body.contentType });
  }

  return { method: request.method, url: buildUrl(interpolate(request.url, variables), params), headers, body };
}

/** Merge query parameters into a URL without losing ones already written by hand. */
export function buildUrl(rawUrl: string, params: Array<{ key: string; value: string }>): string {
  const url = rawUrl.trim();
  if (params.length === 0) return url;
  try {
    const parsed = new URL(url);
    for (const param of params) parsed.searchParams.append(param.key, param.value);
    return parsed.toString();
  } catch {
    // Relative or still-templated URL: fall back to plain string concatenation.
    const query = params
      .map((param) => `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value)}`)
      .join('&');
    if (!query) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${query}`;
  }
}

function toFetchBody(body: PreparedBody): BodyInit | undefined {
  switch (body.type) {
    case 'none':
      return undefined;
    case 'text':
      return body.text;
    case 'form': {
      const search = new URLSearchParams();
      for (const field of body.fields) search.append(field.key, field.value);
      return search;
    }
    case 'multipart': {
      const form = new FormData();
      for (const field of body.fields) form.append(field.key, field.value);
      return form;
    }
  }
}

export type SendResult = Omit<ResponseRecord, 'requestId'>;

export type SendConfig = {
  mode: SendMode;
  timeoutMs: number;
  followRedirects: boolean;
  proxyBaseUrl: string;
  proxyAvailable: boolean;
  signal?: AbortSignal;
};

function headersToRows(headers: Headers): KeyValue[] {
  const rows: KeyValue[] = [];
  headers.forEach((value, key) => rows.push({ id: createId('rh'), key, value, enabled: true }));
  return rows.sort((left, right) => left.key.localeCompare(right.key));
}

async function sendDirect(prepared: PreparedRequest, config: SendConfig): Promise<SendResult> {
  const headers = new Headers();
  for (const header of prepared.headers) {
    // multipart boundaries must be generated by fetch, so never forward ours.
    if (prepared.body.type === 'multipart' && header.key.toLowerCase() === 'content-type') continue;
    headers.append(header.key, header.value);
  }
  const started = performance.now();
  const response = await fetch(prepared.url, {
    method: prepared.method,
    headers,
    body: toFetchBody(prepared.body),
    signal: config.signal,
    redirect: config.followRedirects ? 'follow' : 'manual',
  });
  const text = await response.text();
  return {
    id: createId('res'),
    url: prepared.url,
    method: prepared.method,
    status: response.status,
    statusText: response.statusText || httpStatusText(response.status),
    headers: headersToRows(response.headers),
    body: text,
    truncated: false,
    size: byteLength(text),
    durationMs: Math.round(performance.now() - started),
    sentAt: new Date().toISOString(),
    via: 'browser',
  };
}

type ProxyResponse = {
  status: number;
  statusText: string;
  headers: Array<{ key: string; value: string }>;
  body: string;
  truncated: boolean;
  size: number;
  durationMs: number;
  finalUrl: string;
};

async function sendViaProxy(prepared: PreparedRequest, config: SendConfig): Promise<SendResult> {
  const started = performance.now();
  const response = await fetch(`${config.proxyBaseUrl}/proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: config.signal,
    body: JSON.stringify({
      method: prepared.method,
      url: prepared.url,
      headers: prepared.headers,
      body: prepared.body,
      timeoutMs: config.timeoutMs,
      followRedirects: config.followRedirects,
    }),
  });

  const payload = (await response.json()) as ProxyResponse | { error: { message: string } };
  if (!response.ok || 'error' in payload) {
    const message = 'error' in payload ? payload.error.message : `Proxy returned ${response.status}`;
    throw new ProxyError(message);
  }

  return {
    id: createId('res'),
    url: payload.finalUrl || prepared.url,
    method: prepared.method,
    status: payload.status,
    statusText: payload.statusText || httpStatusText(payload.status),
    headers: payload.headers.map((header) => ({ id: createId('rh'), key: header.key, value: header.value, enabled: true })),
    body: payload.body,
    truncated: payload.truncated,
    size: payload.size,
    durationMs: payload.durationMs || Math.round(performance.now() - started),
    sentAt: new Date().toISOString(),
    via: 'proxy',
  };
}

/** Raised when the proxy itself fails, as opposed to the upstream endpoint. */
export class ProxyError extends Error {}

/**
 * Send a prepared request. In `auto` mode the proxy is preferred (it sidesteps
 * CORS the way a desktop client would) and the browser is used as a fallback
 * when the proxy is not running.
 */
export async function sendRequest(prepared: PreparedRequest, config: SendConfig): Promise<SendResult> {
  const useProxy = config.mode === 'proxy' || (config.mode === 'auto' && config.proxyAvailable);
  if (!useProxy) return sendDirect(prepared, config);
  try {
    return await sendViaProxy(prepared, config);
  } catch (error) {
    if (config.mode === 'proxy' || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    return sendDirect(prepared, config);
  }
}

export function toErrorResponse(prepared: PreparedRequest, error: unknown, durationMs: number): SendResult {
  const message =
    error instanceof Error
      ? error.message
      : 'The request could not be completed.';
  return {
    id: createId('res'),
    url: prepared.url,
    method: prepared.method,
    status: 0,
    statusText: 'Failed',
    headers: [],
    body: '',
    truncated: false,
    size: 0,
    durationMs,
    sentAt: new Date().toISOString(),
    via: 'browser',
    error: message,
  };
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  409: 'Conflict', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

export function httpStatusText(status: number): string {
  return STATUS_TEXT[status] ?? '';
}
