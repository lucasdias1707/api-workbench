import { useState } from 'react';
import { ArrowDownToLine, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CopyVariablesDialog } from '@/components/dialogs/CopyVariablesDialog';
import { Dialog } from '@/components/common/Dialog';
import { KeyValueTable } from '@/components/request/KeyValueTable';
import { createEnvironment, ENVIRONMENT_COLORS } from '@/lib/factories';
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo';
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
  // Open on whatever is in use, so managing follows straight on from picking.
  const [selectedId, setSelectedId] = useState(state.activeEnvironmentId ?? base?.id ?? '');
  const [copying, setCopying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const deleteWithUndo = useDeleteWithUndo();

  const selected = environments.find((environment) => environment.id === selectedId) ?? base;
  if (!selected) return null;

  const setVariables = (variables: KeyValue[]) =>
    dispatch({ type: 'environment/update', id: selected.id, patch: { variables } });

  const addEnvironment = () => {
    const overlays = environments.filter((environment) => !environment.isBase).length;
    const environment = createEnvironment(
      state.activeWorkspaceId,
      `Environment ${overlays + 1}`,
      false,
      [],
      ENVIRONMENT_COLORS[(overlays + 1) % ENVIRONMENT_COLORS.length],
    );
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
                <span className="var-dot" style={{ background: environment.color }} />
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
                onClick={() => setConfirming(true)}
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
              data-autofocus
              onChange={(event) => dispatch({ type: 'environment/update', id: selected.id, patch: { name: event.target.value } })}
              aria-label="Environment name"
              data-testid="input-environment-name"
            />
          )}

          <div className="section-label" style={{ margin: 0 }}>
            Colour
            <span className="spacer" />
            <span className="hint" style={{ fontSize: 10 }}>
              variables from this environment render in it
            </span>
          </div>
          <div className="swatches">
            {ENVIRONMENT_COLORS.map((color) => (
              <button
                key={color}
                className={`swatch ${selected.color === color ? 'active' : ''}`}
                style={{ background: color }}
                onClick={() => dispatch({ type: 'environment/update', id: selected.id, patch: { color } })}
                aria-label={`Use colour ${color}`}
                data-testid={`swatch-${color.replace('#', '')}`}
              />
            ))}
            <input
              type="color"
              className="swatch-custom"
              value={selected.color}
              onChange={(event) => dispatch({ type: 'environment/update', id: selected.id, patch: { color: event.target.value } })}
              aria-label="Custom environment colour"
              data-testid="input-environment-color"
            />
          </div>
          <div className="section-label" style={{ margin: 0 }}>
            Variables
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => setCopying(true)} data-testid="button-copy-variables">
              <ArrowDownToLine size={12} /> Copy from…
            </button>
          </div>
          <KeyValueTable
            items={selected.variables}
            onChange={setVariables}
            keyPlaceholder="Variable"
            testPrefix={`env-${selected.isBase ? 'base' : 'overlay'}`}
          />
          <p className="hint">
            {selected.isBase
              ? 'Base variables apply to every request. Environments layered on top override them one value at a time, and folder variables override both.'
              : 'Only the variables defined here override the base environment. A folder that defines the same name still wins.'}
          </p>
        </div>
      </div>

      {confirming ? (
        <ConfirmDialog
          title="Delete this environment?"
          message={
            <>
              <strong>{selected.name}</strong> and its {selected.variables.length} variable
              {selected.variables.length === 1 ? '' : 's'} will be removed. Requests using them fall back to the base
              environment. You can undo this from the notification straight afterwards.
            </>
          }
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            deleteWithUndo(
              { type: 'environment/delete', id: selected.id },
              { title: `Deleted ${selected.name}` },
            );
            setSelectedId(base.id);
            setConfirming(false);
          }}
        />
      ) : null}

      {copying ? (
        <CopyVariablesDialog
          destination={selected}
          onApply={setVariables}
          onClose={() => setCopying(false)}
        />
      ) : null}
    </Dialog>
  );
}
