import { useCallback, useRef, useState } from 'react';
import { prepareRequest, sendRequest, toErrorResponse } from '@/lib/http';
import { PROXY_BASE_URL, type ProxyStatus } from '@/hooks/use-proxy-health';
import { useWorkspace } from '@/state/workspace-store';
import type { RequestRecord } from '@/types';

export type SendState = {
  sending: boolean;
  send: (request: RequestRecord) => Promise<void>;
  cancel: () => void;
  lastError: string | null;
};

/** Drive one in-flight request at a time, storing the result in the workspace. */
export function useSendRequest(proxyStatus: ProxyStatus): SendState {
  const { state, variables, dispatch } = useWorkspace();
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
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

      const timeout = window.setTimeout(() => controller.abort(), state.settings.timeoutMs);
      const started = performance.now();

      try {
        const prepared = prepareRequest(request, variables);
        if (!prepared.url.trim()) throw new Error('Enter a URL before sending.');

        const result = await sendRequest(prepared, {
          mode: state.settings.sendMode,
          timeoutMs: state.settings.timeoutMs,
          followRedirects: state.settings.followRedirects,
          proxyBaseUrl: PROXY_BASE_URL,
          proxyAvailable: proxyStatus === 'available',
          signal: controller.signal,
        });
        dispatch({ type: 'response/add', response: { ...result, requestId: request.id } });
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
    [dispatch, proxyStatus, state.settings, variables],
  );

  return { sending, send, cancel, lastError };
}
