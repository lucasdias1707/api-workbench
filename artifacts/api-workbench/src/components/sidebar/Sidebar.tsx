import { useMemo, useState } from 'react';
import { Braces, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, Download, FilePlus2, FolderInput, FolderPlus, PanelLeftClose, Pencil, Search, Terminal, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ContextMenu, type MenuEntry } from '@/components/common/ContextMenu';
import { MOD_LABEL } from '@/hooks/use-hotkeys';
import { PromptDialog } from '@/components/common/PromptDialog';
import { downloadJson } from '@/lib/download';
import { exportFileName, exportFolder, exportRequest } from '@/lib/export';
import { createFolder, createRequest } from '@/lib/factories';
import { buildTree, countRequests, isDescendantFolder, type TreeNode } from '@/state/selectors';
import { WorkspaceMenu } from '@/components/sidebar/WorkspaceMenu';
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo';
import { useWorkspace } from '@/state/workspace-store';
import type { Folder, RequestRecord } from '@/types';

type MenuState = { x: number; y: number; entries: MenuEntry[] } | null;
type PromptState =
  | { kind: 'new-folder'; parentId: string | null }
  | { kind: 'rename-folder'; folder: Folder }
  | { kind: 'rename-request'; request: RequestRecord }
  | null;

type ConfirmState = { kind: 'folder'; folder: Folder } | { kind: 'request'; request: RequestRecord } | null;

