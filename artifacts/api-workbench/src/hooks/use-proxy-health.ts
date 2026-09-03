import { useEffect, useState } from 'react';

/**
 * Base URL of the companion API server. It is same-origin in the Replit
 * preview (the router maps `/api` to the server) and can be pointed elsewhere
 * with `VITE_API_BASE_URL` for other setups.
 */
export const PROXY_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

export type ProxyStatus = 'checking' | 'available' | 'unavailable';

/** Poll the server once on mount so `auto` send mode knows what it can use. */
export function useProxyHealth(): { status: ProxyStatus; recheck: () => void } {
  const [status, setStatus] = useState<ProxyStatus>('checking');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);

    fetch(`${PROXY_BASE_URL}/healthz`, { signal: controller.signal })
      .then((response) => {
        if (!cancelled) setStatus(response.ok ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [nonce]);

  return { status, recheck: () => setNonce((current) => current + 1) };
}
