import { Download, RefreshCw, RotateCw } from 'lucide-react';
import { useUpdateCheck } from '@/hooks/use-update-check';
import { canSelfUpdate, describeDownload, releasePageUrl, restartApp } from '@/lib/updates';
import { useWorkspace } from '@/state/workspace-store';

/**
 * The Updates panel.
 *
 * Rendered only on the desktop, by its caller. The check runs by itself; the
 * download never does. A `.deb` or `.rpm` install gets the same check but a
 * link instead of a button, because those files belong to the package manager.
 */
export function UpdatesSection() {
  const { state, dispatch } = useWorkspace();
  const settings = state.settings;
  const updates = useUpdateCheck(settings.autoCheckUpdates);

  const selfUpdating = updates.installKind ? canSelfUpdate(updates.installKind) : true;

  return (
    <div>
      <div className="section-label">
        Updates
        <span className="spacer" />
        <button
          className="btn btn-sm"
          onClick={updates.check}
          disabled={updates.phase === 'checking' || updates.phase === 'downloading'}
          data-testid="button-check-updates"
        >
          <RefreshCw size={12} /> {updates.phase === 'checking' ? 'Checking…' : 'Check now'}
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          className="checkbox"
          checked={settings.autoCheckUpdates}
          onChange={(event) =>
            dispatch({ type: 'settings/update', patch: { autoCheckUpdates: event.target.checked } })
          }
          data-testid="checkbox-auto-check-updates"
        />
        Check for new versions when the app starts
      </label>

      <div style={{ marginTop: 10 }} data-testid="text-update-status">
        {updates.phase === 'current' ? <p className="hint">You are on the latest version.</p> : null}

        {updates.phase === 'error' ? (
          <p className="hint" style={{ color: 'var(--red)' }}>
            {updates.error}
          </p>
        ) : null}

        {updates.update && updates.phase !== 'ready' ? (
          <div className="stack" style={{ gap: 8 }}>
            <div>
              <strong>Version {updates.update.version}</strong>{' '}
              <span className="hint">is available — you have {updates.update.currentVersion}.</span>
            </div>

            {updates.update.notes ? (
              <pre className="update-notes">{updates.update.notes}</pre>
            ) : null}

            {selfUpdating ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  onClick={updates.download}
                  disabled={updates.phase === 'downloading'}
                  data-testid="button-download-update"
                >
                  <Download size={13} /> Download and install
                </button>
                {updates.phase === 'downloading' ? (
                  <span className="hint mono">
                    {describeDownload(updates.progress.received, updates.progress.total)}
                  </span>
                ) : null}
              </div>
            ) : (
              <>
                <a
                  className="btn"
                  href={releasePageUrl(updates.update.version)}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="link-release-page"
                >
                  <Download size={13} /> Open the release page
                </a>
                <p className="hint">
                  This copy was installed from a <code>.deb</code> or <code>.rpm</code>, so the files belong to
                  your package manager and the app must not overwrite them. Download the new package and install
                  it the way you installed this one.
                </p>
              </>
            )}
          </div>
        ) : null}

        {updates.phase === 'ready' ? (
          <div className="stack" style={{ gap: 8 }}>
            <p className="hint">
              Version {updates.update?.version} is installed. It takes effect when the app restarts.
            </p>
            <button className="btn btn-primary" onClick={() => void restartApp()} data-testid="button-restart-app">
              <RotateCw size={13} /> Restart now
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
