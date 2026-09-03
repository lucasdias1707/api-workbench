import { X } from 'lucide-react';
import { useWorkspace } from '@/state/workspace-store';

/** Open-request tabs, mirroring how a desktop client keeps several in flight. */
export function TabStrip() {
  const { state, dispatch } = useWorkspace();
  const tabs = state.openTabIds
    .map((id) => state.requests.find((request) => request.id === id))
    .filter((request): request is NonNullable<typeof request> => Boolean(request));

  if (tabs.length === 0) return <div className="tabstrip" />;

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
    </div>
  );
}
