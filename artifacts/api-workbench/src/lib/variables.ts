import type { Environment, Folder, KeyValue } from '@/types';

/**
 * Copying variables from one place to another.
 *
 * Setting up Staging and Production means retyping the same fifteen names that
 * Base already has, which is both tedious and the kind of tedium that produces
 * a typo you only find when a request goes to the wrong host. So the names come
 * across in one step and only the values are yours to change.
 */

/** Somewhere variables can be copied from: an environment or a folder. */
export type VariableSource = {
  id: string;
  name: string;
  kind: 'environment' | 'folder';
  color: string;
  variables: KeyValue[];
};

export type CopyableVariable = {
  key: string;
  value: string;
  /** True when the destination already defines this name. */
  conflict: boolean;
};

/**
 * Everywhere in the workspace that holds variables, minus the destination
 * itself — copying something onto itself is never what was meant.
 */
export function variableSources(
  environments: Environment[],
  folders: Folder[],
  excludeId: string,
): VariableSource[] {
  const fromEnvironments = environments
    .filter((environment) => environment.id !== excludeId)
    .map<VariableSource>((environment) => ({
      id: environment.id,
      name: environment.name,
      kind: 'environment',
      color: environment.color,
      variables: environment.variables ?? [],
    }));

  const fromFolders = folders
    .filter((folder) => folder.id !== excludeId && (folder.variables ?? []).length > 0)
    .map<VariableSource>((folder) => ({
      id: folder.id,
      name: folder.name,
      kind: 'folder',
      color: folder.color,
      variables: folder.variables ?? [],
    }));

  return [...fromEnvironments, ...fromFolders];
}

/**
 * What can be taken from a source, and which of it would land on something the
 * destination already has.
 *
 * A row with no name is skipped: the tables keep a blank trailing row for
 * typing into, and copying it across would just add another blank.
 */
export function copyableVariables(source: KeyValue[], destination: KeyValue[]): CopyableVariable[] {
  const existing = new Set(
    destination.map((item) => item.key.trim()).filter(Boolean),
  );
  const seen = new Set<string>();
  const copyable: CopyableVariable[] = [];

  for (const item of source) {
    const key = item.key.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    copyable.push({ key, value: item.value, conflict: existing.has(key) });
  }
  return copyable;
}

/**
 * Fold the chosen variables into the destination.
 *
 * A name the destination already has is **overwritten in place**, keeping its
 * row: the alternative is two rows with the same name, where which one wins is
 * a detail of iteration order rather than anything a person decided. Ticking a
 * conflicting name is how you say you want it replaced.
 *
 * `withValues: false` brings the names across and leaves the values blank,
 * which is the usual shape of a Staging copied from Production — same keys,
 * different hosts.
 */
export function mergeVariables(
  destination: KeyValue[],
  picked: CopyableVariable[],
  makeRow: (key: string, value: string) => KeyValue,
  withValues = true,
): KeyValue[] {
  const merged = [...destination];
  for (const variable of picked) {
    const value = withValues ? variable.value : '';
    const index = merged.findIndex((item) => item.key.trim() === variable.key);
    if (index === -1) merged.push(makeRow(variable.key, value));
    else merged[index] = { ...merged[index], value, enabled: true };
  }
  return merged;
}
