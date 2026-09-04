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
import { buildManifest, platformFor, type ReleaseAsset } from './updater-manifest.js';

const API = 'https://api.github.com';

type ApiAsset = { name: string; browser_download_url: string; url: string };

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    accept: 'application/vnd.github+json',
    'user-agent': 'carom-updater-manifest',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchRelease(repo: string, tag: string): Promise<{ assets: ApiAsset[]; body: string }> {
  const response = await fetch(`${API}/repos/${repo}/releases/tags/${tag}`, { headers: headers() });
  if (!response.ok) {
    throw new Error(`Could not read release ${tag}: HTTP ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as { assets: ApiAsset[]; body: string };
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

async function main(): Promise<void> {
  const [repo, version, outFile] = process.argv.slice(2);
  if (!repo || !version || !outFile) {
    throw new Error('Usage: compose-updater-manifest <owner/repo> <version> <out-file>');
  }

  const tag = `v${version}`;
  const release = await fetchRelease(repo, tag);
  const assets: ReleaseAsset[] = release.assets.map((asset) => ({
    name: asset.name,
    url: asset.browser_download_url,
  }));

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

await main();
