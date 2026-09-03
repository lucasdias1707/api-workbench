import { emptyAuth, row } from '@/lib/factories';
import type { PreparedRequest } from '@/lib/http';
import type { Auth, BodyType, HttpMethod, KeyValue } from '@/types';
import { HTTP_METHODS } from '@/types';

export type ParsedCurl = {
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  bodyType: BodyType;
  body: string;
  form: KeyValue[];
  multipart: KeyValue[];
  auth: Auth;
};

/** Split a shell-ish command into tokens, honouring quotes and `\` continuations. */
export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === '\\' && quote === '"' && index + 1 < command.length) {
        index += 1;
        current += command[index];
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (char === '\\' && (command[index + 1] === '\n' || command[index + 1] === '\r')) {
      index += command[index + 1] === '\r' && command[index + 2] === '\n' ? 2 : 1;
      continue;
    }
    if (char === '\\' && index + 1 < command.length) {
      index += 1;
      current += command[index];
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started || current) tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (started || current) tokens.push(current);
  return tokens.filter((token, index) => token !== '' || index === 0);
}

function splitPair(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  if (index === -1) return [value.trim(), ''];
  return [value.slice(0, index).trim(), value.slice(index + separator.length).trim()];
}

function guessBodyType(body: string, contentType: string): BodyType {
  const lowered = contentType.toLowerCase();
  if (lowered.includes('json')) return 'json';
  if (lowered.includes('xml')) return 'xml';
  if (lowered.includes('x-www-form-urlencoded')) return 'form';
  if (lowered) return 'text';
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('<')) return 'xml';
  return 'text';
}

function nameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments.at(-1) ?? parsed.hostname;
  } catch {
    return 'Imported request';
  }
}

/**
 * Parse a `curl` command into request fields. Unknown flags are skipped rather
 * than rejected, so pasting a command copied from browser devtools works.
 */
export function parseCurl(command: string): ParsedCurl {
  const tokens = tokenize(command.trim().replace(/^\s*curl\s+/i, 'curl '));
  if (tokens[0]?.toLowerCase() === 'curl') tokens.shift();

  const headers: KeyValue[] = [];
  const params: KeyValue[] = [];
  const multipart: KeyValue[] = [];
  const dataParts: string[] = [];
  const urlEncodedParts: KeyValue[] = [];
  const auth = emptyAuth();
  let method: HttpMethod | null = null;
  let url = '';
  let forceGet = false;

  const takeValue = (index: number): [string, number] => [tokens[index + 1] ?? '', index + 1];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    let value: string;

    switch (true) {
      case token === '-X' || token === '--request':
        [value, index] = takeValue(index);
        if (HTTP_METHODS.includes(value.toUpperCase() as HttpMethod)) method = value.toUpperCase() as HttpMethod;
        break;
      case token === '-H' || token === '--header': {
        [value, index] = takeValue(index);
        const [key, headerValue] = splitPair(value, ':');
        if (key) headers.push(row(key, headerValue));
        break;
      }
      case token === '-b' || token === '--cookie':
        [value, index] = takeValue(index);
        if (value) headers.push(row('Cookie', value));
        break;
      case token === '-A' || token === '--user-agent':
        [value, index] = takeValue(index);
        if (value) headers.push(row('User-Agent', value));
        break;
      case token === '-u' || token === '--user': {
        [value, index] = takeValue(index);
        const [username, password] = splitPair(value, ':');
        auth.type = 'basic';
        auth.username = username;
        auth.password = password;
        break;
      }
      case token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-ascii':
        [value, index] = takeValue(index);
        dataParts.push(value);
        break;
      case token === '--data-urlencode': {
        [value, index] = takeValue(index);
        const [key, encodedValue] = splitPair(value, '=');
        urlEncodedParts.push(row(key, encodedValue));
        break;
      }
      case token === '-F' || token === '--form': {
        [value, index] = takeValue(index);
        const [key, formValue] = splitPair(value, '=');
        if (key) multipart.push(row(key, formValue));
        break;
      }
      case token === '-G' || token === '--get':
        forceGet = true;
        break;
      case token === '--url':
        [value, index] = takeValue(index);
        url = value;
        break;
      // Flags that carry a value we do not model.
      case token === '-o' || token === '--output' || token === '-e' || token === '--referer' || token === '--max-time' || token === '--connect-timeout' || token === '-x' || token === '--proxy' || token === '-w' || token === '--write-out':
        index += 1;
        break;
      case token.startsWith('-'):
        // Boolean flags such as -L, -k, -s, --compressed: nothing to carry over.
        break;
      default:
        if (!url) url = token;
        break;
    }
  }

  const contentType = headers.find((header) => header.key.toLowerCase() === 'content-type')?.value ?? '';
  const rawBody = dataParts.join('&');

  let bodyType: BodyType = 'none';
  let body = '';
  let form: KeyValue[] = [];

  if (multipart.length > 0) {
    bodyType = 'multipart';
  } else if (urlEncodedParts.length > 0) {
    bodyType = 'form';
    form = urlEncodedParts;
  } else if (rawBody) {
    bodyType = guessBodyType(rawBody, contentType);
    if (bodyType === 'form') {
      form = [...new URLSearchParams(rawBody).entries()].map(([key, entryValue]) => row(key, entryValue));
    } else {
      body = rawBody;
    }
  }

  // `curl -G` turns data into query parameters instead of a body.
  if (forceGet && (form.length > 0 || body)) {
    const search = new URLSearchParams(form.length > 0 ? form.map((item) => [item.key, item.value]) : rawBody);
    for (const [key, entryValue] of search.entries()) params.push(row(key, entryValue));
    bodyType = 'none';
    body = '';
    form = [];
  }

  // Query parameters written inline in the URL become editable rows.
  try {
    const parsed = new URL(url);
    for (const [key, entryValue] of parsed.searchParams.entries()) params.push(row(key, entryValue));
    parsed.search = '';
    url = parsed.toString().replace(/\?$/, '');
  } catch {
    // Leave templated or relative URLs untouched.
  }

  const resolvedMethod: HttpMethod = method ?? (forceGet ? 'GET' : bodyType === 'none' ? 'GET' : 'POST');

  return {
    name: nameFromUrl(url),
    method: resolvedMethod,
    url,
    headers,
    params,
    bodyType,
    body,
    form,
    multipart,
    auth,
  };
}

function shellQuote(value: string): string {
  if (value === '') return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Render a prepared request as a runnable `curl` command. */
export function toCurl(prepared: PreparedRequest): string {
  const parts = ['curl', '--request', prepared.method, shellQuote(prepared.url)];
  for (const header of prepared.headers) {
    parts.push('\\\n  --header', shellQuote(`${header.key}: ${header.value}`));
  }
  const body = prepared.body;
  if (body.type === 'text') {
    parts.push('\\\n  --data-raw', shellQuote(body.text));
  } else if (body.type === 'form') {
    for (const field of body.fields) parts.push('\\\n  --data-urlencode', shellQuote(`${field.key}=${field.value}`));
  } else if (body.type === 'multipart') {
    for (const field of body.fields) parts.push('\\\n  --form', shellQuote(`${field.key}=${field.value}`));
  }
  return parts.join(' ');
}
