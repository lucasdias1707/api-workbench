import { useEffect, useState } from 'react';

/**
 * Base URL of the companion API server. Same-origin by default, which is how
 * the dev server and a single-host deployment both serve it; point it
 * elsewhere with `VITE_API_BASE_URL` when the API lives on another host.
 */
export const PROXY_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

export type ProxyStatus = 'checking' | 'available' | 'unavailable';

/** How long to wait for the health check before assuming there is no server. */
const HEALTH_TIMEOUT_MS = 4000;

/**
 * A 200 is not enough to conclude the server is there.
 *
 * The production artifact serves the frontend statically with a catch-all
 * rewrite to index.html, and a page hosted anywhere else does the same, so an
 * unrouted `/api/healthz` answers 200 with HTML. Only our own health payload
 * counts, otherwise every send would take a doomed trip through the proxy
 * before falling back to the browser.
 */
export function isHealthPayload(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { status?: unknown }).status === 'ok';
}

/** Probe the server once on mount so `auto` send mode knows what it can use. */
export function useProxyHealth(): { status: ProxyStatus; recheck: () => void } {
  const [status, setStatus] = useState<ProxyStatus>('checking');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    const probe = async () => {
      try {
        const response = await fetch(`${PROXY_BASE_URL}/healthz`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return false;
        return isHealthPayload(await response.json());
      } catch {
        // Network failure, a timeout, or a body that is not JSON at all.
        return false;
      }
    };

    void probe().then((healthy) => {
      window.clearTimeout(timer);
      if (!cancelled) setStatus(healthy ? 'available' : 'unavailable');
    });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [nonce]);

  return { status, recheck: () => setNonce((current) => current + 1) };
}
