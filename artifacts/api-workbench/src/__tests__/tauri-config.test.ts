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
describe('tauri window configuration', () => {
  const config = JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, '../../src-tauri/tauri.conf.json'), 'utf8'),
  ) as { app: { windows: Array<{ dragDropEnabled?: boolean }> } };

  it('leaves drag and drop to the webview, so the sidebar can reorder requests', () => {
    for (const window of config.app.windows) {
      expect(window.dragDropEnabled).toBe(false);
    }
  });
});
