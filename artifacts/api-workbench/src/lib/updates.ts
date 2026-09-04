import { formatBytes } from '@/lib/format';
import { isDesktop } from '@/lib/http';

/**
 * Self-updating from the GitHub releases.
 *
 * The plugin is imported lazily, the same way `lib/http.ts` loads the HTTP one,
 * so a web build never pulls in code that only exists inside the desktop shell.
 * Everything the UI needs goes through this module rather than the plugin, so
 * there is one place that knows the plugin exists.
 */

export const REPO_URL = 'https://github.com/lucasdias1707/carom-client-api';

/** How the running copy was installed. Mirrors the `install_kind` command. */
export type InstallKind = 'macos' | 'windows' | 'appimage' | 'linux-package' | 'web';

/**
 * `.deb` and `.rpm` belong to the package manager: the files are owned by it,
 * and an app that overwrote them would leave the system's own record of what is
 * installed pointing at something else. Those are told where to download
 * instead.
 */
export function canSelfUpdate(kind: InstallKind): boolean {
  return kind === 'macos' || kind === 'windows' || kind === 'appimage';
}

/** Where to send someone who has to update by hand. */
export function releasePageUrl(version?: string): string {
  return version ? `${REPO_URL}/releases/tag/v${version}` : `${REPO_URL}/releases/latest`;
}

/**
 * Progress text for the download.
 *
 * A server is free to answer without a `content-length`, and it does happen
 * behind proxies, so a total of zero has to read as honest progress rather than
 * "0%" or `NaN`.
 */
export function describeDownload(received: number, total: number): string {
  if (!Number.isFinite(total) || total <= 0) return `${formatBytes(received)} downloaded`;
  const percent = Math.min(100, Math.round((received / total) * 100));
  return `${formatBytes(received)} of ${formatBytes(total)} · ${percent}%`;
}

/** What the UI needs to know about an update that is waiting. */
export type AvailableUpdate = {
  version: string;
  currentVersion: string;
  /** Release notes, which for our releases is the body of the GitHub release. */
  notes: string;
  /** Download and swap in the update. Does not restart the app. */
  install: (onProgress: (received: number, total: number) => void) => Promise<void>;
};

export async function readInstallKind(): Promise<InstallKind> {
  if (!isDesktop()) return 'web';
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<InstallKind>('install_kind');
}

/**
 * Ask the release feed whether there is something newer. `null` means we are
 * current — the plugin compares versions itself against the manifest.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isDesktop()) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return null;

  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? '',
    install: async (onProgress) => {
      let received = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
          onProgress(0, total);
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength;
          onProgress(received, total);
        } else if (event.event === 'Finished') {
          onProgress(total || received, total);
        }
      });
    },
  };
}

/** Restart into the version that was just installed. */
export async function restartApp(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
