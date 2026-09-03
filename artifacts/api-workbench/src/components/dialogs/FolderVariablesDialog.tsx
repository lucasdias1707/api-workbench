import { Dialog } from '@/components/common/Dialog';
import { KeyValueTable } from '@/components/request/KeyValueTable';
import { LOCAL_VARIABLE_COLOR } from '@/lib/template';
import { folderPath } from '@/state/selectors';
import { useWorkspace } from '@/state/workspace-store';

/**
 * Variables scoped to one folder. They apply to every request inside it and
 * override the environment, which is what makes a folder a usable unit for
 * "this collection talks to a different host".
 */
export function FolderVariablesDialog({ folderId, onClose }: { folderId: string; onClose: () => void }) {
  const { state, dispatch } = useWorkspace();
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) return null;

  const path = folderPath(state, folder.id);

  return (
    <Dialog
      title={`Variables · ${folder.name}`}
      description={path.join(' / ')}
      onClose={onClose}
      testId="dialog-folder-variables"
      footer={
        <button className="btn btn-primary" onClick={onClose} data-testid="button-close-folder-variables">
          Done
        </button>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <div className="section-label">
          <span className="var-dot" style={{ background: LOCAL_VARIABLE_COLOR }} />
          Local variables
        </div>
        <KeyValueTable
          items={folder.variables ?? []}
          onChange={(variables) => dispatch({ type: 'folder/variables', id: folder.id, variables })}
          keyPlaceholder="Variable"
          testPrefix="folder-var"
        />
        <p className="hint">
          These apply to every request in this folder and in the folders under it, and they win over the environment.
          A nearer folder wins over an outer one. They always render blue, so a local override is visible at a glance.
        </p>
      </div>
    </Dialog>
  );
}
