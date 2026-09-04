/**
 * CLI wrapper around `buildManifest`, run by the desktop workflow after every
 * matrix job has finished.
 *
 * Usage:
 *   tsx src/compose-updater-manifest.ts <bundles-dir> <version> <repo-url> <out-file>
 *
 * `bundles-dir` is where the four jobs' artifacts were downloaded. Every `.sig`
 * found under it is paired with the file it signs, which is the same path
 * without the suffix.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { buildManifest, platformFor, type SignedBundle } from './updater-manifest.js';

function findSignatures(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.sig')) found.push(path);
    }
  };
  walk(root);
  return found;
}

function main(): void {
  const [bundlesDir, version, repoUrl, outFile] = process.argv.slice(2);
  if (!bundlesDir || !version || !repoUrl || !outFile) {
    throw new Error('Usage: compose-updater-manifest <bundles-dir> <version> <repo-url> <out-file>');
  }

  const bundles: SignedBundle[] = [];
  for (const sigPath of findSignatures(bundlesDir)) {
    // The signature file is the bundle's name plus `.sig`.
    const assetName = basename(sigPath).replace(/\.sig$/, '');
    if (!platformFor(assetName)) continue;
    bundles.push({ assetName, signature: readFileSync(sigPath, 'utf8') });
  }

  console.log(`Signed updater bundles found: ${bundles.map((b) => b.assetName).join(', ') || 'none'}`);

  const manifest = buildManifest({
    version,
    tag: `v${version}`,
    repoUrl,
    notes: `Carom v${version}. See the release page for what changed.`,
    bundles,
  });

  writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${outFile} covering ${Object.keys(manifest.platforms).join(', ')}`);
}

main();
