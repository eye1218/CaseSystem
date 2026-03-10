const ticketRows = [
  {
    id: "100182",
    title: "SOC 告警升级: 可疑横向移动行为",
    category: "安全事件",
    priority: "P1",
    riskScore: 92,
    mainStatus: "IN_PROGRESS",
    subStatus: "ESCALATION_PENDING_CONFIRM",
    assignee: "王晨",
    pool: "",
    createdAt: "2026-03-09T07:24:00",
    updatedAt: "2026-03-09T09:12:00",
  },
  {
    id: "100181",
    title: "客户反馈: 邮件钓鱼处置报告需补充",
    category: "服务请求",
    priority: "P2",
    riskScore: 63,
    mainStatus: "RESOLVED",
    subStatus: "NONE",
    assignee: "李青",
    pool: "",
    createdAt: "2026-03-08T15:10:00",
    updatedAt: "2026-03-09T08:02:00",
  },
  {
    id: "100177",
    title: "夜班值守: T2 池待领取工单",
    category: "告警事件",
    priority: "P2",
    riskScore: 74,
    mainStatus: "WAITING_RESPONSE",
    subStatus: "NONE",
    assignee: "",
    pool: "T2_POOL",
    createdAt: "2026-03-09T01:04:00",
    updatedAt: "2026-03-09T01:12:00",
  },
  {
    id: "100169",
    title: "主机异常登录: 超过响应 SLA",
    category: "安全事件",
    priority: "P1",
    riskScore: 87,
    mainStatus: "RESPONSE_TIMEOUT",
    subStatus: "NONE",
    assignee: "王晨",
    pool: "",
    createdAt: "2026-03-09T00:20:00",
    updatedAt: "2026-03-09T02:18:00",
  },
  {
    id: "100161",
    title: "客户系统故障排查单",
    category: "系统故障",
    priority: "P3",
    riskScore: 41,
    mainStatus: "CLOSED",
    subStatus: "NONE",
    assignee: "赵一凡",
    pool: "",
    createdAt: "2026-03-05T11:30:00",
    updatedAt: "2026-03-07T10:40:00",
  },
];

const actorProfiles = {
  T1: { role: "T1", label: "T1", userId: "user-t1", internal: true },
  T2: { role: "T2", label: "T2", userId: "user-wangchen", internal: true },
  T3: { role: "T3", label: "T3", userId: "user-zhaoyifan", internal: true },
  ADMIN: { role: "ADMIN", label: "ADMIN", userId: "user-admin", internal: true },
  CUSTOMER: { role: "CUSTOMER", label: "CUSTOMER", userId: "user-customer", internal: false },
};

const knowledgeIndex = {
  "phishing-playbook.md": {
    title: "钓鱼邮件处置作业卡",
    type: "Runbook",
    updatedAt: "2026-03-08 21:05",
  },
  "lateral-movement.md": {
    title: "横向移动初判与隔离指引",
    type: "Playbook",
    updatedAt: "2026-03-09 01:32",
  },
};

const reportIndex = {
  "lateral-movement-closure.txt": {
    title: "横向移动事件关闭报告",
    type: "Closure Report · 最新版",
    label: "下载报告文件",
  },
  "incident-retrospective-template.txt": {
    title: "事件复盘模板",
    type: "Template · Markdown Export",
    label: "下载模板",
  },
};

