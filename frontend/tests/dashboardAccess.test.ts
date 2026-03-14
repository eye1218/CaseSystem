import assert from "node:assert/strict";

import {
  getDefaultRouteForRole,
  hasMenuAccess,
  isInternalRole,
} from "../src/features/auth/utils.ts";

assert.equal(isInternalRole("T1"), true);
assert.equal(isInternalRole("T2"), true);
assert.equal(isInternalRole("T3"), true);
assert.equal(isInternalRole("ADMIN"), true);
assert.equal(isInternalRole("CUSTOMER"), false);

assert.equal(getDefaultRouteForRole("T1"), "/");
assert.equal(getDefaultRouteForRole("T2"), "/");
assert.equal(getDefaultRouteForRole("T3"), "/");
assert.equal(getDefaultRouteForRole("ADMIN"), "/");
assert.equal(getDefaultRouteForRole("CUSTOMER"), "/tickets");

assert.equal(hasMenuAccess("T1", "dashboard"), true);
assert.equal(hasMenuAccess("T2", "dashboard"), true);
assert.equal(hasMenuAccess("T3", "dashboard"), true);
assert.equal(hasMenuAccess("ADMIN", "dashboard"), true);
assert.equal(hasMenuAccess("CUSTOMER", "dashboard"), false);
