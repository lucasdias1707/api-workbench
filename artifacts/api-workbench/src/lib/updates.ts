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

/** What the top-bar badge should look like, or `null` for "show nothing". */
export type UpdateBadgeView = {
  /** Drives the colour: blue waiting, grey busy, green installed, red failed. */
  tone: 'available' | 'busy' | 'ready' | 'failed';
  /** The hover text. It has to say what clicking does, since the icon cannot. */
  label: string;
  /**
   * What the click does. The badge acts on the update itself rather than
   * sending anyone to Settings for a second click — Settings is still there,
   * behind the gear, for the notes and the preference.
   */
  action: 'download' | 'restart' | 'release-page' | 'none';
};

export type UpdateBadgeInput = {
  /**
   * False for a `.deb` or `.rpm`, where the files belong to the package
   * manager. Clicking has to lead somewhere useful rather than start a
   * download that the installer would refuse.
   */
  selfUpdating?: boolean;
  /** Set when a *download* failed, so the button that started it can say so. */
  downloadError?: string;
};

/**
 * Turn the update state into the badge.
 *
 * Pure and separate from the component because this is the part that decides
 * whether anyone ever learns a new version exists, and it is worth being able
 * to test each phase without a desktop shell to run it in.
 *
 * `idle`, `checking` and `current` show nothing: a bar that carries a
 * permanently dead icon teaches people to ignore it. A failed *check* shows
 * nothing either — it is reported in Settings, where it can be acted on, and a
 * badge there would promise a download that does not exist. A failed
 * *download* is the opposite: someone pressed this button and it did not work,
 * so it stays and says so.
 */
export function describeUpdateBadge(
  phase: string,
  update: { version: string } | null,
  progress: { received: number; total: number },
  input: UpdateBadgeInput = {},
): UpdateBadgeView | null {
  const selfUpdating = input.selfUpdating ?? true;

  if (phase === 'ready') {
    return {
      tone: 'ready',
      action: 'restart',
      label: update
        ? `Version ${update.version} is installed — click to restart and finish`
        : 'An update is installed — click to restart and finish',
    };
  }

  if (phase === 'downloading') {
    return {
      tone: 'busy',
      action: 'none',
      label: `Downloading — ${describeDownload(progress.received, progress.total)}`,
    };
  }

  if (phase === 'error' && input.downloadError) {
    return {
      tone: 'failed',
      // Retrying is the only useful thing left, and it is one click away.
      action: selfUpdating ? 'download' : 'release-page',
      label: `${input.downloadError} Click to try again.`,
    };
  }

  if (phase === 'available' && update) {
    if (!selfUpdating) {
      return {
        tone: 'available',
        action: 'release-page',
        label: `Version ${update.version} is available — click to open the release page. This copy was installed from a package, so it updates through your package manager.`,
      };
    }
    return {
      tone: 'available',
      action: 'download',
      label: `Version ${update.version} is available — click to download and install it`,
    };
  }

  return null;
}
