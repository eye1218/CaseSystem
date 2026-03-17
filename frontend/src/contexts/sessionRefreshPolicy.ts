export const PROACTIVE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
export const ACTIVITY_WINDOW_MS = 10 * 60 * 1000;
export const REFRESH_RETRY_DELAY_MS = 3000;
export const PROACTIVE_REFRESH_TICK_MS = 60 * 1000;

export interface ProactiveRefreshDecisionInput {
  nowMs: number;
  lastRefreshAtMs: number;
  lastActivityAtMs: number;
  isVisible: boolean;
}

export function shouldTriggerProactiveRefresh(input: ProactiveRefreshDecisionInput): boolean {
  if (!input.isVisible) {
    return false;
  }
  const refreshDue = input.nowMs - input.lastRefreshAtMs >= PROACTIVE_REFRESH_INTERVAL_MS;
  const recentlyActive = input.nowMs - input.lastActivityAtMs <= ACTIVITY_WINDOW_MS;
  return refreshDue && recentlyActive;
}

function waitForDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    function onAbort() {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    }

    signal?.addEventListener("abort", onAbort);
  });
}

export interface RefreshWithRetryOptions {
  refresh: () => Promise<boolean>;
  onSessionInvalid: () => void;
  shouldContinue?: () => boolean;
  retryDelayMs?: number;
  signal?: AbortSignal;
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export async function refreshWithSingleRetry(options: RefreshWithRetryOptions): Promise<boolean> {
  const shouldContinue = options.shouldContinue ?? (() => true);
  if (!shouldContinue()) {
    return false;
  }

  const firstAttempt = await options.refresh();
  if (firstAttempt) {
    return true;
  }

  const retryDelayMs = options.retryDelayMs ?? REFRESH_RETRY_DELAY_MS;
  const wait = options.wait ?? waitForDelay;
  try {
    await wait(retryDelayMs, options.signal);
  } catch {
    return false;
  }

  if (options.signal?.aborted || !shouldContinue()) {
    return false;
  }

  const secondAttempt = await options.refresh();
  if (secondAttempt) {
    return true;
  }

  if (!options.signal?.aborted && shouldContinue()) {
    options.onSessionInvalid();
  }
  return false;
}
