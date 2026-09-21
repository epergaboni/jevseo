import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Bring-your-own-key. On a public instance the visitor's key arrives as a
 * header and must win over whatever the host configured, so a visitor spends
 * their own credits and never the host's. Getting this precedence wrong would
 * quietly bill the host for every stranger's usage.
 */
let dir: string;

async function load() {
  vi.resetModules();
  const [creds, req] = await Promise.all([
    import("@/lib/config/credentials"),
    import("@/lib/config/request-credentials"),
  ]);
  return { ...creds, ...req };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jevseo-req-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  for (const k of ["TYPESAFE_API_KEY", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]) delete process.env[k];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const headers = (h: Record<string, string>) => new Headers(h);

describe("reading headers", () => {
  test("picks up every credential header", async () => {
    const { readCredentialHeaders } = await load();
    expect(
      readCredentialHeaders(
        headers({
          "x-jevseo-typesafe-key": "visitor-key",
          "x-jevseo-dataforseo-login": "a@b.co.uk",
          "x-jevseo-dataforseo-password": "pw",
        }),
      ),
    ).toEqual({
      TYPESAFE_API_KEY: "visitor-key",
      DATAFORSEO_LOGIN: "a@b.co.uk",
      DATAFORSEO_PASSWORD: "pw",
    });
  });

  test("ignores absent and blank headers", async () => {
    const { readCredentialHeaders } = await load();
    expect(readCredentialHeaders(headers({ "x-jevseo-typesafe-key": "   " }))).toEqual({});
    expect(readCredentialHeaders(headers({}))).toEqual({});
  });

  test("rejects an implausibly long value rather than truncating it", async () => {
    const { readCredentialHeaders } = await load();
    const huge = "a".repeat(401);
    expect(readCredentialHeaders(headers({ "x-jevseo-typesafe-key": huge }))).toEqual({});
  });

  test("rejects control characters, which have no business in a key", async () => {
    const { readCredentialHeaders } = await load();
    // Headers() rejects raw newlines itself, so this covers what survives it.
    expect(readCredentialHeaders(headers({ "x-jevseo-typesafe-key": "abc\u007fdef" }))).toEqual({});
  });

  test("trims surrounding whitespace from a pasted key", async () => {
    const { readCredentialHeaders } = await load();
    expect(readCredentialHeaders(headers({ "x-jevseo-typesafe-key": "  key  " }))).toEqual({
      TYPESAFE_API_KEY: "key",
    });
  });
});

describe("precedence", () => {
  test("a request key beats the host's environment key", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "host-key");
    const { getCredential, withRequestCredentials, sourceOf } = await load();
    expect(getCredential("TYPESAFE_API_KEY")).toBe("host-key");

    withRequestCredentials({ TYPESAFE_API_KEY: "visitor-key" }, () => {
      expect(getCredential("TYPESAFE_API_KEY")).toBe("visitor-key");
      expect(sourceOf("TYPESAFE_API_KEY")).toBe("request");
    });
  });

  test("a request key beats the local file", async () => {
    writeFileSync(join(dir, ".jevseo.local.json"), JSON.stringify({ TYPESAFE_API_KEY: "file-key" }));
    const { getCredential, withRequestCredentials } = await load();
    expect(getCredential("TYPESAFE_API_KEY")).toBe("file-key");
    withRequestCredentials({ TYPESAFE_API_KEY: "visitor-key" }, () => {
      expect(getCredential("TYPESAFE_API_KEY")).toBe("visitor-key");
    });
  });

  test("falls back to the host for a credential the visitor did not supply", async () => {
    vi.stubEnv("DATAFORSEO_LOGIN", "host@example.com");
    const { getCredential, withRequestCredentials } = await load();
    withRequestCredentials({ TYPESAFE_API_KEY: "visitor-key" }, () => {
      expect(getCredential("TYPESAFE_API_KEY")).toBe("visitor-key");
      expect(getCredential("DATAFORSEO_LOGIN")).toBe("host@example.com");
    });
  });

  test("the context does not leak outside the request that set it", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "host-key");
    const { getCredential, withRequestCredentials } = await load();
    withRequestCredentials({ TYPESAFE_API_KEY: "visitor-key" }, () => {
      expect(getCredential("TYPESAFE_API_KEY")).toBe("visitor-key");
    });
    expect(getCredential("TYPESAFE_API_KEY")).toBe("host-key");
  });

  test("two concurrent requests never see each other's key", async () => {
    const { getCredential, withRequestCredentials } = await load();
    const seen: string[] = [];

    const request = (key: string, delay: number) =>
      withRequestCredentials({ TYPESAFE_API_KEY: key }, async () => {
        await new Promise((r) => setTimeout(r, delay));
        seen.push(getCredential("TYPESAFE_API_KEY") ?? "none");
      });

    await Promise.all([request("alice", 20), request("bob", 5), request("carol", 12)]);
    expect(seen.sort()).toEqual(["alice", "bob", "carol"]);
  });
});

describe("snapshotting for background work", () => {
  test("captures the current context so a detached crawl keeps the key", async () => {
    const { withRequestCredentials, currentRequestCredentials, getCredential } = await load();
    let captured: Record<string, string | undefined> = {};
    withRequestCredentials({ TYPESAFE_API_KEY: "visitor-key" }, () => {
      captured = currentRequestCredentials();
    });
    expect(captured).toEqual({ TYPESAFE_API_KEY: "visitor-key" });

    // Re-establishing it later is what the crawl route does inside `after`.
    withRequestCredentials(captured, () => {
      expect(getCredential("TYPESAFE_API_KEY")).toBe("visitor-key");
    });
  });

  test("an empty snapshot outside a request is harmless", async () => {
    const { currentRequestCredentials, hasAnyRequestCredential } = await load();
    expect(currentRequestCredentials()).toEqual({});
    expect(hasAnyRequestCredential()).toBe(false);
  });
});
