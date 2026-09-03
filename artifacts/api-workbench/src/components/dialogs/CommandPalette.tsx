import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { useWorkspace } from '@/state/workspace-store';
import { folderPath } from '@/state/selectors';

export type Command = {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
};

type CommandPaletteProps = {
  commands: Command[];
  onClose: () => void;
};

/** ⌘K launcher: fuzzy-ish search over actions and every request in the workspace. */
export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const { state, dispatch } = useWorkspace();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<Command[]>(() => {
    const requestCommands = state.requests
      .filter((request) => request.workspaceId === state.activeWorkspaceId)
      .map<Command>((request) => ({
        id: `open-${request.id}`,
        label: request.name,
        hint: [...folderPath(state, request.folderId), request.method].join(' · '),
        run: () => dispatch({ type: 'request/open', id: request.id }),
      }));
    const all = [...commands, ...requestCommands];
    const term = query.trim().toLowerCase();
    if (!term) return all.slice(0, 40);
    return all
      .filter((entry) => `${entry.label} ${entry.hint ?? ''}`.toLowerCase().includes(term))
      .slice(0, 40);
  }, [commands, dispatch, query, state]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    command.run();
    onClose();
  };

  return (
    <div
      className="overlay top"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog palette" role="dialog" aria-modal="true" aria-label="Command palette" data-testid="dialog-command-palette">
        <input
          className="palette-input"
          value={query}
          autoFocus
          placeholder="Search requests and actions…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIndex((current) => Math.min(current + 1, entries.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              run(entries[index]);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          aria-label="Search commands"
          data-testid="input-command-palette"
        />
        <div className="palette-list" ref={listRef}>
          {entries.length === 0 ? (
            <div className="tree-empty">No matches.</div>
          ) : (
            entries.map((entry, entryIndex) => (
              <button
                key={entry.id}
                className={`palette-item ${entryIndex === index ? 'active' : ''}`}
                onMouseEnter={() => setIndex(entryIndex)}
                onClick={() => run(entry)}
                data-testid={`palette-item-${entry.id}`}
              >
                {entry.icon}
                <span className="truncate">{entry.label}</span>
                <span className="spacer" />
                {entry.hint ? <span className="tree-count">{entry.hint}</span> : null}
                {entryIndex === index ? <CornerDownLeft size={12} /> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
