import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, FilePlus2, FolderPlus, Pencil, Search, Terminal, Trash2, Zap } from 'lucide-react';
import { ContextMenu, type MenuEntry } from '@/components/common/ContextMenu';
import { PromptDialog } from '@/components/common/PromptDialog';
import { createFolder, createRequest } from '@/lib/factories';
import { buildTree, countRequests, type TreeNode } from '@/state/selectors';
import { useWorkspace } from '@/state/workspace-store';
import type { Folder, RequestRecord } from '@/types';

type MenuState = { x: number; y: number; entries: MenuEntry[] } | null;
type PromptState =
  | { kind: 'new-folder'; parentId: string | null }
  | { kind: 'rename-folder'; folder: Folder }
  | { kind: 'rename-request'; request: RequestRecord }
  | null;

export function Sidebar({ onImportCurl }: { onImportCurl: () => void }) {
  const { state, dispatch } = useWorkspace();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<MenuState>(null);
  const [prompt, setPrompt] = useState<PromptState>(null);

  const tree = useMemo(() => buildTree(state, search), [state, search]);
  const isSearching = search.trim().length > 0;

  const addRequest = (folderId: string | null) => {
    dispatch({
      type: 'request/create',
      request: createRequest({
        workspaceId: state.activeWorkspaceId,
        folderId,
        name: 'New request',
        url: '{{baseUrl}}/',
        sortIndex: state.requests.length,
      }),
    });
  };

  const folderMenu = (folder: Folder): MenuEntry[] => [
    { kind: 'item', label: 'New request', icon: <FilePlus2 size={13} />, onSelect: () => addRequest(folder.id) },
    { kind: 'item', label: 'New folder', icon: <FolderPlus size={13} />, onSelect: () => setPrompt({ kind: 'new-folder', parentId: folder.id }) },
    { kind: 'separator' },
    { kind: 'item', label: 'Rename', icon: <Pencil size={13} />, onSelect: () => setPrompt({ kind: 'rename-folder', folder }) },
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

  const renderNodes = (nodes: TreeNode[]) =>
    nodes.map((node) => {
      if (node.kind === 'request') {
        const request = node.request;
        const selected = request.id === state.activeRequestId;
        return (
          <button
            key={request.id}
            className={`tree-row ${selected ? 'selected' : ''}`}
            style={{ paddingLeft: 8 + node.depth * 12 }}
            onClick={() => dispatch({ type: 'request/open', id: request.id })}
            onContextMenu={(event) => openMenu(event, requestMenu(request))}
            title={request.url || request.name}
            data-testid={`button-request-${request.id}`}
          >
            <span className={`tree-method m-${request.method.toLowerCase()}`}>{request.method}</span>
            <span className="tree-name truncate">{request.name}</span>
          </button>
        );
      }

      const folder = node.folder;
      const isOpen = isSearching || !collapsed[folder.id];
      return (
        <div key={folder.id}>
          <button
            className="tree-row"
            style={{ paddingLeft: 4 + node.depth * 12 }}
            onClick={() => setCollapsed((current) => ({ ...current, [folder.id]: isOpen }))}
            onContextMenu={(event) => openMenu(event, folderMenu(folder))}
            data-testid={`button-folder-${folder.id}`}
            aria-expanded={isOpen}
          >
            <span className="tree-caret">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
            <span className="tree-folder-name truncate">{folder.name}</span>
            <span className="tree-count">{countRequests(node.children)}</span>
          </button>
          {isOpen ? renderNodes(node.children) : null}
        </div>
      );
    });

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand-mark">
          <Zap size={13} strokeWidth={2.6} />
        </div>
        <div className="brand-text">
          <div className="brand-name truncate">
            {state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.name ?? 'Workspace'}
          </div>
          <div className="brand-sub">{state.requests.length} requests</div>
        </div>
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

      <div className="sidebar-tree" data-testid="sidebar-tree">
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
