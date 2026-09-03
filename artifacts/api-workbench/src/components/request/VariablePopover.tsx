import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { LOCAL_VARIABLE_COLOR } from '@/lib/template';
import { row } from '@/lib/factories';
import { useWorkspace } from '@/state/workspace-store';
import type { ResolvedVariable } from '@/types';

type VariablePopoverProps = {
  name: string;
  /** `null` when the variable is referenced but defined nowhere yet. */
  variable: ResolvedVariable | null;
  anchor: DOMRect;
  onClose: () => void;
};

/**
 * Edit the definition a variable actually resolves to, without leaving the
 * request. Writes back to whichever folder or environment supplied the value,
 * so the edit lands where the reader expects.
 */
export function VariablePopover({ name, variable, anchor, onClose }: VariablePopoverProps) {
  const { state, dispatch, activeRequest } = useWorkspace();
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(variable?.value ?? '');
  const [position, setPosition] = useState({ left: anchor.left, top: anchor.bottom + 6 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8)),
      top: anchor.bottom + rect.height + 8 > window.innerHeight ? anchor.top - rect.height - 6 : anchor.bottom + 6,
    });
  }, [anchor]);

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const environments = state.environments.filter(
    (environment) => environment.workspaceId === state.activeWorkspaceId,
  );
  const base = environments.find((environment) => environment.isBase);
  const folder = state.folders.find((item) => item.id === activeRequest?.folderId);

  const save = () => {
    if (variable?.scope === 'folder') {
      const target = state.folders.find((item) => item.id === variable.sourceId);
      if (target) {
        dispatch({
          type: 'folder/variables',
          id: target.id,
          variables: target.variables.map((item) => (item.key.trim() === name ? { ...item, value } : item)),
        });
      }
    } else if (variable) {
      const target = environments.find((environment) => environment.id === variable.sourceId);
      if (target) {
        dispatch({
          type: 'environment/update',
          id: target.id,
          patch: { variables: target.variables.map((item) => (item.key.trim() === name ? { ...item, value } : item)) },
        });
      }
    }
    onClose();
  };

  const define = (scope: 'folder' | 'base') => {
    if (scope === 'folder' && folder) {
      dispatch({ type: 'folder/variables', id: folder.id, variables: [...folder.variables, row(name, value)] });
    } else if (base) {
      dispatch({ type: 'environment/update', id: base.id, patch: { variables: [...base.variables, row(name, value)] } });
    }
    onClose();
  };

  const accent = variable ? (variable.scope === 'folder' ? LOCAL_VARIABLE_COLOR : variable.color) : 'var(--red)';

  return (
    <div className="var-popover" ref={ref} style={position} role="dialog" aria-label={`Edit ${name}`} data-testid="popover-variable">
      <div className="var-popover-head">
        <span className="var-dot" style={{ background: accent }} />
        <span className="mono" style={{ fontWeight: 600 }}>
          {name}
        </span>
        <span className="spacer" />
        {variable ? (
          <span className="chip" style={{ color: accent }}>
            {variable.scope === 'folder' ? 'local' : 'global'}
          </span>
        ) : (
          <span className="chip" style={{ color: 'var(--red)' }}>
            undefined
          </span>
        )}
      </div>

      {variable ? (
        <>
          <div className="var-popover-origin">
            from {variable.scope === 'folder' ? 'folder' : 'environment'} <strong>{variable.sourceName}</strong>
          </div>
          <div className="var-popover-row">
            <input
              className="field mono"
              value={value}
              autoFocus
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
              aria-label={`Value of ${name}`}
              data-testid="input-variable-value"
            />
            <button className="btn btn-primary btn-sm" onClick={save} data-testid="button-save-variable">
              <Check size={12} /> Save
            </button>
          </div>
          {variable.shadowed.length > 0 ? (
            <div className="var-popover-shadowed">
              overrides{' '}
              {variable.shadowed.map((origin, index) => (
                <span key={`${origin.sourceId}-${index}`}>
                  {index > 0 ? ', ' : ''}
                  <span style={{ color: origin.scope === 'folder' ? LOCAL_VARIABLE_COLOR : origin.color }}>
                    {origin.sourceName}
                  </span>
                  <span className="mono"> = {origin.value || '(empty)'}</span>
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="var-popover-origin">Not defined yet. Give it a value and pick where it lives.</div>
          <div className="var-popover-row">
            <input
              className="field mono"
              value={value}
              autoFocus
              placeholder="Value"
              onChange={(event) => setValue(event.target.value)}
              aria-label={`Value of ${name}`}
              data-testid="input-variable-value"
            />
          </div>
          <div className="var-popover-row">
            <button
              className="btn btn-sm"
              onClick={() => define('folder')}
              disabled={!folder}
              title={folder ? `Local to ${folder.name}` : 'This request is not in a folder'}
              data-testid="button-define-local"
            >
              <Plus size={12} /> Local {folder ? `(${folder.name})` : ''}
            </button>
            <button className="btn btn-sm" onClick={() => define('base')} disabled={!base} data-testid="button-define-global">
              <Plus size={12} /> Global (Base)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
