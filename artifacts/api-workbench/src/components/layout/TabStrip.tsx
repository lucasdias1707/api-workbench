import { useState } from 'react';
import { X, XCircle } from 'lucide-react';
import { ContextMenu, type MenuEntry } from '@/components/common/ContextMenu';
import { useWorkspace } from '@/state/workspace-store';

/** Open-request tabs, mirroring how a desktop client keeps several in flight. */
export function TabStrip() {
  const { state, dispatch } = useWorkspace();
  const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);
  const tabs = state.openTabIds
    .map((id) => state.requests.find((request) => request.id === id))
    .filter((request): request is NonNullable<typeof request> => Boolean(request));

  if (tabs.length === 0) return <div className="tabstrip" />;

  /**
   * Right-click a tab, act on that tab. "Close others" keeps the one that was
   * right-clicked, not the one that happens to be focused — otherwise the menu
   * would act on something the pointer is nowhere near.
   */
  const tabMenu = (id: string): MenuEntry[] => [
    { kind: 'item', label: 'Close', icon: <X size={13} />, onSelect: () => dispatch({ type: 'request/close-tab', id }) },
    {
      kind: 'item',
      label: 'Close others',
      icon: <XCircle size={13} />,
      onSelect: () => dispatch({ type: 'request/close-other-tabs', id }),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Close all',
      icon: <XCircle size={13} />,
      onSelect: () => dispatch({ type: 'request/close-all-tabs' }),
    },
  ];

  return (
    <div className="tabstrip" role="tablist" aria-label="Open requests">
      {tabs.map((request) => {
        const active = request.id === state.activeRequestId;
        return (
          <div
            key={request.id}
            className={`tab ${active ? 'active' : ''}`}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => dispatch({ type: 'request/open', id: request.id })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                dispatch({ type: 'request/open', id: request.id });
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenu({ x: event.clientX, y: event.clientY, entries: tabMenu(request.id) });
            }}
            onAuxClick={(event) => {
              // Middle click closes, as in a browser.
              if (event.button === 1) dispatch({ type: 'request/close-tab', id: request.id });
            }}
            data-testid={`tab-${request.id}`}
          >
            <span className={`tab-method m-${request.method.toLowerCase()}`}>{request.method}</span>
            <span className="truncate">{request.name}</span>
            <button
              className="tab-close"
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: 'request/close-tab', id: request.id });
              }}
              aria-label={`Close ${request.name}`}
              data-testid={`button-close-tab-${request.id}`}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
      {menu ? <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
