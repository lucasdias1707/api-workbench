import { describe, expect, it } from 'vitest';
import { changedSpan, closePair, deletePair, handleEditorKey, indent, skipClosing, type EditorSelection } from '@/lib/editor-keys';

/**
 * Writes a case as one string: `|` is the caret, `[...]` is a selection.
 * Reading `at('{"a":|}')` beats three lines setting up offsets.
 */
function at(marked: string): EditorSelection {
  const open = marked.indexOf('[');
  if (open !== -1) {
    const close = marked.indexOf(']', open);
    const value = marked.slice(0, open) + marked.slice(open + 1, close) + marked.slice(close + 1);
    return { value, start: open, end: close - 1 };
  }
  const caret = marked.indexOf('|');
  return { value: marked.replace('|', ''), start: caret, end: caret };
}

/** The inverse, so failures read the same way the cases do. */
function show(edit: ReturnType<typeof indent>): string {
  if (!edit) return '<unhandled>';
  const { value, start, end } = edit;
  if (start === end) return `${value.slice(0, start)}|${value.slice(start)}`;
  return `${value.slice(0, start)}[${value.slice(start, end)}]${value.slice(end)}`;
}

describe('indent', () => {
  it('inserts two spaces at the caret', () => {
    expect(show(indent(at('{"a":|1}'), false))).toBe('{"a":  |1}');
  });

  it('replaces a selection that stays on one line', () => {
    expect(show(indent(at('[abc]def'), false))).toBe('  |def');
  });

  it('shifts every line a multi-line selection touches, and no others', () => {
    // Lines b and c move; a and d are outside the selection and stay put.
    expect(show(indent(at('a\n[b\nc]\nd'), false))).toBe('a\n  [b\n  c]\nd');
  });

  it('outdents the caret line with no selection', () => {
    expect(show(indent(at('    ab|c'), true))).toBe('  ab|c');
  });

  it('outdents only as far as there is indentation to remove', () => {
    expect(show(indent(at(' a|'), true))).toBe('a|');
    expect(show(indent(at('a|'), true))).toBe('a|');
  });

  it('leaves the line below alone when the selection ends at its start', () => {
    // Dragging to the beginning of the next line means "up to here".
    expect(indent(at('[a\n]b'), false)?.value).toBe('  a\nb');
  });
});

describe('closePair', () => {
  it('inserts both halves and puts the caret between them', () => {
    expect(show(closePair(at('|'), '{'))).toBe('{|}');
    expect(show(closePair(at('|'), '['))).toBe('[|]');
    expect(show(closePair(at('|'), '"'))).toBe('"|"');
  });

  it('wraps a selection and keeps it selected', () => {
    expect(show(closePair(at('x[abc]y'), '"'))).toBe('x"[abc]"y');
    expect(show(closePair(at('[a]'), '{'))).toBe('{[a]}');
  });

  it('does not auto-close a quote in front of a word', () => {
    expect(closePair(at('|name'), '"')).toBeNull();
  });

  it('still auto-closes a quote in front of punctuation or nothing', () => {
    expect(show(closePair(at('|}'), '"'))).toBe('"|"}');
    expect(show(closePair(at('a|'), '"'))).toBe('a"|"');
  });

  it('is not fooled by a character that opens nothing', () => {
    expect(closePair(at('|'), 'x')).toBeNull();
  });
});

describe('skipClosing', () => {
  it('steps over the closer instead of adding a second one', () => {
    expect(show(skipClosing(at('{|}'), '}'))).toBe('{}|');
    expect(show(skipClosing(at('"a|"'), '"'))).toBe('"a"|');
  });

  it('declines when the next character is something else', () => {
    expect(skipClosing(at('{|a}'), '}')).toBeNull();
  });

  it('declines while text is selected', () => {
    expect(skipClosing(at('{[a]}'), '}')).toBeNull();
  });
});

describe('deletePair', () => {
  it('takes both halves of an empty pair', () => {
    expect(show(deletePair(at('a{|}b')))).toBe('a|b');
    expect(show(deletePair(at('"|"')))).toBe('|');
  });

  it('leaves a pair with something in it alone', () => {
    expect(deletePair(at('{x|}'))).toBeNull();
  });

  it('leaves mismatched neighbours alone', () => {
    expect(deletePair(at('{|]'))).toBeNull();
  });

  it('declines at the very start of the text', () => {
    expect(deletePair(at('|}'))).toBeNull();
  });
});

describe('handleEditorKey', () => {
  it('lets ordinary typing through untouched', () => {
    expect(handleEditorKey(at('|'), 'a', false)).toBeNull();
    expect(handleEditorKey(at('|'), 'Enter', false)).toBeNull();
  });

  it('routes Tab and Shift+Tab to indent and outdent', () => {
    expect(show(handleEditorKey(at('|a'), 'Tab', false))).toBe('  |a');
    expect(show(handleEditorKey(at('  |a'), 'Tab', true))).toBe('|a');
  });

  it('prefers stepping over a quote to opening a new one', () => {
    expect(show(handleEditorKey(at('"a|"'), '"', false))).toBe('"a"|');
  });

  it('opens a quote when there is no closer waiting', () => {
    expect(show(handleEditorKey(at('|'), '"', false))).toBe('"|"');
  });

  it('wraps a selection in quotes rather than replacing it', () => {
    expect(show(handleEditorKey(at('[abc]'), '"', false))).toBe('"[abc]"');
  });
});

describe('changedSpan', () => {
  /** Applying the span to `before` must always produce `after`. */
  const apply = (before: string, after: string) => {
    const [from, to, insert] = changedSpan(before, after);
    return before.slice(0, from) + insert + before.slice(to);
  };

  it('narrows an insertion to the inserted characters', () => {
    expect(changedSpan('ab', 'aXb')).toEqual([1, 1, 'X']);
  });

  it('narrows a deletion to the removed characters', () => {
    expect(changedSpan('aXb', 'ab')).toEqual([1, 2, '']);
  });

  it('narrows a replacement to the differing middle', () => {
    expect(changedSpan('a{}b', 'a[]b')).toEqual([1, 3, '[]']);
  });

  it('is empty when nothing changed', () => {
    expect(changedSpan('same', 'same')).toEqual([4, 4, '']);
  });

  it('reconstructs the target for the edits the editor actually makes', () => {
    const cases: Array<[string, string]> = [
      ['', '{}'],
      ['{}', '{"a"}'],
      ['a\nb', 'a\n  b'],
      ['  a\n  b', 'a\nb'],
      ['hello', '"hello"'],
      ['{}', ''],
      ['aaa', 'aa'],
      ['ab', 'ba'],
    ];
    for (const [before, after] of cases) {
      expect(apply(before, after)).toBe(after);
    }
  });
});