const ticketDetailIndex = {
  "100182": {
    source: "API",
    riskScore: 92,
    heroCopy: "主状态与子状态分离展示，知识库通过 Markdown 预览抽屉辅助研判，报告仅提供下载入口。",
    responseSla: { value: "已达成", meta: "08:00 前已响应", tone: "success" },
    resolutionSla: { value: "02:41:12", meta: "剩余时长", tone: "warning" },
    respondedAt: "2026-03-09T07:58:00",
    escalationTargetUserId: "user-zhaoyifan",
    escalationTargetName: "赵一凡",
    comments: [
      {
        author: "王晨",
        role: "T2",
        time: "09:12",
        body: "已完成主机隔离与横向移动初判，等待指定专家确认升级。若需要，可直接参考右侧知识库作业卡。",
      },
      {
        author: "系统",
        role: "System",
        time: "09:05",
        body: "子状态变更为“升级待确认”，目标确认人：赵一凡。",
      },
      {
        author: "客户 A",
        role: "Customer",
        time: "08:56",
        body: "请优先确认当前办公区资产是否存在扩散风险，我们需要 30 分钟内获得初步结论。",
      },
    ],
    timeline: [
      { title: "升级申请", body: "09:05 · 王晨发起升级给指定人，目标确认人赵一凡。" },
      { title: "已响应", body: "07:58 · 记录 responded_at，工单进入处理中阶段。" },
      { title: "工单创建", body: "07:24 · API 创建工单，初始主状态 WAITING_RESPONSE，子状态 NONE。" },
    ],
    knowledge: [
      {
        file: "lateral-movement.md",
        title: "横向移动初判与隔离指引",
        type: "Playbook",
        updatedAt: "2026-03-09 01:32",
        summary: "适配“安全事件”分类，包含研判优先级、隔离顺序与后续升级判断。",
      },
      {
        file: "phishing-playbook.md",
        title: "钓鱼邮件处置作业卡",
        type: "Runbook",
        updatedAt: "2026-03-08 21:05",
        summary: "适合关联邮件投递、主机告警和客户反馈联动处置时快速参考。",
      },
    ],
    reports: [
      { file: "lateral-movement-closure.txt" },
      { file: "incident-retrospective-template.txt" },
    ],
    externalContext: [
      { label: "规则名", value: "Lateral Movement Suspected" },
      { label: "资产", value: "HOST-SH-29 / 10.16.3.42" },
      { label: "SIM 研判", value: "优先隔离登录源主机，再检查相邻办公网资产。" },
    ],
  },
  "100181": {
    source: "CUSTOMER",
    riskScore: 63,
    heroCopy: "该工单已完成处置，当前页面重点表现关闭前复核、客户评论与报告下载。",
    responseSla: { value: "已达成", meta: "2 小时内响应", tone: "success" },
    resolutionSla: { value: "已达成", meta: "已进入关闭待复核", tone: "success" },
    comments: [
      { author: "李青", role: "T2", time: "08:02", body: "已补充报告结论，等待客户确认关闭。" },
      { author: "客户 A", role: "Customer", time: "07:45", body: "请补充影响范围说明后再关闭工单。" },
    ],
    timeline: [
      { title: "处置完成", body: "08:02 · 当前主状态进入 RESOLVED，待进一步关闭。" },
      { title: "客户补充反馈", body: "07:45 · 客户要求完善报告范围说明。" },
    ],
    knowledge: [
      {
        file: "phishing-playbook.md",
        title: "钓鱼邮件处置作业卡",
        type: "Runbook",
        updatedAt: "2026-03-08 21:05",
        summary: "处理客户反馈和邮件安全处置时可快速复用标准步骤。",
      },
    ],
    reports: [{ file: "incident-retrospective-template.txt" }],
    externalContext: [
      { label: "客户侧备注", value: "关注报告内容完整性，不涉及进一步升级。" },
      { label: "工单来源", value: "客户补充说明后继续推进关闭。" },
    ],
  },
  "100177": {
    source: "INTERNAL",
    riskScore: 74,
    heroCopy: "当前工单位于池子中，责任归属展示为池子，但内部用户仍可按业务状态执行动作。",
    responseSla: { value: "00:48:19", meta: "距离响应超时", tone: "warning" },
    resolutionSla: { value: "08:35:00", meta: "距离处置超时", tone: "default" },
    comments: [
      { author: "系统", role: "System", time: "01:12", body: "工单进入 T2_POOL，等待内部人员领取。" },
    ],
    timeline: [
      { title: "进入池子", body: "01:12 · 工单升级到 T2_POOL，未指定具体处理人。" },
      { title: "工单创建", body: "01:04 · 手工创建，主状态 WAITING_RESPONSE。" },
    ],
    knowledge: [
      {
        file: "lateral-movement.md",
        title: "横向移动初判与隔离指引",
        type: "Playbook",
        updatedAt: "2026-03-09 01:32",
        summary: "可用于池子工单快速识别是否需要升级到更高层级。",
      },
    ],
    reports: [{ file: "incident-retrospective-template.txt" }],
    externalContext: [
      { label: "当前池子", value: "T2_POOL" },
      { label: "责任说明", value: "内部用户不因池子归属失去普通工单操作能力。" },
    ],
  },
  "100169": {
    source: "API",
    riskScore: 87,
    heroCopy: "当前处于响应超时，页面重点强调超时风险下仍允许响应与后续处置。",
    responseSla: { value: "已超时", meta: "响应 SLA 已超出 00:52:14", tone: "danger" },
    resolutionSla: { value: "03:18:42", meta: "剩余处置时长", tone: "warning" },
    comments: [
      { author: "系统", role: "System", time: "02:18", body: "主状态切换为 RESPONSE_TIMEOUT，等待人工补响应。" },
    ],
    timeline: [
      { title: "响应超时", body: "02:18 · 达到响应 SLA 截止但仍未响应。" },
      { title: "工单创建", body: "00:20 · API 同步异常登录告警。" },
    ],
    knowledge: [
      {
        file: "lateral-movement.md",
        title: "横向移动初判与隔离指引",
        type: "Playbook",
        updatedAt: "2026-03-09 01:32",
        summary: "对高风险主机登录和横向移动类事件适配较好。",
      },
    ],
    reports: [{ file: "lateral-movement-closure.txt" }],
    externalContext: [
      { label: "规则名", value: "Suspicious Login Burst" },
      { label: "资产", value: "HOST-SH-41 / 10.16.8.14" },
      { label: "SIM 研判", value: "优先补充响应动作，再继续推进处置与隔离。" },
    ],
  },
  "100161": {
    source: "CUSTOMER",
    riskScore: 41,
    heroCopy: "已关闭工单不再展示内部处理动作，客户视角仅保留评论历史、报告下载与 Reopen 入口。",
    responseSla: { value: "已达成", meta: "响应和处置均已完成", tone: "success" },
    resolutionSla: { value: "已关闭", meta: "已进入闭环状态", tone: "success" },
    comments: [
      { author: "赵一凡", role: "T3", time: "03/07 10:40", body: "故障排查完成并已交付最终说明。" },
      { author: "客户 B", role: "Customer", time: "03/07 09:52", body: "确认问题已恢复，如后续复发将发起重开。" },
    ],
    timeline: [
      { title: "工单关闭", body: "03/07 10:40 · 主状态 CLOSED，保留历史评论与报告下载。" },
      { title: "已处置", body: "03/07 09:58 · 当前问题已恢复，进入待关闭阶段。" },
    ],
    knowledge: [
      {
        file: "phishing-playbook.md",
        title: "钓鱼邮件处置作业卡",
        type: "Runbook",
        updatedAt: "2026-03-08 21:05",
        summary: "当前分类为系统故障，仅作跨案例参考。",
      },
    ],
    reports: [{ file: "incident-retrospective-template.txt" }],
    externalContext: [
      { label: "客户状态", value: "已确认关闭，允许后续 Reopen。" },
      { label: "内部备注", value: "已归档到回收站策略之外，不支持彻底删除。" },
    ],
  },
};

