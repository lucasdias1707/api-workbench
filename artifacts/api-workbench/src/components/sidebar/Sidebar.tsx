import { useMemo, useState } from 'react';
import { Braces, ChevronDown, ChevronRight, Copy, Download, FilePlus2, FolderPlus, Pencil, Search, Terminal, Trash2 } from 'lucide-react';
import { ContextMenu, type MenuEntry } from '@/components/common/ContextMenu';
import { PromptDialog } from '@/components/common/PromptDialog';
import { downloadJson } from '@/lib/download';
import { exportFileName, exportFolder, exportRequest } from '@/lib/export';
import { createFolder, createRequest } from '@/lib/factories';
import { buildTree, countRequests, isDescendantFolder, type TreeNode } from '@/state/selectors';
import { WorkspaceMenu } from '@/components/sidebar/WorkspaceMenu';
import { useWorkspace } from '@/state/workspace-store';
import type { Folder, RequestRecord } from '@/types';

type MenuState = { x: number; y: number; entries: MenuEntry[] } | null;
type PromptState =
  | { kind: 'new-folder'; parentId: string | null }
  | { kind: 'rename-folder'; folder: Folder }
  | { kind: 'rename-request'; request: RequestRecord }
  | null;

export function Sidebar({ onImportCurl, onFolderVariables }: { onImportCurl: () => void; onFolderVariables: (folderId: string) => void }) {
  const { state, dispatch } = useWorkspace();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<MenuState>(null);
  const [prompt, setPrompt] = useState<PromptState>(null);
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
    { kind: 'item', label: 'Folder variables', icon: <Braces size={13} />, onSelect: () => onFolderVariables(folder.id) },
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
      onSelect: () => dispatch({ type: 'folder/delete', id: folder.id }),
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
      onSelect: () => dispatch({ type: 'request/delete', id: request.id }),
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
            className={`tree-row ${dragging?.id === folder.id ? 'dragging' : ''} ${
              dropTarget === `into:${folder.id}` ? 'drop-into' : ''
            }`}
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
            onClick={() => setCollapsed((current) => ({ ...current, [folder.id]: isOpen }))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setCollapsed((current) => ({ ...current, [folder.id]: isOpen }));
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
      </div>

      {menu ? <ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} /> : null}

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
