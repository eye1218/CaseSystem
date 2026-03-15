from __future__ import annotations


def test_login_route_serves_spa_index(client):
    response = client.get("/login")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<!doctype html>" in response.text.lower()
