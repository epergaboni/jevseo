import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The browser credential store holds visitors' API keys. It is the one piece
 * of this app where a mistake leaks somebody else's secret, so it is tested
 * against a real storage implementation rather than trusted.
 */

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  throwOnAccess = false;

  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    if (this.throwOnAccess) throw new Error("storage blocked");
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.throwOnAccess) throw new Error("storage blocked");
    this.map.set(k, v);
  }
  removeItem(k: string) {
    if (this.throwOnAccess) throw new Error("storage blocked");
    this.map.delete(k);
  }
}

let storage: MemoryStorage;

async function load() {
  vi.resetModules();
  return import("@/lib/client/credential-store");
}

beforeEach(() => {
  storage = new MemoryStorage();
  const listeners = new Map<string, Set<EventListener>>();
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: (t: string, fn: EventListener) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(fn);
    },
    removeEventListener: (t: string, fn: EventListener) => listeners.get(t)?.delete(fn),
    dispatchEvent: (e: Event) => {
      listeners.get(e.type)?.forEach((fn) => fn(e));
      return true;
    },
  });
  vi.stubGlobal("Event", class {
    constructor(public type: string) {}
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("storing keys", () => {
  test("writes and reads a key back", async () => {
    const { writeLocalCredential, readLocalCredentials } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "my-key");
    expect(readLocalCredentials()).toEqual({ TYPESAFE_API_KEY: "my-key" });
  });

  test("namespaces its keys so it cannot collide with another app on the origin", async () => {
    const { writeLocalCredential } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "my-key");
    expect(storage.key(0)).toBe("jevseo.credential.TYPESAFE_API_KEY");
  });

  test("trims a pasted value", async () => {
    const { writeLocalCredential, readLocalCredentials } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "   spaced   ");
    expect(readLocalCredentials().TYPESAFE_API_KEY).toBe("spaced");
  });

  test("an empty value removes the key rather than storing a blank", async () => {
    const { writeLocalCredential, readLocalCredentials } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "my-key");
    writeLocalCredential("TYPESAFE_API_KEY", "  ");
    expect(readLocalCredentials()).toEqual({});
  });

  test("clearing removes every key, not just the one in front", async () => {
    const { writeLocalCredential, clearLocalCredentials, readLocalCredentials } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "a");
    writeLocalCredential("DATAFORSEO_LOGIN", "b");
    writeLocalCredential("DATAFORSEO_PASSWORD", "c");
    clearLocalCredentials();
    expect(readLocalCredentials()).toEqual({});
  });

  test("blocked storage degrades to empty instead of throwing", async () => {
    const { writeLocalCredential, readLocalCredentials, clearLocalCredentials } = await load();
    storage.throwOnAccess = true;
    expect(() => writeLocalCredential("TYPESAFE_API_KEY", "x")).not.toThrow();
    expect(readLocalCredentials()).toEqual({});
    expect(() => clearLocalCredentials()).not.toThrow();
  });
});

describe("headers", () => {
  test("maps each key to its wire header", async () => {
    const { writeLocalCredential, credentialHeaders } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "k");
    writeLocalCredential("DATAFORSEO_LOGIN", "a@b.co.uk");
    expect(credentialHeaders()).toEqual({
      "x-jevseo-typesafe-key": "k",
      "x-jevseo-dataforseo-login": "a@b.co.uk",
    });
  });

  test("sends nothing when nothing is stored", async () => {
    const { credentialHeaders } = await load();
    expect(credentialHeaders()).toEqual({});
  });

  test("an unsaved draft is sent in place of the stored key", async () => {
    const { writeLocalCredential, credentialHeaders } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "old");
    expect(credentialHeaders({ TYPESAFE_API_KEY: "  typed  " })).toEqual({
      "x-jevseo-typesafe-key": "typed",
    });
  });

  test("an empty draft leaves the stored key alone", async () => {
    const { writeLocalCredential, credentialHeaders } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "stored");
    expect(credentialHeaders({ TYPESAFE_API_KEY: "   " })).toEqual({
      "x-jevseo-typesafe-key": "stored",
    });
  });

  test("a draft works with nothing stored at all", async () => {
    const { credentialHeaders } = await load();
    expect(credentialHeaders({ TYPESAFE_API_KEY: "typed" })).toEqual({
      "x-jevseo-typesafe-key": "typed",
    });
  });

  test("apiFetch attaches them without discarding the caller's own headers", async () => {
    const { writeLocalCredential, apiFetch } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "k");

    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      seen.push(init);
      return new Response("{}");
    });

    await apiFetch("/api/analyse", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    expect(seen[0].headers).toEqual({
      "content-type": "application/json",
      "x-jevseo-typesafe-key": "k",
    });
    expect(seen[0].method).toBe("POST");
  });

  test("apiFetch sends the draft the visitor has just typed", async () => {
    const { writeLocalCredential, apiFetch } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "old");

    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      seen.push(init);
      return new Response("{}");
    });

    await apiFetch("/api/settings/test", { method: "POST" }, { TYPESAFE_API_KEY: "typed" });

    expect(seen[0].headers).toEqual({ "x-jevseo-typesafe-key": "typed" });
  });
});

describe("snapshot for useSyncExternalStore", () => {
  test("returns the same reference until something changes, or the hook loops", async () => {
    const { getCredentialSnapshot, writeLocalCredential } = await load();
    const first = getCredentialSnapshot();
    expect(getCredentialSnapshot()).toBe(first);

    writeLocalCredential("TYPESAFE_API_KEY", "k");
    const second = getCredentialSnapshot();
    expect(second).not.toBe(first);
    expect(getCredentialSnapshot()).toBe(second);
  });

  test("the server snapshot is always empty, so hydration matches", async () => {
    const { getCredentialServerSnapshot, writeLocalCredential } = await load();
    writeLocalCredential("TYPESAFE_API_KEY", "k");
    expect(getCredentialServerSnapshot()).toEqual({});
  });

  test("subscribers are notified on write and on unsubscribe stop being called", async () => {
    const { subscribeToCredentials, writeLocalCredential } = await load();
    let calls = 0;
    const unsubscribe = subscribeToCredentials(() => calls++);
    writeLocalCredential("TYPESAFE_API_KEY", "k");
    expect(calls).toBe(1);
    unsubscribe();
    writeLocalCredential("TYPESAFE_API_KEY", "k2");
    expect(calls).toBe(1);
  });
});

describe("masking", () => {
  test("shows only the ends of a long secret", async () => {
    const { maskCredential } = await load();
    expect(maskCredential("api_key_1234567890abcd")).toBe("api••••abcd");
  });

  test("hides a short secret entirely", async () => {
    const { maskCredential } = await load();
    expect(maskCredential("short")).toBe("••••");
  });
});
