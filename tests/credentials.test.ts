import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The store resolves paths from process.cwd() and caches on file mtime, so each
 * test gets a fresh temporary directory and a fresh module registry.
 */
let dir: string;
const ENV_KEYS = ["TYPESAFE_API_KEY", "TYPESAFE_MODEL", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"] as const;
const saved: Record<string, string | undefined> = {};

async function load() {
  vi.resetModules();
  return import("@/lib/config/credentials");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jevseo-cred-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const storeFile = () => join(dir, ".jevseo.local.json");

describe("resolution order", () => {
  test("reports nothing configured on a clean checkout", async () => {
    const { getCredential, sourceOf } = await load();
    expect(getCredential("TYPESAFE_API_KEY")).toBeUndefined();
    expect(sourceOf("TYPESAFE_API_KEY")).toBe("none");
  });

  test("reads from the local store when no env var is set", async () => {
    writeFileSync(storeFile(), JSON.stringify({ TYPESAFE_API_KEY: "from-file" }));
    const { getCredential, sourceOf } = await load();
    expect(getCredential("TYPESAFE_API_KEY")).toBe("from-file");
    expect(sourceOf("TYPESAFE_API_KEY")).toBe("local");
  });

  test("the environment always beats the local store", async () => {
    writeFileSync(storeFile(), JSON.stringify({ TYPESAFE_API_KEY: "from-file" }));
    process.env.TYPESAFE_API_KEY = "from-env";
    const { getCredential, sourceOf } = await load();
    expect(getCredential("TYPESAFE_API_KEY")).toBe("from-env");
    expect(sourceOf("TYPESAFE_API_KEY")).toBe("env");
  });

  test("treats a whitespace-only env var as unset", async () => {
    process.env.TYPESAFE_API_KEY = "   ";
    const { getCredential }= await load();
    expect(getCredential("TYPESAFE_API_KEY")).toBeUndefined();
  });

  test("survives a corrupt store rather than throwing", async () => {
    writeFileSync(storeFile(), "{ not json");
    const { getCredential, credentialStatuses } = await load();
    expect(getCredential("TYPESAFE_API_KEY")).toBeUndefined();
    expect(credentialStatuses()).toHaveLength(4);
  });

  test("ignores unknown keys in the store file", async () => {
    writeFileSync(storeFile(), JSON.stringify({ SOMETHING_ELSE: "x", TYPESAFE_MODEL: "jev-1.13.0" }));
    const { credentialStatuses } = await load();
    const keys = credentialStatuses().map((s) => s.key);
    expect(keys).not.toContain("SOMETHING_ELSE");
    expect(credentialStatuses().find((s) => s.key === "TYPESAFE_MODEL")?.configured).toBe(true);
  });
});

describe("status reporting", () => {
  test("masks secrets and never returns the raw value", async () => {
    process.env.TYPESAFE_API_KEY = "api_key_1234567890abcd";
    const { credentialStatuses } = await load();
    const status = credentialStatuses().find((s) => s.key === "TYPESAFE_API_KEY")!;
    expect(status.preview).toBe("api••••abcd");
    expect(status.preview).not.toContain("key_12345");
  });

  test("masks a short secret entirely", async () => {
    process.env.DATAFORSEO_PASSWORD = "short";
    const { credentialStatuses } = await load();
    expect(credentialStatuses().find((s) => s.key === "DATAFORSEO_PASSWORD")?.preview).toBe("••••");
  });

  test("shows non-secret values in full", async () => {
    process.env.DATAFORSEO_LOGIN = "someone@example.co.uk";
    const { credentialStatuses } = await load();
    expect(credentialStatuses().find((s) => s.key === "DATAFORSEO_LOGIN")?.preview).toBe(
      "someone@example.co.uk",
    );
  });
});

describe("writing", () => {
  test("writes the store with owner-only permissions", async () => {
    const { saveCredentials } = await load();
    saveCredentials({ TYPESAFE_API_KEY: "written" });
    expect(existsSync(storeFile())).toBe(true);
    expect(statSync(storeFile()).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(storeFile(), "utf8"))).toEqual({ TYPESAFE_API_KEY: "written" });
  });

  test("merges rather than replacing", async () => {
    const { saveCredentials } = await load();
    saveCredentials({ DATAFORSEO_LOGIN: "a@b.co.uk" });
    saveCredentials({ DATAFORSEO_PASSWORD: "secret" });
    expect(JSON.parse(readFileSync(storeFile(), "utf8"))).toEqual({
      DATAFORSEO_LOGIN: "a@b.co.uk",
      DATAFORSEO_PASSWORD: "secret",
    });
  });

  test("an empty string removes a key", async () => {
    const { saveCredentials, getCredential } = await load();
    saveCredentials({ TYPESAFE_MODEL: "jev-1.13.0" });
    saveCredentials({ TYPESAFE_MODEL: "" });
    expect(getCredential("TYPESAFE_MODEL")).toBeUndefined();
  });

  test("removes the file once nothing is left in it", async () => {
    const { saveCredentials } = await load();
    saveCredentials({ TYPESAFE_MODEL: "jev-1.13.0" });
    saveCredentials({ TYPESAFE_MODEL: "" });
    expect(existsSync(storeFile())).toBe(false);
  });

  test("a later read sees a value written moments earlier", async () => {
    const { saveCredentials, getCredential } = await load();
    saveCredentials({ TYPESAFE_API_KEY: "first" });
    expect(getCredential("TYPESAFE_API_KEY")).toBe("first");
    saveCredentials({ TYPESAFE_API_KEY: "second" });
    expect(getCredential("TYPESAFE_API_KEY")).toBe("second");
  });

  test("clearCredentials deletes the store", async () => {
    const { saveCredentials, clearCredentials } = await load();
    saveCredentials({ TYPESAFE_API_KEY: "x" });
    clearCredentials();
    expect(existsSync(storeFile())).toBe(false);
  });

  test("clearing an absent store is a no-op, not an error", async () => {
    const { clearCredentials } = await load();
    expect(() => clearCredentials()).not.toThrow();
  });
});

describe("production refuses to write", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("saveCredentials throws and writes nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { saveCredentials, canWriteCredentials, CredentialWriteError } = await load();
    expect(canWriteCredentials()).toBe(false);
    expect(() => saveCredentials({ TYPESAFE_API_KEY: "x" })).toThrow(CredentialWriteError);
    expect(existsSync(storeFile())).toBe(false);
  });

  test("clearCredentials throws and leaves the file alone", async () => {
    writeFileSync(storeFile(), JSON.stringify({ TYPESAFE_API_KEY: "keep-me" }));
    vi.stubEnv("NODE_ENV", "production");
    const { clearCredentials, CredentialWriteError } = await load();
    expect(() => clearCredentials()).toThrow(CredentialWriteError);
    expect(existsSync(storeFile())).toBe(true);
  });

  test("reading still works in production, since the environment is the source", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TYPESAFE_API_KEY = "from-env";
    const { getCredential } = await load();
    expect(getCredential("TYPESAFE_API_KEY")).toBe("from-env");
  });
});
