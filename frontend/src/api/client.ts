export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

let refreshPromise: Promise<boolean> | null = null;

function getCookie(name: string): string | null {
  const encodedName = `${name}=`;
  const parts = document.cookie.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(encodedName)) {
      return decodeURIComponent(part.slice(encodedName.length));
    }
  }
  return null;
}

async function issueCsrf(): Promise<string> {
  const response = await fetch("/auth/csrf", {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error("Failed to issue CSRF token");
  }

  const payload = (await response.json()) as { csrf_token: string };
  return payload.csrf_token;
}

function resolveRequestPath(path: string): string {
  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return new URL(path).pathname;
    }
    return new URL(path, "http://localhost").pathname;
  } catch {
    return path;
  }
}

function shouldAttemptTokenRefresh(path: string): boolean {
  const requestPath = resolveRequestPath(path);
  return !["/auth/login", "/auth/refresh", "/auth/csrf"].includes(requestPath);
}

function buildRequestHeaders(headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  if (!mergedHeaders.has("Accept")) {
    mergedHeaders.set("Accept", "application/json");
  }
  return mergedHeaders;
}

function buildRequestInit(init?: RequestInit, rotateCsrfHeader = false): RequestInit {
  const headers = buildRequestHeaders(init?.headers);
  if (rotateCsrfHeader && headers.has("X-CSRF-Token")) {
    const latestCsrfToken = getCookie("XSRF-TOKEN");
    if (latestCsrfToken) {
      headers.set("X-CSRF-Token", latestCsrfToken);
    }
  }
  return {
    ...init,
    credentials: "include",
    headers
  };
}

async function parseApiError(response: Response): Promise<ApiError> {
  const rawText = await response.text();
  let parsed: unknown = rawText || undefined;
  let detail: unknown = rawText || undefined;
  let message = rawText || `Request failed: ${response.status}`;

  try {
    parsed = JSON.parse(rawText) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      detail = record.detail ?? parsed;

      if (typeof detail === "string") {
        message = detail;
      } else if (detail && typeof detail === "object") {
        const detailRecord = detail as Record<string, unknown>;
        if (typeof detailRecord.message === "string") {
          message = detailRecord.message;
        }
      } else if (typeof record.message === "string") {
        message = record.message;
      }
    }
  } catch {}

  return new ApiError(message, response.status, detail ?? parsed);
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const rawText = await response.text();
    const compactText = rawText.replace(/\s+/g, " ").slice(0, 120);
    const message = contentType.toLowerCase().includes("text/html")
      ? "API returned HTML instead of JSON. The backend route may be missing or the deployed service is outdated."
      : `API returned unexpected content type: ${contentType || "unknown"}`;
    throw new ApiError(message, response.status, compactText || undefined);
  }

  return (await response.json()) as T;
}

async function doRefreshTokenRequest(): Promise<boolean> {
  try {
    const csrfToken = await issueCsrf();
    const refreshResponse = await fetch("/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-CSRF-Token": csrfToken,
        Origin: window.location.origin
      }
    });
    return refreshResponse.ok;
  } catch {
    return false;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefreshTokenRequest().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function refreshSessionSilently(): Promise<boolean> {
  return refreshAccessToken();
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await fetch(path, buildRequestInit(init));

  if (response.status === 401 && shouldAttemptTokenRefresh(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await fetch(path, buildRequestInit(init, true));
    }
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return parseApiResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const csrfToken = (await issueCsrf()) || getCookie("XSRF-TOKEN");
  if (!csrfToken) {
    throw new Error("Missing CSRF token");
  }

  return apiFetch<T>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      Origin: window.location.origin
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const csrfToken = (await issueCsrf()) || getCookie("XSRF-TOKEN");
  if (!csrfToken) {
    throw new Error("Missing CSRF token");
  }

  return apiFetch<T>(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      Origin: window.location.origin
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

export async function apiDelete(path: string): Promise<void> {
  const csrfToken = (await issueCsrf()) || getCookie("XSRF-TOKEN");
  if (!csrfToken) {
    throw new Error("Missing CSRF token");
  }

  await apiFetch<void>(path, {
    method: "DELETE",
    headers: {
      "X-CSRF-Token": csrfToken,
      Origin: window.location.origin
    }
  });
}

export async function apiDeleteJson<T>(path: string): Promise<T> {
  const csrfToken = (await issueCsrf()) || getCookie("XSRF-TOKEN");
  if (!csrfToken) {
    throw new Error("Missing CSRF token");
  }

  return apiFetch<T>(path, {
    method: "DELETE",
    headers: {
      "X-CSRF-Token": csrfToken,
      Origin: window.location.origin
    }
  });
}

export async function apiPostForm<T>(path: string, body: FormData): Promise<T> {
  const csrfToken = (await issueCsrf()) || getCookie("XSRF-TOKEN");
  if (!csrfToken) {
    throw new Error("Missing CSRF token");
  }

  return apiFetch<T>(path, {
    method: "POST",
    headers: {
      "X-CSRF-Token": csrfToken,
      Origin: window.location.origin
    },
    body
  });
}
