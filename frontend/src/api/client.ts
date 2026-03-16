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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
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

    throw new ApiError(message, response.status, detail ?? parsed);
  }

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
