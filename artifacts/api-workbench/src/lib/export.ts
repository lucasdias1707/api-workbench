import type { Folder, RequestRecord, WorkspaceState } from '@/types';

/**
 * A slice of a workspace: one folder with everything under it, or one request.
 *
 * It is deliberately not a `WorkspaceState`. A full export replaces the
 * workspace on import; a slice has to be merged into one, and the two must not
 * be mistaken for each other by whatever reads the file, so the shape carries
 * its own marker.
 */
export const SUBTREE_FORMAT = 'workspace-subtree';
export const SUBTREE_VERSION = 1;

export type SubtreeExport = {
  format: typeof SUBTREE_FORMAT;
  version: number;
  /** What was exported, for a human reading the file or a future importer. */
  name: string;
  exportedAt: string;
  /** Empty when a single request was exported. Ordered outermost first. */
  folders: Folder[];
  requests: RequestRecord[];
};

/** True for any object carrying our slice marker, however old its version. */
export function isSubtreeExport(value: unknown): value is SubtreeExport {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { format?: unknown }).format === SUBTREE_FORMAT
  );
}

/**
 * Folder ids for `folderId` and every folder beneath it.
 *
 * The `seen` set is not paranoia about our own reducer: state comes back from
 * localStorage and from imported files, and a parent cycle there would
 * otherwise spin forever.
 */
export function subtreeFolderIds(state: WorkspaceState, folderId: string): string[] {
  const collected: string[] = [];
  const seen = new Set<string>();
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    if (!state.folders.some((folder) => folder.id === current)) continue;
    collected.push(current);
    for (const child of state.folders) {
      if (child.parentId === current) queue.push(child.id);
    }
  }
  return collected;
}

function envelope(name: string, folders: Folder[], requests: RequestRecord[]): SubtreeExport {
  return {
    format: SUBTREE_FORMAT,
    version: SUBTREE_VERSION,
    name,
    exportedAt: new Date().toISOString(),
    folders,
    requests,
  };
}

/** One folder, its nested folders, and every request inside any of them. */
export function exportFolder(state: WorkspaceState, folderId: string): SubtreeExport | null {
  const root = state.folders.find((folder) => folder.id === folderId);
  if (!root) return null;
  const ids = new Set(subtreeFolderIds(state, folderId));
  const folders = state.folders.filter((folder) => ids.has(folder.id));
  const requests = state.requests.filter((request) => request.folderId !== null && ids.has(request.folderId));
  return envelope(root.name, folders, requests);
}

/** A single request, with no folder around it. */
export function exportRequest(state: WorkspaceState, requestId: string): SubtreeExport | null {
  const request = state.requests.find((item) => item.id === requestId);
  if (!request) return null;
  return envelope(request.name, [], [request]);
}

/**
 * A file name built from what was exported. Anything that is not a letter,
 * digit or dash collapses to a single dash, so "Pokémon / v2" saves as
 * "pok-mon-v2.json" rather than something the OS refuses to write.
 */
export function exportFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'export'}.json`;
}
