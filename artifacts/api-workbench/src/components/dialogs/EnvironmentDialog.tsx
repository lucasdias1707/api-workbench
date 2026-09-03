import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { KeyValueTable } from '@/components/request/KeyValueTable';
import { createEnvironment } from '@/lib/factories';
import { useWorkspace } from '@/state/workspace-store';
import type { KeyValue } from '@/types';

/**
 * Editor for the base environment plus any number of overlays. The base always
 * applies; the selected overlay is layered on top when a request is sent.
 */
export function EnvironmentDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useWorkspace();
  const environments = state.environments.filter((environment) => environment.workspaceId === state.activeWorkspaceId);
  const base = environments.find((environment) => environment.isBase) ?? environments[0];
  const [selectedId, setSelectedId] = useState(base?.id ?? '');

  const selected = environments.find((environment) => environment.id === selectedId) ?? base;
  if (!selected) return null;

  const setVariables = (variables: KeyValue[]) =>
    dispatch({ type: 'environment/update', id: selected.id, patch: { variables } });

  const addEnvironment = () => {
    const environment = createEnvironment(state.activeWorkspaceId, `Environment ${environments.length}`, false, []);
    dispatch({ type: 'environment/create', environment });
    setSelectedId(environment.id);
  };

  return (
    <Dialog
      title="Environments"
      description="Values here replace {{variables}} in URLs, headers, bodies and auth."
      onClose={onClose}
      wide
      testId="dialog-environments"
      footer={
        <>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={onClose} data-testid="button-close-environments">
            Done
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 14, alignItems: 'start' }}>
        <div>
          <div className="section-label">
            Environments
            <span className="spacer" />
            <button className="icon-btn" onClick={addEnvironment} aria-label="Add environment" data-testid="button-add-environment">
              <Plus size={14} />
            </button>
          </div>
          <div style={{ display: 'grid', gap: 2 }}>
            {environments.map((environment) => (
              <button
                key={environment.id}
                className={`tree-row ${environment.id === selected.id ? 'selected' : ''}`}
                style={{ paddingLeft: 8 }}
                onClick={() => setSelectedId(environment.id)}
                data-testid={`button-environment-${environment.id}`}
              >
                <span className="tree-name truncate">{environment.name}</span>
                {environment.isBase ? <span className="tree-count">base</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <div className="section-label">
            {selected.isBase ? 'Base variables' : 'Name'}
            <span className="spacer" />
            {selected.isBase ? null : (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  dispatch({ type: 'environment/delete', id: selected.id });
                  setSelectedId(base.id);
                }}
                data-testid="button-delete-environment"
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
          {selected.isBase ? null : (
            <input
              className="field"
              value={selected.name}
              onChange={(event) => dispatch({ type: 'environment/update', id: selected.id, patch: { name: event.target.value } })}
              aria-label="Environment name"
              data-testid="input-environment-name"
            />
          )}
          <KeyValueTable
            items={selected.variables}
            onChange={setVariables}
            keyPlaceholder="Variable"
            testPrefix={`env-${selected.isBase ? 'base' : 'overlay'}`}
          />
          <p className="hint">
            {selected.isBase
              ? 'Base variables apply to every request. Overlay environments override them one value at a time.'
              : 'Only the variables defined here override the base environment.'}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
