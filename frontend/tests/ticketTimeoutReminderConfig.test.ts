import assert from "node:assert/strict";

import {
  extractTimeoutReminderConfig,
  getDefaultTimeoutReminderConfig,
  parseTimeoutReminderConfigItem,
} from "../src/features/tickets/timeoutReminderConfig.ts";
import type { SystemConfig } from "../src/api/config.ts";

const validItem: SystemConfig = {
  id: 1,
  category: "ticket.timeout_reminder",
  key: "DEFAULT",
  value: {
    response_reminder_minutes: 7,
    resolution_reminder_minutes: 25,
  },
  description: null,
  is_active: true,
  created_at: "2026-03-19T10:00:00Z",
  updated_at: "2026-03-19T10:00:00Z",
};

assert.deepStrictEqual(parseTimeoutReminderConfigItem(validItem), {
  key: "DEFAULT",
  responseReminderMinutes: 7,
  resolutionReminderMinutes: 25,
});

assert.deepStrictEqual(
  extractTimeoutReminderConfig([
    {
      ...validItem,
      key: "unexpected",
      value: {
        response_reminder_minutes: 0,
        resolution_reminder_minutes: 0,
      },
    },
  ]),
  getDefaultTimeoutReminderConfig(),
);
