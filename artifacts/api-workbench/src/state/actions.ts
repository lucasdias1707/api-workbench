import type { Environment, Folder, RequestRecord, ResponseRecord, Settings, WorkspaceState } from '@/types';

export type Action =
  | { type: 'state/replace'; state: WorkspaceState }
  | { type: 'request/open'; id: string }
  | { type: 'request/close-tab'; id: string }
  | { type: 'request/close-other-tabs'; id: string }
  | { type: 'request/update'; id: string; patch: Partial<RequestRecord> }
  | { type: 'request/create'; request: RequestRecord }
  | { type: 'request/duplicate'; id: string }
  | { type: 'request/delete'; id: string }
  | { type: 'request/move'; id: string; folderId: string | null }
  | { type: 'folder/create'; folder: Folder }
  | { type: 'folder/rename'; id: string; name: string }
  | { type: 'folder/delete'; id: string }
  | { type: 'environment/activate'; id: string | null }
  | { type: 'environment/create'; environment: Environment }
  | { type: 'environment/update'; id: string; patch: Partial<Environment> }
  | { type: 'environment/delete'; id: string }
  | { type: 'response/add'; response: ResponseRecord }
  | { type: 'response/clear'; requestId: string }
  | { type: 'settings/update'; patch: Partial<Settings> };
