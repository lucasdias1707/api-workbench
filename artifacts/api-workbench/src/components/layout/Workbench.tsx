import { useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  Columns2,
  FilePlus2,
  FolderInput,
  Keyboard,
  Layers,
  PanelLeft,
  Rows2,
  Send,
  Settings,
  Terminal,
} from 'lucide-react';
import { CommandPalette, type Command } from '@/components/dialogs/CommandPalette';
import { EnvironmentDialog } from '@/components/dialogs/EnvironmentDialog';
import { ImportCurlDialog } from '@/components/dialogs/ImportCurlDialog';
import { ImportPostmanDialog } from '@/components/dialogs/ImportPostmanDialog';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';
import { ShortcutsDialog } from '@/components/dialogs/ShortcutsDialog';
import { EnvironmentPicker } from '@/components/layout/EnvironmentPicker';
import { FolderPane } from '@/components/layout/FolderPane';
import { TabStrip } from '@/components/layout/TabStrip';
import { RequestPane } from '@/components/request/RequestPane';
import { ResponsePane } from '@/components/response/ResponsePane';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { useToast } from '@/components/common/Toaster';
import { useHotkeys, MOD_LABEL } from '@/hooks/use-hotkeys';
import { useProxyHealth } from '@/hooks/use-proxy-health';
import { useSendRequest } from '@/hooks/use-send-request';
import { useTheme } from '@/hooks/use-theme';
import { createRequest } from '@/lib/factories';
import { useWorkspace } from '@/state/workspace-store';

type Overlay = 'palette' | 'environments' | 'settings' | 'curl' | 'postman' | 'shortcuts' | null;

