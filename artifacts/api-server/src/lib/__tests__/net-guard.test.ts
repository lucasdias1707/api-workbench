import { afterEach, describe, expect, it } from "vitest";
import { allowsPrivateNetwork, guardTargetUrl, isPrivateAddress } from "../net-guard";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("isPrivateAddress", () => {
  it.each([
    "10.0.0.1",
    "127.0.0.1",
    "172.16.5.4",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
  ])("treats %s as private", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.1.1", "2606:4700::1111"])(
    "treats %s as public",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe("allowsPrivateNetwork", () => {
  it("is off in production by default", () => {
    process.env["NODE_ENV"] = "production";
    delete process.env["PROXY_ALLOW_PRIVATE_NETWORK"];
    expect(allowsPrivateNetwork()).toBe(false);
  });

  it("is on outside production by default", () => {
    process.env["NODE_ENV"] = "development";
    delete process.env["PROXY_ALLOW_PRIVATE_NETWORK"];
    expect(allowsPrivateNetwork()).toBe(true);
  });

  it("honours an explicit opt-in", () => {
    process.env["NODE_ENV"] = "production";
    process.env["PROXY_ALLOW_PRIVATE_NETWORK"] = "true";
    expect(allowsPrivateNetwork()).toBe(true);
  });

  it("honours an explicit opt-out", () => {
    process.env["NODE_ENV"] = "development";
    process.env["PROXY_ALLOW_PRIVATE_NETWORK"] = "false";
    expect(allowsPrivateNetwork()).toBe(false);
  });
});

describe("guardTargetUrl", () => {
  it("rejects a malformed URL", async () => {
    await expect(guardTargetUrl("not a url")).resolves.toMatchObject({ ok: false });
  });

  it.each(["file:///etc/passwd", "ftp://example.com", "gopher://example.com"])(
    "rejects the %s scheme",
    async (url) => {
      const result = await guardTargetUrl(url);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/http and https/);
    },
  );

  it("always blocks the cloud metadata address, even with private access on", async () => {
    process.env["PROXY_ALLOW_PRIVATE_NETWORK"] = "true";
    const result = await guardTargetUrl("http://169.254.169.254/latest/meta-data/");
    expect(result.ok).toBe(false);
  });

  it("always blocks the metadata hostname", async () => {
    process.env["PROXY_ALLOW_PRIVATE_NETWORK"] = "true";
    const result = await guardTargetUrl("http://metadata.google.internal/");
    expect(result.ok).toBe(false);
  });

  it("blocks loopback when private access is off", async () => {
    process.env["PROXY_ALLOW_PRIVATE_NETWORK"] = "false";
    const result = await guardTargetUrl("http://127.0.0.1:8080/api/healthz");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/private address/);
  });

  it("allows loopback when private access is on", async () => {
    process.env["PROXY_ALLOW_PRIVATE_NETWORK"] = "true";
    await expect(guardTargetUrl("http://127.0.0.1:8080/api/healthz")).resolves.toMatchObject({ ok: true });
  });

  it("blocks a private IPv6 literal", async () => {
    process.env["PROXY_ALLOW_PRIVATE_NETWORK"] = "false";
    await expect(guardTargetUrl("http://[::1]:8080/")).resolves.toMatchObject({ ok: false });
  });

  it("allows a public literal address", async () => {
    process.env["PROXY_ALLOW_PRIVATE_NETWORK"] = "false";
    await expect(guardTargetUrl("https://1.1.1.1/")).resolves.toMatchObject({ ok: true });
  });

  it("reports a hostname it cannot resolve", async () => {
    const result = await guardTargetUrl("https://this-host-does-not-exist.invalid/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/resolve/);
  });
});
