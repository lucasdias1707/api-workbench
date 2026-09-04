import { describe, expect, it } from 'vitest';
import { canSelfUpdate, describeDownload, releasePageUrl, type InstallKind } from '@/lib/updates';

describe('canSelfUpdate', () => {
  it('allows the formats that can replace their own files', () => {
    for (const kind of ['macos', 'windows', 'appimage'] as InstallKind[]) {
      expect(canSelfUpdate(kind)).toBe(true);
    }
  });

  it('refuses a package-manager install', () => {
    // The files belong to dpkg or rpm; overwriting them would leave the
    // system's record of what is installed pointing at something else.
    expect(canSelfUpdate('linux-package')).toBe(false);
  });

  it('refuses the web build, which has nothing to replace', () => {
    expect(canSelfUpdate('web')).toBe(false);
  });
});

describe('releasePageUrl', () => {
  it('points at a specific tag when a version is known', () => {
    expect(releasePageUrl('0.3.0')).toBe(
      'https://github.com/lucasdias1707/carom-client-api/releases/tag/v0.3.0',
    );
  });

  it('falls back to the latest release when it is not', () => {
    expect(releasePageUrl()).toBe('https://github.com/lucasdias1707/carom-client-api/releases/latest');
  });
});

describe('describeDownload', () => {
  it('reports progress against a known total', () => {
    expect(describeDownload(512 * 1024, 1024 * 1024)).toBe('512.0 KB of 1.00 MB · 50%');
  });

  it('reports what has arrived when the server sent no length', () => {
    // A proxy stripping content-length is not an error, and it must not read
    // as "0%" or NaN.
    expect(describeDownload(2 * 1024 * 1024, 0)).toBe('2.00 MB downloaded');
    expect(describeDownload(1024, Number.NaN)).toBe('1.0 KB downloaded');
  });

  it('does not exceed 100% when the total was understated', () => {
    expect(describeDownload(200, 100)).toBe('200 B of 100 B · 100%');
  });

  it('starts at zero rather than empty', () => {
    expect(describeDownload(0, 1024)).toBe('0 B of 1.0 KB · 0%');
  });
});
