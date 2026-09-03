import { describe, expect, it } from 'vitest';
import { interpolate, missingVariables, resolveVariables, tokenize } from '@/lib/template';
import { createEnvironment, row } from '@/lib/factories';

describe('interpolate', () => {
  const variables = { baseUrl: 'https://api.test', token: 'abc123' };

  it('replaces known variables', () => {
    expect(interpolate('{{baseUrl}}/users', variables)).toBe('https://api.test/users');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(interpolate('{{  baseUrl  }}/x', variables)).toBe('https://api.test/x');
  });

  it('leaves unknown variables in place so they stay visible', () => {
    expect(interpolate('{{baseUrl}}/{{missing}}', variables)).toBe('https://api.test/{{missing}}');
  });

  it('replaces every occurrence', () => {
    expect(interpolate('{{token}}-{{token}}', variables)).toBe('abc123-abc123');
  });

  it('does not recurse into a substituted value', () => {
    expect(interpolate('{{a}}', { a: '{{b}}', b: 'deep' })).toBe('{{b}}');
  });

  it('passes empty input straight through', () => {
    expect(interpolate('', variables)).toBe('');
  });
});

describe('tokenize', () => {
  it('splits literals from variables and marks unresolved ones', () => {
    const tokens = tokenize('{{baseUrl}}/v1/{{nope}}', { baseUrl: 'https://api.test' });
    expect(tokens).toEqual([
      { kind: 'variable', text: '{{baseUrl}}', name: 'baseUrl', resolved: 'https://api.test' },
      { kind: 'text', text: '/v1/' },
      { kind: 'variable', text: '{{nope}}', name: 'nope', resolved: null },
    ]);
  });
});

describe('missingVariables', () => {
  it('reports each undefined name once', () => {
    expect(missingVariables('{{a}}{{b}}{{a}}', { b: 'set' })).toEqual(['a']);
  });
});

describe('resolveVariables', () => {
  it('layers the active environment over the base', () => {
    const base = createEnvironment('ws', 'Base', true, [row('baseUrl', 'https://base'), row('token', 'base-token')]);
    const staging = createEnvironment('ws', 'Staging', false, [row('baseUrl', 'https://staging')]);
    expect(resolveVariables([base, staging], staging.id)).toEqual({
      baseUrl: 'https://staging',
      token: 'base-token',
    });
  });

  it('uses the base alone when nothing is active', () => {
    const base = createEnvironment('ws', 'Base', true, [row('baseUrl', 'https://base')]);
    const staging = createEnvironment('ws', 'Staging', false, [row('baseUrl', 'https://staging')]);
    expect(resolveVariables([base, staging], null)).toEqual({ baseUrl: 'https://base' });
  });

  it('ignores disabled and unnamed variables', () => {
    const base = createEnvironment('ws', 'Base', true, [row('keep', 'yes'), row('drop', 'no', false), row('', 'orphan')]);
    expect(resolveVariables([base], null)).toEqual({ keep: 'yes' });
  });
});
