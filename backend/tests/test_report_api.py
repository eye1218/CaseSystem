from __future__ import annotations

from .conftest import issue_csrf, login


def switch_role(client, role_code: str) -> None:
    csrf = client.cookies.get("XSRF-TOKEN")
    response = client.post(
        "/auth/switch-role",
        json={"active_role_code": role_code},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text


def create_template(client, *, category_id: str = "endpoint") -> dict:
    csrf = issue_csrf(client)
    response = client.post(
        "/api/v1/report-templates",
        data={
            "name": "终端处置模板",
            "description": "用于终端安全工单的标准处置模板",
            "ticket_category_id": category_id,
            "status": "ACTIVE",
        },
        files={
            "file": (
                "endpoint-template.docx",
                b"template-v1",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def upload_report(
    client,
    *,
    ticket_id: int = 100177,
    source_template_id: str | None = None,
    title: str = "终端恶意软件处置报告",
    report_type: str = "结案报告",
    note: str = "包含 IOC 与处置结论",
    filename: str = "endpoint-report.pdf",
    content: bytes = b"report-v1",
) -> dict:
    csrf = issue_csrf(client)
    data = {
        "ticket_id": str(ticket_id),
        "title": title,
        "report_type": report_type,
        "note": note,
    }
    if source_template_id:
        data["source_template_id"] = source_template_id

    response = client.post(
        "/api/v1/reports",
        data=data,
        files={"file": (filename, content, "application/pdf")},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_admin_can_create_report_template_and_ticket_detail_exposes_it(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")

    template = create_template(client, category_id="endpoint")
    assert template["ticket_category_id"] == "endpoint"
    assert template["status"] == "ACTIVE"

    listing = client.get("/api/v1/report-templates", params={"ticket_category_id": "endpoint"})
    assert listing.status_code == 200, listing.text
    items = listing.json()["items"]
    assert any(item["id"] == template["id"] for item in items)

    detail = client.get("/api/v1/tickets/100177/detail")
    assert detail.status_code == 200
    payload = detail.json()
    assert any(item["id"] == template["id"] for item in payload["report_templates"])

    download = client.get(template["download_path"])
    assert download.status_code == 200
    assert "attachment;" in download.headers["content-disposition"].lower()


def test_non_admin_cannot_create_report_template(client):
    login(client, "analyst", "AnalystPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/report-templates",
        data={
            "name": "未授权模板",
            "ticket_category_id": "endpoint",
            "status": "ACTIVE",
        },
        files={"file": ("forbidden.docx", b"template", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 403


def test_internal_user_can_upload_update_replace_and_delete_report(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    template = create_template(client, category_id="endpoint")
    switch_role(client, "T2")

    created = upload_report(client, ticket_id=100177, source_template_id=template["id"])
    report_id = created["id"]
    assert created["ticket_id"] == 100177
    assert created["ticket_category_id"] == "endpoint"
    assert created["ticket_category_name"] == "终端安全"
    assert created["ticket_created_at"]
    assert created["source_template"]["id"] == template["id"]

    detail = client.get("/api/v1/tickets/100177/detail")
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert any(item["id"] == report_id for item in detail_payload["reports"])

    listing = client.get("/api/v1/reports")
    assert listing.status_code == 200
    listed = next(item for item in listing.json()["items"] if item["id"] == report_id)
    assert listed["ticket_category_id"] == "endpoint"
    assert listed["ticket_category_name"] == "终端安全"

    download = client.get(created["download_path"])
    assert download.status_code == 200
    assert download.content == b"report-v1"

    csrf = issue_csrf(client)
    updated = client.patch(
        f"/api/v1/reports/{report_id}",
        json={
            "title": "终端恶意软件结案报告",
            "report_type": "复盘报告",
            "note": "补充了根因与加固建议",
            "source_template_id": template["id"],
        },
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "终端恶意软件结案报告"

    replace_csrf = issue_csrf(client)
    replaced = client.post(
        f"/api/v1/reports/{report_id}/replace-file",
        files={"file": ("endpoint-report-v2.pdf", b"report-v2", "application/pdf")},
        headers={"X-CSRF-Token": replace_csrf, "Origin": "https://testserver"},
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["original_filename"] == "endpoint-report-v2.pdf"

    redownload = client.get(replaced.json()["download_path"])
    assert redownload.status_code == 200
    assert redownload.content == b"report-v2"

    delete_csrf = issue_csrf(client)
    deleted = client.delete(
        f"/api/v1/reports/{report_id}",
        headers={"X-CSRF-Token": delete_csrf, "Origin": "https://testserver"},
    )
    assert deleted.status_code == 204, deleted.text

    missing = client.get(f"/api/v1/reports/{report_id}")
    assert missing.status_code == 404


def test_customer_cannot_upload_report(client):
    login(client, "customer", "CustomerPass123")
    csrf = issue_csrf(client)

    response = client.post(
        "/api/v1/reports",
        data={
            "ticket_id": "100181",
            "title": "客户尝试上传报告",
            "report_type": "客户报告",
        },
        files={"file": ("customer.pdf", b"forbidden", "application/pdf")},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 403


def test_mismatched_template_category_is_rejected(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "ADMIN")
    template = create_template(client, category_id="intrusion")
    switch_role(client, "T2")

    csrf = issue_csrf(client)
    response = client.post(
        "/api/v1/reports",
        data={
            "ticket_id": "100181",
            "title": "钓鱼工单错误模板",
            "report_type": "结案报告",
            "source_template_id": template["id"],
        },
        files={"file": ("phishing.pdf", b"wrong-template", "application/pdf")},
        headers={"X-CSRF-Token": csrf, "Origin": "https://testserver"},
    )

    assert response.status_code == 422


def test_customer_can_download_report_on_owned_ticket_only(client):
    login(client, "admin", "AdminPass123")
    switch_role(client, "T2")
    owned_report = upload_report(client, ticket_id=100181, title="钓鱼事件客户报告", report_type="客户报告")
    hidden_report = upload_report(client, ticket_id=100177, title="内部终端报告", report_type="结案报告")

    login(client, "customer", "CustomerPass123")

    listing = client.get("/api/v1/reports")
    assert listing.status_code == 200
    visible_ids = {item["id"] for item in listing.json()["items"]}
    assert owned_report["id"] in visible_ids
    assert hidden_report["id"] not in visible_ids

    own_download = client.get(owned_report["download_path"])
    assert own_download.status_code == 200

    hidden_download = client.get(hidden_report["download_path"])
    assert hidden_download.status_code == 404
