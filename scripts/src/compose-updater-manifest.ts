/**
 * CLI wrapper around `buildManifest`, run by the desktop workflow after every
 * matrix job has published its bundles to the release.
 *
 * Usage:
 *   tsx src/compose-updater-manifest.ts <owner/repo> <version> <out-file>
 *
 * Reads the release's own asset list, so every URL in the manifest is one the
 * release actually serves. Tauri uploads each bundle's `.sig` alongside it, so
 * the signatures come from there too.
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildManifest, platformFor, type ReleaseAsset } from './updater-manifest.js';

const API = 'https://api.github.com';

export type ApiAsset = { name: string; browser_download_url: string; url: string };

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    accept: 'application/vnd.github+json',
    'user-agent': 'carom-updater-manifest',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export type ApiRelease = { assets: ApiAsset[]; body: string; tag_name?: string; draft?: boolean };

/**
 * Find the release for a tag, draft included.
 *
 * The build publishes as a draft so that nobody's updater sees a half-built
 * release, and a draft has no tag yet — GitHub creates the tag when the draft
 * is published, so `releases/tags/{tag}` answers 404 for one. The listing
 * endpoint does include drafts for an authenticated caller, and each carries
 * the `tag_name` it will get, so that is the fallback.
 */
export async function fetchRelease(
  repo: string,
  tag: string,
  send: typeof fetch = fetch,
): Promise<ApiRelease> {
  const byTag = await send(`${API}/repos/${repo}/releases/tags/${tag}`, { headers: headers() });
  if (byTag.ok) return (await byTag.json()) as ApiRelease;
  if (byTag.status !== 404) {
    throw new Error(`Could not read release ${tag}: HTTP ${byTag.status} ${await byTag.text()}`);
  }

  const listed = await send(`${API}/repos/${repo}/releases?per_page=100`, { headers: headers() });
  if (!listed.ok) {
    throw new Error(`Could not list releases: HTTP ${listed.status} ${await listed.text()}`);
  }
  const releases = (await listed.json()) as ApiRelease[];
  const draft = releases.find((release) => release.tag_name === tag);
  if (!draft) {
    throw new Error(
      `No release found for ${tag}, published or draft. The build jobs create it, so this means none of them got that far.`,
    );
  }
  return draft;
}

/**
 * A `.sig` is a short base64 blob. Fetching it through the API asset endpoint
 * rather than the browser URL keeps it working if the repository is private.
 */
async function fetchSignature(asset: ApiAsset): Promise<string> {
  const response = await fetch(asset.url, {
    headers: { ...headers(), accept: 'application/octet-stream' },
  });
  if (!response.ok) throw new Error(`Could not read ${asset.name}: HTTP ${response.status}`);
  return await response.text();
}

/**
 * The public download URL for each asset, built from the tag.
 *
 * Deliberately **not** `browser_download_url`. A draft release has no tag yet,
 * so GitHub answers with an `untagged-<hash>` path — and the composer now runs
 * against a draft on purpose. Those placeholder URLs stop working the moment
 * the release is published under its real tag, which is exactly when the
 * manifest starts being read: v0.4.1 shipped a manifest where all four URLs
 * 404ed, and nothing noticed because every platform key was present.
 *
 * The tag form is what the URL becomes once published, so it is correct for a
 * draft and a published release alike.
 */
export function toReleaseAssets(repo: string, tag: string, assets: ApiAsset[]): ReleaseAsset[] {
  return assets.map((asset) => ({
    name: asset.name,
    url: `https://github.com/${repo}/releases/download/${tag}/${asset.name}`,
  }));
}

async function main(): Promise<void> {
  const [repo, version, outFile] = process.argv.slice(2);
  if (!repo || !version || !outFile) {
    throw new Error('Usage: compose-updater-manifest <owner/repo> <version> <out-file>');
  }

  const tag = `v${version}`;
  const release = await fetchRelease(repo, tag);
  const assets: ReleaseAsset[] = toReleaseAssets(repo, tag, release.assets);

  const applicable = assets.filter((asset) => !asset.name.endsWith('.sig') && platformFor(asset.name));
  console.log(`Release ${tag} carries ${assets.length} assets; the updater can apply:`);
  for (const asset of applicable) console.log(`  ${asset.name} -> ${platformFor(asset.name)}`);

  // Only the ones that end up in the manifest need their signature fetched, but
  // the choice happens inside buildManifest, so collect them all up front.
  const signatures = new Map<string, string>();
  for (const asset of release.assets) {
    if (!asset.name.endsWith('.sig')) continue;
    const signs = asset.name.slice(0, -'.sig'.length);
    if (!platformFor(signs)) continue;
    signatures.set(signs, await fetchSignature(asset));
  }

  const manifest = buildManifest({
    version,
    notes: release.body?.trim() || `Carom ${tag}.`,
    assets,
    signatureFor: (name) => signatures.get(name),
  });

  writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${outFile} covering ${Object.keys(manifest.platforms).join(', ')}`);
}

// Importable for its tests without running the CLI: `fetchRelease` is the part
// that has to cope with a draft, and that is worth exercising without a network.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
