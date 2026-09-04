import { lexJson, type JsonToken, type JsonTokenKind } from '@/lib/json-lexer';
import { VARIABLE_PATTERN } from '@/lib/template';
import type { VariableTable } from '@/types';

/**
 * What the editor's mirror paints: JSON colouring with `{{variables}}` picked
 * out on top of it.
 *
 * The two have to be layered rather than chosen between. A body is JSON *and*
 * carries variables — `{"name":"{{first_name}}"}` is both a string token and a
 * variable inside it — and before this the variable was simply drawn as part of
 * the string, so a typo like `{{frist_name}}` looked exactly like a correct
 * one and went out on the wire as literal text.
 *
 * The invariant from `lexJson` carries over unchanged and matters just as much:
 * joining every token's text must reproduce the input exactly, because this is
 * painted behind a transparent textarea and one lost character slides every
 * colour out from under the caret.
 */
export type MirrorToken = {
  kind: JsonTokenKind;
  text: string;
  /** Set on a `{{...}}` span. `defined` is false when it resolves to nothing. */
  variable?: { name: string; defined: boolean };
};

/** Split one token's text on its variables, keeping the token's own kind. */
function splitToken(token: JsonToken, table: VariableTable): MirrorToken[] {
  // `matchAll` needs a fresh lastIndex, and the pattern is a shared global.
  const matches = [...token.text.matchAll(VARIABLE_PATTERN)];
  if (matches.length === 0) return [token];

  const parts: MirrorToken[] = [];
  let cursor = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ kind: token.kind, text: token.text.slice(cursor, index) });
    const name = match[1].trim();
    parts.push({
      kind: token.kind,
      text: match[0],
      variable: { name, defined: table[name] !== undefined },
    });
    cursor = index + match[0].length;
  }
  if (cursor < token.text.length) parts.push({ kind: token.kind, text: token.text.slice(cursor) });
  return parts;
}

/**
 * Tokens for the mirror.
 *
 * `language` decides only whether JSON colouring runs underneath; variables are
 * picked out either way, because a GraphQL query or a script uses them just as
 * a JSON body does.
 */
export function mirrorTokens(
  value: string,
  language: 'json' | 'plain',
  table: VariableTable,
): MirrorToken[] {
  const base: JsonToken[] = language === 'json' ? lexJson(value) : [{ kind: 'plain', text: value }];
  return base.flatMap((token) => splitToken(token, table));
}