const statusDictionary = {
  WAITING_RESPONSE: { label: "待响应", className: "status-waiting" },
  IN_PROGRESS: { label: "处理中", className: "status-progress" },
  RESPONSE_TIMEOUT: { label: "响应超时", className: "status-timeout" },
  RESOLUTION_TIMEOUT: { label: "处置超时", className: "status-timeout" },
  RESOLVED: { label: "已处置", className: "status-resolved" },
  CLOSED: { label: "已关闭", className: "status-closed" },
  REOPENED: { label: "已重开", className: "status-progress" },
  NONE: { label: "无子状态", className: "" },
  ESCALATION_PENDING_CONFIRM: { label: "升级待确认", className: "status-escalation" },
  ESCALATION_CONFIRMED: { label: "升级已确认", className: "status-escalation" },
  ESCALATION_REJECTED: { label: "升级被拒绝", className: "status-escalation" },
};

const actionCatalog = {
  respond: { label: "响应", tone: "quiet" },
  resolve: { label: "处置完成", tone: "primary" },
  close: { label: "关闭", tone: "primary" },
  reopen: { label: "重开 Reopen", tone: "primary" },
  escalate: { label: "升级申请", tone: "ghost" },
  confirmEscalation: { label: "确认升级", tone: "primary" },
  rejectEscalation: { label: "拒绝升级", tone: "ghost" },
  joinPool: { label: "加入池子", tone: "quiet" },
  claim: { label: "领取工单", tone: "quiet" },
  edit: { label: "编辑", tone: "ghost" },
};

