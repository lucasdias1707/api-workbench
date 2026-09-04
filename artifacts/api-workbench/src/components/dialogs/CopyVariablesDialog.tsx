import { useMemo, useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { Dialog } from '@/components/common/Dialog';
import { row } from '@/lib/factories';
import { copyableVariables, mergeVariables, variableSources } from '@/lib/variables';
import { useWorkspace } from '@/state/workspace-store';
import type { Environment, KeyValue } from '@/types';

type CopyVariablesDialogProps = {
  destination: Environment;
  onApply: (variables: KeyValue[]) => void;
  onClose: () => void;
};

/**
 * Pull variables in from another environment or folder.
 *
 * Everything starts ticked except the names the destination already defines:
 * those are the ones where copying overwrites something, so they are the ones
 * worth deciding about rather than defaulting through.
 */
export function CopyVariablesDialog({ destination, onApply, onClose }: CopyVariablesDialogProps) {
  const { state } = useWorkspace();

  const sources = useMemo(
    () =>
      variableSources(
        state.environments.filter((item) => item.workspaceId === state.activeWorkspaceId),
        state.folders.filter((item) => item.workspaceId === state.activeWorkspaceId),
        destination.id,
      ),
    [state.environments, state.folders, state.activeWorkspaceId, destination.id],
  );

  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const [withValues, setWithValues] = useState(true);
  const source = sources.find((item) => item.id === sourceId) ?? sources[0];

  const copyable = useMemo(
    () => (source ? copyableVariables(source.variables, destination.variables) : []),
    [source, destination.variables],
  );

  /**
   * Which names are ticked. Seeded from the source rather than stored across
   * sources: everything comes across except the names the destination already
   * has, since those are the ones where copying overwrites something and so
   * the ones worth a deliberate tick.
   *
   * Re-seeded during render when the source changes — React's own pattern for
   * state derived from props, and the reason switching source cannot leave a
   * tick belonging to the previous one.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (seededFor !== sourceId) {
    setSeededFor(sourceId);
    setPicked(new Set(copyable.filter((item) => !item.conflict).map((item) => item.key)));
  }

  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const chosen = copyable.filter((item) => picked.has(item.key));

  const apply = () => {
    onApply(mergeVariables(destination.variables, chosen, (key, value) => row(key, value), withValues));
    onClose();
  };

  return (
    <Dialog
      title={`Copy variables into ${destination.name}`}
      description="Take the names from somewhere that already has them, then change the values that differ."
      onClose={onClose}
      testId="dialog-copy-variables"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={apply}
            disabled={chosen.length === 0}
            data-testid="button-confirm-copy-variables"
          >
            <ArrowDownToLine size={13} /> Copy {chosen.length || ''}
          </button>
        </>
      }
    >
      {sources.length === 0 ? (
        <p className="hint" data-testid="text-no-sources">
          There is nowhere to copy from yet — this is the only place in the workspace holding variables.
        </p>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <div className="section-label">Copy from</div>
          <select
            className="select"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            aria-label="Copy from"
            data-testid="select-copy-source"
          >
            {sources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.kind})
              </option>
            ))}
          </select>

          <div className="section-label">
            Variables
            <span className="spacer" />
            <span className="hint" style={{ fontSize: 10 }}>
              {copyable.filter((item) => item.conflict).length > 0
                ? 'names already here start unticked'
                : `${copyable.length} available`}
            </span>
          </div>

          <div className="import-tree" data-testid="copy-variable-list">
            {copyable.length === 0 ? (
              <div className="tree-empty">That one has no variables to copy.</div>
            ) : (
              copyable.map((item) => {
                const on = picked.has(item.key);
                return (
                  <label className="import-row" key={item.key} style={{ paddingLeft: 6 }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={on}
                      onChange={() => toggle(item.key)}
                      data-testid={`checkbox-copy-${item.key}`}
                    />
                    <span className="mono truncate" style={{ flex: '0 0 auto' }}>
                      {item.key}
                    </span>
                    <span className="hint mono truncate" style={{ flex: 1, minWidth: 0 }}>
                      {withValues ? item.value || '(empty)' : '(blank)'}
                    </span>
                    {item.conflict ? (
                      <span className="chip" style={{ color: 'var(--yellow)' }} title="This name already exists here">
                        replaces
                      </span>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              className="checkbox"
              checked={withValues}
              onChange={(event) => setWithValues(event.target.checked)}
              data-testid="checkbox-copy-values"
            />
            Copy the values too
          </label>
          <p className="hint">
            Leave that off to bring only the names across — which is usually what a Staging copied from Production
            wants, since the keys match and every value differs.
          </p>
        </div>
      )}
    </Dialog>
  );
}
