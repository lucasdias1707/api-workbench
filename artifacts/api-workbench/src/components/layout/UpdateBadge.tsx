import { AlertTriangle, Download, RotateCw } from 'lucide-react';
import { canSelfUpdate, describeUpdateBadge, releasePageUrl, restartApp } from '@/lib/updates';
import { useUpdates } from '@/state/update-store';

/**
 * The update affordance in the top bar.
 *
 * It does the work rather than pointing at it: one click downloads and
 * installs, the next restarts. Settings still holds the release notes and the
 * automatic-check preference, but nothing there is required to take an update.
 *
 * It only exists when there is something to do about it — no badge means no
 * update, so the bar does not carry a permanently dead icon. It is deliberately
 * the one coloured control up there: everything else is monochrome, so colour
 * alone is enough to draw the eye without a second element.
 *
 * What it says and does for each phase lives in `describeUpdateBadge`, which is
 * where that is tested.
 */
export function UpdateBadge() {
  const updates = useUpdates();

  const badge = describeUpdateBadge(updates.phase, updates.update, updates.progress, {
    selfUpdating: updates.installKind ? canSelfUpdate(updates.installKind) : true,
    downloadError: updates.error?.stage === 'download' ? updates.error.message : undefined,
  });
  if (!badge) return null;

  const icon =
    badge.tone === 'ready' ? <RotateCw size={15} /> : badge.tone === 'failed' ? <AlertTriangle size={15} /> : <Download size={15} />;

  // A package-managed install cannot swap its own files, so that one case is a
  // real link rather than a button pretending to be one.
  if (badge.action === 'release-page') {
    return (
      <a
        className={`icon-btn update-badge ${badge.tone}`}
        href={releasePageUrl(updates.update?.version)}
        target="_blank"
        rel="noreferrer"
        aria-label={badge.label}
        data-tooltip={badge.label}
        data-testid="button-update-badge"
      >
        {icon}
        <span className="update-dot" />
      </a>
    );
  }

  return (
    <button
      className={`icon-btn update-badge ${badge.tone}`}
      onClick={() => {
        if (badge.action === 'download') updates.download();
        else if (badge.action === 'restart') void restartApp();
      }}
      disabled={badge.action === 'none'}
      aria-label={badge.label}
      data-tooltip={badge.label}
      data-testid="button-update-badge"
    >
      {icon}
      {/* A dot rather than a number: there is only ever one update waiting. */}
      {badge.tone === 'busy' ? null : <span className="update-dot" />}
    </button>
  );
}
