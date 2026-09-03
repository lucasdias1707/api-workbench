import type { Environment, KeyValue } from '@/types';

const VARIABLE_PATTERN = /\{\{\s*([^}\s][^}]*?)\s*\}\}/g;

export type TemplateToken =
  | { kind: 'text'; text: string }
  | { kind: 'variable'; text: string; name: string; resolved: string | null };

/** Flatten base + active environment variables into a plain lookup table. */
export function resolveVariables(environments: Environment[], activeId: string | null): Record<string, string> {
  const table: Record<string, string> = {};
  const apply = (environment: Environment | undefined) => {
    if (!environment) return;
    for (const variable of environment.variables) {
      if (!variable.enabled || !variable.key.trim()) continue;
      table[variable.key.trim()] = variable.value;
    }
  };
  apply(environments.find((environment) => environment.isBase));
  apply(environments.find((environment) => environment.id === activeId && !environment.isBase));
  return table;
}

/**
 * Replace `{{ name }}` placeholders. Unknown names are left untouched so the
 * user can see what is still missing instead of silently sending an empty
 * string.
 */
export function interpolate(value: string, variables: Record<string, string>): string {
  if (!value) return value;
  return value.replace(VARIABLE_PATTERN, (match, name: string) => {
    const resolved = variables[name.trim()];
    return resolved === undefined ? match : resolved;
  });
}

/** Split a string into literal and variable spans, for highlighted inputs. */
export function tokenize(value: string, variables: Record<string, string>): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(VARIABLE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ kind: 'text', text: value.slice(lastIndex, index) });
    const name = match[1].trim();
    tokens.push({ kind: 'variable', text: match[0], name, resolved: variables[name] ?? null });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) tokens.push({ kind: 'text', text: value.slice(lastIndex) });
  return tokens;
}

/** Variable names referenced by a string but not defined anywhere. */
export function missingVariables(value: string, variables: Record<string, string>): string[] {
  const missing = new Set<string>();
  for (const match of value.matchAll(VARIABLE_PATTERN)) {
    const name = match[1].trim();
    if (variables[name] === undefined) missing.add(name);
  }
  return [...missing];
}

export function interpolateRows(rows: KeyValue[], variables: Record<string, string>): KeyValue[] {
  return rows.map((row) => ({ ...row, key: interpolate(row.key, variables), value: interpolate(row.value, variables) }));
}
