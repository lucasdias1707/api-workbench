export type JsonTokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'plain';

export type JsonToken = { kind: JsonTokenKind; text: string };

const PUNCTUATION = new Set(['{', '}', '[', ']', ',', ':']);
const NUMBER = /-?\d+(\.\d+)?([eE][+-]?\d+)?/y;
const WORD = /[A-Za-z_][A-Za-z0-9_]*/y;

/**
 * Colour JSON that is still being typed.
 *
 * `JSON.parse` is no use here: half-written text is invalid for most of its
 * life, and the editor still has to look like JSON while you write it. So this
 * scans characters and never fails — an unterminated string is a string, a bare
 * word is plain text, and a stray brace is punctuation.
 *
 * The one invariant that matters: joining every token's text reproduces the
 * input exactly. The highlight is painted behind the textarea, so a single lost
 * or added character would slide the colours out from under the caret.
 */
export function lexJson(input: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let plain = '';

  const flush = () => {
    if (plain) {
      tokens.push({ kind: 'plain', text: plain });
      plain = '';
    }
  };
  const push = (kind: JsonTokenKind, text: string) => {
    flush();
    tokens.push({ kind, text });
  };

  let index = 0;
  while (index < input.length) {
    const char = input[index];

    if (char === '"') {
      const start = index;
      index += 1;
      while (index < input.length) {
        if (input[index] === '\\') {
          index += 2;
          continue;
        }
        if (input[index] === '"') {
          index += 1;
          break;
        }
        // A newline ends an unterminated string, so one stray quote cannot
        // paint the whole rest of the document as a string.
        if (input[index] === '\n') break;
        index += 1;
      }
      const text = input.slice(start, Math.min(index, input.length));
      let ahead = index;
      while (ahead < input.length && /\s/.test(input[ahead])) ahead += 1;
      push(input[ahead] === ':' ? 'key' : 'string', text);
      continue;
    }

    if (PUNCTUATION.has(char)) {
      push('punctuation', char);
      index += 1;
      continue;
    }

    if (char === '-' || (char >= '0' && char <= '9')) {
      NUMBER.lastIndex = index;
      const match = NUMBER.exec(input);
      if (match && match.index === index) {
        push('number', match[0]);
        index += match[0].length;
        continue;
      }
    }

    if (/[A-Za-z_]/.test(char)) {
      WORD.lastIndex = index;
      const match = WORD.exec(input) as RegExpExecArray;
      const word = match[0];
      if (word === 'true' || word === 'false') push('boolean', word);
      else if (word === 'null') push('null', word);
      else plain += word;
      index += word.length;
      continue;
    }

    plain += char;
    index += 1;
  }

  flush();
  return tokens;
}
