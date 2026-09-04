import { describe, expect, it } from 'vitest';
import { lexJson, type JsonToken } from '@/lib/json-lexer';

const kinds = (input: string) => lexJson(input).map((token) => `${token.kind}:${token.text}`);
const rejoin = (tokens: JsonToken[]) => tokens.map((token) => token.text).join('');

describe('lexJson', () => {
  it('separates a key from a string value by what follows the quotes', () => {
    expect(kinds('{"name": "ditto"}')).toEqual([
      'punctuation:{',
      'key:"name"',
      'punctuation::',
      'plain: ',
      'string:"ditto"',
      'punctuation:}',
    ]);
  });

  it('still calls it a key when whitespace sits before the colon', () => {
    expect(lexJson('{"a"\n : 1}')[1]).toEqual({ kind: 'key', text: '"a"' });
  });

  it('reads numbers with decimals and exponents as one token', () => {
    expect(kinds('[1, -2.5, 3e10, 4E-2]').filter((token) => token.startsWith('number'))).toEqual([
      'number:1',
      'number:-2.5',
      'number:3e10',
      'number:4E-2',
    ]);
  });

  it('marks the literals and leaves other bare words plain', () => {
    expect(kinds('true false null undefined')).toEqual([
      'boolean:true',
      'plain: ',
      'boolean:false',
      'plain: ',
      'null:null',
      // Runs of plain text merge into one token; only the literals are split out.
      'plain: undefined',
    ]);
  });

  it('keeps an escaped quote inside the string', () => {
    expect(lexJson('"a\\"b"')).toEqual([{ kind: 'string', text: '"a\\"b"' }]);
  });

  it('treats an unterminated string as a string, but only to the line end', () => {
    const tokens = lexJson('{"a": "oops\n"b": 1}');
    expect(tokens).toContainEqual({ kind: 'string', text: '"oops' });
    expect(tokens.some((token) => token.kind === 'key' && token.text === '"b"')).toBe(true);
  });

  it('reproduces the input exactly, which is what keeps the overlay aligned', () => {
    const samples = [
      '',
      '{',
      '{"a":1,"b":[true,null,"x"]}',
      '{\n  "nested": { "deep": [1, 2, 3] }\n}',
      '"unterminated',
      '  \n\t{ }  ',
      '{{baseUrl}}/pokemon',
      '-',
      '-notanumber',
      '{"emoji": "🎱", "accent": "ç"}',
    ];
    for (const sample of samples) {
      expect(rejoin(lexJson(sample))).toBe(sample);
    }
  });

  it('does not swallow a lone minus as a number', () => {
    expect(lexJson('-')).toEqual([{ kind: 'plain', text: '-' }]);
  });

  it('leaves a template variable readable rather than mangling it', () => {
    expect(rejoin(lexJson('{"url": "{{baseUrl}}/x"}'))).toBe('{"url": "{{baseUrl}}/x"}');
  });
});