export function Workbench() {
  const { state, dispatch, activeRequest, activeFolder } = useWorkspace();
  const { toast } = useToast();
  const { status: proxyStatus } = useProxyHealth();
  const { sending, send, cancel, scriptLogs, scriptTests } = useSendRequest(proxyStatus);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  useTheme(state.settings.theme);

  const environments = state.environments.filter(
    (environment) => environment.workspaceId === state.activeWorkspaceId && !environment.isBase,
  );

  const newRequest = () =>
    dispatch({
      type: 'request/create',
      request: createRequest({
        workspaceId: state.activeWorkspaceId,
        folderId: activeRequest?.folderId ?? null,
        name: 'New request',
        sortIndex: state.requests.length,
      }),
    });

  const sendActive = () => {
    if (!activeRequest) {
      toast({ title: 'Nothing to send', description: 'Open a request first.', kind: 'info' });
      return;
    }
    void send(activeRequest);
  };

  useHotkeys([
    { key: 'k', mod: true, allowInInput: true, handler: () => setOverlay('palette') },
    { key: 'enter', mod: true, allowInInput: true, handler: sendActive },
    { key: 'n', mod: true, allowInInput: true, handler: newRequest },
    { key: 'e', mod: true, allowInInput: true, handler: () => setOverlay('environments') },
    { key: 'b', mod: true, allowInInput: true, handler: () => setSidebarVisible((current) => !current) },
    { key: ',', mod: true, allowInInput: true, handler: () => setOverlay('settings') },
    {
      key: 'w',
      mod: true,
      allowInInput: true,
      handler: () => {
        if (state.activeRequestId) dispatch({ type: 'request/close-tab', id: state.activeRequestId });
      },
    },
  ]);

  const commands: Command[] = [
    { id: 'new-request', label: 'New request', icon: <FilePlus2 size={13} />, hint: `${MOD_LABEL} N`, run: newRequest },
    { id: 'send', label: 'Send request', icon: <Send size={13} />, hint: `${MOD_LABEL} ⏎`, run: sendActive },
    { id: 'environments', label: 'Edit environments', icon: <Layers size={13} />, hint: `${MOD_LABEL} E`, run: () => setOverlay('environments') },
    { id: 'import-curl', label: 'Import from curl', icon: <Terminal size={13} />, run: () => setOverlay('curl') },
    { id: 'import-postman', label: 'Import a Postman collection', icon: <FolderInput size={13} />, run: () => setOverlay('postman') },
    { id: 'settings', label: 'Settings', icon: <Settings size={13} />, hint: `${MOD_LABEL} ,`, run: () => setOverlay('settings') },
    { id: 'shortcuts', label: 'Keyboard shortcuts', icon: <Keyboard size={13} />, run: () => setOverlay('shortcuts') },
    {
      id: 'layout',
      label: state.settings.layout === 'horizontal' ? 'Stack the panes' : 'Place panes side by side',
      icon: state.settings.layout === 'horizontal' ? <Rows2 size={13} /> : <Columns2 size={13} />,
      run: () =>
        dispatch({
          type: 'settings/update',
          patch: { layout: state.settings.layout === 'horizontal' ? 'vertical' : 'horizontal' },
        }),
    },
  ];

  return (
    <div
      className="workbench"
      data-sidebar={sidebarVisible ? 'visible' : 'hidden'}
      style={
        {
          '--json-key': state.settings.jsonTheme.key,
          '--json-string': state.settings.jsonTheme.string,
          '--json-number': state.settings.jsonTheme.number,
          '--json-boolean': state.settings.jsonTheme.boolean,
          '--json-null': state.settings.jsonTheme.null,
          '--json-punct': state.settings.jsonTheme.punctuation,
        } as React.CSSProperties
      }
    >
      <Sidebar onImportCurl={() => setOverlay('curl')} onImportPostman={() => setOverlay('postman')} />

      <main className="main">
        <div className="topbar">
          <button
            className="icon-btn"
            onClick={() => setSidebarVisible((current) => !current)}
            title={`Toggle sidebar (${MOD_LABEL} B)`}
            aria-label="Toggle sidebar"
            data-testid="button-toggle-sidebar"
          >
            <PanelLeft size={15} />
          </button>

          <TabStrip />

          <div className="topbar-actions">
            <EnvironmentPicker onManage={() => setOverlay('environments')} />
            <button
              className="icon-btn"
              onClick={() => setOverlay('environments')}
              title={`Environments (${MOD_LABEL} E)`}
              aria-label="Environments"
              data-testid="button-environments"
            >
              <Layers size={15} />
            </button>
            <button
              className="icon-btn"
              onClick={() =>
                dispatch({
                  type: 'settings/update',
                  patch: { layout: state.settings.layout === 'horizontal' ? 'vertical' : 'horizontal' },
                })
              }
              title="Switch pane layout"
              aria-label="Switch pane layout"
              data-testid="button-toggle-layout"
            >
              {state.settings.layout === 'horizontal' ? <Rows2 size={15} /> : <Columns2 size={15} />}
            </button>
            <button
              className="icon-btn"
              onClick={() => setOverlay('settings')}
              title={`Settings (${MOD_LABEL} ,)`}
              aria-label="Settings"
              data-testid="button-settings"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>

        {activeFolder ? (
          <FolderPane folder={activeFolder} />
        ) : activeRequest ? (
          <PanelGroup
            className="panes"
            direction={state.settings.layout}
            autoSaveId={`workbench-panes-${state.settings.layout}`}
          >
            <Panel defaultSize={50} minSize={22} order={1}>
              <RequestPane request={activeRequest} sending={sending} onSend={sendActive} onCancel={cancel} />
            </Panel>
            <PanelResizeHandle className="pane-divider" />
            <Panel defaultSize={50} minSize={22} order={2}>
              <ResponsePane
                requestId={activeRequest.id}
                sending={sending}
                scriptLogs={scriptLogs}
                scriptTests={scriptTests}
              />
            </Panel>
          </PanelGroup>
        ) : (
          <div className="empty" data-testid="empty-workspace">
            <div>
              <div className="empty-icon">
                <Send size={19} />
              </div>
              <h3>No request open</h3>
              <p>
                Pick one from the sidebar, or press <span className="kbd">{MOD_LABEL} N</span> to start a new one.
              </p>
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={newRequest} data-testid="button-empty-new-request">
                <FilePlus2 size={13} /> New request
              </button>
            </div>
          </div>
        )}
      </main>

      {overlay === 'palette' ? <CommandPalette commands={commands} onClose={() => setOverlay(null)} /> : null}
      {overlay === 'environments' ? <EnvironmentDialog onClose={() => setOverlay(null)} /> : null}
      {overlay === 'settings' ? <SettingsDialog onClose={() => setOverlay(null)} proxyStatus={proxyStatus} /> : null}
      {overlay === 'curl' ? <ImportCurlDialog onClose={() => setOverlay(null)} /> : null}
      {overlay === 'postman' ? <ImportPostmanDialog onClose={() => setOverlay(null)} /> : null}
      {overlay === 'shortcuts' ? <ShortcutsDialog onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}
