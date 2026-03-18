# CaseSystem API - 新建工单接口文档

该文档说明了如何使用 API Token 通过 REST API 在 CaseSystem 中创建工单。

## 1. 接口信息

- **接口地址**: `POST /api/v1/tickets`
- **认证方式**: `Authorization: Bearer <YOUR_API_TOKEN>`
- **内容类型**: `application/json`

## 2. 请求参数详解

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| **`title`** | `string` | **是** | 工单标题。长度限制：1-255 个字符。 |
| **`description`** | `string` | **是** | 工单详情描述。长度限制：1-8000 个字符。 |
| **`category_id`** | `string` | **是** | 分类 ID。可选：`intrusion`, `network`, `data`, `endpoint`, `phishing`。 |
| **`priority`** | `string` | **是** | 优先级。可选值：`P1` (紧急), `P2` (高), `P3` (中), `P4` (低)。 |
| **`risk_score`** | `integer` | **是** | 风险分值。取值范围：0 - 100。 |
| **`assignment_mode`**| `string` | 否 | 分配模式。可选：`unassigned` (默认，待领取), `pool` (自动分配至池)。 |
| **`pool_code`** | `string` | 否 | 当模式为 `pool` 时必填。例如：`T1_POOL`, `T2_POOL`, `T3_POOL`。 |
| **`alarm_ids`** | `list[str]` | 否 | 关联的原始告警 ID 列表。最多支持 500 个。 |
| **`context_markdown`**| `string` | 否 | 支持 Markdown 格式的详细上下文补充信息。 |

## 3. 请求示例 (cURL)

```bash
curl -X POST http://10.20.100.42:8010/api/v1/tickets \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API 自动化测试：异常数据访问",
    "description": "检测到 IP 10.0.4.15 触发了数据泄露防护规则。",
    "category_id": "data",
    "priority": "P2",
    "risk_score": 85,
    "assignment_mode": "pool",
    "pool_code": "T2_POOL",
    "alarm_ids": ["ALARM-001"],
    "context_markdown": "### 影响资产\n- web-prod-01\n\n> 建议立即封禁源 IP。"
  }'
```

## 4. 注意事项

1. **安全校验**: 使用 API Token 请求时，系统会自动绕过 CSRF 校验，无需提供 `X-CSRF-TOKEN`。
2. **频率限制**: 请避免极高频调用。
3. **响应状态**: 成功返回 `200 OK` 及创建后的工单详情 JSON。
