import { describe, expect, it } from "vitest";
import { checkProxyAccess, readAccessConfig, type AccessConfig } from "../proxy-access";

const base: AccessConfig = { sharedSecret: undefined, isProduction: false, privateNetworkAllowed: false };

describe("checkProxyAccess", () => {
  it("stays open in local development, where there is nothing in front of it", () => {
    expect(checkProxyAccess(base, undefined)).toEqual({ allowed: true });
    expect(checkProxyAccess({ ...base, privateNetworkAllowed: true }, undefined)).toEqual({ allowed: true });
  });

  it("refuses to serve when production allows private targets with no secret set", () => {
    const verdict = checkProxyAccess({ ...base, isProduction: true, privateNetworkAllowed: true }, undefined);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.status).toBe(503);
      expect(verdict.code).toBe("proxy_unconfigured");
      expect(verdict.message).toMatch(/PROXY_SHARED_SECRET/);
    }
  });

  it("still serves public-only production without a secret", () => {
    // Reaching the public internet unauthenticated is a lesser exposure than
    // reaching the private network, and is the documented default.
    expect(checkProxyAccess({ ...base, isProduction: true }, undefined)).toEqual({ allowed: true });
  });

  it("accepts the matching secret", () => {
    expect(checkProxyAccess({ ...base, sharedSecret: "s3cret" }, "s3cret")).toEqual({ allowed: true });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["wrong", "nope"],
    ["a prefix of the secret", "s3cre"],
    ["the secret plus padding", "s3cret "],
  ])("rejects %s credentials", (_label, header) => {
    const verdict = checkProxyAccess({ ...base, sharedSecret: "s3cret" }, header);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.status).toBe(401);
  });

  it("requires the secret even when the dangerous combination is configured", () => {
    const config: AccessConfig = { sharedSecret: "s3cret", isProduction: true, privateNetworkAllowed: true };
    expect(checkProxyAccess(config, "s3cret")).toEqual({ allowed: true });
    expect(checkProxyAccess(config, undefined).allowed).toBe(false);
  });
});

describe("readAccessConfig", () => {
  it("treats a blank secret as unset", () => {
    expect(readAccessConfig({ PROXY_SHARED_SECRET: "   " } as NodeJS.ProcessEnv).sharedSecret).toBeUndefined();
  });

  it("trims the configured secret", () => {
    expect(readAccessConfig({ PROXY_SHARED_SECRET: " abc " } as NodeJS.ProcessEnv).sharedSecret).toBe("abc");
  });
});
