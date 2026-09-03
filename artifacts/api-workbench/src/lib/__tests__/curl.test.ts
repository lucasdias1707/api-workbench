import { describe, expect, it } from 'vitest';
import { parseCurl, toCurl, tokenize } from '@/lib/curl';

describe('tokenize', () => {
  it('keeps quoted spans together', () => {
    expect(tokenize(`curl -H 'A: b c' https://x.test`)).toEqual(['curl', '-H', 'A: b c', 'https://x.test']);
  });

  it('joins lines split with a backslash', () => {
    expect(tokenize('curl \\\n  -X POST \\\n  https://x.test')).toEqual(['curl', '-X', 'POST', 'https://x.test']);
  });

  it('unescapes inside double quotes', () => {
    expect(tokenize('curl -d "{\\"a\\":1}" https://x.test')).toEqual(['curl', '-d', '{"a":1}', 'https://x.test']);
  });
});

describe('parseCurl', () => {
  it('reads method, headers and a JSON body', () => {
    const parsed = parseCurl(`curl -X POST https://api.test/users \\
      -H 'Content-Type: application/json' \\
      -H 'Accept: application/json' \\
      -d '{"name":"Ada"}'`);
    expect(parsed.method).toBe('POST');
    expect(parsed.url).toBe('https://api.test/users');
    expect(parsed.headers.map((header) => header.key)).toEqual(['Content-Type', 'Accept']);
    expect(parsed.bodyType).toBe('json');
    expect(parsed.body).toBe('{"name":"Ada"}');
  });

  it('infers POST when a body is present without -X', () => {
    expect(parseCurl(`curl https://api.test/x -d 'a=1'`).method).toBe('POST');
  });

  it('lifts inline query parameters out of the URL', () => {
    const parsed = parseCurl('curl "https://api.test/x?a=1&b=2"');
    expect(parsed.url).toBe('https://api.test/x');
    expect(parsed.params.map((param) => [param.key, param.value])).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('turns -u into basic auth', () => {
    const parsed = parseCurl('curl -u ada:secret https://api.test/x');
    expect(parsed.auth).toMatchObject({ type: 'basic', username: 'ada', password: 'secret' });
  });

  it('reads -F as multipart fields', () => {
    const parsed = parseCurl("curl -F 'name=Ada' -F 'role=admin' https://api.test/x");
    expect(parsed.bodyType).toBe('multipart');
    expect(parsed.multipart.map((field) => field.key)).toEqual(['name', 'role']);
  });

  it('treats -G data as query parameters', () => {
    const parsed = parseCurl("curl -G --data-urlencode 'q=hello world' https://api.test/search");
    expect(parsed.method).toBe('GET');
    expect(parsed.bodyType).toBe('none');
    expect(parsed.params).toContainEqual(expect.objectContaining({ key: 'q', value: 'hello world' }));
  });

  it('ignores boolean flags it does not model', () => {
    const parsed = parseCurl('curl -sSL --compressed https://api.test/x');
    expect(parsed.url).toBe('https://api.test/x');
    expect(parsed.method).toBe('GET');
  });

  it('parses a devtools-style copy with a cookie header', () => {
    const parsed = parseCurl(`curl 'https://api.test/x' -b 'session=1' -A 'Mozilla/5.0'`);
    expect(parsed.headers).toContainEqual(expect.objectContaining({ key: 'Cookie', value: 'session=1' }));
    expect(parsed.headers).toContainEqual(expect.objectContaining({ key: 'User-Agent', value: 'Mozilla/5.0' }));
  });
});

describe('toCurl', () => {
  it('renders a command that round-trips back through the parser', () => {
    const command = toCurl({
      method: 'POST',
      url: 'https://api.test/users?a=1',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: { type: 'text', text: '{"name":"Ada"}', contentType: 'application/json' },
    });
    const parsed = parseCurl(command);
    expect(parsed.method).toBe('POST');
    expect(parsed.url).toBe('https://api.test/users');
    expect(parsed.body).toBe('{"name":"Ada"}');
    expect(parsed.params).toContainEqual(expect.objectContaining({ key: 'a', value: '1' }));
  });

  it('quotes values containing single quotes', () => {
    const command = toCurl({
      method: 'GET',
      url: "https://api.test/x",
      headers: [{ key: 'X-Note', value: "it's fine" }],
      body: { type: 'none' },
    });
    expect(parseCurl(command).headers).toContainEqual(expect.objectContaining({ value: "it's fine" }));
  });
});
