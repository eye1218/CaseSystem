from __future__ import annotations

KNOWLEDGE_LIBRARY = {
    "intrusion": [
        {
            "id": "kb-001",
            "title": {"zh": "暴力破解事件处置手册 v2.3", "en": "Brute Force Incident Response Playbook v2.3"},
            "summary": {
                "zh": "适用于 SSH、RDP、VPN 与 Web 登录口暴力破解告警的标准化处置流程。",
                "en": "Standardized workflow for SSH, RDP, VPN, and web login brute-force alerts.",
            },
            "tags": ["入侵检测", "暴力破解", "P1/P2"],
            "author": "SOC T3 Expert Team",
            "updated_at": "2024-02-15",
            "version": "v2.3",
            "likes": 47,
            "content": {
                "zh": """# 暴力破解事件处置手册 v2.3

## 1. 快速判断

- 检查 5 分钟内失败次数是否超过阈值
- 确认是否存在成功登录
- 判断目标账号是否包含 `root`、`admin` 等高价值账号

## 2. 第一阶段响应

1. 查询来源 IP 的 24 小时认证记录
2. 检查 IP 信誉和历史投诉
3. 在工单评论中记录目标账号、时间窗口和初步结论

## 3. 处置动作

```bash
iptables -I INPUT -s <SOURCE_IP> -j DROP
iptables-save > /etc/iptables/rules.v4
```

## 4. 升级条件

- 出现成功登录
- 攻击涉及特权账号
- 发现横向移动迹象
""",
                "en": """# Brute Force Incident Response Playbook v2.3

## 1. Rapid Triage

- Validate failures within the alert window
- Confirm whether any login succeeded
- Check if privileged accounts were targeted

## 2. Initial Response

1. Query authentication history for the source IP
2. Review IP reputation and historical cases
3. Record the impacted accounts and initial judgement in the ticket

## 3. Containment

```bash
iptables -I INPUT -s <SOURCE_IP> -j DROP
iptables-save > /etc/iptables/rules.v4
```
""",
            },
        },
        {
            "id": "kb-002",
            "title": {"zh": "SSH 异常登录分析指南", "en": "SSH Anomaly Login Analysis Guide"},
            "summary": {
                "zh": "汇总 auth.log 关键模式、统计命令与成功入侵判断矩阵。",
                "en": "Covers auth.log patterns, quick commands, and compromise judgement matrix.",
            },
            "tags": ["SSH", "auth.log", "分析指南"],
            "author": "SOC T2 Team",
            "updated_at": "2024-01-20",
            "version": "v1.5",
            "likes": 32,
            "content": {
                "zh": """# SSH 异常登录分析指南

## 常见日志模式

```text
Failed password for <user> from <ip>
Accepted password for <user> from <ip>
Disconnected from authenticating user <user> <ip>
```

## 快速分析命令

```bash
grep "Failed password" /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn
grep "Accepted" /var/log/auth.log
```

## 判断矩阵

- 仅失败、无成功：封堵来源，按 P2/P3 处理
- 有成功登录：立即升 P1，转 T2/T3 深入分析
""",
                "en": """# SSH Anomaly Login Analysis Guide

## Key Patterns

```text
Failed password for <user> from <ip>
Accepted password for <user> from <ip>
```

## Quick Commands

```bash
grep "Failed password" /var/log/auth.log
grep "Accepted" /var/log/auth.log
```
""",
            },
        },
    ],
    "endpoint": [
        {
            "id": "kb-101",
            "title": {"zh": "终端恶意软件处置检查单", "en": "Endpoint Malware Containment Checklist"},
            "summary": {
                "zh": "适用于 EDR 连续上报可疑落地、持久化与进程注入行为的处置流程。",
                "en": "Response flow for EDR suspicious dropper, persistence, and injection behavior.",
            },
            "tags": ["终端安全", "EDR", "恶意软件"],
            "author": "SOC Endpoint Team",
            "updated_at": "2024-03-01",
            "version": "v1.8",
            "likes": 41,
            "content": {
                "zh": """# 终端恶意软件处置检查单

## 重点排查项

- 最近 24 小时新增启动项
- 可疑文件哈希与下载路径
- 外联域名、IP 与进程树
- 是否存在提权和横向移动迹象

## 现场处置

1. 先隔离终端再拉取快照
2. 导出 EDR 事件链路
3. 核实是否影响同网段同类资产
""",
                "en": """# Endpoint Malware Containment Checklist

## Focus Areas

- New autoruns within 24 hours
- Suspicious file hashes and download path
- Process tree and outbound indicators
- Privilege escalation and lateral movement evidence
""",
            },
        },
        {
            "id": "kb-102",
            "title": {"zh": "EDR 夜班值守响应手册", "en": "EDR Night Shift Triage Guide"},
            "summary": {
                "zh": "用于夜班值守场景下快速判断 EDR 告警是否需要提级或进入池子。",
                "en": "Quick guide for deciding whether an EDR alert should be escalated or pooled overnight.",
            },
            "tags": ["EDR", "夜班值守", "T2_POOL"],
            "author": "SOC Duty Lead",
            "updated_at": "2024-02-25",
            "version": "v1.2",
            "likes": 28,
            "content": {
                "zh": """# EDR 夜班值守响应手册

## 值守判断

- 高风险终端优先进入 T2_POOL
- 若告警涉及核心资产或域控，直接电话通知值班经理
- 若仅为单机可疑落地且已自动隔离，可先补充上下文再移交
""",
                "en": """# EDR Night Shift Triage Guide

## Duty Rules

- Prioritize high-risk endpoints into the T2 pool
- Notify the duty lead when crown-jewel assets are involved
- Preserve endpoint context before handing off
""",
            },
        },
    ],
    "phishing": [
        {
            "id": "kb-201",
            "title": {"zh": "邮件钓鱼闭环答复模板", "en": "Phishing Closure Response Template"},
            "summary": {
                "zh": "用于客户反馈阶段快速补充影响范围、处置动作和用户教育建议。",
                "en": "Template for customer-facing closure summary, impact scope, and awareness guidance.",
            },
            "tags": ["钓鱼邮件", "客户沟通"],
            "author": "SOC Customer Response",
            "updated_at": "2024-02-10",
            "version": "v1.4",
            "likes": 19,
            "content": {
                "zh": """# 邮件钓鱼闭环答复模板

## 建议结构

1. 事件经过
2. 影响范围
3. 已采取措施
4. 用户侧建议
5. 是否需要复盘报告
""",
                "en": """# Phishing Closure Response Template

1. Incident summary
2. Impact scope
3. Actions taken
4. Customer-side recommendations
""",
            },
        }
    ],
    "network": [
        {
            "id": "kb-301",
            "title": {"zh": "网络异常排查与复盘建议", "en": "Network Fault Triage and Review Guide"},
            "summary": {
                "zh": "适用于客户工单类网络故障、链路抖动和恢复后复盘场景。",
                "en": "Used for customer network incidents, link instability, and post-recovery review.",
            },
            "tags": ["网络攻击", "客户工单", "复盘"],
            "author": "SOC Network Team",
            "updated_at": "2024-01-30",
            "version": "v1.1",
            "likes": 13,
            "content": {
                "zh": """# 网络异常排查与复盘建议

- 确认变更窗口与故障时间是否重叠
- 核实上游链路和出口策略
- 对恢复后的流量曲线做 24 小时观察
""",
                "en": """# Network Fault Triage and Review Guide

- Compare the outage window against recent changes
- Validate upstream links and policy changes
- Observe recovered traffic for the next 24 hours
""",
            },
        }
    ],
}

