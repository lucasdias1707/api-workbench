import { useCallback, useRef, useState } from 'react';
import { prepareRequest, sendRequest, toErrorResponse } from '@/lib/http';
import { scriptChain } from '@/lib/inherit';
import { applyVariableWrites, runScripts, type ScriptLogEntry, type ScriptTest } from '@/lib/scripts';
import { row } from '@/lib/factories';
import { folderChain } from '@/state/selectors';
import { PROXY_BASE_URL, type ProxyStatus } from '@/hooks/use-proxy-health';
import { useWorkspace } from '@/state/workspace-store';
import type { Environment, RequestRecord, ResponseRecord } from '@/types';

export type SendState = {
  sending: boolean;
  send: (request: RequestRecord) => Promise<void>;
  cancel: () => void;
  lastError: string | null;
  /** What the last run's scripts printed and asserted, for the console. */
  scriptLogs: ScriptLogEntry[];
  scriptTests: ScriptTest[];
};

/** Drive one in-flight request at a time, storing the result in the workspace. */
export function useSendRequest(proxyStatus: ProxyStatus): SendState {
  const { state, variables, dispatch } = useWorkspace();
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [scriptLogs, setScriptLogs] = useState<ScriptLogEntry[]>([]);
  const [scriptTests, setScriptTests] = useState<ScriptTest[]>([]);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setSending(false);
  }, []);

  const send = useCallback(
    async (request: RequestRecord) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setSending(true);
      setLastError(null);
      setScriptLogs([]);
      setScriptTests([]);

      const timeout = window.setTimeout(() => controller.abort(), state.settings.timeoutMs);
      const started = performance.now();
      const chain = folderChain(state, request.folderId);

      // A script writes into whichever environment is active, falling back to
      // the base one. Writing into the request would be surprising: `pm.set`
      // in a collection means "remember this for the next request", and the
      // environment is the only place that outlives one.
      const target =
        state.environments.find((environment) => environment.id === state.activeEnvironmentId) ??
        state.environments.find(
          (environment) => environment.workspaceId === state.activeWorkspaceId && environment.isBase,
        );

      const store = (writes: Array<{ key: string; value: string }>, environment: Environment | undefined) => {
        if (!environment || writes.length === 0) return;
        dispatch({
          type: 'environment/update',
          id: environment.id,
          patch: { variables: applyVariableWrites(environment.variables, writes, (key, value) => row(key, value)) },
        });
      };

      try {
        const view = {
          method: request.method,
          url: request.url,
          headers: request.headers
            .filter((header) => header.enabled && header.key.trim())
            .map((header) => ({ key: header.key, value: header.value })),
          body: request.body,
        };

        const pre = runScripts(scriptChain(request, chain, 'pre'), { request: view, variables });
        setScriptLogs(pre.logs);
        setScriptTests(pre.tests);
        store(pre.variables, target);
        if (pre.error) {
          // The script was setting up something the request needs; sending
          // half-prepared would be worse than not sending.
          throw new Error(`Pre-request script failed in ${pre.error.source}: ${pre.error.message}`);
        }

        // Variables a pre-request script just wrote apply to this request too,
        // which is the entire point of writing one.
        const resolved = { ...variables };
        for (const write of pre.variables) resolved[write.key] = write.value;

        const prepared = prepareRequest(request, resolved, { folders: chain, extraHeaders: pre.headers });
        if (!prepared.url.trim()) throw new Error('Enter a URL before sending.');

        const result = await sendRequest(prepared, {
          mode: state.settings.sendMode,
          timeoutMs: state.settings.timeoutMs,
          followRedirects: state.settings.followRedirects,
          proxyBaseUrl: PROXY_BASE_URL,
          proxyAvailable: proxyStatus === 'available',
          signal: controller.signal,
        });
        const response: ResponseRecord = { ...result, requestId: request.id };
        dispatch({ type: 'response/add', response });

        const post = runScripts(scriptChain(request, chain, 'post'), {
          request: { ...view, url: prepared.url },
          response,
          variables: resolved,
        });
        setScriptLogs((current) => [...current, ...post.logs]);
        setScriptTests((current) => [...current, ...post.tests]);
        store(post.variables, target);
        // A post-response script failing does not undo the response, which is
        // already recorded; it is reported the same way a send failure is.
        if (post.error) setLastError(`Post-response script failed in ${post.error.source}: ${post.error.message}`);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // Cancelled by the user or by the timeout; nothing to record.
          setLastError(controller.signal.reason === 'timeout' ? 'Request timed out.' : null);
          return;
        }
        const prepared = { method: request.method, url: request.url, headers: [], body: { type: 'none' } as const };
        const failure = toErrorResponse(prepared, error, Math.round(performance.now() - started));
        dispatch({ type: 'response/add', response: { ...failure, requestId: request.id } });
        setLastError(failure.error ?? 'Request failed.');
      } finally {
        window.clearTimeout(timeout);
        if (controllerRef.current === controller) controllerRef.current = null;
        setSending(false);
      }
    },
    [dispatch, proxyStatus, state, variables],
  );

  return { sending, send, cancel, lastError, scriptLogs, scriptTests };
}
