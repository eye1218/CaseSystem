import assert from "node:assert/strict";

import {
  ACTIVITY_WINDOW_MS,
  PROACTIVE_REFRESH_INTERVAL_MS,
  REFRESH_RETRY_DELAY_MS,
  refreshWithSingleRetry,
  shouldTriggerProactiveRefresh
} from "../src/contexts/sessionRefreshPolicy.ts";

const now = Date.now();

assert.strictEqual(
  shouldTriggerProactiveRefresh({
    nowMs: now,
    lastRefreshAtMs: now - PROACTIVE_REFRESH_INTERVAL_MS,
    lastActivityAtMs: now - ACTIVITY_WINDOW_MS + 5_000,
    isVisible: true
  }),
  true
);

assert.strictEqual(
  shouldTriggerProactiveRefresh({
    nowMs: now,
    lastRefreshAtMs: now - PROACTIVE_REFRESH_INTERVAL_MS,
    lastActivityAtMs: now - ACTIVITY_WINDOW_MS + 5_000,
    isVisible: false
  }),
  false
);

assert.strictEqual(
  shouldTriggerProactiveRefresh({
    nowMs: now,
    lastRefreshAtMs: now - PROACTIVE_REFRESH_INTERVAL_MS,
    lastActivityAtMs: now - ACTIVITY_WINDOW_MS - 1,
    isVisible: true
  }),
  false
);

{
  const attempts: string[] = [];
  const waits: number[] = [];

  const refreshed = await refreshWithSingleRetry({
    refresh: async () => {
      attempts.push("refresh");
      return attempts.length >= 2;
    },
    onSessionInvalid: () => {
      throw new Error("onSessionInvalid should not be called on successful retry");
    },
    wait: async (delayMs) => {
      waits.push(delayMs);
    }
  });

  assert.strictEqual(refreshed, true);
  assert.deepStrictEqual(attempts, ["refresh", "refresh"]);
  assert.deepStrictEqual(waits, [REFRESH_RETRY_DELAY_MS]);
}

{
  const attempts: string[] = [];
  const waits: number[] = [];
  let invalidated = 0;

  const refreshed = await refreshWithSingleRetry({
    refresh: async () => {
      attempts.push("refresh");
      return false;
    },
    onSessionInvalid: () => {
      invalidated += 1;
    },
    wait: async (delayMs) => {
      waits.push(delayMs);
    }
  });

  assert.strictEqual(refreshed, false);
  assert.deepStrictEqual(attempts, ["refresh", "refresh"]);
  assert.deepStrictEqual(waits, [REFRESH_RETRY_DELAY_MS]);
  assert.strictEqual(invalidated, 1);
}
