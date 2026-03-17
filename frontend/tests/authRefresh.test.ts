import assert from "node:assert/strict";

import { apiFetch, refreshSessionSilently } from "../src/api/client.ts";

type FetchInput = string | URL | Request;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function resolveUrl(input: FetchInput): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

async function testAutoRefreshAndRetry(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: string[] = [];

  globalThis.document = { cookie: "XSRF-TOKEN=csrf-initial" } as Document;
  globalThis.window = { location: { origin: "https://example.test" } } as Window & typeof globalThis;

  globalThis.fetch = (async (input: FetchInput): Promise<Response> => {
    const url = resolveUrl(input);
    calls.push(url);
    if (url === "/api/v1/tickets" && calls.length === 1) {
      return jsonResponse({ detail: "Access token expired" }, 401);
    }
    if (url === "/auth/csrf") {
      return jsonResponse({ csrf_token: "csrf-rotated" }, 200);
    }
    if (url === "/auth/refresh") {
      globalThis.document.cookie = "XSRF-TOKEN=csrf-new";
      return jsonResponse({ message: "ok" }, 200);
    }
    if (url === "/api/v1/tickets" && calls.length > 1) {
      return jsonResponse({ items: [{ id: "1001" }] }, 200);
    }
    return jsonResponse({ detail: "unexpected request" }, 500);
  }) as typeof fetch;

  const payload = await apiFetch<{ items: Array<{ id: string }> }>("/api/v1/tickets");
  assert.deepStrictEqual(payload.items.map((item) => item.id), ["1001"]);
  assert.deepStrictEqual(calls, ["/api/v1/tickets", "/auth/csrf", "/auth/refresh", "/api/v1/tickets"]);

  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
}

async function testConcurrentRequestsShareSingleRefresh(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: string[] = [];
  let refreshed = false;
  let refreshCalls = 0;

  globalThis.document = { cookie: "XSRF-TOKEN=csrf-initial" } as Document;
  globalThis.window = { location: { origin: "https://example.test" } } as Window & typeof globalThis;

  globalThis.fetch = (async (input: FetchInput): Promise<Response> => {
    const url = resolveUrl(input);
    calls.push(url);
    if (url === "/auth/csrf") {
      return jsonResponse({ csrf_token: "csrf-concurrent" }, 200);
    }
    if (url === "/auth/refresh") {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      refreshed = true;
      globalThis.document.cookie = "XSRF-TOKEN=csrf-after-refresh";
      return jsonResponse({ message: "ok" }, 200);
    }
    if (url === "/api/v1/resource-a") {
      if (!refreshed) {
        return jsonResponse({ detail: "Access token expired" }, 401);
      }
      return jsonResponse({ id: "a" }, 200);
    }
    if (url === "/api/v1/resource-b") {
      if (!refreshed) {
        return jsonResponse({ detail: "Access token expired" }, 401);
      }
      return jsonResponse({ id: "b" }, 200);
    }
    return jsonResponse({ detail: "unexpected request" }, 500);
  }) as typeof fetch;

  const [a, b] = await Promise.all([
    apiFetch<{ id: string }>("/api/v1/resource-a"),
    apiFetch<{ id: string }>("/api/v1/resource-b")
  ]);

  assert.strictEqual(a.id, "a");
  assert.strictEqual(b.id, "b");
  assert.strictEqual(refreshCalls, 1);
  assert.deepStrictEqual(calls, [
    "/api/v1/resource-a",
    "/api/v1/resource-b",
    "/auth/csrf",
    "/auth/refresh",
    "/api/v1/resource-a",
    "/api/v1/resource-b"
  ]);

  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
}

async function testLogin401DoesNotTriggerRefresh(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: string[] = [];

  globalThis.document = { cookie: "XSRF-TOKEN=csrf-initial" } as Document;
  globalThis.window = { location: { origin: "https://example.test" } } as Window & typeof globalThis;

  globalThis.fetch = (async (input: FetchInput): Promise<Response> => {
    const url = resolveUrl(input);
    calls.push(url);
    if (url === "/auth/login") {
      return jsonResponse({ detail: "用户名或密码错误" }, 401);
    }
    return jsonResponse({ detail: "unexpected request" }, 500);
  }) as typeof fetch;

  let thrown: unknown;
  try {
    await apiFetch("/auth/login", { method: "POST" });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error);
  assert.deepStrictEqual(calls, ["/auth/login"]);

  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
}

async function testRefreshSessionSilentlyReturnsBoolean(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  globalThis.document = { cookie: "XSRF-TOKEN=csrf-initial" } as Document;
  globalThis.window = { location: { origin: "https://example.test" } } as Window & typeof globalThis;

  globalThis.fetch = (async (input: FetchInput): Promise<Response> => {
    const url = resolveUrl(input);
    if (url === "/auth/csrf") {
      return jsonResponse({ csrf_token: "csrf-next" }, 200);
    }
    if (url === "/auth/refresh") {
      return jsonResponse({ message: "ok" }, 200);
    }
    return jsonResponse({ detail: "unexpected request" }, 500);
  }) as typeof fetch;

  const success = await refreshSessionSilently();
  assert.strictEqual(success, true);

  globalThis.fetch = (async (input: FetchInput): Promise<Response> => {
    const url = resolveUrl(input);
    if (url === "/auth/csrf") {
      return jsonResponse({ csrf_token: "csrf-next" }, 200);
    }
    if (url === "/auth/refresh") {
      return jsonResponse({ detail: "refresh invalid" }, 401);
    }
    return jsonResponse({ detail: "unexpected request" }, 500);
  }) as typeof fetch;

  const failed = await refreshSessionSilently();
  assert.strictEqual(failed, false);

  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
}

async function testSilentRefreshSharesSingleFlightWith401Fallback(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const calls: string[] = [];
  let refreshed = false;
  let refreshCalls = 0;

  globalThis.document = { cookie: "XSRF-TOKEN=csrf-initial" } as Document;
  globalThis.window = { location: { origin: "https://example.test" } } as Window & typeof globalThis;

  globalThis.fetch = (async (input: FetchInput): Promise<Response> => {
    const url = resolveUrl(input);
    calls.push(url);
    if (url === "/api/v1/protected") {
      if (!refreshed) {
        return jsonResponse({ detail: "Access token expired" }, 401);
      }
      return jsonResponse({ ok: true }, 200);
    }
    if (url === "/auth/csrf") {
      return jsonResponse({ csrf_token: "csrf-next" }, 200);
    }
    if (url === "/auth/refresh") {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      refreshed = true;
      return jsonResponse({ message: "ok" }, 200);
    }
    return jsonResponse({ detail: "unexpected request" }, 500);
  }) as typeof fetch;

  const [silentRefreshResult, protectedPayload] = await Promise.all([
    refreshSessionSilently(),
    apiFetch<{ ok: boolean }>("/api/v1/protected")
  ]);

  assert.strictEqual(silentRefreshResult, true);
  assert.strictEqual(protectedPayload.ok, true);
  assert.strictEqual(refreshCalls, 1);
  assert.strictEqual(calls.filter((item) => item === "/auth/csrf").length, 1);
  assert.strictEqual(calls.filter((item) => item === "/auth/refresh").length, 1);

  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
}

await testAutoRefreshAndRetry();
await testConcurrentRequestsShareSingleRefresh();
await testLogin401DoesNotTriggerRefresh();
await testRefreshSessionSilentlyReturnsBoolean();
await testSilentRefreshSharesSingleFlightWith401Fallback();
