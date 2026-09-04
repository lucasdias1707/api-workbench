/**
 * The editing rules behind the body editor's Tab and bracket keys.
 *
 * They are pure on purpose: each takes the text and where the selection is,
 * and returns the text and where the selection should end up. No textarea, no
 * events — the component applies the result, and these can be read and tested
 * as the small string operations they are.
 */

export type EditorSelection = {
  value: string;
  /** Caret position, or the start of the selection. */
  start: number;
  /** Equal to `start` when nothing is selected. */
  end: number;
};

/** `null` means "we are not handling this key", so the browser does its thing. */
export type EditorEdit = EditorSelection | null;

export const INDENT = '  ';

/** Typing the opening half of one of these inserts the closing half too. */
export const PAIRS: Record<string, string> = { '{': '}', '[': ']', '"': '"' };

const CLOSERS = new Set(Object.values(PAIRS));

function splice(value: string, start: number, end: number, text: string): string {
  return value.slice(0, start) + text + value.slice(end);
}

/** Start of the line `index` sits on. */
function lineStartAt(value: string, index: number): number {
  return value.lastIndexOf('\n', index - 1) + 1;
}

/**
 * The block of whole lines the selection touches.
 *
 * A selection that ends exactly at a line start does not include that line —
 * dragging to the beginning of the next line is how people select "up to here",
 * and indenting the untouched line below would be a surprise.
 */
function lineBlock(value: string, start: number, end: number): { from: number; to: number } {
  const lastCharacter = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const from = lineStartAt(value, start);
  const newline = value.indexOf('\n', lastCharacter);
  return { from, to: newline === -1 ? value.length : newline };
}

/**
 * Tab, and Shift+Tab.
 *
 * A selection spanning lines shifts every line it touches. Anything smaller
 * inserts one indent at the caret, which is what a Tab in a text field is for.
 */
export function indent(selection: EditorSelection, outdent: boolean): EditorEdit {
  const { value, start, end } = selection;
  const spansLines = value.slice(start, end).includes('\n');

  if (!spansLines && !outdent) {
    return { value: splice(value, start, end, INDENT), start: start + INDENT.length, end: start + INDENT.length };
  }

  const { from, to } = lineBlock(value, start, end);
  const lines = value.slice(from, to).split('\n');

  if (outdent) {
    let removedFirst = 0;
    let removedTotal = 0;
    const shifted = lines.map((line, index) => {
      const width = Math.min(line.length - line.trimStart().length, INDENT.length);
      if (index === 0) removedFirst = width;
      removedTotal += width;
      return line.slice(width);
    });
    return {
      value: splice(value, from, to, shifted.join('\n')),
      start: Math.max(from, start - removedFirst),
      end: Math.max(from, end - removedTotal),
    };
  }

  const shifted = lines.map((line) => INDENT + line);
  return {
    value: splice(value, from, to, shifted.join('\n')),
    start: start + INDENT.length,
    end: end + INDENT.length * lines.length,
  };
}

/**
 * `{`, `[` and `"`.
 *
 * With text selected, the pair goes around it and the selection survives, so
 * quoting a word is select-then-press. With no selection, both halves are
 * inserted and the caret lands between them.
 */
export function closePair(selection: EditorSelection, opener: string): EditorEdit {
  const closer = PAIRS[opener];
  if (!closer) return null;
  const { value, start, end } = selection;

  if (start !== end) {
    const inner = value.slice(start, end);
    return { value: splice(value, start, end, opener + inner + closer), start: start + 1, end: end + 1 };
  }

  // Auto-closing a quote right before a word would cut that word out of the
  // string it is about to join. Braces do not have this problem.
  if (opener === '"' && /[A-Za-z0-9_]/.test(value[start] ?? '')) return null;

  return { value: splice(value, start, start, opener + closer), start: start + 1, end: start + 1 };
}

/**
 * Typing the closing half when it is already there just steps over it, so
 * finishing a pair by hand does not leave a stray `}}`.
 */
export function skipClosing(selection: EditorSelection, closer: string): EditorEdit {
  const { value, start, end } = selection;
  if (start !== end) return null;
  if (!CLOSERS.has(closer) || value[start] !== closer) return null;
  return { value, start: start + 1, end: start + 1 };
}

/** Backspace inside an empty pair takes both halves. */
export function deletePair(selection: EditorSelection): EditorEdit {
  const { value, start, end } = selection;
  if (start !== end || start === 0) return null;
  const before = value[start - 1];
  if (PAIRS[before] !== value[start]) return null;
  return { value: splice(value, start - 1, start + 1, ''), start: start - 1, end: start - 1 };
}

/**
 * Route a keypress to the rule that handles it, or `null` to let the browser
 * handle it. Quotes are ambiguous — the same key both opens and closes — so
 * stepping over an existing one wins over opening a new pair.
 */
export function handleEditorKey(selection: EditorSelection, key: string, shiftKey: boolean): EditorEdit {
  if (key === 'Tab') return indent(selection, shiftKey);
  if (key === 'Backspace') return deletePair(selection);
  if (CLOSERS.has(key)) {
    const skipped = skipClosing(selection, key);
    if (skipped) return skipped;
  }
  if (key in PAIRS) return closePair(selection, key);
  return null;
}

/**
 * The one stretch of text that differs between two strings, as
 * `[start, end, replacement]`.
 *
 * The component replaces only this span rather than the whole document, so a
 * Tab is one small undo step instead of a rewrite of the entire body.
 */
export function changedSpan(before: string, after: string): [number, number, string] {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start += 1;
  let tail = 0;
  while (tail < max - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  return [start, before.length - tail, after.slice(start, after.length - tail)];
}
