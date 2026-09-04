/**
 * Builds the `latest.json` that the desktop app reads to find updates.
 *
 * It exists as a separate step because `tauri-action` deletes and replaces any
 * release asset of the same name. With four matrix jobs publishing to one
 * release, each overwrites the previous job's manifest and only the last
 * platform survives — the updater would then work on one platform and quietly
 * fail on the other three. Composing it once, after every job has finished, is
 * the only way the file describes all four.
 *
 * It works from the release's own asset list rather than from the build
 * directory. The build directory is not the same set: the bundler also writes
 * a `.AppImage.tar.gz` that `tauri-action` does not upload, plus lowercase
 * copies of every bundle that collide case-insensitively inside a workflow
 * artifact zip. Naming any of those in the manifest produces a URL that 404s
 * for the platform it belongs to, on a file that otherwise looks complete.
 */

/** Keys the updater looks itself up by. Fixed by the plugin, not by us. */
export type PlatformKey = 'darwin-aarch64' | 'darwin-x86_64' | 'linux-x86_64' | 'windows-x86_64';

export const REQUIRED_PLATFORMS: PlatformKey[] = [
  'darwin-aarch64',
  'darwin-x86_64',
  'linux-x86_64',
  'windows-x86_64',
];

/** One file attached to the GitHub release. */
export type ReleaseAsset = { name: string; url: string };

export type UpdaterManifest = {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
};

/**
 * Suffixes the updater can apply, and which platform each serves.
 *
 * Order is preference. The bare `.AppImage` comes before the archived form
 * because that is the one that reaches the release. Windows can produce both
 * an NSIS installer and an MSI; NSIS wins, since `installMode: passive` in
 * tauri.conf.json configures that one.
 *
 * Deliberately absent: `.dmg` (how a person installs by hand — the updater
 * swaps the `.app` out of the tarball instead), and `.deb`/`.rpm`, which Tauri
 * also signs but which belong to the package manager. Naming those would hand
 * someone a file their platform cannot apply.
 */
const APPLIES: Array<{ suffix: string; key: PlatformKey | 'darwin-by-arch' }> = [
  { suffix: '.app.tar.gz', key: 'darwin-by-arch' },
  { suffix: '.AppImage', key: 'linux-x86_64' },
  { suffix: '.AppImage.tar.gz', key: 'linux-x86_64' },
  { suffix: '-setup.exe', key: 'windows-x86_64' },
  { suffix: '-setup.exe.zip', key: 'windows-x86_64' },
  { suffix: '.nsis.zip', key: 'windows-x86_64' },
  { suffix: '.msi', key: 'windows-x86_64' },
  { suffix: '.msi.zip', key: 'windows-x86_64' },
];

/** Which platform an asset updates, or `null` if the updater cannot apply it. */
export function platformFor(assetName: string): PlatformKey | null {
  const match = APPLIES.find((entry) => assetName.endsWith(entry.suffix));
  if (!match) return null;
  if (match.key !== 'darwin-by-arch') return match.key;
  // Both Macs produce a `.app.tar.gz`; only the name says which.
  if (assetName.includes('aarch64') || assetName.includes('arm64')) return 'darwin-aarch64';
  if (assetName.includes('x64') || assetName.includes('x86_64')) return 'darwin-x86_64';
  return null;
}

/** Lower wins when two assets serve the same platform. */
function preference(assetName: string): number {
  const index = APPLIES.findIndex((entry) => assetName.endsWith(entry.suffix));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export type ManifestInput = {
  version: string;
  notes: string;
  /** Everything attached to the release, including the `.sig` files. */
  assets: ReleaseAsset[];
  /** The detached signature for an asset, by that asset's exact name. */
  signatureFor: (assetName: string) => string | undefined;
  /** Injected so the output is reproducible in tests. */
  now?: Date;
};

/**
 * Compose the manifest, or throw naming what is missing.
 *
 * Refusing to emit a partial file is the point: a manifest listing three
 * platforms is indistinguishable, to the fourth platform's users, from having
 * no update at all, and it would ship without anyone noticing.
 */
export function buildManifest(input: ManifestInput): UpdaterManifest {
  const chosen = new Map<PlatformKey, ReleaseAsset>();

  for (const asset of input.assets) {
    if (asset.name.endsWith('.sig')) continue;
    const key = platformFor(asset.name);
    if (!key) continue;
    const held = chosen.get(key);
    if (!held || preference(asset.name) < preference(held.name)) chosen.set(key, asset);
  }

  const missing = REQUIRED_PLATFORMS.filter((key) => !chosen.has(key));
  if (missing.length > 0) {
    throw new Error(
      `The release has no bundle for ${missing.join(', ')}. Every platform must be present, or its users silently stop receiving updates.`,
    );
  }

  const platforms: UpdaterManifest['platforms'] = {};
  const unsigned: string[] = [];

  for (const key of REQUIRED_PLATFORMS) {
    const asset = chosen.get(key) as ReleaseAsset;
    const signature = input.signatureFor(asset.name);
    if (!signature) {
      unsigned.push(asset.name);
      continue;
    }
    platforms[key] = { signature: signature.trim(), url: asset.url };
  }

  if (unsigned.length > 0) {
    throw new Error(
      `No signature published for ${unsigned.join(', ')}. The updater rejects anything it cannot verify, so an unsigned entry is a dead one.`,
    );
  }

  return {
    version: input.version,
    notes: input.notes,
    pub_date: (input.now ?? new Date()).toISOString(),
    platforms,
  };
}