const ticketListState = {
  sortKey: null,
  sortDirection: "asc",
};

const priorityOrder = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem("casesystem-theme", theme);
  document.querySelectorAll("[data-theme-label]").forEach((node) => {
    node.textContent = theme === "dark" ? "Dark" : "Light";
  });
}

function initializeTheme() {
  const stored = localStorage.getItem("casesystem-theme");
  applyTheme(stored || "dark");
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = document.body.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(current);
    });
  });
}

function getStatusChip(code) {
  const item = statusDictionary[code] || { label: code, className: "" };
  const className = item.className ? `status-chip ${item.className}` : "status-chip";
  return `<span class="${className}">${item.label}</span>`;
}

function getButtonClass(tone) {
  if (tone === "primary") {
    return "primary-button";
  }
  if (tone === "ghost") {
    return "ghost-button";
  }
  if (tone === "danger") {
    return "danger-button";
  }
  return "quiet-button";
}

function formatDate(value) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getTicketSortValue(ticket, sortKey) {
  if (sortKey === "id") {
    return Number(ticket.id);
  }
  if (sortKey === "priority") {
    return priorityOrder[ticket.priority] || 999;
  }
  if (sortKey === "riskScore") {
    return Number(ticket.riskScore);
  }
  if (sortKey === "createdAt" || sortKey === "updatedAt") {
    return new Date(ticket[sortKey]).getTime();
  }
  return ticket[sortKey];
}

function sortTickets(rows) {
  if (!ticketListState.sortKey) {
    return rows;
  }

  const direction = ticketListState.sortDirection === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = getTicketSortValue(left, ticketListState.sortKey);
    const rightValue = getTicketSortValue(right, ticketListState.sortKey);
    if (leftValue === rightValue) {
      return Number(left.id) - Number(right.id);
    }
    return leftValue > rightValue ? direction : -direction;
  });
}

function renderTicketRows(rows) {
  const tbody = document.querySelector("[data-ticket-table]");
  if (!tbody) {
    return;
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state">未找到符合筛选条件的工单</div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td><a class="table-id" href="/ui/tickets/${row.id}">#${row.id}</a></td>
          <td>
            <div class="table-title">
              <strong>${row.title}</strong>
            </div>
          </td>
          <td><span class="chip">${row.category}</span></td>
          <td><span class="priority-chip">${row.priority}</span></td>
          <td><span class="risk-score">${row.riskScore}</span></td>
          <td>${getStatusChip(row.mainStatus)}</td>
          <td>${row.subStatus === "NONE" ? '<span class="muted">无</span>' : getStatusChip(row.subStatus)}</td>
          <td>${row.assignee || '<span class="muted">未指定</span>'}</td>
          <td>${row.pool || '<span class="muted">未在池中</span>'}</td>
          <td>${formatDate(row.createdAt)}</td>
          <td>${formatDate(row.updatedAt)}</td>
          <td><a class="quiet-button" href="/ui/tickets/${row.id}">查看详情</a></td>
        </tr>
      `
    )
    .join("");
}

function getFilteredTickets() {
  const idValue = (document.querySelector("#ticket-id-search")?.value || "").trim();
  const category = document.querySelector("#filter-category")?.value || "";
  const priority = document.querySelector("#filter-priority")?.value || "";
  const status = document.querySelector("#filter-status")?.value || "";
  const fromDate = document.querySelector("#filter-from-date")?.value || "";
  const toDate = document.querySelector("#filter-to-date")?.value || "";

  return ticketRows.filter((ticket) => {
    if (idValue && ticket.id !== idValue) {
      return false;
    }
    if (category && ticket.category !== category) {
      return false;
    }
    if (priority && ticket.priority !== priority) {
      return false;
    }
    if (status && ticket.mainStatus !== status) {
      return false;
    }
    if (fromDate && ticket.createdAt.slice(0, 10) < fromDate) {
      return false;
    }
    if (toDate && ticket.createdAt.slice(0, 10) > toDate) {
      return false;
    }
    return true;
  });
}

function updateTicketCount(rows) {
  const countNode = document.querySelector("[data-filter-count]");
  if (countNode) {
    countNode.textContent = `${rows.length} / ${ticketRows.length}`;
  }
}

function updateSortHeaders() {
  document.querySelectorAll("[data-sort-key]").forEach((button) => {
    const indicator = button.querySelector("[data-sort-indicator]");
    const active = button.dataset.sortKey === ticketListState.sortKey;
    button.dataset.active = active ? "true" : "false";
    if (indicator) {
      indicator.textContent = active ? (ticketListState.sortDirection === "asc" ? "↑" : "↓") : "↕";
    }
  });
}

function updateTicketList() {
  const rows = sortTickets(getFilteredTickets());
  renderTicketRows(rows);
  updateTicketCount(rows);
  updateSortHeaders();
}

function initializeTicketList() {
  const table = document.querySelector("[data-ticket-table]");
  if (!table) {
    return;
  }
  updateTicketList();
  document.querySelectorAll("[data-filter-input]").forEach((node) => {
    node.addEventListener("input", updateTicketList);
    node.addEventListener("change", updateTicketList);
  });
  document.querySelectorAll("[data-sort-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sortKey;
      if (ticketListState.sortKey === key) {
        ticketListState.sortDirection = ticketListState.sortDirection === "asc" ? "desc" : "asc";
      } else {
        ticketListState.sortKey = key;
        ticketListState.sortDirection = "asc";
      }
      updateTicketList();
    });
  });
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const html = [];
  let inList = false;
  let inCode = false;
  let codeBuffer = [];

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  lines.forEach((line) => {
    if (line.startsWith("```")) {
      closeList();
      if (!inCode) {
        inCode = true;
        codeBuffer = [];
      } else {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        inCode = false;
      }
      return;
    }

    if (inCode) {
      codeBuffer.push(line);
      return;
    }

    if (!line.trim()) {
      closeList();
      return;
    }

    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${renderInlineMarkdown(escapeHtml(line.slice(2)))}</h1>`);
      return;
    }
    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${renderInlineMarkdown(escapeHtml(line.slice(3)))}</h2>`);
      return;
    }
    if (line.startsWith("### ")) {
      closeList();
      html.push(`<h3>${renderInlineMarkdown(escapeHtml(line.slice(4)))}</h3>`);
      return;
    }
    if (line.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${renderInlineMarkdown(escapeHtml(line.slice(2)))}</blockquote>`);
      return;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInlineMarkdown(escapeHtml(line.slice(2)))}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(escapeHtml(line))}</p>`);
  });

  closeList();
  return html.join("");
}

