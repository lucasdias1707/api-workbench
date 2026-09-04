import { createPm } from '@/lib/pm';
import type { HttpMethod, KeyValue, ResponseRecord } from '@/types';

/**
 * Pre-request and post-response scripts.
 *
 * **These are not sandboxed.** A script is JavaScript compiled with `Function`
 * and run in the app's own context, so it can reach anything the app can — on
 * the desktop build that includes the network and, through Tauri, the machine.
 * That is inherent to the feature rather than an oversight: a script that
 * cannot act is not worth writing. Only run scripts you would run yourself,
 * and treat an imported collection's scripts as code from whoever wrote it.
 *
 * The surface is deliberately small. Everything is on one `carom` object. A
 * Postman-shaped `pm` sits beside it (see `lib/pm.ts`) so a script that arrived
 * with an imported collection runs without being rewritten.
 */

export type ScriptRequestView = {
  method: HttpMethod;
  url: string;
  headers: Array<{ key: string; value: string }>;
  body: string;
};

export type ScriptLogEntry = { source: string; level: 'log' | 'error'; text: string };

/** One `pm.test`, which is a named assertion rather than a thrown failure. */
export type ScriptTest = { source: string; name: string; passed: boolean; error?: string };

export type ScriptOutcome = {
  /** Variable writes the script asked for, applied by the caller. */
  variables: Array<{ key: string; value: string }>;
  /** Header additions a pre-request script made. */
  headers: Array<{ key: string; value: string }>;
  logs: ScriptLogEntry[];
  /** Results of `pm.test`. A failing test does not stop the chain. */
  tests: ScriptTest[];
  /** Set when a script threw; the run stops there. */
  error?: { source: string; message: string };
};

export type ScriptContext = {
  request: ScriptRequestView;
  /** Absent in a pre-request script. */
  response?: ResponseRecord;
  /** Resolved variables the script can read. */
  variables: Record<string, string>;
};

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Run a chain of scripts, collecting what they asked for rather than letting
 * them reach into the store. The caller decides what to do with the result,
 * which is what keeps this testable without a running app.
 *
 * A throw stops the chain: a pre-request script that failed was probably
 * setting up something the request needs, and sending anyway would send
 * something half-built.
 */
export function runScripts(
  steps: Array<{ source: string; code: string }>,
  context: ScriptContext,
): ScriptOutcome {
  const outcome: ScriptOutcome = { variables: [], headers: [], logs: [], tests: [] };
  if (steps.length === 0) return outcome;

  for (const step of steps) {
    const api = {
      request: context.request,
      response: context.response,
      variables: { ...context.variables },
      /** Read a variable, including ones set earlier in this same chain. */
      get: (name: string): string => {
        const written = outcome.variables.findLast((item) => item.key === name);
        return written ? written.value : (context.variables[name] ?? '');
      },
      /** Queue a variable write, applied to the active environment afterwards. */
      set: (name: string, value: unknown): void => {
        if (!name) return;
        outcome.variables.push({ key: name, value: stringify(value) });
      },
      /** Add a header to the outgoing request. Pre-request only. */
      header: (key: string, value: unknown): void => {
        if (!key) return;
        outcome.headers.push({ key, value: stringify(value) });
      },
      /** The response body parsed as JSON, or `null` if it is not JSON. */
      json: (): unknown => {
        if (!context.response) return null;
        try {
          return JSON.parse(context.response.body);
        } catch {
          return null;
        }
      },
    };

    const pm = createPm({
      get: api.get,
      set: api.set,
      header: api.header,
      request: {
        method: context.request.method,
        url: context.request.url,
        headers: context.request.headers,
        body: context.request.body,
      },
      response: context.response
        ? {
            status: context.response.status,
            statusText: context.response.statusText,
            body: context.response.body,
            durationMs: context.response.durationMs,
            headers: context.response.headers,
          }
        : undefined,
      test: (name, passed, error) => outcome.tests.push({ source: step.source, name, passed, error }),
    });

    const console = {
      log: (...args: unknown[]) =>
        outcome.logs.push({ source: step.source, level: 'log' as const, text: args.map(stringify).join(' ') }),
      error: (...args: unknown[]) =>
        outcome.logs.push({ source: step.source, level: 'error' as const, text: args.map(stringify).join(' ') }),
    };

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('carom', 'pm', 'console', `"use strict";\n${step.code}`);
      fn(api, pm, console);
    } catch (error) {
      outcome.error = {
        source: step.source,
        message: error instanceof Error ? error.message : stringify(error),
      };
      return outcome;
    }
  }

  return outcome;
}

/** Fold a script's header additions into the rows a request already carries. */
export function applyScriptHeaders(
  headers: Array<{ key: string; value: string }>,
  added: Array<{ key: string; value: string }>,
): Array<{ key: string; value: string }> {
  if (added.length === 0) return headers;
  const merged = [...headers];
  for (const header of added) {
    // A script setting a header it also wrote by hand means the script wins:
    // it ran later and knows more.
    const index = merged.findIndex((item) => item.key.toLowerCase() === header.key.toLowerCase());
    if (index === -1) merged.push(header);
    else merged[index] = header;
  }
  return merged;
}

/** Turn queued variable writes into rows for the environment they land in. */
export function applyVariableWrites(
  variables: KeyValue[],
  writes: Array<{ key: string; value: string }>,
  makeRow: (key: string, value: string) => KeyValue,
): KeyValue[] {
  const next = [...variables];
  for (const write of writes) {
    const index = next.findIndex((item) => item.key === write.key);
    if (index === -1) next.push(makeRow(write.key, write.value));
    else next[index] = { ...next[index], value: write.value, enabled: true };
  }
  return next;
}
