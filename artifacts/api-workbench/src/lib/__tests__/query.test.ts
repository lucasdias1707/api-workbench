import { describe, expect, it } from 'vitest';
import { row } from '@/lib/factories';
import { buildUrl } from '@/lib/http';
import { mergeParams, splitQuery } from '@/lib/query';

describe('splitQuery', () => {
  it('leaves a URL with no query alone', () => {
    expect(splitQuery('https://api.example.com/users')).toEqual({
      base: 'https://api.example.com/users',
      params: [],
    });
  });

  it('separates the address from the parameters', () => {
    expect(splitQuery('https://api.example.com/users?page=2&limit=10')).toEqual({
      base: 'https://api.example.com/users',
      params: [
        { key: 'page', value: '2' },
        { key: 'limit', value: '10' },
      ],
    });
  });

  it('works on a URL that is still templated', () => {
    // `new URL()` throws on this, which is why the split is hand-rolled.
    expect(splitQuery('{{baseUrl}}/teste?teste=1&teste=2')).toEqual({
      base: '{{baseUrl}}/teste',
      params: [
        { key: 'teste', value: '1' },
        { key: 'teste', value: '2' },
      ],
    });
  });

  it('keeps a variable inside a value intact', () => {
    expect(splitQuery('{{baseUrl}}/x?token={{apiKey}}').params).toEqual([
      { key: 'token', value: '{{apiKey}}' },
    ]);
  });

  it('keeps repeated keys, which mean something different to a server', () => {
    expect(splitQuery('/x?id=1&id=2').params).toEqual([
      { key: 'id', value: '1' },
      { key: 'id', value: '2' },
    ]);
  });

  it('treats a key with no value as a parameter', () => {
    expect(splitQuery('/x?debug&page=1').params).toEqual([
      { key: 'debug', value: '' },
      { key: 'page', value: '1' },
    ]);
  });

  it('decodes what was percent-encoded', () => {
    expect(splitQuery('/search?q=hello%20world&tag=a%26b').params).toEqual([
      { key: 'q', value: 'hello world' },
      { key: 'tag', value: 'a&b' },
    ]);
  });

  it('drops the separators of an empty query rather than inventing rows', () => {
    expect(splitQuery('/x?')).toEqual({ base: '/x', params: [] });
    expect(splitQuery('/x?&&').params).toEqual([]);
  });

  it('puts the fragment back on the address, where it belongs', () => {
    expect(splitQuery('/docs?page=2#section')).toEqual({
      base: '/docs#section',
      params: [{ key: 'page', value: '2' }],
    });
  });

  it('splits on the first question mark only', () => {
    expect(splitQuery('/x?next=/y?z=1').params).toEqual([{ key: 'next', value: '/y?z=1' }]);
  });
});

describe('mergeParams', () => {
  it('adds the extracted parameters to an empty table', () => {
    const merged = mergeParams([], [{ key: 'page', value: '2' }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ key: 'page', value: '2', enabled: true });
  });

  it('keeps the rows that were already there', () => {
    const existing = [row('sort', 'asc')];
    const merged = mergeParams(existing, [{ key: 'page', value: '2' }]);
    expect(merged.map((item) => item.key)).toEqual(['sort', 'page']);
  });

  it('does not double a row when the same URL is pasted twice', () => {
    const once = mergeParams([], [{ key: 'page', value: '2' }]);
    const twice = mergeParams(once, [{ key: 'page', value: '2' }]);
    expect(twice).toHaveLength(1);
  });

  it('still adds a repeat that came from one URL', () => {
    const merged = mergeParams(
      [],
      [
        { key: 'id', value: '1' },
        { key: 'id', value: '2' },
      ],
    );
    expect(merged.map((item) => item.value)).toEqual(['1', '2']);
  });

  it('treats the same key with a different value as a new row', () => {
    const merged = mergeParams([row('page', '1')], [{ key: 'page', value: '2' }]);
    expect(merged.map((item) => item.value)).toEqual(['1', '2']);
  });

  it('gives every row its own id, so the table can edit them apart', () => {
    const merged = mergeParams(
      [],
      [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ],
    );
    expect(new Set(merged.map((item) => item.id)).size).toBe(2);
  });
});

describe('splitting then sending', () => {
  /** The move only works if what comes out goes back in unchanged. */
  const roundTrip = (url: string) => {
    const { base, params } = splitQuery(url);
    return buildUrl(base, params);
  };

  it('rebuilds an absolute URL', () => {
    expect(roundTrip('https://api.example.com/users?page=2&limit=10')).toBe(
      'https://api.example.com/users?page=2&limit=10',
    );
  });

  it('rebuilds a relative URL', () => {
    expect(roundTrip('/users?page=2')).toBe('/users?page=2');
  });

  it('rebuilds repeated keys in order', () => {
    expect(roundTrip('https://api.example.com/x?id=1&id=2')).toBe(
      'https://api.example.com/x?id=1&id=2',
    );
  });

  it('re-encodes a value that needed escaping', () => {
    expect(roundTrip('https://api.example.com/search?q=hello%20world')).toBe(
      'https://api.example.com/search?q=hello+world',
    );
  });
});
