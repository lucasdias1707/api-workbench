import { describe, expect, it } from "vitest";
import { resolveBindHost, resolvePort } from "../bind";

describe("resolveBindHost", () => {
  it("listens on every interface when HOST is not set", () => {
    expect(resolveBindHost(undefined)).toBe("0.0.0.0");
    expect(resolveBindHost("")).toBe("0.0.0.0");
    expect(resolveBindHost("   ")).toBe("0.0.0.0");
  });

  it("honours an explicit loopback bind, so a reverse proxy can be the only way in", () => {
    expect(resolveBindHost("127.0.0.1")).toBe("127.0.0.1");
    expect(resolveBindHost(" 127.0.0.1 ")).toBe("127.0.0.1");
    expect(resolveBindHost("::1")).toBe("::1");
  });
});

describe("resolvePort", () => {
  it("accepts a valid port", () => {
    expect(resolvePort("8080")).toBe(8080);
  });

  it("requires the variable to be present", () => {
    expect(() => resolvePort(undefined)).toThrow(/required/);
    expect(() => resolvePort("")).toThrow(/required/);
  });

  it.each(["0", "-1", "70000", "abc", "80.5"])("rejects %s", (value) => {
    expect(() => resolvePort(value)).toThrow(/Invalid PORT/);
  });
});
