from __future__ import annotations


def test_login_route_serves_spa_index(client):
    response = client.get("/login")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<!doctype html>" in response.text.lower()


def test_unknown_spa_route_serves_spa_index(client):
    response = client.get("/some/future/frontend/page")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<!doctype html>" in response.text.lower()


def test_unknown_api_route_does_not_fall_back_to_spa(client):
    response = client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert "application/json" in response.headers["content-type"]
    assert response.json() == {"detail": "Not Found"}
