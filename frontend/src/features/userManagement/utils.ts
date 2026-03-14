export interface UserListQueryInput {
  search?: string;
  status?: string;
  roleCode?: string;
  groupId?: string;
}

export interface UserGroupListQueryInput {
  search?: string;
}

export interface AvailableGroupMemberUser {
  id: string;
  username: string;
  display_name: string;
}

export interface ExistingGroupMemberRef {
  user_id: string;
}

export function buildUserListPath(query: UserListQueryInput): string {
  const params = new URLSearchParams();

  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }
  if (query.status && query.status !== "all") {
    params.set("status", query.status);
  }
  if (query.roleCode && query.roleCode !== "all") {
    params.set("role_code", query.roleCode);
  }
  if (query.groupId?.trim()) {
    params.set("group_id", query.groupId.trim());
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return `/api/v1/users${suffix}`;
}

export function buildUserGroupListPath(query: UserGroupListQueryInput): string {
  const params = new URLSearchParams();

  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return `/api/v1/user-groups${suffix}`;
}

export function getAvailableGroupMemberOptions(
  users: AvailableGroupMemberUser[],
  members: ExistingGroupMemberRef[],
): AvailableGroupMemberUser[] {
  const memberIds = new Set(members.map((member) => member.user_id));
  return [...users]
    .filter((user) => !memberIds.has(user.id))
    .sort((left, right) => {
      const displayNameOrder = left.display_name.localeCompare(right.display_name);
      if (displayNameOrder !== 0) {
        return displayNameOrder;
      }
      return left.username.localeCompare(right.username);
    });
}