REPORT_LIBRARY = {
    "intrusion": [
        {
            "id": "rpt-001",
            "report_no": "RPT-2024-0312",
            "title": {"zh": "入侵检测事件报告 — 暴力破解", "en": "Intrusion Detection Incident Report — Brute Force"},
            "type": {"zh": "事件报告", "en": "Incident Report"},
            "status": "draft",
            "analyst": "John Doe",
            "created_at": "2024-03-09 16:00",
            "likes": 18,
            "content": {
                "zh": "# 入侵检测事件报告\n\n- 攻击源：192.168.1.100\n- 失败登录：237 次\n- 处置结论：已封堵，未发现成功入侵\n",
                "en": "# Intrusion Detection Incident Report\n\n- Source: 192.168.1.100\n- Failed logins: 237\n- Conclusion: blocked, no successful compromise found\n",
            },
        },
        {
            "id": "rpt-002",
            "report_no": "RPT-2024-0289",
            "title": {"zh": "入侵检测周报 — 暴力破解趋势", "en": "Intrusion Detection Weekly Report — Brute Force Trend"},
            "type": {"zh": "趋势分析", "en": "Trend Analysis"},
            "status": "final",
            "analyst": "Jane Smith",
            "created_at": "2024-03-04 09:30",
            "likes": 34,
            "content": {
                "zh": "# 入侵检测周报\n\n本周暴力破解事件数量环比上升 18%，集中在 SSH 与 VPN 认证面。",
                "en": "# Weekly Intrusion Report\n\nBrute-force activity increased by 18% week over week, mostly on SSH and VPN.",
            },
        },
    ],
    "endpoint": [
        {
            "id": "rpt-101",
            "report_no": "RPT-2024-0308",
            "title": {"zh": "终端恶意软件处置报告", "en": "Endpoint Malware Response Report"},
            "type": {"zh": "事件报告", "en": "Incident Report"},
            "status": "final",
            "analyst": "Night Shift SOC",
            "created_at": "2024-03-09 08:10",
            "likes": 22,
            "content": {
                "zh": "# 终端恶意软件处置报告\n\n- 终端：finance-lt-022\n- 行为：可疑落地、计划任务持久化\n- 结论：已隔离并完成 IOC 扫描\n",
                "en": "# Endpoint Malware Response Report\n\n- Host: finance-lt-022\n- Behavior: suspicious dropper and scheduled task persistence\n- Conclusion: isolated and swept for IOCs\n",
            },
        }
    ],
    "phishing": [
        {
            "id": "rpt-201",
            "report_no": "RPT-2024-0222",
            "title": {"zh": "钓鱼邮件处置总结", "en": "Phishing Response Summary"},
            "type": {"zh": "客户报告", "en": "Customer Report"},
            "status": "final",
            "analyst": "Alice Admin",
            "created_at": "2024-03-08 19:20",
            "likes": 16,
            "content": {
                "zh": "# 钓鱼邮件处置总结\n\n已完成邮箱检索、链接封禁与终端查杀，建议客户更新用户教育素材。",
                "en": "# Phishing Response Summary\n\nMailbox search, link blocking, and endpoint inspection completed.",
            },
        }
    ],
    "network": [
        {
            "id": "rpt-301",
            "report_no": "RPT-2024-0205",
            "title": {"zh": "客户网络故障复盘摘要", "en": "Customer Network Incident Review"},
            "type": {"zh": "复盘报告", "en": "Review Report"},
            "status": "final",
            "analyst": "SOC Network Team",
            "created_at": "2024-03-05 12:30",
            "likes": 9,
            "content": {
                "zh": "# 客户网络故障复盘摘要\n\n故障由策略变更与链路抖动叠加触发，已恢复并增加变更审批校验。",
                "en": "# Customer Network Incident Review\n\nThe outage was caused by a policy change combined with link instability.",
            },
        }
    ],
}

