import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { LOCAL_VARIABLE_COLOR, tokenize } from '@/lib/template';
import { VariablePopover } from '@/components/request/VariablePopover';
import type { ResolvedVariable, VariableTable } from '@/types';

type TemplateFieldProps = {
  value: string;
  table: VariableTable;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  ariaLabel: string;
  testId?: string;
  className?: string;
};

/**
 * A text input whose `{{variables}}` are drawn coloured, hoverable and
 * clickable.
 *
 * The input keeps its own text transparent and a mirror sits on top rendering
 * the same string with markup. The mirror ignores the pointer everywhere except
 * on the variable chips, so typing, selection and the caret still belong to the
 * real input.
 */
export function TemplateField({
  value,
  table,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  testId,
  className,
}: TemplateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ variable: ResolvedVariable | null; name: string; anchor: DOMRect } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const tokens = tokenize(value, table);

  useLayoutEffect(() => {
    if (mirrorRef.current) mirrorRef.current.scrollLeft = scrollLeft;
  }, [scrollLeft, value]);

  return (
    <div className={`template-field ${className ?? ''}`}>
      <div className="template-mirror" ref={mirrorRef} aria-hidden="true">
        {tokens.map((token, index) => {
          if (token.kind === 'text') return <span key={index}>{token.text}</span>;
          const resolved = token.resolved;
          const style: CSSProperties = resolved
            ? { '--var-color': resolved.scope === 'folder' ? LOCAL_VARIABLE_COLOR : resolved.color } as CSSProperties
            : {};
          return (
            <button
              key={index}
              type="button"
              tabIndex={-1}
              className={`var-chip ${resolved ? '' : 'missing'}`}
              style={style}
              title={
                resolved
                  ? `${resolved.value || '(empty)'}\n${scopeLabel(resolved)}`
                  : `${token.name} is not defined in this workspace`
              }
              onClick={(event) => {
                event.preventDefault();
                setEditing({
                  variable: resolved,
                  name: token.name,
                  anchor: event.currentTarget.getBoundingClientRect(),
                });
              }}
              data-testid={`var-chip-${token.name}`}
            >
              {token.text}
            </button>
          );
        })}
      </div>
      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
        aria-label={ariaLabel}
        data-testid={testId}
      />
      {editing ? (
        <VariablePopover
          name={editing.name}
          variable={editing.variable}
          anchor={editing.anchor}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

export function scopeLabel(variable: ResolvedVariable): string {
  const where = variable.scope === 'folder' ? `folder “${variable.sourceName}”` : `environment “${variable.sourceName}”`;
  const scope = variable.scope === 'folder' ? 'local' : 'global';
  const shadowed = variable.shadowed.length
    ? ` · overrides ${variable.shadowed.length} other definition${variable.shadowed.length === 1 ? '' : 's'}`
    : '';
  return `${scope} · from ${where}${shadowed}`;
}
