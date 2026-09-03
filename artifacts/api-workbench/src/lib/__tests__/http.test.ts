import { describe, expect, it } from 'vitest';
import { buildUrl, prepareRequest } from '@/lib/http';
import { createRequest, emptyAuth, row } from '@/lib/factories';
import type { RequestRecord } from '@/types';

function make(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return createRequest({ workspaceId: 'ws', url: 'https://api.test/things', ...overrides });
}

const variables = { baseUrl: 'https://api.test', token: 'secret' };

describe('buildUrl', () => {
  it('appends parameters to an absolute URL', () => {
    expect(buildUrl('https://api.test/x?a=1', [{ key: 'b', value: '2' }])).toBe('https://api.test/x?a=1&b=2');
  });

  it('encodes parameters on a URL it cannot parse', () => {
    expect(buildUrl('{{baseUrl}}/x', [{ key: 'q', value: 'a b' }])).toBe('{{baseUrl}}/x?q=a%20b');
  });

  it('keeps duplicate parameter names', () => {
    expect(buildUrl('https://api.test/x', [
      { key: 'tag', value: 'a' },
      { key: 'tag', value: 'b' },
    ])).toBe('https://api.test/x?tag=a&tag=b');
  });
});

describe('prepareRequest', () => {
  it('interpolates the URL and drops disabled rows', () => {
    const prepared = prepareRequest(
      make({
        url: '{{baseUrl}}/things',
        params: [row('limit', '10'), row('skip', '5', false)],
        headers: [row('Accept', 'application/json'), row('X-Off', 'no', false)],
      }),
      variables,
    );
    expect(prepared.url).toBe('https://api.test/things?limit=10');
    expect(prepared.headers).toEqual([{ key: 'Accept', value: 'application/json' }]);
  });

  it('adds a JSON content type when the user has not set one', () => {
    const prepared = prepareRequest(make({ method: 'POST', bodyType: 'json', body: '{"a":1}' }), variables);
    expect(prepared.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
    expect(prepared.body).toEqual({ type: 'text', text: '{"a":1}', contentType: 'application/json' });
  });

  it('respects an explicit content type', () => {
    const prepared = prepareRequest(
      make({ method: 'POST', bodyType: 'json', body: '{}', headers: [row('Content-Type', 'application/vnd.api+json')] }),
      variables,
    );
    const contentTypes = prepared.headers.filter((header) => header.key === 'Content-Type');
    expect(contentTypes).toEqual([{ key: 'Content-Type', value: 'application/vnd.api+json' }]);
  });

  it('never sends a body on GET', () => {
    const prepared = prepareRequest(make({ method: 'GET', bodyType: 'json', body: '{"a":1}' }), variables);
    expect(prepared.body).toEqual({ type: 'none' });
  });

  it('turns bearer auth into a header and interpolates the token', () => {
    const prepared = prepareRequest(
      make({ auth: { ...emptyAuth(), type: 'bearer', token: '{{token}}' } }),
      variables,
    );
    expect(prepared.headers).toContainEqual({ key: 'Authorization', value: 'Bearer secret' });
  });

  it('base64 encodes basic auth', () => {
    const prepared = prepareRequest(
      make({ auth: { ...emptyAuth(), type: 'basic', username: 'ada', password: 'pw' } }),
      variables,
    );
    expect(prepared.headers).toContainEqual({ key: 'Authorization', value: `Basic ${btoa('ada:pw')}` });
  });

  it('can put an API key in the query string', () => {
    const prepared = prepareRequest(
      make({ auth: { ...emptyAuth(), type: 'apikey', apiKeyName: 'api_key', apiKeyValue: 'k1', apiKeyIn: 'query' } }),
      variables,
    );
    expect(prepared.url).toBe('https://api.test/things?api_key=k1');
    expect(prepared.headers).toEqual([]);
  });

  it('builds a form body from enabled fields only', () => {
    const prepared = prepareRequest(
      make({ method: 'POST', bodyType: 'form', form: [row('a', '1'), row('b', '2', false)] }),
      variables,
    );
    expect(prepared.body).toEqual({ type: 'form', fields: [{ key: 'a', value: '1' }] });
  });

  it('wraps a GraphQL query and its variables', () => {
    const prepared = prepareRequest(
      make({ method: 'POST', bodyType: 'graphql', graphql: { query: 'query { me }', variables: '{"id":1}' } }),
      variables,
    );
    expect(prepared.body).toEqual({
      type: 'text',
      text: JSON.stringify({ query: 'query { me }', variables: { id: 1 } }),
      contentType: 'application/json',
    });
  });

  it('rejects GraphQL variables that are not JSON', () => {
    expect(() =>
      prepareRequest(make({ method: 'POST', bodyType: 'graphql', graphql: { query: '{}', variables: 'nope' } }), variables),
    ).toThrow(/not valid JSON/);
  });
});