ALERT_LIBRARY = {
    "SIEM": [
        {
            "seq": 1,
            "time": "14:30:02.114",
            "rule_id": "BF-002",
            "src_ip": "192.168.1.100",
            "src_port": 54321,
            "dst_host": "prod-ssh-gw-01",
            "dst_port": 22,
            "user": "root",
            "result": "FAIL",
        },
        {
            "seq": 2,
            "time": "14:30:02.227",
            "rule_id": "BF-002",
            "src_ip": "192.168.1.100",
            "src_port": 54322,
            "dst_host": "prod-ssh-gw-01",
            "dst_port": 22,
            "user": "admin",
            "result": "FAIL",
        },
        {
            "seq": 3,
            "time": "14:30:02.449",
            "rule_id": "BF-002",
            "src_ip": "192.168.1.100",
            "src_port": 54323,
            "dst_host": "prod-ssh-gw-01",
            "dst_port": 22,
            "user": "svc_deploy",
            "result": "FAIL",
        },
    ],
    "EDR": [
        {
            "seq": 1,
            "time": "02:11:14.904",
            "rule_id": "EDR-POWERDROP",
            "src_ip": "10.21.14.22",
            "src_port": 0,
            "dst_host": "finance-lt-022",
            "dst_port": 0,
            "user": "wang.li",
            "result": "SUSPICIOUS",
        },
        {
            "seq": 2,
            "time": "02:11:18.205",
            "rule_id": "EDR-TASK-PERSIST",
            "src_ip": "10.21.14.22",
            "src_port": 0,
            "dst_host": "finance-lt-022",
            "dst_port": 0,
            "user": "SYSTEM",
            "result": "SUSPICIOUS",
        },
    ],
}

