import { describe, expect, it } from 'vitest';
import { buildVariableTable, interpolate, missingVariables, tokenize, valuesOf, LOCAL_VARIABLE_COLOR } from '@/lib/template';
import { createEnvironment, createFolder, row } from '@/lib/factories';

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
  const base = createEnvironment('ws', 'Base', true, [row('baseUrl', 'https://api.test')]);
  const table = buildVariableTable([], [base], null);

  it('splits literals from variables and resolves what it can', () => {
    const tokens = tokenize('{{baseUrl}}/v1/{{nope}}', table);
    expect(tokens.map((token) => token.kind)).toEqual(['variable', 'text', 'variable']);
    expect(tokens[0]).toMatchObject({ text: '{{baseUrl}}', name: 'baseUrl', start: 0, end: 11 });
    expect(tokens[0].kind === 'variable' && tokens[0].resolved?.value).toBe('https://api.test');
    expect(tokens[1]).toEqual({ kind: 'text', text: '/v1/' });
    expect(tokens[2]).toMatchObject({ name: 'nope', resolved: null });
  });

  it('reports the span of each variable so the UI can anchor to it', () => {
    const tokens = tokenize('x{{baseUrl}}', table);
    const variable = tokens.find((token) => token.kind === 'variable');
    expect(variable).toMatchObject({ start: 1, end: 12 });
  });
});

describe('missingVariables', () => {
  it('reports each undefined name once', () => {
    expect(missingVariables('{{a}}{{b}}{{a}}', { b: 'set' })).toEqual(['a']);
  });
});

describe('buildVariableTable', () => {
  const base = createEnvironment('ws', 'Base', true, [row('baseUrl', 'https://base'), row('token', 'base-token')]);
  const staging = createEnvironment('ws', 'Staging', false, [row('baseUrl', 'https://staging')], '#57b981');

  it('layers the active environment over the base', () => {
    expect(valuesOf(buildVariableTable([], [base, staging], staging.id))).toEqual({
      baseUrl: 'https://staging',
      token: 'base-token',
    });
  });

  it('uses the base alone when nothing is active', () => {
    expect(valuesOf(buildVariableTable([], [base, staging], null))).toEqual({
      baseUrl: 'https://base',
      token: 'base-token',
    });
  });

  it('ignores disabled and unnamed variables', () => {
    const env = createEnvironment('ws', 'Base', true, [row('keep', 'yes'), row('drop', 'no', false), row('', 'orphan')]);
    expect(valuesOf(buildVariableTable([], [env], null))).toEqual({ keep: 'yes' });
  });

  it('lets a folder override the environment', () => {
    const folder = createFolder('ws', 'GitHub', null, 0);
    folder.variables = [row('baseUrl', 'https://api.github.com')];
    const table = buildVariableTable([folder], [base, staging], staging.id);
    expect(table.baseUrl.value).toBe('https://api.github.com');
    expect(table.baseUrl.scope).toBe('folder');
  });

  it('lets the nearest folder win over an outer one', () => {
    const outer = createFolder('ws', 'Outer', null, 0);
    outer.variables = [row('baseUrl', 'https://outer')];
    const inner = createFolder('ws', 'Inner', outer.id, 0);
    inner.variables = [row('baseUrl', 'https://inner')];
    // The chain is ordered nearest first, as folderChain produces it.
    const table = buildVariableTable([inner, outer], [base], null);
    expect(table.baseUrl.value).toBe('https://inner');
    expect(table.baseUrl.sourceName).toBe('Inner');
  });

  it('records what each winner shadowed, nearest first', () => {
    const folder = createFolder('ws', 'GitHub', null, 0);
    folder.variables = [row('baseUrl', 'https://api.github.com')];
    const table = buildVariableTable([folder], [base, staging], staging.id);
    expect(table.baseUrl.shadowed.map((origin) => origin.sourceName)).toEqual(['Staging', 'Base']);
    expect(table.baseUrl.shadowed.map((origin) => origin.value)).toEqual(['https://staging', 'https://base']);
  });

  it('paints folder variables local blue and environment ones their own colour', () => {
    const folder = createFolder('ws', 'GitHub', null, 0);
    folder.variables = [row('local', 'x')];
    const table = buildVariableTable([folder], [base, staging], staging.id);
    expect(table.local.color).toBe(LOCAL_VARIABLE_COLOR);
    expect(table.baseUrl.color).toBe('#57b981');
  });

  it('marks the scope of every resolved variable', () => {
    const table = buildVariableTable([], [base, staging], staging.id);
    expect(table.baseUrl.scope).toBe('environment');
    expect(table.token.scope).toBe('base');
  });
});
