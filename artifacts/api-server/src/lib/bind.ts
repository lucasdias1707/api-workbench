/**
 * Interface the server listens on.
 *
 * The default stays `0.0.0.0` because managed hosts route to the container from
 * outside and need every interface. A deployment that puts a reverse proxy in
 * front should set `HOST=127.0.0.1`, so the only way in is through that proxy
 * and whatever auth it enforces — the request forwarder must never be reachable
 * on its own.
 */
export function resolveBindHost(value: string | undefined): string {
  const host = value?.trim();
  return host ? host : "0.0.0.0";
}

export function resolvePort(value: string | undefined): number {
  if (!value) {
    throw new Error("PORT environment variable is required but was not provided.");
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: "${value}"`);
  }
  return port;
}
