import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * The proxy forwards requests on behalf of whoever can reach it, so an
 * unguarded version is a server-side request forgery primitive. These checks
 * keep it pointed at the public internet unless the operator opts in.
 */

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
]);

/** Cloud metadata services, blocked even when private networking is allowed. */
const ALWAYS_BLOCKED_ADDRESSES = new Set(["169.254.169.254", "fd00:ec2::254"]);

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export type GuardResult = { ok: true; url: URL } | { ok: false; reason: string };

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(normalized)) return true; // unique local
  // IPv4-mapped addresses such as ::ffff:127.0.0.1
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  return false;
}

/** Private targets are allowed in development so `localhost` APIs are testable. */
export function allowsPrivateNetwork(): boolean {
  const flag = process.env["PROXY_ALLOW_PRIVATE_NETWORK"];
  if (flag !== undefined) return flag === "true" || flag === "1";
  return process.env["NODE_ENV"] !== "production";
}

/**
 * Validate a target URL and resolve its hostname so a public-looking name
 * cannot point at an internal address.
 */
export async function guardTargetUrl(rawUrl: string): Promise<GuardResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "The URL is not valid. Include the scheme, for example https://example.com." };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `Only http and https are supported, got ${url.protocol.replace(":", "")}.` };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "That host is blocked by the proxy." };
  }

  const addresses: string[] = [];
  if (isIP(hostname)) {
    addresses.push(hostname);
  } else {
    try {
      const resolved = await lookup(hostname, { all: true });
      addresses.push(...resolved.map((entry) => entry.address));
    } catch {
      return { ok: false, reason: `Could not resolve ${hostname}.` };
    }
  }

  for (const address of addresses) {
    if (ALWAYS_BLOCKED_ADDRESSES.has(address)) {
      return { ok: false, reason: "That host is blocked by the proxy." };
    }
    if (isPrivateAddress(address) && !allowsPrivateNetwork()) {
      return {
        ok: false,
        reason:
          "This host resolves to a private address. Set PROXY_ALLOW_PRIVATE_NETWORK=true to allow it, or send the request from the browser instead.",
      };
    }
  }

  return { ok: true, url };
}
