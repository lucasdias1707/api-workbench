import { timingSafeEqual } from "node:crypto";
import { allowsPrivateNetwork } from "./net-guard";

/**
 * Access control for the request forwarder.
 *
 * The forwarder is only as safe as whatever sits in front of it. A reverse
 * proxy holding the password can inject a shared secret on the requests it
 * forwards, which the frontend never sees, so reaching the server directly is
 * not enough to use it.
 */

export const PROXY_AUTH_HEADER = "x-proxy-auth";

export type AccessVerdict =
  | { allowed: true }
  | { allowed: false; status: number; code: string; message: string };

function secretsMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  // timingSafeEqual throws on length mismatch, so compare lengths separately.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type AccessConfig = {
  sharedSecret: string | undefined;
  isProduction: boolean;
  privateNetworkAllowed: boolean;
};

export function readAccessConfig(env: NodeJS.ProcessEnv = process.env): AccessConfig {
  return {
    sharedSecret: env["PROXY_SHARED_SECRET"]?.trim() || undefined,
    isProduction: env["NODE_ENV"] === "production",
    privateNetworkAllowed: allowsPrivateNetwork(),
  };
}

/**
 * Decide whether one forwarding request may proceed.
 *
 * Reaching private networks turns the forwarder into a way into everything the
 * host can see, so that combination refuses to run unauthenticated in
 * production rather than quietly exposing the network it sits in.
 */
export function checkProxyAccess(config: AccessConfig, headerValue: string | undefined): AccessVerdict {
  if (!config.sharedSecret) {
    if (config.isProduction && config.privateNetworkAllowed) {
      return {
        allowed: false,
        status: 503,
        code: "proxy_unconfigured",
        message:
          "This server allows private network targets but has no PROXY_SHARED_SECRET, which would let anyone who reaches it into the private network around it. Set PROXY_SHARED_SECRET and have your reverse proxy send it as the X-Proxy-Auth header.",
      };
    }
    return { allowed: true };
  }

  if (!headerValue || !secretsMatch(config.sharedSecret, headerValue)) {
    return {
      allowed: false,
      status: 401,
      code: "proxy_unauthorized",
      message: "Missing or invalid X-Proxy-Auth header.",
    };
  }

  return { allowed: true };
}