function closeKnowledgeDrawer() {
  const drawer = document.querySelector("#knowledge-drawer");
  if (!drawer) {
    return;
  }
  drawer.classList.remove("is-open");
  document.body.classList.remove("has-open-drawer");
}

async function openKnowledgeDrawer(fileName, title, meta) {
  const drawer = document.querySelector("#knowledge-drawer");
  if (!drawer) {
    return;
  }
  const titleNode = drawer.querySelector("[data-drawer-title]");
  const metaNode = drawer.querySelector("[data-drawer-meta]");
  const bodyNode = drawer.querySelector("[data-drawer-body]");

  titleNode.textContent = title;
  metaNode.textContent = meta;
  bodyNode.innerHTML = "<p class='muted'>正在加载 Markdown 预览…</p>";
  drawer.classList.add("is-open");
  document.body.classList.add("has-open-drawer");

  try {
    const response = await fetch(`/ui-assets/knowledge/${fileName}`);
    const markdown = await response.text();
    bodyNode.innerHTML = `<article class="markdown-render">${renderMarkdown(markdown)}</article>`;
  } catch (error) {
    bodyNode.innerHTML = `<p class="status-note">Markdown 预览加载失败，请稍后重试。</p>`;
  }
}

function initializeKnowledgeDrawer() {
  const drawer = document.querySelector("#knowledge-drawer");
  if (!drawer) {
    return;
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-knowledge-file]");
    if (!button) {
      return;
    }
    const fileName = button.dataset.knowledgeFile;
    const title = button.dataset.knowledgeTitle || knowledgeIndex[fileName]?.title || "知识预览";
    const meta = `${button.dataset.knowledgeType || knowledgeIndex[fileName]?.type || "Knowledge"} · ${
      button.dataset.knowledgeUpdated || knowledgeIndex[fileName]?.updatedAt || ""
    }`;
    await openKnowledgeDrawer(fileName, title, meta);
  });

  drawer.querySelectorAll("[data-close-drawer]").forEach((button) => {
    button.addEventListener("click", closeKnowledgeDrawer);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeKnowledgeDrawer();
    }
  });
}

