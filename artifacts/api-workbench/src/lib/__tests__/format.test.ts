import { describe, expect, it } from 'vitest';
import { byteLength, contentTypeLabel, formatBytes, formatDuration, statusFamily, tryPrettyJson } from '@/lib/format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [2048, '2.0 KB'],
    [1024 * 1024 * 3, '3.00 MB'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it('switches units as the value grows', () => {
    expect(formatDuration(120)).toBe('120 ms');
    expect(formatDuration(1500)).toBe('1.50 s');
    expect(formatDuration(65_000)).toBe('1m 5s');
  });
});

describe('statusFamily', () => {
  it.each([
    [0, 'none'],
    [204, 'success'],
    [301, 'redirect'],
    [404, 'client'],
    [503, 'server'],
  ] as const)('maps %i to %s', (status, family) => {
    expect(statusFamily(status)).toBe(family);
  });
});

describe('contentTypeLabel', () => {
  it('recognises common types', () => {
    expect(contentTypeLabel('application/json; charset=utf-8')).toBe('JSON');
    expect(contentTypeLabel('text/html')).toBe('HTML');
    expect(contentTypeLabel(undefined)).toBe('Unknown');
  });
});

describe('tryPrettyJson', () => {
  it('formats valid JSON', () => {
    expect(tryPrettyJson('{"a":1}')).toEqual({ text: '{\n  "a": 1\n}', ok: true });
  });

  it('returns the input untouched when it is not JSON', () => {
    expect(tryPrettyJson('<html>')).toEqual({ text: '<html>', ok: false });
  });
});

describe('byteLength', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(byteLength('café')).toBe(5);
  });
});
