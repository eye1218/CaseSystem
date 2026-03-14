import {
  Eye,
  Filter,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ApiError } from "../api/client";
import {
  addUserGroupMembers,
  createUser,
  createUserGroup,
  deleteUser,
  deleteUserGroup,
  getUserDetail,
  getUserGroupDetail,
  listUserGroups,
  listUsers,
  removeUserGroupMember,
  updateUser,
  updateUserGroup,
  updateUserStatus,
} from "../api/users";
import { getAvailableGroupMemberOptions } from "../features/userManagement/utils";
import { useLanguage } from "../contexts/LanguageContext";
import type { RoleCode } from "../types/auth";
import type {
  ManagedUserDetail,
  ManagedUserSummary,
  ManagedUserStatus,
  UserGroupDetailResponse,
  UserGroupSummary,
} from "../types/userManagement";
import { formatApiDateTime } from "../utils/datetime";

type TabKey = "users" | "groups";
type DrawerKind =
  | "closed"
  | "user-create"
  | "user-detail"
  | "user-edit"
  | "group-create"
  | "group-detail"
  | "group-edit";

interface UserFormState {
  username: string;
  display_name: string;
  email: string;
  password: string;
  role_codes: RoleCode[];
  group_ids: string[];
}

interface GroupFormState {
  name: string;
  description: string;
}

const ROLE_OPTIONS: Array<{ value: RoleCode; zh: string; en: string }> = [
  { value: "T1", zh: "T1 分析员", en: "T1 Analyst" },
  { value: "T2", zh: "T2 分析员", en: "T2 Analyst" },
  { value: "T3", zh: "T3 专家", en: "T3 Specialist" },
  { value: "ADMIN", zh: "管理员", en: "Administrator" },
  { value: "CUSTOMER", zh: "客户", en: "Customer" },
];

const STATUS_OPTIONS: Array<{ value: ManagedUserStatus | "all"; zh: string; en: string }> = [
  { value: "all", zh: "全部状态", en: "All statuses" },
  { value: "active", zh: "启用", en: "Active" },
  { value: "disabled", zh: "停用", en: "Disabled" },
  { value: "pending", zh: "待激活", en: "Pending" },
];

const initialUserForm: UserFormState = {
  username: "",
  display_name: "",
  email: "",
  password: "",
  role_codes: ["T1"],
  group_ids: [],
};

const initialGroupForm: GroupFormState = {
  name: "",
  description: "",
};