function initializeCreatePage() {
  const roleField = document.querySelector("#creator-role");
  const sourceField = document.querySelector("#ticket-source");
  const helper = document.querySelector("[data-source-helper]");
  if (!roleField || !sourceField || !helper) {
    return;
  }

  const syncSource = () => {
    if (roleField.value === "CUSTOMER") {
      sourceField.value = "CUSTOMER";
      sourceField.disabled = true;
      helper.textContent = "客户创建工单时，来源固定为 CUSTOMER。";
    } else {
      sourceField.value = "INTERNAL";
      sourceField.disabled = true;
      helper.textContent = "内部人员手工创建工单时，来源默认使用 INTERNAL。API 来源不通过该页面配置。";
    }
  };

  roleField.addEventListener("change", syncSource);
  syncSource();
}

function showToast(message) {
  const toast = document.querySelector("#ui-toast");
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.classList.add("is-open");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-open"), 2200);
}

function initializeRecycleBin() {
  const previewButtons = document.querySelectorAll("[data-bin-preview]");
  if (!previewButtons.length) {
    return;
  }

  const panel = document.querySelector("#bin-preview");
  const titleNode = panel.querySelector("[data-bin-title]");
  const bodyNode = panel.querySelector("[data-bin-body]");

  previewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      titleNode.textContent = `工单 #${button.dataset.ticketId}`;
      bodyNode.innerHTML = `
        <div class="stack">
          <div><span class="meta-item-label">删除前摘要</span><div class="meta-item-value">${button.dataset.ticketTitle}</div></div>
          <div><span class="meta-item-label">删除时间</span><div class="meta-item-value">${button.dataset.deletedAt}</div></div>
          <div><span class="meta-item-label">删除人</span><div class="meta-item-value">${button.dataset.deletedBy}</div></div>
          <div><span class="meta-item-label">删除原因</span><div class="meta-item-value">${button.dataset.deletedReason}</div></div>
        </div>
      `;
    });
  });

  document.querySelectorAll("[data-restore-ticket]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast(`工单 #${button.dataset.restoreTicket} 已进入恢复确认流程`);
    });
  });
}

function getActorProfile() {
  const params = new URLSearchParams(window.location.search);
  const requestedRole = (params.get("role") || document.body.dataset.activeRole || "T2").toUpperCase();
  return actorProfiles[requestedRole] || actorProfiles.T2;
}

