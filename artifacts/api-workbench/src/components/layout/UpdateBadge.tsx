import { Download, RotateCw } from 'lucide-react';
import { describeUpdateBadge } from '@/lib/updates';
import { useUpdates } from '@/state/update-store';

/**
 * The update affordance in the top bar.
 *
 * It only exists when there is something to do about it — no badge means no
 * update, so the bar does not carry a permanently dead icon. It is deliberately
 * the one coloured control up there: everything else is monochrome, so colour
 * alone is enough to draw the eye without a second element.
 *
 * What it says for each phase lives in `describeUpdateBadge`, which is where
 * that is tested.
 */
export function UpdateBadge({ onOpenSettings }: { onOpenSettings: () => void }) {
  const updates = useUpdates();
  const badge = describeUpdateBadge(updates.phase, updates.update, updates.progress);
  if (!badge) return null;

  return (
    <button
      className={`icon-btn update-badge ${badge.tone}`}
      onClick={onOpenSettings}
      aria-label={badge.label}
      data-tooltip={badge.label}
      data-testid="button-update-badge"
    >
      {badge.tone === 'ready' ? <RotateCw size={15} /> : <Download size={15} />}
      {/* A dot rather than a number: there is only ever one update waiting. */}
      {badge.tone === 'busy' ? null : <span className="update-dot" />}
    </button>
  );
}
