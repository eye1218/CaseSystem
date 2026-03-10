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
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
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
      "X-CSRF-Token": csrfToken
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
