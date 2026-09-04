import { describe, expect, it } from 'vitest';
import { createEnvironment, createFolder, row } from '@/lib/factories';
import { copyableVariables, mergeVariables, variableSources } from '@/lib/variables';

describe('variableSources', () => {
  it('offers every environment except the one being filled', () => {
    const base = createEnvironment('ws', 'Base', true, [row('a', '1')]);
    const staging = createEnvironment('ws', 'Staging', false, []);
    const sources = variableSources([base, staging], [], staging.id);
    expect(sources.map((item) => item.name)).toEqual(['Base']);
  });

  it('offers folders that actually hold variables, and skips the empty ones', () => {
    const base = createEnvironment('ws', 'Base', true, []);
    const withVars = { ...createFolder('ws', 'Playground', null, 0), variables: [row('host', 'x')] };
    const empty = createFolder('ws', 'Empty', null, 1);
    const sources = variableSources([base], [withVars, empty], base.id);
    expect(sources.map((item) => item.name)).toEqual(['Playground']);
    expect(sources[0].kind).toBe('folder');
  });
});

describe('copyableVariables', () => {
  const destination = [row('baseUrl', 'https://old.test'), row('kept', 'yes')];

  it('lists what the source has', () => {
    const source = [row('token', 'abc'), row('region', 'eu')];
    expect(copyableVariables(source, destination).map((item) => item.key)).toEqual(['token', 'region']);
  });

  it('flags a name the destination already defines', () => {
    const source = [row('baseUrl', 'https://new.test'), row('token', 'abc')];
    const copyable = copyableVariables(source, destination);
    expect(copyable.find((item) => item.key === 'baseUrl')?.conflict).toBe(true);
    expect(copyable.find((item) => item.key === 'token')?.conflict).toBe(false);
  });

  it('skips the blank trailing row the tables keep for typing into', () => {
    expect(copyableVariables([row('a', '1'), row('', '')], destination).map((item) => item.key)).toEqual(['a']);
  });

  it('offers a repeated name once', () => {
    expect(copyableVariables([row('a', '1'), row('a', '2')], []).map((item) => item.value)).toEqual(['1']);
  });
});

describe('mergeVariables', () => {
  const make = (key: string, value: string) => row(key, value);

  it('appends a name the destination did not have', () => {
    const destination = [row('kept', 'yes')];
    const merged = mergeVariables(destination, [{ key: 'token', value: 'abc', conflict: false }], make);
    expect(merged.map((item) => item.key)).toEqual(['kept', 'token']);
    expect(merged[1].value).toBe('abc');
  });

  it('overwrites a conflicting name in place rather than adding a second row', () => {
    // Two rows with one name would leave which wins to iteration order, which
    // is not something anyone chose.
    const destination = [row('baseUrl', 'https://old.test')];
    const merged = mergeVariables(destination, [{ key: 'baseUrl', value: 'https://new.test', conflict: true }], make);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: destination[0].id, value: 'https://new.test', enabled: true });
  });

  it('re-enables a row that had been unticked', () => {
    const destination = [{ ...row('baseUrl', 'old'), enabled: false }];
    const merged = mergeVariables(destination, [{ key: 'baseUrl', value: 'new', conflict: true }], make);
    expect(merged[0].enabled).toBe(true);
  });

  it('brings only the names across when values are left behind', () => {
    // The usual shape of a Staging copied from Production: same keys, and
    // every value has to differ.
    const merged = mergeVariables([], [{ key: 'baseUrl', value: 'https://prod.test', conflict: false }], make, false);
    expect(merged[0]).toMatchObject({ key: 'baseUrl', value: '' });
  });

  it('leaves the destination alone when nothing was picked', () => {
    const destination = [row('a', '1')];
    expect(mergeVariables(destination, [], make)).toEqual(destination);
  });
});