export default function UsersPage() {
  const { language, t } = useLanguage();
  const zh = language === "zh";
  const [activeTab, setActiveTab] = useState<TabKey>("users");
  const [drawerKind, setDrawerKind] = useState<DrawerKind>("closed");
  const [loading, setLoading] = useState(true);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [users, setUsers] = useState<ManagedUserSummary[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [groups, setGroups] = useState<UserGroupSummary[]>([]);
  const [groupsTotal, setGroupsTotal] = useState(0);
  const [groupCatalog, setGroupCatalog] = useState<UserGroupSummary[]>([]);
  const [userCatalog, setUserCatalog] = useState<ManagedUserSummary[]>([]);

  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeUserDetail, setActiveUserDetail] = useState<ManagedUserDetail | null>(null);
  const [activeGroupDetail, setActiveGroupDetail] = useState<UserGroupDetailResponse | null>(null);

  const [userForm, setUserForm] = useState<UserFormState>(initialUserForm);
  const [groupForm, setGroupForm] = useState<GroupFormState>(initialGroupForm);
  const [memberUserId, setMemberUserId] = useState("");

  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<ManagedUserStatus | "all">("all");
  const [userRoleFilter, setUserRoleFilter] = useState<RoleCode | "all">("all");
  const [userGroupFilter, setUserGroupFilter] = useState("");
  const [groupSearch, setGroupSearch] = useState("");

  const userStats = useMemo(
    () => ({
      active: users.filter((item) => item.status === "active").length,
      disabled: users.filter((item) => item.status === "disabled").length,
    }),
    [users],
  );

  const groupStats = useMemo(
    () => ({
      memberships: groups.reduce((sum, item) => sum + item.member_count, 0),
      nonEmpty: groups.filter((item) => item.member_count > 0).length,
    }),
    [groups],
  );

  const availableMemberOptions = useMemo(
    () =>
      getAvailableGroupMemberOptions(
        userCatalog.map((user) => ({
          id: user.id,
          username: user.username,
          display_name: user.display_name,
        })),
        activeGroupDetail?.members ?? [],
      ),
    [activeGroupDetail?.members, userCatalog],
  );

  useEffect(() => {
    void refreshGroupCatalog();
  }, []);

  useEffect(() => {
    if (activeTab === "users") {
      void loadUsers();
      return;
    }
    void loadGroups();
  }, [activeTab, groupSearch, userGroupFilter, userRoleFilter, userSearch, userStatusFilter]);

  useEffect(() => {
    if (drawerKind === "group-detail") {
      void refreshUserCatalog();
    }
  }, [drawerKind]);

  async function loadUsers() {
    setLoading(true);
    setPageError(null);
    try {
      const response = await listUsers({
        search: userSearch,
        status: userStatusFilter,
        roleCode: userRoleFilter,
        groupId: userGroupFilter,
      });
      setUsers(response.items);
      setUsersTotal(response.total_count);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : zh ? "加载失败" : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    setLoading(true);
    setPageError(null);
    try {
      const response = await listUserGroups({ search: groupSearch });
      setGroups(response.items);
      setGroupsTotal(response.total_count);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : zh ? "加载失败" : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function refreshGroupCatalog() {
    try {
      const response = await listUserGroups({});
      setGroupCatalog(response.items);
    } catch {}
  }

  async function refreshUserCatalog() {
    try {
      const response = await listUsers({});
      setUserCatalog(response.items);
    } catch {}
  }

  async function refreshActiveGroupDetail() {
    if (!activeGroupId || !activeGroupDetail) {
      return;
    }
    try {
      const response = await getUserGroupDetail(activeGroupId);
      setActiveGroupDetail(response);
    } catch {}
  }

  async function openUserDrawer(kind: "user-detail" | "user-edit", userId: string) {
    setDrawerKind(kind);
    setActiveUserId(userId);
    setActiveGroupId(null);
    setActiveGroupDetail(null);
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const response = await getUserDetail(userId);
      setActiveUserDetail(response.user);
      setUserForm({
        username: response.user.username,
        display_name: response.user.display_name,
        email: response.user.email ?? "",
        password: "",
        role_codes: response.user.roles,
        group_ids: response.user.groups.map((group) => group.id),
      });
    } catch (error) {
      setDrawerError(error instanceof Error ? error.message : zh ? "加载失败" : "Failed to load");
    } finally {
      setDrawerLoading(false);
    }
  }

  async function openGroupDrawer(kind: "group-detail" | "group-edit", groupId: string) {
    setDrawerKind(kind);
    setActiveGroupId(groupId);
    setActiveUserId(null);
    setActiveUserDetail(null);
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const [detail] = await Promise.all([getUserGroupDetail(groupId), refreshUserCatalog()]);
      setActiveGroupDetail(detail);
      setGroupForm({
        name: detail.group.name,
        description: detail.group.description ?? "",
      });
      setMemberUserId("");
    } catch (error) {
      setDrawerError(error instanceof Error ? error.message : zh ? "加载失败" : "Failed to load");
    } finally {
      setDrawerLoading(false);
    }
  }

  function openUserCreate() {
    setDrawerKind("user-create");
    setActiveUserId(null);
    setActiveGroupId(null);
    setActiveUserDetail(null);
    setActiveGroupDetail(null);
    setUserForm(initialUserForm);
    setDrawerError(null);
  }

  function openGroupCreate() {
    setDrawerKind("group-create");
    setActiveGroupId(null);
    setActiveUserId(null);
    setActiveUserDetail(null);
    setActiveGroupDetail(null);
    setGroupForm(initialGroupForm);
    setDrawerError(null);
  }

  function closeDrawer() {
    setDrawerKind("closed");
    setActiveUserId(null);
    setActiveGroupId(null);
    setActiveUserDetail(null);
    setActiveGroupDetail(null);
    setDrawerError(null);
    setDrawerLoading(false);
    setMemberUserId("");
  }

  function updateUserFormField<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setUserForm((current) => ({ ...current, [key]: value }));
  }

  function updateGroupFormField<K extends keyof GroupFormState>(key: K, value: GroupFormState[K]) {
    setGroupForm((current) => ({ ...current, [key]: value }));
  }

  function toggleRole(roleCode: RoleCode) {
    setUserForm((current) => {
      const exists = current.role_codes.includes(roleCode);
      if (exists) {
        const nextRoles = current.role_codes.filter((item) => item !== roleCode);
        return { ...current, role_codes: nextRoles.length > 0 ? nextRoles : current.role_codes };
      }
      return { ...current, role_codes: [...current.role_codes, roleCode] };
    });
  }

  function toggleGroup(groupId: string) {
    setUserForm((current) => ({
      ...current,
      group_ids: current.group_ids.includes(groupId)
        ? current.group_ids.filter((item) => item !== groupId)
        : [...current.group_ids, groupId],
    }));
  }

  async function handleSaveUser() {
    setSubmitting(true);
    setDrawerError(null);
    try {
      if (drawerKind === "user-create") {
        const response = await createUser({
          username: userForm.username,
          display_name: userForm.display_name,
          email: userForm.email.trim() ? userForm.email.trim() : null,
          password: userForm.password,
          role_codes: userForm.role_codes,
          group_ids: userForm.group_ids,
        });
        setActiveUserId(response.user.id);
        setActiveUserDetail(response.user);
        setDrawerKind("user-detail");
      } else if (drawerKind === "user-edit" && activeUserId) {
        const response = await updateUser(activeUserId, {
          display_name: userForm.display_name,
          email: userForm.email.trim() ? userForm.email.trim() : null,
          group_ids: userForm.group_ids,
        });
        setActiveUserDetail(response.user);
        setDrawerKind("user-detail");
      }
      await Promise.all([loadUsers(), refreshGroupCatalog(), refreshUserCatalog(), refreshActiveGroupDetail()]);
    } catch (error) {
      setDrawerError(readApiMessage(error, zh));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveGroup() {
    setSubmitting(true);
    setDrawerError(null);
    try {
      if (drawerKind === "group-create") {
        const response = await createUserGroup({
          name: groupForm.name,
          description: groupForm.description.trim() ? groupForm.description.trim() : null,
        });
        setActiveGroupId(response.group.id);
        setActiveGroupDetail(response);
        setDrawerKind("group-detail");
        await refreshUserCatalog();
      } else if (drawerKind === "group-edit" && activeGroupId) {
        const response = await updateUserGroup(activeGroupId, {
          name: groupForm.name,
          description: groupForm.description.trim() ? groupForm.description.trim() : null,
        });
        const refreshed = await getUserGroupDetail(response.group.id);
        setActiveGroupDetail(refreshed);
        setDrawerKind("group-detail");
      }
      await Promise.all([loadGroups(), refreshGroupCatalog()]);
    } catch (error) {
      setDrawerError(readApiMessage(error, zh));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUserStatus(user: ManagedUserSummary, nextStatus: ManagedUserStatus) {
    const confirmed = window.confirm(
      zh
        ? `${nextStatus === "disabled" ? "停用" : "启用"}用户 ${user.display_name}？`
        : `${nextStatus === "disabled" ? "Disable" : "Enable"} ${user.display_name}?`,
    );
    if (!confirmed) return;

    const reason =
      nextStatus === "disabled"
        ? zh
          ? "由管理员停用"
          : "Disabled by administrator"
        : null;

    try {
      const response = await updateUserStatus(user.id, nextStatus, reason);
      if (activeUserId === user.id) {
        setActiveUserDetail(response.user);
      }
      await Promise.all([loadUsers(), refreshActiveGroupDetail()]);
    } catch (error) {
      window.alert(readApiMessage(error, zh));
    }
  }

  async function handleDeleteUser(user: ManagedUserSummary) {
    const confirmed = window.confirm(
      zh ? `删除用户 ${user.display_name}？此操作不可撤销。` : `Delete ${user.display_name}? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await deleteUser(user.id);
      if (activeUserId === user.id) {
        closeDrawer();
      }
      await Promise.all([loadUsers(), refreshUserCatalog(), refreshActiveGroupDetail()]);
    } catch (error) {
      window.alert(readApiMessage(error, zh));
    }
  }

  async function handleDeleteGroup(group: UserGroupSummary) {
    const confirmed = window.confirm(
      zh ? `删除用户组 ${group.name}？` : `Delete group ${group.name}?`,
    );
    if (!confirmed) return;

    try {
      await deleteUserGroup(group.id);
      if (activeGroupId === group.id) {
        closeDrawer();
      }
      await Promise.all([loadGroups(), refreshGroupCatalog()]);
    } catch (error) {
      window.alert(readApiMessage(error, zh));
    }
  }

  async function handleAddMember() {
    if (!activeGroupId || !memberUserId) return;
    setSubmitting(true);
    setDrawerError(null);
    try {
      const response = await addUserGroupMembers(activeGroupId, { user_ids: [memberUserId] });
      setActiveGroupDetail(response);
      setMemberUserId("");
      await Promise.all([loadGroups(), refreshGroupCatalog(), refreshUserCatalog()]);
    } catch (error) {
      setDrawerError(readApiMessage(error, zh));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!activeGroupId) return;
    const confirmed = window.confirm(zh ? "将该用户移出当前用户组？" : "Remove this user from the group?");
    if (!confirmed) return;
    try {
      const response = await removeUserGroupMember(activeGroupId, userId);
      setActiveGroupDetail(response);
      await Promise.all([loadGroups(), refreshGroupCatalog(), refreshUserCatalog()]);
    } catch (error) {
      window.alert(readApiMessage(error, zh));
    }
  }

  const drawerOpen = drawerKind !== "closed";
  const showingUserForm = drawerKind === "user-create" || drawerKind === "user-edit" || drawerKind === "user-detail";
  const showingGroupForm = drawerKind === "group-create" || drawerKind === "group-edit" || drawerKind === "group-detail";

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title={zh ? "用户总览" : "Users"}
          value={String(usersTotal)}
          subtitle={zh ? "当前筛选结果中的用户数" : "Users in the current result set"}
          icon={<UserCog className="h-4 w-4" />}
        />
        <MetricCard
          title={zh ? "停用用户" : "Disabled"}
          value={String(userStats.disabled)}
          subtitle={zh ? "当前结果中的停用账号" : "Disabled accounts in the current view"}
          icon={<UserMinus className="h-4 w-4" />}
        />
        <MetricCard
          title={zh ? "用户组" : "Groups"}
          value={String(groupsTotal)}
          subtitle={
            activeTab === "users"
              ? zh
                ? "用于分组维护、筛选和通知对象选择"
                : "Business grouping for filters and targeting"
              : zh
                ? `已有成员关系 ${groupStats.memberships} 条`
                : `${groupStats.memberships} current memberships`
          }
          icon={<Users className="h-4 w-4" />}
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {zh ? "管理员工作台" : "Admin Workspace"}
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              {zh ? "用户管理" : "User Management"}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {zh
                ? "统一维护账号状态、用户组关系与停用/删除保护规则。"
                : "Manage account status, group membership, and delete/disable protections."}
            </p>
          </div>

          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950/60">
            <TabButton active={activeTab === "users"} onClick={() => setActiveTab("users")}>
              {zh ? "Users / 用户" : "Users"}
            </TabButton>
            <TabButton active={activeTab === "groups"} onClick={() => setActiveTab("groups")}>
              {zh ? "Groups / 用户组" : "Groups"}
            </TabButton>
          </div>
        </div>

        {pageError ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {pageError}
          </div>
        ) : null}

        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={activeTab === "users" ? userSearch : groupSearch}
              onChange={(event) =>
                activeTab === "users" ? setUserSearch(event.target.value) : setGroupSearch(event.target.value)
              }
              placeholder={
                activeTab === "users"
                  ? zh
                    ? "按用户名、显示名或邮箱搜索"
                    : "Search username, display name, or email"
                  : zh
                    ? "按用户组名称搜索"
                    : "Search group name"
              }
              className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {activeTab === "users" ? (
            <>
              <button
                onClick={() => setShowFilters((current) => !current)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  showFilters
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Filter className="h-4 w-4" />
                {t("common.filter")}
              </button>
              <button
                onClick={openUserCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                {zh ? "新增用户" : "Create User"}
              </button>
            </>
          ) : (
            <button
              onClick={openGroupCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              {zh ? "新增用户组" : "Create Group"}
            </button>
          )}
        </div>

        {activeTab === "users" && showFilters ? (
          <div className="mb-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3 dark:border-slate-800 dark:bg-slate-950/40">
            <FilterField label={zh ? "账号状态" : "Status"}>
              <select
                value={userStatusFilter}
                onChange={(event) => setUserStatusFilter(event.target.value as ManagedUserStatus | "all")}
                className={selectClassName}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {zh ? option.zh : option.en}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label={zh ? "角色" : "Role"}>
              <select
                value={userRoleFilter}
                onChange={(event) => setUserRoleFilter(event.target.value as RoleCode | "all")}
                className={selectClassName}
              >
                <option value="all">{zh ? "全部角色" : "All roles"}</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {zh ? role.zh : role.en}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label={zh ? "用户组" : "Group"}>
              <select
                value={userGroupFilter}
                onChange={(event) => setUserGroupFilter(event.target.value)}
                className={selectClassName}
              >
                <option value="">{zh ? "全部用户组" : "All groups"}</option>
                {groupCatalog.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </FilterField>
          </div>
        ) : null}

        <div className="flex min-h-0 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="overflow-auto">
              {activeTab === "users" ? (
                <table className="min-w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <HeadCell label={zh ? "用户名" : "Username"} />
                      <HeadCell label={zh ? "显示名" : "Display Name"} />
                      <HeadCell label="Email" />
                      <HeadCell label={zh ? "角色" : "Roles"} />
                      <HeadCell label={zh ? "用户组" : "Groups"} />
                      <HeadCell label={zh ? "状态" : "Status"} />
                      <HeadCell label={zh ? "最后登录" : "Last Login"} />
                      <HeadCell label={zh ? "更新时间" : "Updated"} />
                      <HeadCell label={zh ? "操作" : "Actions"} />
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900">
                    {loading ? (
                      <LoadingRow colSpan={9} label={t("common.loading")} />
                    ) : users.length === 0 ? (
                      <LoadingRow colSpan={9} label={t("common.noData")} />
                    ) : (
                      users.map((user, index) => (
                        <tr
                          key={user.id}
                          onClick={() => void openUserDrawer("user-detail", user.id)}
                          className={`cursor-pointer border-b border-slate-100 text-sm transition-colors dark:border-slate-800 ${
                            index % 2 === 0
                              ? "bg-white hover:bg-blue-50/60 dark:bg-slate-900 dark:hover:bg-slate-800/70"
                              : "bg-slate-50/70 hover:bg-blue-50/60 dark:bg-slate-950/40 dark:hover:bg-slate-800/70"
                          }`}
                        >
                          <Cell className="font-mono text-slate-700 dark:text-slate-200">{user.username}</Cell>
                          <Cell>{user.display_name}</Cell>
                          <Cell>{user.email ?? "-"}</Cell>
                          <Cell>
                            <div className="flex flex-wrap gap-1.5">
                              {user.roles.map((role) => (
                                <RoleBadge key={role} role={role} language={language} />
                              ))}
                            </div>
                          </Cell>
                          <Cell>
                            <div className="flex flex-wrap gap-1.5">
                              {user.groups.length === 0 ? (
                                <span className="text-xs text-slate-400">-</span>
                              ) : (
                                user.groups.map((group) => <GroupChip key={group.id} label={group.name} />)
                              )}
                            </div>
                          </Cell>
                          <Cell>
                            <StatusBadge status={user.status} language={language} />
                          </Cell>
                          <Cell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                            {formatApiDateTime(user.last_login_at, language)}
                          </Cell>
                          <Cell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                            {formatApiDateTime(user.updated_at, language)}
                          </Cell>
                          <Cell>
                            <ActionRow>
                              <ActionButton
                                onClick={() => void openUserDrawer("user-detail", user.id)}
                                label={zh ? "查看" : "View"}
                                icon={<Eye className="h-3.5 w-3.5" />}
                              />
                              <ActionButton
                                onClick={() => void openUserDrawer("user-edit", user.id)}
                                label={zh ? "编辑" : "Edit"}
                                icon={<Pencil className="h-3.5 w-3.5" />}
                              />
                              <ActionButton
                                onClick={() => void handleUserStatus(user, user.status === "active" ? "disabled" : "active")}
                                label={user.status === "active" ? (zh ? "停用" : "Disable") : zh ? "启用" : "Enable"}
                                icon={user.status === "active" ? <UserMinus className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                              />
                              <DangerButton
                                onClick={() => void handleDeleteUser(user)}
                                label={zh ? "删除" : "Delete"}
                              />
                            </ActionRow>
                          </Cell>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="min-w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <HeadCell label={zh ? "用户组名称" : "Group Name"} />
                      <HeadCell label={zh ? "描述" : "Description"} />
                      <HeadCell label={zh ? "成员数" : "Members"} />
                      <HeadCell label={zh ? "更新时间" : "Updated"} />
                      <HeadCell label={zh ? "操作" : "Actions"} />
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900">
                    {loading ? (
                      <LoadingRow colSpan={5} label={t("common.loading")} />
                    ) : groups.length === 0 ? (
                      <LoadingRow colSpan={5} label={t("common.noData")} />
                    ) : (
                      groups.map((group, index) => (
                        <tr
                          key={group.id}
                          onClick={() => void openGroupDrawer("group-detail", group.id)}
                          className={`cursor-pointer border-b border-slate-100 text-sm transition-colors dark:border-slate-800 ${
                            index % 2 === 0
                              ? "bg-white hover:bg-blue-50/60 dark:bg-slate-900 dark:hover:bg-slate-800/70"
                              : "bg-slate-50/70 hover:bg-blue-50/60 dark:bg-slate-950/40 dark:hover:bg-slate-800/70"
                          }`}
                        >
                          <Cell className="font-medium text-slate-900 dark:text-white">{group.name}</Cell>
                          <Cell>{group.description ?? "-"}</Cell>
                          <Cell>{group.member_count}</Cell>
                          <Cell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                            {formatApiDateTime(group.updated_at, language)}
                          </Cell>
                          <Cell>
                            <ActionRow>
                              <ActionButton
                                onClick={() => void openGroupDrawer("group-detail", group.id)}
                                label={zh ? "查看" : "View"}
                                icon={<Eye className="h-3.5 w-3.5" />}
                              />
                              <ActionButton
                                onClick={() => void openGroupDrawer("group-edit", group.id)}
                                label={zh ? "编辑" : "Edit"}
                                icon={<Pencil className="h-3.5 w-3.5" />}
                              />
                              <DangerButton
                                onClick={() => void handleDeleteGroup(group)}
                                label={zh ? "删除" : "Delete"}
                              />
                            </ActionRow>
                          </Cell>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <DrawerShell open={drawerOpen}>
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {drawerKind.startsWith("user") ? (zh ? "用户" : "User") : zh ? "用户组" : "Group"}
                  </div>
                  <h2 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {drawerTitle(drawerKind, zh)}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {drawerError ? (
                <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                  {drawerError}
                </div>
              ) : null}

              <div className="flex-1 overflow-auto p-4">
                {drawerLoading ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                    {t("common.loading")}
                  </div>
                ) : showingUserForm ? (
                  <div className="space-y-5">
                    <section className="grid gap-4">
                      <Field label="Username">
                        <input
                          type="text"
                          value={userForm.username}
                          readOnly={drawerKind !== "user-create"}
                          onChange={(event) => updateUserFormField("username", event.target.value)}
                          className={inputClassName(drawerKind !== "user-create")}
                        />
                      </Field>

                      <Field label={zh ? "显示名" : "Display Name"}>
                        <input
                          type="text"
                          value={userForm.display_name}
                          readOnly={drawerKind === "user-detail"}
                          onChange={(event) => updateUserFormField("display_name", event.target.value)}
                          className={inputClassName(drawerKind === "user-detail")}
                        />
                      </Field>

                      <Field label="Email">
                        <input
                          type="email"
                          value={userForm.email}
                          readOnly={drawerKind === "user-detail"}
                          onChange={(event) => updateUserFormField("email", event.target.value)}
                          className={inputClassName(drawerKind === "user-detail")}
                        />
                      </Field>

                      {drawerKind === "user-create" ? (
                        <Field label={zh ? "初始密码" : "Initial Password"}>
                          <input
                            type="password"
                            value={userForm.password}
                            onChange={(event) => updateUserFormField("password", event.target.value)}
                            className={inputClassName(false)}
                          />
                        </Field>
                      ) : (
                        <InfoPanel
                          label={zh ? "账号状态" : "Account Status"}
                          value={
                            activeUserDetail ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={activeUserDetail.status} language={language} />
                                {activeUserDetail.disabled_reason ? (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {activeUserDetail.disabled_reason}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              "-"
                            )
                          }
                        />
                      )}
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {zh ? "角色" : "Roles"}
                      </div>
                      {drawerKind === "user-create" ? (
                        <div className="grid gap-2">
                          {ROLE_OPTIONS.map((role) => (
                            <label
                              key={role.value}
                              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                            >
                              <input
                                type="checkbox"
                                checked={userForm.role_codes.includes(role.value)}
                                onChange={() => toggleRole(role.value)}
                              />
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                {role.value}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {zh ? role.zh : role.en}
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {userForm.role_codes.map((role) => (
                            <RoleBadge key={role} role={role} language={language} />
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {zh ? "用户组" : "Groups"}
                      </div>
                      {groupCatalog.length === 0 ? (
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {zh ? "暂无可选用户组" : "No groups available"}
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          {groupCatalog.map((group) => (
                            <label
                              key={group.id}
                              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                            >
                              <input
                                type="checkbox"
                                checked={userForm.group_ids.includes(group.id)}
                                disabled={drawerKind === "user-detail"}
                                onChange={() => toggleGroup(group.id)}
                              />
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                {group.name}
                              </span>
                              <span className="text-xs text-slate-400">
                                {group.member_count}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                ) : showingGroupForm ? (
                  <div className="space-y-5">
                    <section className="grid gap-4">
                      <Field label={zh ? "用户组名称" : "Group Name"}>
                        <input
                          type="text"
                          value={groupForm.name}
                          readOnly={drawerKind === "group-detail"}
                          onChange={(event) => updateGroupFormField("name", event.target.value)}
                          className={inputClassName(drawerKind === "group-detail")}
                        />
                      </Field>
                      <Field label={zh ? "描述" : "Description"}>
                        <textarea
                          value={groupForm.description}
                          readOnly={drawerKind === "group-detail"}
                          onChange={(event) => updateGroupFormField("description", event.target.value)}
                          className={`${inputClassName(drawerKind === "group-detail")} min-h-28 resize-y`}
                        />
                      </Field>
                    </section>

                    {drawerKind === "group-detail" && activeGroupDetail ? (
                      <section className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                              {zh ? "组成员" : "Members"}
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {activeGroupDetail.group.member_count}
                            </span>
                          </div>

                          <div className="mb-4 flex flex-col gap-3">
                            <select
                              value={memberUserId}
                              onChange={(event) => setMemberUserId(event.target.value)}
                              className={selectClassName}
                            >
                              <option value="">{zh ? "选择要加入的用户" : "Select user to add"}</option>
                              {availableMemberOptions.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.display_name} ({user.username})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleAddMember()}
                              disabled={!memberUserId || submitting}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                            >
                              <UserPlus className="h-4 w-4" />
                              {zh ? "加入用户组" : "Add Member"}
                            </button>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                            <table className="min-w-full border-collapse">
                              <thead className="bg-white dark:bg-slate-900">
                                <tr className="border-b border-slate-200 dark:border-slate-800">
                                  <HeadCell label={zh ? "成员" : "Member"} />
                                  <HeadCell label={zh ? "角色" : "Roles"} />
                                  <HeadCell label={zh ? "状态" : "Status"} />
                                  <HeadCell label={zh ? "加入时间" : "Added"} />
                                  <HeadCell label={zh ? "操作" : "Actions"} />
                                </tr>
                              </thead>
                              <tbody className="bg-slate-50/50 dark:bg-slate-950/40">
                                {activeGroupDetail.members.length === 0 ? (
                                  <LoadingRow colSpan={5} label={t("common.noData")} />
                                ) : (
                                  activeGroupDetail.members.map((member) => (
                                    <tr key={member.user_id} className="border-b border-slate-100 dark:border-slate-800">
                                      <Cell>
                                        <div className="font-medium text-slate-900 dark:text-white">
                                          {member.display_name}
                                        </div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">
                                          {member.username}
                                        </div>
                                      </Cell>
                                      <Cell>
                                        <div className="flex flex-wrap gap-1.5">
                                          {member.roles.map((role) => (
                                            <RoleBadge key={role} role={role} language={language} />
                                          ))}
                                        </div>
                                      </Cell>
                                      <Cell>
                                        <StatusBadge status={member.status} language={language} />
                                      </Cell>
                                      <Cell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                                        {formatApiDateTime(member.added_at, language)}
                                      </Cell>
                                      <Cell>
                                        <DangerButton
                                          onClick={() => void handleRemoveMember(member.user_id)}
                                          label={zh ? "移除" : "Remove"}
                                        />
                                      </Cell>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {zh ? "关闭" : "Close"}
                </button>
                <div className="flex items-center gap-2">
                  {drawerKind === "user-detail" && activeUserId ? (
                    <button
                      type="button"
                      onClick={() => setDrawerKind("user-edit")}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Pencil className="h-4 w-4" />
                      {zh ? "编辑" : "Edit"}
                    </button>
                  ) : null}
                  {drawerKind === "group-detail" && activeGroupId ? (
                    <button
                      type="button"
                      onClick={() => setDrawerKind("group-edit")}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Pencil className="h-4 w-4" />
                      {zh ? "编辑" : "Edit"}
                    </button>
                  ) : null}
                  {drawerKind === "user-create" || drawerKind === "user-edit" ? (
                    <button
                      type="button"
                      onClick={() => void handleSaveUser()}
                      disabled={submitting}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      <Shield className="h-4 w-4" />
                      {submitting ? (zh ? "保存中" : "Saving") : zh ? "保存" : "Save"}
                    </button>
                  ) : null}
                  {drawerKind === "group-create" || drawerKind === "group-edit" ? (
                    <button
                      type="button"
                      onClick={() => void handleSaveGroup()}
                      disabled={submitting}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      <Shield className="h-4 w-4" />
                      {submitting ? (zh ? "保存中" : "Saving") : zh ? "保存" : "Save"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </DrawerShell>
        </div>
      </section>
    </div>
  );
}

function readApiMessage(error: unknown, zh: boolean): string {
  if (error instanceof ApiError) {
    if (typeof error.detail === "string") {
      return error.detail;
    }
    if (error.detail && typeof error.detail === "object") {
      const detail = error.detail as Record<string, unknown>;
      if (typeof detail.message === "string") {
        return detail.message;
      }
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return zh ? "操作失败" : "Request failed";
}

function drawerTitle(kind: DrawerKind, zh: boolean) {
  const map: Record<DrawerKind, string> = {
    closed: "",
    "user-create": zh ? "新增用户" : "Create User",
    "user-detail": zh ? "用户详情" : "User Detail",
    "user-edit": zh ? "编辑用户" : "Edit User",
    "group-create": zh ? "新增用户组" : "Create Group",
    "group-detail": zh ? "用户组详情" : "Group Detail",
    "group-edit": zh ? "编辑用户组" : "Edit Group",
  };
  return map[kind];
}

function inputClassName(readOnly: boolean) {
  return `w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white ${
    readOnly ? "cursor-default opacity-80" : ""
  }`;
}

function roleLabel(role: RoleCode, language: "zh" | "en") {
  const option = ROLE_OPTIONS.find((item) => item.value === role);
  return language === "zh" ? option?.zh ?? role : option?.en ?? role;
}

function statusLabel(status: ManagedUserStatus, language: "zh" | "en") {
  const labels: Record<ManagedUserStatus, { zh: string; en: string }> = {
    active: { zh: "启用", en: "Active" },
    disabled: { zh: "停用", en: "Disabled" },
    pending: { zh: "待激活", en: "Pending" },
  };
  return labels[status][language];
}

function statusClass(status: ManagedUserStatus) {
  switch (status) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "disabled":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300";
    default:
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
  }
}

function roleClass(role: RoleCode) {
  switch (role) {
    case "ADMIN":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
    case "CUSTOMER":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    default:
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
  }
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
        <div className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          {icon}
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{subtitle}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function DrawerShell({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="flex-shrink-0 overflow-hidden transition-[width,margin] duration-300 ease-out"
      style={{ width: open ? 540 : 0, marginLeft: open ? 16 : 0 }}
    >
      <div className="h-full w-[540px]">{children}</div>
    </div>
  );
}

function InfoPanel({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="text-sm text-slate-700 dark:text-slate-200">{value}</div>
    </div>
  );
}

function LoadingRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-14 text-center text-sm text-slate-500 dark:text-slate-400">
        {label}
      </td>
    </tr>
  );
}

function HeadCell({ label }: { label: string }) {
  return (
    <th className="px-4 py-3 text-left">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold leading-none uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
    </th>
  );
}

function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-slate-700 dark:text-slate-200 ${className}`}>{children}</td>;
}

function StatusBadge({
  status,
  language,
}: {
  status: ManagedUserStatus;
  language: "zh" | "en";
}) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>
      {statusLabel(status, language)}
    </span>
  );
}

function RoleBadge({ role, language }: { role: RoleCode; language: "zh" | "en" }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${roleClass(role)}`}>
      {roleLabel(role, language)}
    </span>
  );
}

function GroupChip({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {label}
    </span>
  );
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function ActionButton({
  onClick,
  label,
  icon,
}: {
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
    >
      {icon}
      {label}
    </button>
  );
}

function DangerButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

const selectClassName =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white";
