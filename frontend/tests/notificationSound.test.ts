import assert from "node:assert/strict";

import {
  NOTIFICATION_SOUND_ENABLED_STORAGE_KEY,
  loadSoundEnabledSetting,
  persistSoundEnabledSetting,
  resolveNotificationSoundKey,
} from "../src/features/notifications/sound.ts";

assert.strictEqual(
  resolveNotificationSoundKey({
    action_required: true,
    category: "ticket_escalation_request",
  }),
  "important_message",
);

assert.strictEqual(
  resolveNotificationSoundKey({
    action_required: false,
    category: "ticket_assigned",
  }),
  "ticket_new_p2",
);

assert.strictEqual(
  resolveNotificationSoundKey({
    action_required: false,
    category: "unknown_category",
  }),
  "ticket_new_p3",
);

const localStorageMap = new Map<string, string>();
const mockWindow = {
  localStorage: {
    getItem(key: string) {
      return localStorageMap.has(key) ? localStorageMap.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageMap.set(key, value);
    },
  },
} as unknown as Window;

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: mockWindow,
});

assert.strictEqual(loadSoundEnabledSetting(), true);
persistSoundEnabledSetting(false);
assert.strictEqual(localStorageMap.get(NOTIFICATION_SOUND_ENABLED_STORAGE_KEY), "0");
assert.strictEqual(loadSoundEnabledSetting(), false);
persistSoundEnabledSetting(true);
assert.strictEqual(localStorageMap.get(NOTIFICATION_SOUND_ENABLED_STORAGE_KEY), "1");
assert.strictEqual(loadSoundEnabledSetting(), true);

