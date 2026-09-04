import { describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '@/lib/sidebar';

describe('clampSidebarWidth', () => {
  it('keeps a width that is already sensible', () => {
    expect(clampSidebarWidth(300)).toBe(300);
  });

  it('stops the sidebar shrinking past the point where a row still reads', () => {
    expect(clampSidebarWidth(40)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(-500)).toBe(MIN_SIDEBAR_WIDTH);
  });

  it('stops it eating the pane the work actually happens in', () => {
    expect(clampSidebarWidth(2000)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it('rounds, since a fractional pixel in a grid template blurs the seam', () => {
    expect(clampSidebarWidth(300.6)).toBe(301);
  });

  it('falls back to the default for a value that is not a number', () => {
    // Settings come back from localStorage, where a hand-edited or truncated
    // payload can carry anything — and NaN in a grid template silently
    // collapses the column to nothing.
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(undefined as unknown as number)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it('has a default that sits inside its own range', () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBeGreaterThanOrEqual(MIN_SIDEBAR_WIDTH);
    expect(DEFAULT_SIDEBAR_WIDTH).toBeLessThanOrEqual(MAX_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });
});
