import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The sidebar moves requests between folders with HTML5 drag and drop, which
 * the desktop shell can silently take away — and JSON has nowhere to write
 * down why the setting is there, so it is written down here.
 *
 * Tauri installs an OS-level drag handler on the webview whenever
 * `dragDropEnabled` is true, which it is by default. On macOS that handler
 * intercepts *every* drag, not only files: wry's WKWebView subclass overrides
 * `draggingEntered:` and `performDragOperation:` unconditionally, and Tauri's
 * handler always answers "handled", so neither call ever reaches the web
 * content. The page sees the drag start and then nothing — no drop, no move.
 * Windows behaves the same way; the GTK backend only reacts to file drags, so
 * Linux never showed the bug.
 *
 * Turning the handler off gives the drags back to the page. Nothing is lost
 * with it off: the app has no feature that accepts files dropped onto the
 * window.
 */
const config = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../src-tauri/tauri.conf.json'), 'utf8'),
) as {
  app: { windows: Array<{ dragDropEnabled?: boolean }> };
  bundle: { createUpdaterArtifacts?: boolean };
  plugins: { updater: { endpoints: string[]; pubkey: string } };
};

describe('tauri window configuration', () => {
  it('leaves drag and drop to the webview, so the sidebar can reorder requests', () => {
    for (const window of config.app.windows) {
      expect(window.dragDropEnabled).toBe(false);
    }
  });
});

/**
 * The updater is the one feature whose configuration cannot be exercised from
 * a test run: it only does anything against a real signed release. These lock
 * down the parts that would otherwise fail silently in production.
 */
describe('updater configuration', () => {
  it('generates the signed bundles the updater downloads', () => {
    // Off by default. Without it a release carries installers and no updater
    // artifacts at all, and every app checking for updates finds nothing.
    expect(config.bundle.createUpdaterArtifacts).toBe(true);
  });

  it('reads the manifest from the latest release', () => {
    expect(config.plugins.updater.endpoints).toEqual([
      'https://github.com/lucasdias1707/api-workbench/releases/latest/download/latest.json',
    ]);
  });

  it('has a public key of the right shape, or the placeholder the release guard rejects', () => {
    // A real minisign public key is base64 and roughly this long. Accepting the
    // placeholder keeps pull requests green; the workflow refuses to publish
    // while it is still there.
    const { pubkey } = config.plugins.updater;
    if (pubkey === 'PUBKEY_NOT_SET') return;
    expect(pubkey).toMatch(/^[A-Za-z0-9+/=]{40,}$/);
  });
});