function getCurrentTicketId() {
  const match = window.location.pathname.match(/\/ui\/tickets\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function getTicketDetailContext(ticketId) {
  const row = ticketRows.find((item) => item.id === ticketId);
  if (!row) {
    return null;
  }
  const detail = ticketDetailIndex[ticketId] || {};
  return { ...row, ...detail };
}

function buildAction(actionKey) {
  return { key: actionKey, ...actionCatalog[actionKey] };
}

function getDetailActions(detail, actor) {
  if (!detail || !actor) {
    return [];
  }

  const actions = [];
  const isInternal = actor.internal;

  if (!isInternal) {
    if (detail.mainStatus === "CLOSED") {
      actions.push(buildAction("reopen"));
    }
    return actions;
  }

  if (detail.mainStatus === "WAITING_RESPONSE") {
    actions.push(buildAction("respond"));
    if (detail.pool) {
      actions.push(buildAction("claim"));
    }
    actions.push(buildAction("escalate"), buildAction("joinPool"), buildAction("edit"));
  }

  if (detail.mainStatus === "RESPONSE_TIMEOUT") {
    if (detail.respondedAt) {
      actions.push(buildAction("resolve"));
    } else {
      actions.push(buildAction("respond"));
    }
    if (detail.pool) {
      actions.push(buildAction("claim"));
    }
    actions.push(buildAction("escalate"), buildAction("joinPool"), buildAction("edit"));
  }

  if (detail.mainStatus === "IN_PROGRESS") {
    actions.push(buildAction("resolve"));
    if (detail.pool) {
      actions.push(buildAction("claim"));
    }
    actions.push(buildAction("escalate"), buildAction("joinPool"), buildAction("edit"));
  }

  if (detail.mainStatus === "RESOLUTION_TIMEOUT") {
    actions.push(buildAction("resolve"));
    if (detail.pool) {
      actions.push(buildAction("claim"));
    }
    actions.push(buildAction("escalate"), buildAction("joinPool"), buildAction("edit"));
  }

  if (detail.mainStatus === "RESOLVED") {
    actions.push(buildAction("close"));
  }

  if (detail.subStatus === "ESCALATION_PENDING_CONFIRM" && actor.userId === detail.escalationTargetUserId) {
    actions.unshift(buildAction("confirmEscalation"), buildAction("rejectEscalation"));
  }

  const seen = new Set();
  return actions.filter((action) => {
    if (seen.has(action.key)) {
      return false;
    }
    seen.add(action.key);
    return true;
  });
}

function getActionGateCopy(detail, actor) {
  if (!detail || !actor) {
    return "";
  }
  if (!actor.internal) {
    return detail.mainStatus === "CLOSED"
      ? "客户在 CLOSED 状态下可发起 Reopen；其他内部动作保持隐藏。"
      : "客户仅查看公开评论、状态进展和报告下载，不显示内部处理动作。";
  }
  if (detail.subStatus === "ESCALATION_PENDING_CONFIRM") {
    if (actor.userId === detail.escalationTargetUserId) {
      return `当前角色是目标确认人 ${detail.escalationTargetName}，可执行“确认升级 / 拒绝升级”，但该流程不替代工单主状态。`;
    }
    return `当前目标确认人是 ${detail.escalationTargetName}。内部用户仍可执行普通工单动作，但“确认升级 / 拒绝升级”仅对目标确认人显示。`;
  }
  if (detail.pool) {
    return "当前工单位于工单池中。责任归属仅用于展示与统计，不作为内部用户的操作门槛。";
  }
  return "当前工单已分配给指定人。责任归属仅用于展示与统计，不作为内部用户的操作门槛。";
}

function getResponsibilityCopy(detail, actor) {
  if (!detail || !actor) {
    return "";
  }
  if (!actor.internal) {
    return "客户仅查看公开评论、状态进展和报告下载；满足条件时可在 CLOSED 状态发起 Reopen。";
  }
  if (detail.pool) {
    return `当前工单处于 ${detail.pool}。内部用户可继续执行普通动作，领取工单仅用于明确责任归属。`;
  }
  if (detail.assignee) {
    return `当前工单已分配给 ${detail.assignee}。内部用户操作不受责任归属限制，责任信息主要用于协作提示与统计。`;
  }
  return "当前工单尚未指定责任归属。内部用户可直接按业务状态推进响应、处置和升级。";
}

function renderActions(container, actions, maxCount = actions.length) {
  if (!container) {
    return;
  }
  if (!actions.length) {
    container.innerHTML = `<span class="muted">当前状态下无额外可执行动作</span>`;
    return;
  }
  container.innerHTML = actions
    .slice(0, maxCount)
    .map((action, index) => {
      const tone = index === 0 && action.tone !== "danger" ? "primary" : action.tone;
      return `<button class="${getButtonClass(tone)}">${action.label}</button>`;
    })
    .join("");
}

function renderComments(container, comments) {
  if (!container) {
    return;
  }
  container.innerHTML = comments
    .map(
      (comment) => `
        <div class="comment-item">
          <div class="comment-head">
            <div><strong>${escapeHtml(comment.author)}</strong> <span class="comment-role">${escapeHtml(comment.role)}</span></div>
            <div class="muted">${escapeHtml(comment.time)}</div>
          </div>
          <p class="comment-copy">${escapeHtml(comment.body)}</p>
        </div>
      `
    )
    .join("");
}

function renderTimeline(container, items) {
  if (!container) {
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
        <div class="timeline-item">
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.body)}</p>
        </div>
      `
    )
    .join("");
}

function renderKnowledgeCards(container, knowledgeItems) {
  if (!container) {
    return;
  }
  container.innerHTML = knowledgeItems
    .map(
      (item) => `
        <div class="knowledge-card">
          <div class="knowledge-title">${escapeHtml(item.title)}</div>
          <div class="muted">${escapeHtml(item.type)} · 更新于 ${escapeHtml(item.updatedAt)}</div>
          <div class="muted">${escapeHtml(item.summary)}</div>
          <button
            class="knowledge-preview"
            data-knowledge-file="${escapeHtml(item.file)}"
            data-knowledge-title="${escapeHtml(item.title)}"
            data-knowledge-type="${escapeHtml(item.type)}"
            data-knowledge-updated="${escapeHtml(item.updatedAt)}"
          >
            预览 Markdown
          </button>
        </div>
      `
    )
    .join("");
}

function renderReportCards(container, reports) {
  if (!container) {
    return;
  }
  container.innerHTML = reports
    .map((item) => {
      const report = reportIndex[item.file];
      return `
        <div class="report-card">
          <div class="report-title">${escapeHtml(report.title)}</div>
          <div class="muted">${escapeHtml(report.type)}</div>
          <a class="download-link" href="/ui-assets/reports/${escapeHtml(item.file)}" download>${escapeHtml(report.label)}</a>
        </div>
      `;
    })
    .join("");
}

function renderExternalContext(container, contextItems) {
  if (!container) {
    return;
  }
  container.innerHTML = contextItems
    .map(
      (item) => `
        <div>
          <span class="meta-item-label">${escapeHtml(item.label)}</span>
          <div class="meta-item-value">${escapeHtml(item.value)}</div>
        </div>
      `
    )
    .join("");
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) {
    node.textContent = value;
  }
}

function setHtml(selector, value) {
  const node = document.querySelector(selector);
  if (node) {
    node.innerHTML = value;
  }
}

function initializeTicketDetail() {
  const detailView = document.querySelector("[data-ticket-detail-view]");
  if (!detailView) {
    return;
  }

  const actor = getActorProfile();
  const ticketId = getCurrentTicketId();
  const detail = getTicketDetailContext(ticketId);

  if (!detail) {
    detailView.innerHTML = `<section class="card empty-state">未找到该工单示例，请返回列表重新选择。</section>`;
    return;
  }

  setText("[data-page-ticket-id]", `工单详情 #${detail.id}`);
  setText("[data-page-subtitle]", "内部用户按业务状态执行普通动作；升级确认 / 拒绝仅对目标确认人开放。");
  setText("[data-active-role-label]", actor.label);
  setText("[data-hero-title]", detail.title);
  setText("[data-hero-copy]", detail.heroCopy);
  setHtml(
    "[data-hero-chips]",
    `${getStatusChip(detail.mainStatus)}${
      detail.subStatus === "NONE" ? "" : getStatusChip(detail.subStatus)
    }<span class="priority-chip">${detail.priority}</span><span class="risk-chip">风险分 ${detail.riskScore}</span>`
  );

  const actions = getDetailActions(detail, actor);
  renderActions(document.querySelector("[data-hero-actions]"), actions, 3);

  setText("[data-meta-category]", detail.category);
  setText("[data-meta-source]", detail.source);
  setText("[data-meta-assignee]", detail.assignee || "未指定");
  setText("[data-meta-pool]", detail.pool || "未在池中");
  setText("[data-meta-created-at]", formatDateTime(detail.createdAt));
  setText("[data-meta-updated-at]", formatDateTime(detail.updatedAt));

  setText("[data-hero-response-sla-value]", detail.responseSla.value);
  setText("[data-hero-response-sla-meta]", detail.responseSla.meta);
  setText("[data-hero-resolution-sla-value]", detail.resolutionSla.value);
  setText("[data-hero-resolution-sla-meta]", detail.resolutionSla.meta);

  const responseValue = document.querySelector("[data-hero-response-sla-value]");
  const resolutionValue = document.querySelector("[data-hero-resolution-sla-value]");
  if (responseValue) {
    responseValue.className = `hero-sla-value metric-value-${detail.responseSla.tone || "default"}`;
  }
  if (resolutionValue) {
    resolutionValue.className = `hero-sla-value metric-value-${detail.resolutionSla.tone || "default"}`;
  }

  renderComments(document.querySelector("[data-comment-list]"), detail.comments || []);
  renderTimeline(document.querySelector("[data-timeline-list]"), detail.timeline || []);
  renderKnowledgeCards(document.querySelector("[data-knowledge-list]"), detail.knowledge || []);
  renderReportCards(document.querySelector("[data-report-list]"), detail.reports || []);
  renderExternalContext(document.querySelector("[data-context-list]"), detail.externalContext || []);
}

window.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  initializeTicketList();
  initializeTicketDetail();
  initializeKnowledgeDrawer();
  initializeCreatePage();
  initializeRecycleBin();
});
