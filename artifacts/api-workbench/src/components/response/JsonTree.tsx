import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Nodes deeper than this start collapsed so huge payloads stay navigable. */
const AUTO_COLLAPSE_DEPTH = 3;
/** Children rendered before a "show more" control appears. */
const PAGE_SIZE = 100;

function isContainer(value: JsonValue): value is JsonValue[] | { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object';
}

function summarize(value: JsonValue[] | { [key: string]: JsonValue }): string {
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  const size = Object.keys(value).length;
  return `${size} ${size === 1 ? 'key' : 'keys'}`;
}

function Highlighted({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="json-highlight">{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  );
}

function Leaf({ value, term }: { value: JsonValue; term: string }) {
  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === 'string')
    return (
      <span className="json-string">
        "<Highlighted text={value} term={term} />"
      </span>
    );
  if (typeof value === 'number') return <span className="json-number">{String(value)}</span>;
  return <span className="json-boolean">{String(value)}</span>;
}

type NodeProps = {
  label: string | null;
  value: JsonValue;
  depth: number;
  term: string;
  isLast: boolean;
};

function Node({ label, value, depth, term, isLast }: NodeProps) {
  const [open, setOpen] = useState(depth < AUTO_COLLAPSE_DEPTH);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const entries = useMemo<Array<[string, JsonValue]>>(() => {
    if (!isContainer(value)) return [];
    return Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value);
  }, [value]);

  const keyNode = label === null ? null : (
    <>
      <span className="json-key">
        "<Highlighted text={label} term={term} />"
      </span>
      <span className="json-punct">:</span>
    </>
  );

  if (!isContainer(value)) {
    return (
      <div className="json-line" style={{ paddingLeft: label === null ? 0 : 15 }}>
        {keyNode}
        <Leaf value={value} term={term} />
        {isLast ? null : <span className="json-punct">,</span>}
      </div>
    );
  }

  const [openBracket, closeBracket] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  const visible = entries.slice(0, limit);

  return (
    <div className="json-node">
      <div className="json-line">
        <button
          className="json-toggle"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        {keyNode}
        <span className="json-punct">{openBracket}</span>
        {open ? null : (
          <>
            <span className="json-preview">{summarize(value)}</span>
            <span className="json-punct">
              {closeBracket}
              {isLast ? '' : ','}
            </span>
          </>
        )}
      </div>
      {open ? (
        <>
          <div className="json-children">
            {visible.map(([childKey, childValue], index) => (
              <Node
                key={childKey}
                label={Array.isArray(value) ? null : childKey}
                value={childValue}
                depth={depth + 1}
                term={term}
                isLast={index === entries.length - 1}
              />
            ))}
            {entries.length > limit ? (
              <button className="btn btn-sm btn-ghost" onClick={() => setLimit((current) => current + PAGE_SIZE * 5)}>
                Show {Math.min(PAGE_SIZE * 5, entries.length - limit)} more of {entries.length}
              </button>
            ) : null}
          </div>
          <div className="json-line">
            <span className="json-toggle" aria-hidden="true" />
            <span className="json-punct">
              {closeBracket}
              {isLast ? '' : ','}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Collapsible viewer for a parsed JSON payload. */
export function JsonTree({ data, term }: { data: unknown; term: string }) {
  return (
    <div className="json-tree" data-testid="display-json-tree">
      <Node label={null} value={data as JsonValue} depth={0} term={term} isLast />
    </div>
  );
}
