import { describe, expect, it } from 'vitest';
import { isHealthPayload } from '@/hooks/use-proxy-health';

describe('isHealthPayload', () => {
  it('accepts the health response the server actually sends', () => {
    expect(isHealthPayload({ status: 'ok' })).toBe(true);
  });

  it('rejects a value parsed from something that is not our endpoint', () => {
    // A catch-all rewrite serves index.html; JSON.parse would have thrown, but
    // guard the shape anyway so a stray string or array never counts.
    expect(isHealthPayload('<!DOCTYPE html>')).toBe(false);
    expect(isHealthPayload([{ status: 'ok' }])).toBe(false);
  });

  it('rejects an unrelated JSON endpoint that happens to answer', () => {
    expect(isHealthPayload({ ok: true })).toBe(false);
    expect(isHealthPayload({ status: 'degraded' })).toBe(false);
  });

  it('rejects empty payloads', () => {
    expect(isHealthPayload(null)).toBe(false);
    expect(isHealthPayload(undefined)).toBe(false);
    expect(isHealthPayload({})).toBe(false);
  });
});
