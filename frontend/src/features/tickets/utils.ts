import type { TicketClaimStatus, TicketMainStatus, TicketPriority } from "../../types/ticket";

export interface TicketQueryParams {
  ticketId?: string;
  categoryIds?: string[];
  priorities?: TicketPriority[];
  mainStatuses?: TicketMainStatus[];
  claimStatuses?: TicketClaimStatus[];
  poolCodes?: string[];
  subStatus?: string;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  assignedToMe?: boolean;
  limit?: number;
  offset?: number;
}

export function buildTicketListPath(query: TicketQueryParams): string {
  const params = new URLSearchParams();
  const appendValues = (key: string, values?: string[]) => {
    values?.forEach((value) => {
      if (value && value !== "all") {
        params.append(key, value);
      }
    });
  };

  if (query.ticketId) params.set("ticket_id", query.ticketId);
  appendValues("category_id", query.categoryIds);
  appendValues("priority", query.priorities);
  appendValues("main_status", query.mainStatuses);
  appendValues("claim_status", query.claimStatuses);
  appendValues("pool_code", query.poolCodes);
  if (query.subStatus && query.subStatus !== "all") params.set("sub_status", query.subStatus);
  if (query.createdFrom) params.set("created_from", query.createdFrom);
  if (query.createdTo) params.set("created_to", query.createdTo);
  if (query.sortBy) params.set("sort_by", query.sortBy);
  if (query.sortDir) params.set("sort_dir", query.sortDir);
  if (query.assignedToMe) params.set("assigned_to_me", "1");
  if (typeof query.limit === "number") params.set("limit", String(query.limit));
  if (typeof query.offset === "number") params.set("offset", String(query.offset));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return `/api/v1/tickets${suffix}`;
}
