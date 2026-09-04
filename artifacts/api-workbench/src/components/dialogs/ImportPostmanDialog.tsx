import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { useToast } from '@/components/common/Toaster';
import { createEnvironment, createWorkspace } from '@/lib/factories';
import {
  allIds,
  importTree,
  parsePostman,
  pruneImport,
  retargetImport,
  subtreeIds,
  type ImportNode,
  type PostmanImport,
} from '@/lib/postman';
import { useWorkspace } from '@/state/workspace-store';

const SAMPLE = `{
  "info": { "name": "My API", "schema": ".../v2.1.0/collection.json" },
  "item": [ ... ]
}`;

/** The value the destination picker uses for "somewhere that does not exist yet". */
const NEW_WORKSPACE = 'new';

/**
 * Import a Postman export.
 *
 * Two steps, because a collection is usually bigger than what someone wants:
 * read the file, then choose what comes across and where it lands. Both ways in
 * are offered — the file Postman wrote is the usual case, and pasting is what
 * is left when the JSON arrived in a chat message rather than as a download.
 */
export function ImportPostmanDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useWorkspace();
  const { toast } = useToast();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PostmanImport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [destination, setDestination] = useState(state.activeWorkspaceId);
  const [newName, setNewName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => (preview ? importTree(preview) : []), [preview]);

  const read = (contents: string) => {
    try {
      const parsed = parsePostman(contents, state.activeWorkspaceId, state.requests.length);
      setPreview(parsed);
      // Everything starts ticked: the common case is "all of it", and unticking
      // what you do not want is less work than ticking what you do.
      setSelected(new Set(allIds(importTree(parsed))));
      setNewName(parsed.name);
      setError(null);
    } catch (importError) {
      setPreview(null);
      setError(importError instanceof Error ? importError.message : 'Could not read that file.');
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      read(await file.text());
    } catch {
      setError('That file could not be read.');
    }
  };

  const toggle = (node: ImportNode) => {
    const ids = subtreeIds(node);
    setSelected((current) => {
      const next = new Set(current);
      // Ticking a folder takes everything under it; unticking gives it all back.
      const turningOn = !current.has(node.id);
      for (const id of ids) {
        if (turningOn) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const counts = useMemo(() => {
    if (!preview) return { folders: 0, requests: 0 };
    const pruned = pruneImport(preview, selected);
    return { folders: pruned.folders.length, requests: pruned.requests.length };
  }, [preview, selected]);

  const creatingWorkspace = destination === NEW_WORKSPACE;
  const canImport = Boolean(
    preview &&
      (preview.environment || counts.requests > 0 || counts.folders > 0) &&
      (!creatingWorkspace || newName.trim()),
  );

  const confirm = () => {
    if (!preview) return;

    const workspace = creatingWorkspace ? createWorkspace(newName.trim()) : null;
    const workspaceId = workspace ? workspace.id : destination;
    const targeted = retargetImport(preview, workspaceId);
    const { folders, requests } = pruneImport(targeted, selected);

    dispatch({
      type: 'import/merge',
      folders,
      requests,
      environment: targeted.environment,
      baseVariables: targeted.variables,
      workspace,
      // A new workspace needs a base environment, the same one the workspace
      // menu would have given it.
      baseEnvironment: workspace ? createEnvironment(workspace.id, 'Base', true, []) : null,
      workspaceId,
    });

    const where =
      workspace ?? state.workspaces.find((item) => item.id === workspaceId);
    toast({
      title: `Imported ${preview.name}`,
      description: targeted.environment
        ? `${targeted.environment.variables.length} variables into ${where?.name ?? 'this workspace'}.`
        : `${requests.length} requests into ${where?.name ?? 'this workspace'}${
            targeted.variables.length > 0
              ? `, and ${targeted.variables.length} variables into its base environment`
              : ''
          }.`,
      kind: 'success',
    });
    onClose();
  };

  const renderNodes = (nodes: ImportNode[]) =>
    nodes.map((node) => {
      const open = node.kind === 'folder' && !collapsed[node.id];
      return (
        <div key={node.id}>
          <div className="import-row" style={{ paddingLeft: 4 + node.depth * 14 }}>
            <input
              type="checkbox"
              className="checkbox"
              checked={selected.has(node.id)}
              onChange={() => toggle(node)}
              aria-label={node.name}
              data-testid={`checkbox-import-${node.id}`}
            />
            {node.kind === 'folder' ? (
              <button
                className="import-caret"
                onClick={() => setCollapsed((current) => ({ ...current, [node.id]: open }))}
                aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : (
              <span className={`tree-method m-${node.method.toLowerCase()}`}>{node.method}</span>
            )}
            <span className="truncate">{node.name}</span>
          </div>
          {node.kind === 'folder' && open ? renderNodes(node.children) : null}
        </div>
      );
    });

  return (
    <Dialog
      title="Import from Postman"
      description="A collection (v2.1) or an environment, exported from Postman."
      onClose={onClose}
      testId="dialog-import-postman"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {preview ? (
            <button
              className="btn btn-primary"
              onClick={confirm}
              disabled={!canImport}
              data-testid="button-confirm-import-postman"
            >
              Import
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => read(raw)}
              disabled={!raw.trim()}
              data-testid="button-read-postman"
            >
              Continue
            </button>
          )}
        </>
      }
    >
      {preview ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="section-label">
            {preview.environment ? 'Environment' : 'What to import'}
            <span className="spacer" />
            {preview.environment ? null : (
              <>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setSelected(new Set(allIds(tree)))}
                  data-testid="button-select-all-import"
                >
                  All
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setSelected(new Set())}
                  data-testid="button-select-none-import"
                >
                  None
                </button>
              </>
            )}
          </div>

          {preview.environment ? (
            <p className="hint" data-testid="text-import-environment">
              <strong>{preview.environment.name}</strong> — {preview.environment.variables.length} variables. An
              environment belongs to one workspace, so it lands in whichever you pick below.
            </p>
          ) : (
            <div className="import-tree" data-testid="import-tree">
              {renderNodes(tree)}
            </div>
          )}

          <div className="section-label">Where it goes</div>
          <select
            className="select"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            aria-label="Destination workspace"
            data-testid="select-import-workspace"
          >
            {state.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
                {workspace.id === state.activeWorkspaceId ? ' (current)' : ''}
              </option>
            ))}
            <option value={NEW_WORKSPACE}>New workspace…</option>
          </select>

          {creatingWorkspace ? (
            <input
              className="field"
              value={newName}
              placeholder="Workspace name"
              onChange={(event) => setNewName(event.target.value)}
              aria-label="New workspace name"
              data-testid="input-import-workspace-name"
            />
          ) : null}

          {preview.environment ? null : (
            <p className="hint" data-testid="text-import-summary">
              {counts.requests} request{counts.requests === 1 ? '' : 's'} in {counts.folders} folder
              {counts.folders === 1 ? '' : 's'}. A folder you left unticked still comes across when something inside
              it is ticked — otherwise that request would have nowhere to sit.
            </p>
          )}

          <p className="hint">
            Scripts come across as written and run against a <code>pm</code> shim. They are{' '}
            <strong>not sandboxed</strong> — read them before sending anything from a collection you did not write.
          </p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <button className="btn" onClick={() => fileRef.current?.click()} data-testid="button-pick-postman-file">
            <Upload size={13} /> Choose a file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void pickFile(event.target.files?.[0])}
            data-testid="input-postman-file"
          />

          <div className="section-label">Or paste the JSON</div>
          <textarea
            className="editor"
            style={{ minHeight: 150 }}
            value={raw}
            placeholder={SAMPLE}
            spellCheck={false}
            onChange={(event) => {
              setRaw(event.target.value);
              setError(null);
            }}
            aria-label="Postman export"
            data-testid="textarea-postman"
          />

          {error ? (
            <div className="hint" style={{ color: 'var(--red)' }} data-testid="text-postman-error">
              {error}
            </div>
          ) : null}

          <p className="hint">
            The collection becomes a folder, keeping its auth and its scripts, so everything inside it still inherits
            the way it did in Postman. Requests that set their own auth keep it.
          </p>
          <p className="hint">
            Its <strong>variables</strong> go into the base environment, not the folder. Postman resolves an
            environment before a collection, and folder variables here win over environments — so putting them on the
            folder would let a blank collection default shadow the real value in your selected environment. A name the
            base already defines is left alone.
          </p>
        </div>
      )}
    </Dialog>
  );
}
