import type { Folder, RequestRecord, WorkspaceState } from '@/types';

export type TreeNode =
  | { kind: 'folder'; folder: Folder; depth: number; children: TreeNode[] }
  | { kind: 'request'; request: RequestRecord; depth: number };

function sortByIndexThenName<T extends { sortIndex: number; name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.sortIndex - right.sortIndex || left.name.localeCompare(right.name));
}

/** Build the sidebar tree for one workspace, optionally filtered by a search term. */
export function buildTree(state: WorkspaceState, search: string): TreeNode[] {
  const term = search.trim().toLowerCase();
  const matches = (request: RequestRecord) =>
    !term || `${request.name} ${request.method} ${request.url}`.toLowerCase().includes(term);

  const workspaceRequests = state.requests.filter(
    (request) => request.workspaceId === state.activeWorkspaceId && matches(request),
  );
  const workspaceFolders = state.folders.filter((folder) => folder.workspaceId === state.activeWorkspaceId);

  const build = (parentId: string | null, depth: number): TreeNode[] => {
    const folders = sortByIndexThenName(workspaceFolders.filter((folder) => folder.parentId === parentId)).map<TreeNode>(
      (folder) => ({ kind: 'folder', folder, depth, children: build(folder.id, depth + 1) }),
    );
    const requests = sortByIndexThenName(workspaceRequests.filter((request) => request.folderId === parentId)).map<TreeNode>(
      (request) => ({ kind: 'request', request, depth }),
    );
    return [...folders, ...requests];
  };

  const tree = build(null, 0);
  if (!term) return tree;
  // While searching, hide folders that ended up with nothing in them.
  const prune = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((node) => (node.kind === 'folder' ? { ...node, children: prune(node.children) } : node))
      .filter((node) => node.kind === 'request' || node.children.length > 0);
  return prune(tree);
}

export function flattenRequests(nodes: TreeNode[]): RequestRecord[] {
  return nodes.flatMap((node) => (node.kind === 'request' ? [node.request] : flattenRequests(node.children)));
}

/** Requests anywhere beneath a node, which is what the sidebar counter shows. */
export function countRequests(nodes: TreeNode[]): number {
  return nodes.reduce((total, node) => total + (node.kind === 'request' ? 1 : countRequests(node.children)), 0);
}

/** Human-readable path of a request, e.g. `Playground / Inspect`. */
export function folderPath(state: WorkspaceState, folderId: string | null): string[] {
  const path: string[] = [];
  let current = state.folders.find((folder) => folder.id === folderId);
  while (current) {
    path.unshift(current.name);
    const parentId: string | null = current.parentId;
    current = parentId ? state.folders.find((folder) => folder.id === parentId) : undefined;
  }
  return path;
}
