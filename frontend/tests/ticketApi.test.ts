import assert from "node:assert/strict";

import { buildTicketListPath } from "../src/features/tickets/utils.ts";

const filteredPath = buildTicketListPath({
  ticketId: "1001",
  categoryIds: ["intrusion", "network"],
  priorities: ["P1", "P2"],
  mainStatuses: ["IN_PROGRESS", "RESOLVED"],
  claimStatuses: ["unclaimed"],
  poolCodes: ["T1_POOL", "T2_POOL"],
  createdFrom: "2026-03-01",
  createdTo: "2026-03-13",
  sortBy: "created_at",
  sortDir: "desc",
  limit: 40,
  offset: 80,
});

assert.strictEqual(
  filteredPath,
  "/api/v1/tickets?ticket_id=1001&category_id=intrusion&category_id=network&priority=P1&priority=P2&main_status=IN_PROGRESS&main_status=RESOLVED&claim_status=unclaimed&pool_code=T1_POOL&pool_code=T2_POOL&created_from=2026-03-01&created_to=2026-03-13&sort_by=created_at&sort_dir=desc&limit=40&offset=80",
);

const defaultPath = buildTicketListPath({
  categoryIds: [],
  priorities: [],
  mainStatuses: [],
  claimStatuses: [],
  poolCodes: [],
});

assert.strictEqual(defaultPath, "/api/v1/tickets");

const assignedPath = buildTicketListPath({
  assignedToMe: true,
});

assert.strictEqual(assignedPath, "/api/v1/tickets?assigned_to_me=1");
