import { useState } from 'react';
import { Check, ChevronDown, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { ContextMenu, type MenuEntry } from '@/components/common/ContextMenu';
import { PromptDialog } from '@/components/common/PromptDialog';
import { createEnvironment, createWorkspace } from '@/lib/factories';
import { useWorkspace } from '@/state/workspace-store';

/** Workspace identity in the sidebar header, doubling as the switcher. */
export function WorkspaceMenu() {
  const { state, dispatch } = useWorkspace();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [prompt, setPrompt] = useState<'create' | 'rename' | null>(null);

  const active = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
  const requestCount = state.requests.filter((request) => request.workspaceId === state.activeWorkspaceId).length;

  const entries: MenuEntry[] = [
    ...state.workspaces.map<MenuEntry>((workspace) => ({
      kind: 'item',
      label: workspace.name,
      icon: workspace.id === state.activeWorkspaceId ? <Check size={13} /> : <span style={{ width: 13 }} />,
      onSelect: () => dispatch({ type: 'workspace/activate', id: workspace.id }),
    })),
    { kind: 'separator' },
    { kind: 'item', label: 'New workspace', icon: <Plus size={13} />, onSelect: () => setPrompt('create') },
    { kind: 'item', label: 'Rename workspace', icon: <Pencil size={13} />, onSelect: () => setPrompt('rename') },
  ];

  if (state.workspaces.length > 1) {
    entries.push({
      kind: 'item',
      label: 'Delete workspace',
      icon: <Trash2 size={13} />,
      danger: true,
      onSelect: () => dispatch({ type: 'workspace/delete', id: state.activeWorkspaceId }),
    });
  }

  return (
    <>
      <button
        className="workspace-button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.left, y: rect.bottom + 4 });
        }}
        data-testid="button-workspace-menu"
      >
        <span className="brand-mark">
          <Zap size={13} strokeWidth={2.6} />
        </span>
        <span className="brand-text">
          <span className="brand-name truncate">{active?.name ?? 'Workspace'}</span>
          <span className="brand-sub">
            {requestCount} {requestCount === 1 ? 'request' : 'requests'}
          </span>
        </span>
        <ChevronDown size={13} style={{ color: 'var(--text-faint)' }} />
      </button>

      {menu ? <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(null)} /> : null}

      {prompt === 'create' ? (
        <PromptDialog
          title="New workspace"
          description="A workspace has its own folders, requests and environments."
          label="Workspace name"
          initialValue="New workspace"
          confirmLabel="Create workspace"
          onCancel={() => setPrompt(null)}
          onConfirm={(name) => {
            const workspace = createWorkspace(name);
            dispatch({
              type: 'workspace/create',
              workspace,
              environment: createEnvironment(workspace.id, 'Base', true, []),
            });
            setPrompt(null);
          }}
        />
      ) : null}

      {prompt === 'rename' ? (
        <PromptDialog
          title="Rename workspace"
          label="Workspace name"
          initialValue={active?.name ?? ''}
          onCancel={() => setPrompt(null)}
          onConfirm={(name) => {
            dispatch({ type: 'workspace/rename', id: state.activeWorkspaceId, name });
            setPrompt(null);
          }}
        />
      ) : null}
    </>
  );
}
