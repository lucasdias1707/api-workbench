/**
 * Builds the `latest.json` that the desktop app reads to find updates.
 *
 * It exists as a separate step because `tauri-action` deletes and replaces any
 * release asset of the same name. With four matrix jobs publishing to one
 * release, each overwrites the previous job's manifest and only the last
 * platform survives — the updater would then work on one platform and quietly
 * fail on the other three. Composing it once, after every job has finished, is
 * the only way the file describes all four.
 */

/** Keys the updater looks itself up by. Fixed by the plugin, not by us. */
export type PlatformKey = 'darwin-aarch64' | 'darwin-x86_64' | 'linux-x86_64' | 'windows-x86_64';

export const REQUIRED_PLATFORMS: PlatformKey[] = [
  'darwin-aarch64',
  'darwin-x86_64',
  'linux-x86_64',
  'windows-x86_64',
];

/** A bundle produced by one matrix job, paired with its detached signature. */
export type SignedBundle = {
  /** File name as it appears on the release, e.g. `Carom_aarch64.app.tar.gz`. */
  assetName: string;
  /** Contents of the matching `.sig` file. */
  signature: string;
};

export type UpdaterManifest = {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
};

/**
 * Suffixes the updater can actually apply, and which platform each serves.
 *
 * Order is preference: Tauri signs several formats per platform, and Windows in
 * particular can produce both an NSIS installer and an MSI. The NSIS one wins
 * because it is what `installMode: passive` in tauri.conf.json configures.
 *
 * Deliberately absent: `.dmg` (how a person installs by hand — the updater
 * swaps the `.app` inside the tarball instead), and `.deb`/`.rpm`, which Tauri
 * also signs but which belong to the package manager. Matching those would
 * hand someone a file their platform cannot apply.
 */
const APPLIES: Array<{ suffix: string; key: PlatformKey | 'darwin-by-arch' }> = [
  { suffix: '.app.tar.gz', key: 'darwin-by-arch' },
  { suffix: '.AppImage.tar.gz', key: 'linux-x86_64' },
  { suffix: '.AppImage', key: 'linux-x86_64' },
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

export function downloadUrl(repoUrl: string, tag: string, assetName: string): string {
  return `${repoUrl.replace(/\/$/, '')}/releases/download/${tag}/${encodeURIComponent(assetName)}`;
}

export type ManifestInput = {
  version: string;
  tag: string;
  repoUrl: string;
  notes: string;
  bundles: SignedBundle[];
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
  const chosen = new Map<PlatformKey, SignedBundle>();

  for (const bundle of input.bundles) {
    const key = platformFor(bundle.assetName);
    if (!key) continue;
    const held = chosen.get(key);
    if (!held || preference(bundle.assetName) < preference(held.assetName)) {
      chosen.set(key, bundle);
    }
  }

  const missing = REQUIRED_PLATFORMS.filter((key) => !chosen.has(key));
  if (missing.length > 0) {
    throw new Error(
      `No signed bundle for ${missing.join(', ')}. Every platform must be present, or its users silently stop receiving updates.`,
    );
  }

  const platforms: UpdaterManifest['platforms'] = {};
  for (const key of REQUIRED_PLATFORMS) {
    const bundle = chosen.get(key) as SignedBundle;
    platforms[key] = {
      signature: bundle.signature.trim(),
      url: downloadUrl(input.repoUrl, input.tag, bundle.assetName),
    };
  }

  return {
    version: input.version,
    notes: input.notes,
    pub_date: (input.now ?? new Date()).toISOString(),
    platforms,
  };
}
