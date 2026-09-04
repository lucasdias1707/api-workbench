import { useState } from 'react';
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { AppMark } from '@/components/common/AppMark';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ContextMenu, type MenuEntry } from '@/components/common/ContextMenu';
import { PromptDialog } from '@/components/common/PromptDialog';
import { createEnvironment, createWorkspace } from '@/lib/factories';
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo';
import { useWorkspace } from '@/state/workspace-store';

/** Workspace identity in the sidebar header, doubling as the switcher. */
export function WorkspaceMenu() {
  const { state, dispatch } = useWorkspace();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [prompt, setPrompt] = useState<'create' | 'rename' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const deleteWithUndo = useDeleteWithUndo();

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
      onSelect: () => setConfirming(true),
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
          <AppMark size={13} />
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

      {confirming ? (
        <ConfirmDialog
          title="Delete this workspace?"
          message={
            <>
              <strong>{active?.name}</strong> goes, and so does everything in it: {requestCount} request
              {requestCount === 1 ? '' : 's'}, its folders and its environments. You can undo this from the
              notification straight afterwards.
            </>
          }
          confirmLabel="Delete workspace"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            deleteWithUndo(
              { type: 'workspace/delete', id: state.activeWorkspaceId },
              { title: `Deleted ${active?.name ?? 'workspace'}`, detail: 'Its folders, requests and environments went too.' },
            );
            setConfirming(false);
          }}
        />
      ) : null}

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
