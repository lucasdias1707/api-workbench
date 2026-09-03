import { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { useToast } from '@/components/common/Toaster';
import { createSeedState } from '@/lib/seed';
import { useWorkspace } from '@/state/workspace-store';
import type { PaneLayout, SendMode, ThemeName, WorkspaceState } from '@/types';
import type { ProxyStatus } from '@/hooks/use-proxy-health';

const PROXY_COPY: Record<ProxyStatus, string> = {
  checking: 'Checking whether the companion server is running…',
  available: 'The companion server is running, so requests can bypass browser CORS like a desktop client.',
  unavailable: 'The companion server is not reachable, so requests are sent straight from the browser and are subject to CORS.',
};

export function SettingsDialog({ onClose, proxyStatus }: { onClose: () => void; proxyStatus: ProxyStatus }) {
  const { state, dispatch } = useWorkspace();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const settings = state.settings;

  const exportWorkspace = () => {
    const payload = JSON.stringify({ ...state, responses: [] }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'api-workbench-workspace.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importWorkspace = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as WorkspaceState;
      if (!Array.isArray(parsed.requests) || !Array.isArray(parsed.environments)) {
        throw new Error('That file is not an API Workbench export.');
      }
      dispatch({ type: 'state/replace', state: { ...parsed, responses: parsed.responses ?? [] } });
      toast({ title: 'Workspace imported', description: `${parsed.requests.length} requests loaded.`, kind: 'success' });
      onClose();
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : undefined,
        kind: 'error',
      });
    }
  };

  return (
    <Dialog title="Settings" onClose={onClose} testId="dialog-settings" footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="stack" style={{ gap: 16 }}>
        <label className="stack" style={{ gap: 6 }}>
          <span className="section-label" style={{ margin: 0 }}>Theme</span>
          <select
            className="select"
            value={settings.theme}
            onChange={(event) => dispatch({ type: 'settings/update', patch: { theme: event.target.value as ThemeName } })}
            data-testid="select-theme"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">Match system</option>
          </select>
        </label>

        <label className="stack" style={{ gap: 6 }}>
          <span className="section-label" style={{ margin: 0 }}>Pane layout</span>
          <select
            className="select"
            value={settings.layout}
            onChange={(event) => dispatch({ type: 'settings/update', patch: { layout: event.target.value as PaneLayout } })}
            data-testid="select-layout"
          >
            <option value="horizontal">Side by side</option>
            <option value="vertical">Stacked</option>
          </select>
        </label>

        <label className="stack" style={{ gap: 6 }}>
          <span className="section-label" style={{ margin: 0 }}>Send requests through</span>
          <select
            className="select"
            value={settings.sendMode}
            onChange={(event) => dispatch({ type: 'settings/update', patch: { sendMode: event.target.value as SendMode } })}
            data-testid="select-send-mode"
          >
            <option value="auto">Auto — server when available</option>
            <option value="proxy">Companion server only</option>
            <option value="browser">Browser only</option>
          </select>
          <span className="hint">{PROXY_COPY[proxyStatus]}</span>
        </label>

        <label className="stack" style={{ gap: 6 }}>
          <span className="section-label" style={{ margin: 0 }}>Timeout (seconds)</span>
          <input
            className="field"
            type="number"
            min={1}
            max={300}
            value={Math.round(settings.timeoutMs / 1000)}
            onChange={(event) =>
              dispatch({ type: 'settings/update', patch: { timeoutMs: Math.max(1, Number(event.target.value) || 30) * 1000 } })
            }
            data-testid="input-timeout"
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            className="checkbox"
            checked={settings.followRedirects}
            onChange={(event) => dispatch({ type: 'settings/update', patch: { followRedirects: event.target.checked } })}
            data-testid="checkbox-follow-redirects"
          />
          Follow redirects
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            className="checkbox"
            checked={settings.persistResponses}
            onChange={(event) => dispatch({ type: 'settings/update', patch: { persistResponses: event.target.checked } })}
            data-testid="checkbox-persist-responses"
          />
          Keep response bodies between reloads
        </label>

        <div>
          <div className="section-label">Workspace data</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={exportWorkspace} data-testid="button-export-workspace">
              <Download size={13} /> Export JSON
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()} data-testid="button-import-workspace">
              <Upload size={13} /> Import JSON
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                dispatch({ type: 'state/replace', state: createSeedState() });
                toast({ title: 'Workspace reset', kind: 'info' });
                onClose();
              }}
              data-testid="button-reset-workspace"
            >
              Reset to sample workspace
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importWorkspace(file);
              event.target.value = '';
            }}
          />
          <p className="hint" style={{ marginTop: 8 }}>
            Everything is stored in this browser only. Export before clearing site data, and keep real secrets in an
            environment you do not share.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
