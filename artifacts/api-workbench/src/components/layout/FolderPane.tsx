import { useState } from 'react';
import { Download, FilePlus2, FolderPlus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { AuthEditor } from '@/components/request/AuthEditor';
import { KeyValueTable } from '@/components/request/KeyValueTable';
import { ScriptEditor } from '@/components/request/ScriptEditor';
import { downloadJson } from '@/lib/download';
import { exportFileName, exportFolder } from '@/lib/export';
import { createFolder, createRequest } from '@/lib/factories';
import { LOCAL_VARIABLE_COLOR } from '@/lib/template';
import { folderPath } from '@/state/selectors';
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo';
import { useWorkspace } from '@/state/workspace-store';
import type { Auth, Folder } from '@/types';

type FolderTab = 'variables' | 'auth' | 'scripts' | 'docs';

const TABS: Array<{ id: FolderTab; label: string }> = [
  { id: 'variables', label: 'Variables' },
  { id: 'auth', label: 'Auth' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'docs', label: 'Docs' },
];

/**
 * A folder's own pane, opened by clicking it in the sidebar.
 *
 * Everything a folder carries lives here rather than behind a right-click:
 * variables, the auth its contents inherit, and the scripts that wrap them.
 * That is the whole reason a folder is a unit and not just a label.
 */
export function FolderPane({ folder }: { folder: Folder }) {
  const { state, dispatch, chainFor, tableFor } = useWorkspace();
  const [tab, setTab] = useState<FolderTab>('variables');
  const [confirming, setConfirming] = useState(false);
  const deleteWithUndo = useDeleteWithUndo();

  const patch = (changes: Partial<Folder>) => dispatch({ type: 'folder/update', id: folder.id, patch: changes });

  // A folder inherits from its ancestors, never from itself, so its own record
  // is dropped from the chain before it reaches the auth editor.
  const ancestors = chainFor(folder.parentId);
  const path = folderPath(state, folder.parentId);

  const childCount = state.requests.filter((request) => request.folderId === folder.id).length;
  // Everything below, however deep — the number the sidebar shows on the row.
  const subtree = new Set([folder.id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const item of state.folders) {
      if (item.parentId && subtree.has(item.parentId) && !subtree.has(item.id)) {
        subtree.add(item.id);
        grew = true;
      }
    }
  }
  const nestedCount = state.requests.filter((request) => request.folderId && subtree.has(request.folderId)).length;

  const addRequest = () =>
    dispatch({
      type: 'request/create',
      request: createRequest({
        workspaceId: folder.workspaceId,
        folderId: folder.id,
        name: 'New request',
        sortIndex: state.requests.length,
      }),
    });

  return (
    <section className="pane" aria-label="Folder" data-testid="folder-pane">
      <div className="folder-head">
        <input
          className="field folder-title"
          value={folder.name}
          onChange={(event) => patch({ name: event.target.value })}
          aria-label="Folder name"
          data-testid="input-folder-name"
        />
        <button className="icon-btn" onClick={addRequest} title="New request in this folder" aria-label="New request in this folder" data-testid="button-folder-new-request">
          <FilePlus2 size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() =>
            dispatch({
              type: 'folder/create',
              folder: createFolder(folder.workspaceId, 'New folder', folder.id, state.folders.length),
            })
          }
          title="New folder inside"
          aria-label="New folder inside"
          data-testid="button-folder-new-folder"
        >
          <FolderPlus size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            const payload = exportFolder(state, folder.id);
            if (payload) downloadJson(exportFileName(folder.name), payload);
          }}
          title="Export folder"
          aria-label="Export folder"
          data-testid="button-folder-export"
        >
          <Download size={15} />
        </button>
        <button
          className="icon-btn danger"
          onClick={() => setConfirming(true)}
          title="Delete folder"
          aria-label="Delete folder"
          data-testid="button-folder-delete"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="pane-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`pane-tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
            data-testid={`tab-folder-${item.id}`}
          >
            {item.label}
            {item.id === 'variables' && folder.variables.length > 0 ? (
              <span className="badge">{folder.variables.length}</span>
            ) : null}
            {item.id === 'auth' && folder.auth.type !== 'inherit' ? (
              <span className="badge">{folder.auth.type}</span>
            ) : null}
            {item.id === 'scripts' && (folder.preScript.trim() || folder.postScript.trim()) ? (
              <span className="badge">on</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="pane-body">
        {tab === 'variables' ? (
          <div className="pane-pad stack">
            <div className="section-label">
              <span className="var-dot" style={{ background: LOCAL_VARIABLE_COLOR }} />
              Local variables
            </div>
            <KeyValueTable
              items={folder.variables}
              onChange={(variables) => dispatch({ type: 'folder/variables', id: folder.id, variables })}
              keyPlaceholder="Variable"
              testPrefix="folder-var"
            />
            <p className="hint">
              These apply to every request in this folder and in the folders under it, and they win over the
              environment. A nearer folder wins over an outer one. They always render blue, so a local override is
              visible at a glance.
            </p>
          </div>
        ) : null}

        {tab === 'auth' ? (
          <AuthEditor
            auth={folder.auth}
            onChange={(auth: Auth) => patch({ auth })}
            chain={ancestors}
            subject="folder"
            variables={tableFor(folder.id)}
          />
        ) : null}

        {tab === 'scripts' ? (
          <ScriptEditor
            preScript={folder.preScript}
            postScript={folder.postScript}
            onChange={patch}
            subject="folder"
            testPrefix="folder"
          />
        ) : null}

        {tab === 'docs' ? (
          <div className="pane-pad stack">
            <div className="section-label">Where it sits</div>
            <p className="hint">
              {path.length > 0 ? `Inside ${path.join(' / ')}. ` : 'At the root of this workspace. '}
              {childCount} request{childCount === 1 ? '' : 's'} directly inside, {nestedCount} counting the folders
              below it.
            </p>
            <div className="section-label">Colour</div>
            <input
              type="color"
              className="field"
              style={{ width: 72, padding: 3 }}
              value={folder.color}
              onChange={(event) => patch({ color: event.target.value })}
              aria-label="Folder colour"
              data-testid="input-folder-color"
            />
          </div>
        ) : null}
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Delete this folder?"
          message={
            <>
              <strong>{folder.name}</strong> takes everything inside it with it: {nestedCount} request
              {nestedCount === 1 ? '' : 's'} and any folders nested below. You can undo this from the notification
              straight afterwards.
            </>
          }
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            deleteWithUndo(
              { type: 'folder/delete', id: folder.id },
              { title: `Deleted ${folder.name}`, detail: 'Everything inside it went too.' },
            );
            setConfirming(false);
          }}
        />
      ) : null}
    </section>
  );
}
