import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type MenuEntry =
  | { kind: 'item'; label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void }
  | { kind: 'separator' };

type ContextMenuProps = {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
};

/** Small floating menu positioned at a point, kept inside the viewport. */
export function ContextMenu({ x, y, entries, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition({
      left: Math.min(x, window.innerWidth - rect.width - 8),
      top: Math.min(y, window.innerHeight - rect.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const dismiss = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="menu"
      ref={ref}
      style={position}
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
      data-testid="context-menu"
    >
      {entries.map((entry, index) =>
        entry.kind === 'separator' ? (
          <div className="menu-sep" key={`sep-${index}`} />
        ) : (
          <button
            key={entry.label}
            className={`menu-item ${entry.danger ? 'danger' : ''}`}
            role="menuitem"
            onClick={() => {
              entry.onSelect();
              onClose();
            }}
          >
            {entry.icon}
            {entry.label}
          </button>
        ),
      )}
    </div>
  );
}
