import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  downloadUrl,
  platformFor,
  REQUIRED_PLATFORMS,
  type SignedBundle,
} from '../updater-manifest.js';

const REPO = 'https://github.com/lucasdias1707/api-workbench';

/**
 * The four bundles a release carries.
 *
 * The macOS and Linux names are the ones observed coming out of the bundler and
 * out of the v0.1.2 release, not invented: macOS drops the version from the
 * tarball name, and Linux ships the AppImage itself rather than an archive of
 * one.
 */
function completeBundles(): SignedBundle[] {
  return [
    { assetName: 'Carom_aarch64.app.tar.gz', signature: 'sig-mac-arm' },
    { assetName: 'Carom_x64.app.tar.gz', signature: 'sig-mac-intel' },
    { assetName: 'Carom_0.3.0_amd64.AppImage', signature: 'sig-linux' },
    { assetName: 'Carom_0.3.0_x64-setup.exe', signature: 'sig-windows' },
  ];
}

describe('platformFor', () => {
  it('maps each updater bundle to the key the plugin looks up', () => {
    expect(platformFor('Carom_aarch64.app.tar.gz')).toBe('darwin-aarch64');
    expect(platformFor('Carom_x64.app.tar.gz')).toBe('darwin-x86_64');
    expect(platformFor('Carom_0.3.0_amd64.AppImage')).toBe('linux-x86_64');
    expect(platformFor('Carom_0.3.0_x64-setup.exe')).toBe('windows-x86_64');
  });

  it('also accepts the archived forms of the same bundles', () => {
    expect(platformFor('Carom_0.3.0_amd64.AppImage.tar.gz')).toBe('linux-x86_64');
    expect(platformFor('Carom_0.3.0_x64-setup.nsis.zip')).toBe('windows-x86_64');
    expect(platformFor('Carom_0.3.0_x64.msi')).toBe('windows-x86_64');
  });

  it('ignores the formats the updater cannot apply', () => {
    // .dmg is how a person installs by hand; the updater swaps the .app inside
    // the tarball. Tauri signs .deb and .rpm too, but they belong to the
    // package manager and handing one to the updater would strand the install.
    for (const name of [
      'Carom_0.3.0_aarch64.dmg',
      'Carom_0.3.0_x64.dmg',
      'Carom_0.3.0_amd64.deb',
      'Carom-0.3.0-1.x86_64.rpm',
      'latest.json',
    ]) {
      expect(platformFor(name)).toBeNull();
    }
  });

  it('does not guess an architecture it cannot see in the name', () => {
    expect(platformFor('Carom.app.tar.gz')).toBeNull();
  });
});

describe('downloadUrl', () => {
  it('points at the release asset for the tag', () => {
    expect(downloadUrl(REPO, 'v0.3.0', 'Carom_aarch64.app.tar.gz')).toBe(
      `${REPO}/releases/download/v0.3.0/Carom_aarch64.app.tar.gz`,
    );
  });

  it('tolerates a trailing slash on the repository URL', () => {
    expect(downloadUrl(`${REPO}/`, 'v0.3.0', 'a.app.tar.gz')).toBe(
      `${REPO}/releases/download/v0.3.0/a.app.tar.gz`,
    );
  });

  it('escapes a name that would otherwise break the URL', () => {
    expect(downloadUrl(REPO, 'v0.3.0', 'Carom x64.app.tar.gz')).toContain('Carom%20x64.app.tar.gz');
  });
});

describe('buildManifest', () => {
  const input = {
    version: '0.3.0',
    tag: 'v0.3.0',
    repoUrl: REPO,
    notes: 'Fixes drag and drop.',
    now: new Date('2026-09-04T12:00:00.000Z'),
  };

  it('lists all four platforms with their signatures and URLs', () => {
    const manifest = buildManifest({ ...input, bundles: completeBundles() });
    expect(Object.keys(manifest.platforms).sort()).toEqual([...REQUIRED_PLATFORMS].sort());
    expect(manifest.platforms['darwin-aarch64']).toEqual({
      signature: 'sig-mac-arm',
      url: `${REPO}/releases/download/v0.3.0/Carom_aarch64.app.tar.gz`,
    });
    expect(manifest.version).toBe('0.3.0');
    expect(manifest.notes).toBe('Fixes drag and drop.');
    expect(manifest.pub_date).toBe('2026-09-04T12:00:00.000Z');
  });

  it('drops the dmg, deb and rpm that sit in the same release', () => {
    // Tauri signs those too, so they arrive with a .sig alongside the rest.
    const manifest = buildManifest({
      ...input,
      bundles: [
        ...completeBundles(),
        { assetName: 'Carom_0.3.0_aarch64.dmg', signature: 'ignored' },
        { assetName: 'Carom_0.3.0_amd64.deb', signature: 'ignored' },
        { assetName: 'Carom-0.3.0-1.x86_64.rpm', signature: 'ignored' },
      ],
    });
    expect(Object.keys(manifest.platforms)).toHaveLength(4);
    expect(manifest.platforms['linux-x86_64'].signature).toBe('sig-linux');
  });

  it('prefers the NSIS installer when Windows produced an MSI as well', () => {
    // installMode: passive in tauri.conf.json configures the NSIS one.
    const manifest = buildManifest({
      ...input,
      bundles: [...completeBundles(), { assetName: 'Carom_0.3.0_x64.msi', signature: 'sig-msi' }],
    });
    expect(manifest.platforms['windows-x86_64'].signature).toBe('sig-windows');
  });

  it('picks the same winner regardless of the order the files were found in', () => {
    const bundles = [{ assetName: 'Carom_0.3.0_x64.msi', signature: 'sig-msi' }, ...completeBundles()];
    const manifest = buildManifest({ ...input, bundles });
    expect(manifest.platforms['windows-x86_64'].signature).toBe('sig-windows');
  });

  it('refuses to emit a manifest missing a platform, naming which', () => {
    // A three-platform manifest looks, to the fourth platform's users, exactly
    // like having no update at all — it has to be loud.
    const bundles = completeBundles().filter((b) => !b.assetName.includes('setup.exe'));
    expect(() => buildManifest({ ...input, bundles })).toThrow(/windows-x86_64/);
  });

  it('names every missing platform, not just the first', () => {
    expect(() => buildManifest({ ...input, bundles: [] })).toThrow(
      /darwin-aarch64.*darwin-x86_64.*linux-x86_64.*windows-x86_64/,
    );
  });

  it('trims the trailing newline a .sig file carries', () => {
    const bundles = completeBundles().map((bundle) => ({ ...bundle, signature: `${bundle.signature}\n` }));
    const manifest = buildManifest({ ...input, bundles });
    expect(manifest.platforms['linux-x86_64'].signature).toBe('sig-linux');
  });
});
