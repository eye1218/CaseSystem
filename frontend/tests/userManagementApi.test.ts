import assert from "node:assert/strict";

import {
  buildUserGroupListPath,
  buildUserListPath,
  getAvailableGroupMemberOptions,
} from "../src/features/userManagement/utils.ts";

const fullPath = buildUserListPath({
  search: "alice",
  status: "disabled",
  roleCode: "ADMIN",
  groupId: "group-1",
});

assert.strictEqual(
  fullPath,
  "/api/v1/users?search=alice&status=disabled&role_code=ADMIN&group_id=group-1",
);

const defaultPath = buildUserListPath({
  search: "   ",
  status: "all",
  roleCode: "all",
  groupId: "",
});

assert.strictEqual(defaultPath, "/api/v1/users");

const groupPath = buildUserGroupListPath({ search: "blue team" });
assert.strictEqual(groupPath, "/api/v1/user-groups?search=blue+team");

const available = getAvailableGroupMemberOptions(
  [
    { id: "u-2", username: "zeus", display_name: "Zeus" },
    { id: "u-1", username: "apollo", display_name: "Apollo" },
    { id: "u-3", username: "apollo.2", display_name: "Apollo" },
  ],
  [{ user_id: "u-2" }],
);

assert.deepStrictEqual(
  available.map((item) => item.id),
  ["u-1", "u-3"],
);