CONTEXT_LIBRARY = {
    "intrusion": {
        "summary": {
            "zh": "来源 IP 在 23 分钟内触发 237 次认证失败，疑似使用字典爆破工具针对 SSH 网关发起持续攻击。",
            "en": "The source IP triggered 237 authentication failures in 23 minutes against the SSH gateway.",
        },
        "markdown": {
            "zh": """## SIEM 告警上下文

- 告警 ID：ALT-2024-0309-001847
- 规则：`BF-002 SSH_BRUTE_CRITICAL`
- 严重程度：`P1`
- 数据源：`auth.log @ prod-ssh-gw-01`

### 响应建议

1. 立即封堵来源 IP 与 /24 网段
2. 复查目标账号最近 24 小时认证记录
3. 检查是否存在横向移动与数据外泄迹象
""",
            "en": """## SIEM Alert Context

- Alert ID: `ALT-2024-0309-001847`
- Rule: `BF-002 SSH_BRUTE_CRITICAL`
- Severity: `P1`
- Source: `auth.log @ prod-ssh-gw-01`

### Recommendations

1. Block the source IP and /24 subnet
2. Review authentication history for targeted accounts
3. Check for lateral movement and data exposure
""",
        },
        "meta": {
            "source": "SIEM",
            "rule_name": "BF-002 SSH_BRUTE_CRITICAL",
            "severity": "P1",
            "asset": "prod-ssh-gw-01",
            "indicator": "192.168.1.100",
        },
    },
    "endpoint": {
        "summary": {
            "zh": "夜班期间终端连续出现可疑落地与计划任务持久化事件，当前已进入 T2 池等待接手。",
            "en": "The endpoint triggered suspicious dropper and scheduled task persistence during the night shift.",
        },
        "markdown": {
            "zh": """## EDR 研判摘要

- 终端：`finance-lt-022`
- 用户：`wang.li`
- 规则：`EDR-POWERDROP`
- 当前状态：已自动隔离，等待人工复核
""",
            "en": """## EDR Context Summary

- Host: `finance-lt-022`
- User: `wang.li`
- Rule: `EDR-POWERDROP`
- Current status: auto-isolated, waiting for analyst review
""",
        },
        "meta": {
            "source": "EDR",
            "rule_name": "EDR-POWERDROP",
            "severity": "P2",
            "asset": "finance-lt-022",
            "indicator": "sha256:d3e3...91f2",
        },
    },
    "phishing": {
        "summary": {
            "zh": "客户请求补充报告结论和用户教育建议，当前已经完成处置，仅保留闭环答复阶段。",
            "en": "Customer requested a refined closure summary and awareness guidance.",
        },
        "markdown": {"zh": "", "en": ""},
        "meta": {
            "source": "Customer",
            "rule_name": "Manual Follow-up",
            "severity": "P2",
            "asset": "Customer Mailbox",
            "indicator": "mail-thread:2024-03-08-77",
        },
    },
    "network": {
        "summary": {
            "zh": "客户侧访问故障已恢复，当前主要保留复盘摘要和恢复观察建议。",
            "en": "The customer network incident has recovered and remains available for post-incident review.",
        },
        "markdown": {"zh": "", "en": ""},
        "meta": {
            "source": "Customer",
            "rule_name": "Customer Recovery Follow-up",
            "severity": "P3",
            "asset": "Customer WAN",
            "indicator": "ticket-network-review",
        },
    },
}
