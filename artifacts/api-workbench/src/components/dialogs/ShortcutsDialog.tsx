import { Dialog } from '@/components/common/Dialog';
import { MOD_LABEL } from '@/hooks/use-hotkeys';

const SHORTCUTS: Array<[string, string]> = [
  [`${MOD_LABEL} K`, 'Open the command palette'],
  [`${MOD_LABEL} Enter`, 'Send the active request'],
  [`${MOD_LABEL} N`, 'New request'],
  [`${MOD_LABEL} W`, 'Close the active tab'],
  [`${MOD_LABEL} E`, 'Edit environments'],
  [`${MOD_LABEL} B`, 'Show or hide the sidebar'],
  [`${MOD_LABEL} ,`, 'Open settings'],
  ['Enter', 'Send, while the URL field has focus'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} testId="dialog-shortcuts">
      <div style={{ display: 'grid', gap: 8 }}>
        {SHORTCUTS.map(([keys, description]) => (
          <div key={keys} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="kbd" style={{ minWidth: 82, justifyContent: 'center' }}>
              {keys}
            </span>
            <span>{description}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
