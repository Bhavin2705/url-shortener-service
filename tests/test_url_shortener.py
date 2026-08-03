import pytest
from app import create_app, hash_ip
from models import db, User, Link, Click

from sqlalchemy.pool import StaticPool

@pytest.fixture
def client():
    app = create_app({
        "TESTING": True,
        "ADMIN_USERNAME": "adminuser",
        "SQLALCHEMY_DATABASE_URI": "sqlite://",
        "RATELIMIT_ENABLED": False,
        "SQLALCHEMY_ENGINE_OPTIONS": {
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool
        }
    })

    with app.test_client() as client:
        with app.app_context():
            db.create_all()
            yield client
            db.drop_all()

def test_shorten_url_success(client):
    response = client.post("/api/shorten", json={
        "original_url": "https://example.com/test-url"
    })
    assert response.status_code == 201
    data = response.get_json()
    assert data["success"] is True
    assert "short_code" in data["link"]
    assert len(data["link"]["short_code"]) == 6
    assert data["link"]["original_url"] == "https://example.com/test-url"

def test_custom_alias(client):
    response = client.post("/api/shorten", json={
        "original_url": "https://example.com/custom",
        "custom_alias": "my-alias"
    })
    assert response.status_code == 201
    data = response.get_json()
    assert data["link"]["short_code"] == "my-alias"

    dup_response = client.post("/api/shorten", json={
        "original_url": "https://example.com/another",
        "custom_alias": "my-alias"
    })
    assert dup_response.status_code == 409

def test_invalid_url_format(client):
    response = client.post("/api/shorten", json={
        "original_url": "not-a-valid-url"
    })
    assert response.status_code == 400

def test_redirection_and_analytics(client):
    short_res = client.post("/api/shorten", json={
        "original_url": "https://example.com/target",
        "custom_alias": "target-link"
    })
    assert short_res.status_code == 201

    redirect_res = client.get("/r/target-link", environ_base={"REMOTE_ADDR": "192.168.1.50"})
    assert redirect_res.status_code == 302
    assert redirect_res.location == "https://example.com/target"

    click_record = Click.query.filter_by(short_code="target-link").first()
    assert click_record is not None
    assert click_record.user_ip != "192.168.1.50"
    assert click_record.user_ip == hash_ip("192.168.1.50")

    # Anonymous links should not expose analytics (IDOR fix)
    analytics_res = client.get("/api/links/target-link/analytics")
    assert analytics_res.status_code == 403

def test_user_auth_and_rbac(client):
    reg_res = client.post("/api/register", json={
        "username": "testuser",
        "password": "secretpassword123"
    })
    assert reg_res.status_code == 201

    short_res = client.post("/api/shorten", json={
        "original_url": "https://example.com/private",
        "custom_alias": "private-link"
    })
    assert short_res.status_code == 201

    analytics_res = client.get("/api/links/private-link/analytics")
    assert analytics_res.status_code == 200

    client.post("/api/logout")

    guest_analytics_res = client.get("/api/links/private-link/analytics")
    assert guest_analytics_res.status_code == 403

    del_res = client.delete("/api/links/private-link")
    assert del_res.status_code == 403

def test_reserved_alias_rejection(client):
    res = client.post("/api/shorten", json={
        "original_url": "https://example.com/reserved",
        "custom_alias": "admin"
    })
    assert res.status_code == 400

def test_case_normalization(client):
    res = client.post("/api/shorten", json={
        "original_url": "https://example.com/case",
        "custom_alias": "MyAlias"
    })
    assert res.status_code == 201
    assert res.get_json()["link"]["short_code"] == "myalias"

    red = client.get("/r/MYALIAS")
    assert red.status_code == 302

def test_alias_recycling(client):
    client.post("/api/register", json={
        "username": "aliasuser",
        "password": "password123"
    })
    res1 = client.post("/api/shorten", json={
        "original_url": "https://example.com/link1",
        "custom_alias": "reusable"
    })
    assert res1.status_code == 201

    del_res = client.delete("/api/links/reusable")
    assert del_res.status_code == 200

    res2 = client.post("/api/shorten", json={
        "original_url": "https://example.com/link2",
        "custom_alias": "reusable"
    })
def test_admin_dashboard_and_permissions(client):
    admin_reg = client.post("/api/register", json={
        "username": "adminuser",
        "password": "password123"
    })
    assert admin_reg.status_code == 201
    assert admin_reg.get_json()["user"]["is_admin"] is True

    stats_res = client.get("/api/admin/stats")
    assert stats_res.status_code == 200
    assert stats_res.get_json()["stats"]["total_users"] == 1

    client.post("/api/logout")

    user_reg = client.post("/api/register", json={
        "username": "normaluser",
        "password": "password123"
    })
    assert user_reg.status_code == 201
    assert user_reg.get_json()["user"]["is_admin"] is False

    unauth_stats = client.get("/api/admin/stats")
    assert unauth_stats.status_code == 403


