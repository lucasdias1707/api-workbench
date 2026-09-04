import { describe, expect, it } from 'vitest';
import { fetchRelease } from '../compose-updater-manifest.js';
import {
  buildManifest,
  platformFor,
  REQUIRED_PLATFORMS,
  type ReleaseAsset,
} from '../updater-manifest.js';

const REPO = 'https://github.com/lucasdias1707/carom-client-api';
const download = (name: string) => `${REPO}/releases/download/v0.3.0/${name}`;

/**
 * The bundles a release carries, with the names observed coming out of CI:
 * macOS drops the version from the tarball name, and Linux ships the AppImage
 * itself — the `.AppImage.tar.gz` the bundler also writes never reaches the
 * release.
 */
function releaseAssets(): ReleaseAsset[] {
  return [
    'Carom_aarch64.app.tar.gz',
    'Carom_x64.app.tar.gz',
    'Carom_0.3.0_amd64.AppImage',
    'Carom_0.3.0_x64-setup.exe',
  ].map((name) => ({ name, url: download(name) }));
}

const signed = (names: string[]) => (name: string) =>
  names.includes(name) ? `sig-for-${name}\n` : undefined;

const allSigned = (assets: ReleaseAsset[]) => signed(assets.map((asset) => asset.name));

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
    for (const name of [
      'Carom_0.3.0_aarch64.dmg',
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

describe('buildManifest', () => {
  const base = {
    version: '0.3.0',
    notes: 'Fixes drag and drop.',
    now: new Date('2026-09-04T12:00:00.000Z'),
  };

  it('lists all four platforms, pointing at the release assets themselves', () => {
    const assets = releaseAssets();
    const manifest = buildManifest({ ...base, assets, signatureFor: allSigned(assets) });

    expect(Object.keys(manifest.platforms).sort()).toEqual([...REQUIRED_PLATFORMS].sort());
    expect(manifest.platforms['darwin-aarch64']).toEqual({
      signature: 'sig-for-Carom_aarch64.app.tar.gz',
      url: download('Carom_aarch64.app.tar.gz'),
    });
    expect(manifest.version).toBe('0.3.0');
    expect(manifest.pub_date).toBe('2026-09-04T12:00:00.000Z');
  });

  it('drops the dmg, deb and rpm that sit in the same release', () => {
    const assets = [
      ...releaseAssets(),
      { name: 'Carom_0.3.0_aarch64.dmg', url: download('Carom_0.3.0_aarch64.dmg') },
      { name: 'Carom_0.3.0_amd64.deb', url: download('Carom_0.3.0_amd64.deb') },
      { name: 'Carom-0.3.0-1.x86_64.rpm', url: download('Carom-0.3.0-1.x86_64.rpm') },
    ];
    const manifest = buildManifest({ ...base, assets, signatureFor: allSigned(assets) });
    expect(Object.keys(manifest.platforms)).toHaveLength(4);
  });

  it('never treats a .sig as a bundle of its own', () => {
    const assets = [
      ...releaseAssets(),
      { name: 'Carom_0.3.0_amd64.AppImage.sig', url: download('Carom_0.3.0_amd64.AppImage.sig') },
    ];
    const manifest = buildManifest({ ...base, assets, signatureFor: allSigned(releaseAssets()) });
    expect(manifest.platforms['linux-x86_64'].url).toBe(download('Carom_0.3.0_amd64.AppImage'));
  });

  it('prefers the bare AppImage, which is the one the release actually serves', () => {
    // The bundler writes a .AppImage.tar.gz too, but tauri-action does not
    // upload it. Naming it here produced a manifest that 404s on Linux.
    const assets = [
      ...releaseAssets(),
      {
        name: 'Carom_0.3.0_amd64.AppImage.tar.gz',
        url: download('Carom_0.3.0_amd64.AppImage.tar.gz'),
      },
    ];
    const manifest = buildManifest({ ...base, assets, signatureFor: allSigned(assets) });
    expect(manifest.platforms['linux-x86_64'].url).toBe(download('Carom_0.3.0_amd64.AppImage'));
  });

  it('prefers the NSIS installer when Windows produced an MSI as well', () => {
    const assets = [
      ...releaseAssets(),
      { name: 'Carom_0.3.0_x64.msi', url: download('Carom_0.3.0_x64.msi') },
    ];
    const manifest = buildManifest({ ...base, assets, signatureFor: allSigned(assets) });
    expect(manifest.platforms['windows-x86_64'].url).toBe(download('Carom_0.3.0_x64-setup.exe'));
  });

  it('picks the same winner regardless of the order the assets came back in', () => {
    const assets = [
      { name: 'Carom_0.3.0_x64.msi', url: download('Carom_0.3.0_x64.msi') },
      ...releaseAssets(),
    ];
    const manifest = buildManifest({ ...base, assets, signatureFor: allSigned(assets) });
    expect(manifest.platforms['windows-x86_64'].url).toBe(download('Carom_0.3.0_x64-setup.exe'));
  });

  it('refuses to emit a manifest missing a platform, naming which', () => {
    const assets = releaseAssets().filter((asset) => !asset.name.includes('setup.exe'));
    expect(() => buildManifest({ ...base, assets, signatureFor: allSigned(assets) })).toThrow(
      /windows-x86_64/,
    );
  });

  it('names every missing platform, not just the first', () => {
    expect(() => buildManifest({ ...base, assets: [], signatureFor: () => undefined })).toThrow(
      /darwin-aarch64.*darwin-x86_64.*linux-x86_64.*windows-x86_64/,
    );
  });

  it('refuses an entry whose signature was never published', () => {
    // The updater rejects what it cannot verify, so an unsigned entry is dead
    // weight that looks alive.
    const assets = releaseAssets();
    const withoutLinux = assets.filter((a) => !a.name.endsWith('.AppImage')).map((a) => a.name);
    expect(() => buildManifest({ ...base, assets, signatureFor: signed(withoutLinux) })).toThrow(
      /Carom_0\.3\.0_amd64\.AppImage/,
    );
  });

  it('trims the trailing newline a .sig file carries', () => {
    const assets = releaseAssets();
    const manifest = buildManifest({ ...base, assets, signatureFor: allSigned(assets) });
    expect(manifest.platforms['linux-x86_64'].signature).toBe('sig-for-Carom_0.3.0_amd64.AppImage');
  });
});

describe('finding the release, draft included', () => {
  const asRelease = (tag: string, draft: boolean) => ({
    tag_name: tag,
    draft,
    body: 'notes',
    assets: [],
  });

  const respond = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

  it('uses the tag endpoint when the release is already published', async () => {
    const calls: string[] = [];
    const send = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return respond(200, asRelease('v1.0.0', false));
    }) as unknown as typeof fetch;

    const release = await fetchRelease('owner/repo', 'v1.0.0', send);
    expect(release.tag_name).toBe('v1.0.0');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/releases/tags/v1.0.0');
  });

  it('falls back to the listing for a draft, which has no tag yet', async () => {
    // A draft release is what the build produces until the manifest is
    // attached, and GitHub creates its tag only when it is published — so
    // `releases/tags/...` answers 404 for exactly the release we need.
    const send = (async (url: string | URL | Request) => {
      if (String(url).includes('/releases/tags/')) return respond(404, { message: 'Not Found' });
      return respond(200, [asRelease('v0.9.0', false), asRelease('v1.0.0', true)]);
    }) as unknown as typeof fetch;

    const release = await fetchRelease('owner/repo', 'v1.0.0', send);
    expect(release).toMatchObject({ tag_name: 'v1.0.0', draft: true });
  });

  it('reports a genuine API failure rather than falling back to the listing', async () => {
    const send = (async () => respond(500, { message: 'boom' })) as unknown as typeof fetch;
    await expect(fetchRelease('owner/repo', 'v1.0.0', send)).rejects.toThrow(/HTTP 500/);
  });

  it('says plainly when no release exists for the tag at all', async () => {
    const send = (async (url: string | URL | Request) =>
      String(url).includes('/releases/tags/') ? respond(404, {}) : respond(200, [])) as unknown as typeof fetch;
    await expect(fetchRelease('owner/repo', 'v1.0.0', send)).rejects.toThrow(/No release found for v1.0.0/);
  });
});
