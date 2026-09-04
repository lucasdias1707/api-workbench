import type { Environment, Folder, KeyValue, RequestRecord, ResponseRecord, Settings, Workspace, WorkspaceState } from '@/types';

export type Action =
  | { type: 'state/replace'; state: WorkspaceState }
  | { type: 'request/open'; id: string }
  | { type: 'request/close-tab'; id: string }
  | { type: 'request/close-other-tabs'; id: string }
  | { type: 'request/update'; id: string; patch: Partial<RequestRecord> }
  | { type: 'request/create'; request: RequestRecord }
  | { type: 'request/duplicate'; id: string }
  | { type: 'request/delete'; id: string }
  | { type: 'request/move'; id: string; folderId: string | null; beforeId?: string | null }
  | { type: 'folder/move'; id: string; parentId: string | null }
  | { type: 'folder/create'; folder: Folder }
  | { type: 'folder/rename'; id: string; name: string }
  | { type: 'folder/delete'; id: string }
  | { type: 'folder/variables'; id: string; variables: KeyValue[] }
  | { type: 'folder/update'; id: string; patch: Partial<Folder> }
  | { type: 'folder/open'; id: string | null }
  | { type: 'workspace/create'; workspace: Workspace; environment: Environment }
  | { type: 'workspace/activate'; id: string }
  | { type: 'workspace/rename'; id: string; name: string }
  | { type: 'workspace/delete'; id: string }
  | { type: 'environment/activate'; id: string | null }
  | { type: 'environment/create'; environment: Environment }
  | { type: 'environment/update'; id: string; patch: Partial<Environment> }
  | { type: 'environment/delete'; id: string }
  | { type: 'response/add'; response: ResponseRecord }
  | { type: 'response/clear'; requestId: string }
  | { type: 'settings/update'; patch: Partial<Settings> }
  /** Append a whole imported tree at once, so one undoable step covers it. */
  | { type: 'import/merge'; folders: Folder[]; requests: RequestRecord[]; environment: Environment | null };
