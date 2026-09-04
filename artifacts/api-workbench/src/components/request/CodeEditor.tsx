import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { changedSpan, handleEditorKey } from '@/lib/editor-keys';
import { mirrorTokens } from '@/lib/mirror-tokens';
import type { VariableTable } from '@/types';

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** Only 'json' is coloured; everything else gets the key handling alone. */
  language?: 'json' | 'plain';
  placeholder?: string;
  ariaLabel: string;
  testId?: string;
  invalid?: boolean;
  style?: CSSProperties;
  /**
   * Resolved variables, so `{{name}}` is drawn as a variable here too — red
   * when it resolves to nothing. Omit it and the text is coloured but no
   * variable is marked, which is what a caller with nothing to resolve wants.
   */
  variables?: VariableTable;
};

/**
 * A textarea with JSON colouring and the bracket and Tab behaviour of a real
 * editor.
 *
 * The textarea keeps the caret, the selection, undo and the browser's own text
 * handling; its text is transparent, and a mirror behind it paints the same
 * string in colour. Nothing about the mirror is interactive — it exists to be
 * looked at — so the two only have to agree on layout, which is why the
 * `.code-editor` rules set font, padding and wrapping on both at once.
 */
export function CodeEditor({
  value,
  onChange,
  language = 'plain',
  placeholder,
  ariaLabel,
  testId,
  invalid,
  style,
  variables,
}: CodeEditorProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  // Both scroll: the mirror has no scrollbar of its own, so it follows.
  const syncScroll = () => {
    const area = areaRef.current;
    const mirror = mirrorRef.current;
    if (!area || !mirror) return;
    mirror.scrollTop = area.scrollTop;
    mirror.scrollLeft = area.scrollLeft;
  };

  useLayoutEffect(syncScroll, [value]);

  const applyEdit = (next: { value: string; start: number; end: number }) => {
    const area = areaRef.current;
    if (!area) return;
    const current = area.value;

    // Route the change through the browser's own insertion, so one Ctrl+Z
    // undoes it. Assigning `value` directly wipes the undo stack, which is a
    // worse trade than a deprecated call every engine still implements.
    //
    // Only the span that actually changed is replaced. Selecting the whole
    // document and retyping it would work, but it makes every Tab a
    // document-sized undo step and rewrites the entire body on each keystroke.
    const [from, to, insert] = changedSpan(current, next.value);
    try {
      area.setSelectionRange(from, to);
      if (document.execCommand('insertText', false, insert)) {
        area.setSelectionRange(next.start, next.end);
        onChange(next.value);
        return;
      }
    } catch {
      // Fall through to the plain assignment below.
    }

    onChange(next.value);
    // React re-renders from state, so the caret is restored after that lands.
    requestAnimationFrame(() => area.setSelectionRange(next.start, next.end));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const area = event.currentTarget;
    const edit = handleEditorKey(
      { value: area.value, start: area.selectionStart, end: area.selectionEnd },
      event.key,
      event.shiftKey,
    );
    if (!edit) return;
    event.preventDefault();
    if (edit.value === area.value) {
      // A pure caret move, such as stepping over a closing brace.
      area.setSelectionRange(edit.start, edit.end);
      return;
    }
    applyEdit(edit);
  };

  const tokens = mirrorTokens(value, language, variables ?? {});

  return (
    <div className={`code-editor ${invalid ? 'invalid' : ''}`} style={style}>
      <div className="code-mirror" ref={mirrorRef} aria-hidden="true">
        {tokens.map((token, index) => (
          <span
            key={index}
            className={`jt-${token.kind}${token.variable ? ` jt-var${token.variable.defined ? '' : ' missing'}` : ''}`}
          >
            {token.text}
          </span>
        ))}
        {/* A trailing newline collapses in a div but not in a textarea; this
            keeps the last line of the two in the same place. */}
        {'\n'}
      </div>
      <textarea
        ref={areaRef}
        className="code-area"
        value={value}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        aria-label={ariaLabel}
        data-testid={testId}
      />
    </div>
  );
}
