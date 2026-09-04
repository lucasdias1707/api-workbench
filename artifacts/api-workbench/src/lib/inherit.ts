import type { Auth, Folder, RequestRecord } from '@/types';

/**
 * What a request actually uses when it says it inherits.
 *
 * Auth and scripts both hang off folders now, and both resolve against the
 * chain of folders a request sits in. They resolve differently on purpose:
 * auth is a single choice, so the nearest folder that made one wins, while
 * scripts stack, because a folder-level script is meant to run *as well as*
 * the request's, not instead of it.
 */

export type AuthSource =
  | { from: 'request'; auth: Auth }
  | { from: 'folder'; auth: Auth; folder: Folder }
  | { from: 'none'; auth: Auth };

const NO_AUTH: Auth = {
  type: 'none',
  token: '',
  username: '',
  password: '',
  apiKeyName: '',
  apiKeyValue: '',
  apiKeyIn: 'header',
};

/**
 * Resolve a request's auth, and say where it came from so the editor can show
 * what is being inherited rather than an empty form.
 *
 * `chain` is the folders from the request outwards, nearest first — the order
 * `folderChain` returns.
 */
export function resolveAuth(auth: Auth, chain: Folder[]): AuthSource {
  if (auth.type !== 'inherit') return { from: 'request', auth };

  for (const folder of chain) {
    if (folder.auth?.type && folder.auth.type !== 'inherit') {
      return { from: 'folder', auth: folder.auth, folder };
    }
  }

  // Nothing up the chain chose one, which is the same as choosing none.
  return { from: 'none', auth: NO_AUTH };
}

/**
 * The scripts to run for a request, in the order they run.
 *
 * Pre-request scripts run outermost folder first, so a folder can set up
 * something its contents depend on. Post-response scripts run the other way,
 * innermost first, so a request can act on its own response before the folder
 * sees it — the same nesting a try/finally would give.
 */
export function scriptChain(
  request: RequestRecord,
  chain: Folder[],
  phase: 'pre' | 'post',
): Array<{ source: string; code: string }> {
  const field = phase === 'pre' ? 'preScript' : 'postScript';
  const folders = phase === 'pre' ? [...chain].reverse() : chain;

  const steps: Array<{ source: string; code: string }> = [];
  const push = (source: string, code: string | undefined) => {
    if (code && code.trim()) steps.push({ source, code });
  };

  if (phase === 'pre') {
    for (const folder of folders) push(`folder “${folder.name}”`, folder[field]);
    push('request', request[field]);
  } else {
    push('request', request[field]);
    for (const folder of folders) push(`folder “${folder.name}”`, folder[field]);
  }

  return steps;
}
