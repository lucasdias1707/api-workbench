import { describe, expect, it } from 'vitest';
import { mirrorTokens } from '@/lib/mirror-tokens';
import type { ResolvedVariable, VariableTable } from '@/types';

const defined = (name: string, value: string): ResolvedVariable => ({
  name,
  value,
  scope: 'environment',
  sourceId: 'env',
  sourceName: 'Base',
  color: '#888',
  shadowed: [],
});

const table: VariableTable = { first_name: defined('first_name', 'Ada') };

/** The invariant the whole mirror rests on. */
const joined = (value: string, language: 'json' | 'plain' = 'json') =>
  mirrorTokens(value, language, table)
    .map((token) => token.text)
    .join('');

describe('mirrorTokens', () => {
  it('reproduces the input exactly, which is what keeps the colours under the caret', () => {
    for (const input of [
      '{"name":"{{first_name}}"}',
      '{{first_name}}',
      'no variables here',
      '{ "a": [1, 2], "b": null }',
      '{{ spaced }}',
      '}}{{',
      '',
      '{"a":"{{one}}{{two}}"}',
    ]) {
      expect(joined(input)).toBe(input);
      expect(joined(input, 'plain')).toBe(input);
    }
  });

  it('marks a variable inside a JSON string, keeping the string colour', () => {
    const tokens = mirrorTokens('{"name":"{{first_name}}"}', 'json', table);
    const variable = tokens.find((token) => token.variable);
    expect(variable).toMatchObject({
      text: '{{first_name}}',
      kind: 'string',
      variable: { name: 'first_name', defined: true },
    });
  });

  it('marks one that resolves to nothing as undefined', () => {
    // This is the case that used to be invisible: it goes out as literal text.
    const tokens = mirrorTokens('{"name":"{{frist_name}}"}', 'json', table);
    expect(tokens.find((token) => token.variable)?.variable).toEqual({ name: 'frist_name', defined: false });
  });

  it('splits the quotes away from the variable, so only the variable is marked', () => {
    const tokens = mirrorTokens('"{{first_name}}"', 'json', table);
    expect(tokens.map((token) => token.text)).toEqual(['"', '{{first_name}}', '"']);
    expect(tokens.filter((token) => token.variable)).toHaveLength(1);
  });

  it('finds two variables in one string', () => {
    const tokens = mirrorTokens('"{{a}}-{{first_name}}"', 'json', table);
    expect(tokens.filter((token) => token.variable).map((token) => token.variable!.name)).toEqual([
      'a',
      'first_name',
    ]);
  });

  it('marks variables in plain text too, where there is no JSON to colour', () => {
    const tokens = mirrorTokens("carom.get('{{first_name}}')", 'plain', table);
    expect(tokens.find((token) => token.variable)?.variable).toEqual({ name: 'first_name', defined: true });
  });

  it('leaves text with no variables as the lexer produced it', () => {
    const tokens = mirrorTokens('{"a":1}', 'json', table);
    expect(tokens.every((token) => token.variable === undefined)).toBe(true);
  });

  it('does not lose its place across repeated calls, which a stale lastIndex would', () => {
    // VARIABLE_PATTERN is a shared global regex; matchAll must not be affected
    // by whatever ran before it.
    const once = mirrorTokens('{{first_name}}', 'plain', table);
    const twice = mirrorTokens('{{first_name}}', 'plain', table);
    expect(twice).toEqual(once);
    expect(twice.filter((token) => token.variable)).toHaveLength(1);
  });
});