export function Sidebar({
  onImportCurl,
  onImportPostman,
  onCollapse,
}: {
  onImportCurl: () => void;
  onImportPostman: () => void;
  onCollapse: () => void;
}) {
  const { state, dispatch } = useWorkspace();
  const deleteWithUndo = useDeleteWithUndo();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<MenuState>(null);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [confirming, setConfirming] = useState<ConfirmState>(null);
  /** What is being dragged, and which row it is currently hovering. */
  const [dragging, setDragging] = useState<{ kind: 'request' | 'folder'; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(state, search), [state, search]);
  const isSearching = search.trim().length > 0;

  const addRequest = (folderId: string | null) => {
    dispatch({
      type: 'request/create',
      request: createRequest({
        workspaceId: state.activeWorkspaceId,
        folderId,
        name: 'New request',
        sortIndex: state.requests.length,
      }),
    });
  };

  /**
   * Clicking a folder does both things it plausibly means: it shows what is
   * inside, and it opens the folder's own pane — where its variables, auth and
   * scripts live. Before this, that pane was only reachable by right-clicking.
   */
  const openFolder = (folderId: string, isOpen: boolean) => {
    setCollapsed((current) => ({ ...current, [folderId]: isOpen }));
    dispatch({ type: 'folder/open', id: folderId });
  };

  /**
   * Collapse everything, or open everything.
   *
   * Which one the button does is decided by what is on screen: if anything is
   * still open it collapses, otherwise it expands. One button, and it always
   * does the thing that changes what you can see.
   */
  const workspaceFolders = state.folders.filter((item) => item.workspaceId === state.activeWorkspaceId);

  /** How many requests a folder would take with it, however deep they sit. */
  const requestsUnder = (folderId: string) => {
    const subtree = new Set([folderId]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const item of workspaceFolders) {
        if (item.parentId && subtree.has(item.parentId) && !subtree.has(item.id)) {
          subtree.add(item.id);
          grew = true;
        }
      }
    }
    return state.requests.filter((request) => request.folderId && subtree.has(request.folderId)).length;
  };
  const anyExpanded = workspaceFolders.some((item) => !collapsed[item.id]);
  const toggleAll = () => {
    if (!anyExpanded) {
      setCollapsed({});
      return;
    }
    setCollapsed(Object.fromEntries(workspaceFolders.map((item) => [item.id, true])));
  };

  const saveFolder = (folder: Folder) => {
    const payload = exportFolder(state, folder.id);
    if (payload) downloadJson(exportFileName(folder.name), payload);
  };

  const saveRequest = (request: RequestRecord) => {
    const payload = exportRequest(state, request.id);
    if (payload) downloadJson(exportFileName(request.name), payload);
  };

  const folderMenu = (folder: Folder): MenuEntry[] => [
    { kind: 'item', label: 'New request', icon: <FilePlus2 size={13} />, onSelect: () => addRequest(folder.id) },
    { kind: 'item', label: 'New folder', icon: <FolderPlus size={13} />, onSelect: () => setPrompt({ kind: 'new-folder', parentId: folder.id }) },
    { kind: 'separator' },
    { kind: 'item', label: 'Folder settings', icon: <Braces size={13} />, onSelect: () => dispatch({ type: 'folder/open', id: folder.id }) },
    { kind: 'item', label: 'Rename', icon: <Pencil size={13} />, onSelect: () => setPrompt({ kind: 'rename-folder', folder }) },
    {
      kind: 'item',
      label: 'Export folder',
      icon: <Download size={13} />,
      onSelect: () => saveFolder(folder),
    },
    {
      kind: 'item',
      label: 'Delete folder',
      icon: <Trash2 size={13} />,
      danger: true,
      onSelect: () => setConfirming({ kind: 'folder', folder }),
    },
  ];

  const requestMenu = (request: RequestRecord): MenuEntry[] => [
    { kind: 'item', label: 'Rename', icon: <Pencil size={13} />, onSelect: () => setPrompt({ kind: 'rename-request', request }) },
    { kind: 'item', label: 'Duplicate', icon: <Copy size={13} />, onSelect: () => dispatch({ type: 'request/duplicate', id: request.id }) },
    { kind: 'item', label: 'Export request', icon: <Download size={13} />, onSelect: () => saveRequest(request) },
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Delete request',
      icon: <Trash2 size={13} />,
      danger: true,
      onSelect: () => setConfirming({ kind: 'request', request }),
    },
  ];

  const openMenu = (event: React.MouseEvent, entries: MenuEntry[]) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, entries });
  };

  /** Whether the current drag may be dropped on this row. */
  const canDrop = (targetKind: 'folder' | 'root', targetId: string | null) => {
    if (!dragging) return false;
    if (dragging.kind === 'folder') {
      if (targetKind === 'root') return true;
      return !isDescendantFolder(state, targetId!, dragging.id);
    }
    return true;
  };

  const handleDrop = (folderId: string | null, beforeId?: string | null) => {
    if (!dragging) return;
    if (dragging.kind === 'request') {
      dispatch({ type: 'request/move', id: dragging.id, folderId, beforeId: beforeId ?? null });
    } else {
      dispatch({ type: 'folder/move', id: dragging.id, parentId: folderId });
    }
    setDragging(null);
    setDropTarget(null);
  };

  const renderNodes = (nodes: TreeNode[]) =>
    nodes.map((node) => {
      if (node.kind === 'request') {
        const request = node.request;
        const selected = request.id === state.activeRequestId;
        return (
          <div
            key={request.id}
            className={`tree-row ${selected ? 'selected' : ''} ${dragging?.id === request.id ? 'dragging' : ''} ${
              dropTarget === `before:${request.id}` ? 'drop-before' : ''
            }`}
            style={{ paddingLeft: 8 + node.depth * 12 }}
            role="button"
            tabIndex={0}
            draggable={!isSearching}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', request.id);
              setDragging({ kind: 'request', id: request.id });
            }}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
            onDragOver={(event) => {
              if (!dragging || dragging.id === request.id) return;
              event.preventDefault();
              // dragover bubbles; without this the root drop zone overwrites
              // the target on its way up and nothing highlights.
              event.stopPropagation();
              event.dataTransfer.dropEffect = 'move';
              setDropTarget(`before:${request.id}`);
            }}
            onDragLeave={() => setDropTarget((current) => (current === `before:${request.id}` ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleDrop(request.folderId, request.id);
            }}
            onClick={() => dispatch({ type: 'request/open', id: request.id })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                dispatch({ type: 'request/open', id: request.id });
              }
            }}
            onContextMenu={(event) => openMenu(event, requestMenu(request))}
            title={request.url || request.name}
            data-testid={`button-request-${request.id}`}
          >
            <span className={`tree-method m-${request.method.toLowerCase()}`}>{request.method}</span>
            <span className="tree-name truncate">{request.name}</span>
          </div>
        );
      }

      const folder = node.folder;
      const isOpen = isSearching || !collapsed[folder.id];
      const hasVariables = (folder.variables ?? []).some((item) => item.enabled && item.key.trim());
      return (
        <div key={folder.id}>
          <div
            className={`tree-row ${folder.id === state.activeFolderId ? 'selected' : ''} ${
              dragging?.id === folder.id ? 'dragging' : ''
            } ${dropTarget === `into:${folder.id}` ? 'drop-into' : ''}`}
            style={{ paddingLeft: 4 + node.depth * 12 }}
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
            draggable={!isSearching}
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', folder.id);
              setDragging({ kind: 'folder', id: folder.id });
            }}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
            onDragOver={(event) => {
              if (!canDrop('folder', folder.id) || dragging?.id === folder.id) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = 'move';
              setDropTarget(`into:${folder.id}`);
            }}
            onDragLeave={() => setDropTarget((current) => (current === `into:${folder.id}` ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!canDrop('folder', folder.id)) return;
              // Dropping onto a collapsed folder should reveal what just moved.
              setCollapsed((current) => ({ ...current, [folder.id]: false }));
              handleDrop(folder.id);
            }}
            onClick={() => openFolder(folder.id, isOpen)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openFolder(folder.id, isOpen);
              }
            }}
            onContextMenu={(event) => openMenu(event, folderMenu(folder))}
            data-testid={`button-folder-${folder.id}`}
          >
            <span className="tree-caret">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
            <span className="tree-folder-name truncate">{folder.name}</span>
            {hasVariables ? (
              <span className="folder-vars" title="This folder defines local variables">
                <Braces size={10} />
              </span>
            ) : null}
            <span className="tree-count">{countRequests(node.children)}</span>
          </div>
          {isOpen ? renderNodes(node.children) : null}
        </div>
      );
    });

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <WorkspaceMenu />
        <button
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          onClick={toggleAll}
          disabled={workspaceFolders.length === 0}
          title={anyExpanded ? 'Collapse all folders' : 'Expand all folders'}
          aria-label={anyExpanded ? 'Collapse all folders' : 'Expand all folders'}
          data-testid="button-toggle-all-folders"
        >
          {anyExpanded ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
        </button>
        <button
          className="icon-btn"
          onClick={() => setPrompt({ kind: 'new-folder', parentId: null })}
          title="New folder"
          aria-label="New folder"
          data-testid="button-new-folder"
        >
          <FolderPlus size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => addRequest(null)}
          title="New request"
          aria-label="New request"
          data-testid="button-new-request"
        >
          <FilePlus2 size={15} />
        </button>
        {/*
          The top bar has a toggle too, but on a narrow window the sidebar
          covers the top bar — so the control that hides it has to live inside
          the thing being hidden, or it cannot be reached at exactly the width
          where it is most needed.
        */}
        <button
          className="icon-btn"
          onClick={onCollapse}
          title={`Hide the sidebar (${MOD_LABEL} B)`}
          aria-label="Hide the sidebar"
          data-testid="button-collapse-sidebar"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="sidebar-search">
        <Search size={13} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter requests"
          aria-label="Filter requests"
          data-testid="input-search-requests"
        />
      </div>

      <div
        className={`sidebar-tree ${dropTarget === 'root' ? 'drop-into' : ''}`}
        data-testid="sidebar-tree"
        onDragOver={(event) => {
          if (!canDrop('root', null)) return;
          event.preventDefault();
          setDropTarget('root');
        }}
        onDragLeave={() => setDropTarget((current) => (current === 'root' ? null : current))}
        onDrop={(event) => {
          event.preventDefault();
          handleDrop(null);
        }}
      >
        {tree.length === 0 ? (
          <div className="tree-empty">{isSearching ? `Nothing matches “${search}”.` : 'No requests yet.'}</div>
        ) : (
          renderNodes(tree)
        )}
      </div>

      <div className="sidebar-foot">
        <button className="btn btn-sm btn-ghost" onClick={onImportCurl} data-testid="button-import-curl">
          <Terminal size={13} /> Import curl
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onImportPostman} data-testid="button-import-postman">
          <FolderInput size={13} /> Import Postman
        </button>
      </div>

      {menu ? <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} /> : null}

      {confirming?.kind === 'request' ? (
        <ConfirmDialog
          title="Delete this request?"
          message={
            <>
              <strong>{confirming.request.name}</strong> and its response history will be removed. You can undo this
              from the notification straight afterwards.
            </>
          }
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            deleteWithUndo(
              { type: 'request/delete', id: confirming.request.id },
              { title: `Deleted ${confirming.request.name}` },
            );
            setConfirming(null);
          }}
        />
      ) : null}

      {confirming?.kind === 'folder' ? (
        <ConfirmDialog
          title="Delete this folder?"
          message={
            <>
              <strong>{confirming.folder.name}</strong> takes everything inside it with it:{' '}
              {requestsUnder(confirming.folder.id)} request
              {requestsUnder(confirming.folder.id) === 1 ? '' : 's'} and any folders nested below. You can undo this
              from the notification straight afterwards.
            </>
          }
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            deleteWithUndo(
              { type: 'folder/delete', id: confirming.folder.id },
              { title: `Deleted ${confirming.folder.name}`, detail: 'Everything inside it went too.' },
            );
            setConfirming(null);
          }}
        />
      ) : null}

      {prompt?.kind === 'new-folder' ? (
        <PromptDialog
          title="New folder"
          label="Folder name"
          initialValue="New folder"
          confirmLabel="Create folder"
          onCancel={() => setPrompt(null)}
          onConfirm={(name) => {
            dispatch({
              type: 'folder/create',
              folder: createFolder(state.activeWorkspaceId, name, prompt.parentId, state.folders.length),
            });
            setPrompt(null);
          }}
        />
      ) : null}

      {prompt?.kind === 'rename-folder' ? (
        <PromptDialog
          title="Rename folder"
          label="Folder name"
          initialValue={prompt.folder.name}
          onCancel={() => setPrompt(null)}
          onConfirm={(name) => {
            dispatch({ type: 'folder/rename', id: prompt.folder.id, name });
            setPrompt(null);
          }}
        />
      ) : null}

      {prompt?.kind === 'rename-request' ? (
        <PromptDialog
          title="Rename request"
          label="Request name"
          initialValue={prompt.request.name}
          onCancel={() => setPrompt(null)}
          onConfirm={(name) => {
            dispatch({ type: 'request/update', id: prompt.request.id, patch: { name } });
            setPrompt(null);
          }}
        />
      ) : null}
    </aside>
  );
}
