import pytest
from app import create_app
from models import db, UrlMapping, ClickAnalytics
from services import hash_ip_address

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"

    with app.test_client() as client:
        with app.app_context():
            db.create_all()
            yield client
            db.drop_all()


def test_shorten_url_success(client):
    response = client.post("/api/urls/shorten", json={
        "original_url": "https://example.com/test-url"
    })
    assert response.status_code == 201
    data = response.get_json()
    assert data["success"] is True
    assert "short_code" in data["data"]
    assert len(data["data"]["short_code"]) == 6
    assert data["data"]["original_url"] == "https://example.com/test-url"


def test_custom_alias(client):
    response = client.post("/api/urls/shorten", json={
        "original_url": "https://example.com/custom",
        "custom_alias": "my-alias"
    })
    assert response.status_code == 201
    data = response.get_json()
    assert data["data"]["short_code"] == "my-alias"

    # Test duplicate alias collision
    dup_response = client.post("/api/urls/shorten", json={
        "original_url": "https://example.com/another",
        "custom_alias": "my-alias"
    })
    assert dup_response.status_code == 409


def test_invalid_url_format(client):
    response = client.post("/api/urls/shorten", json={
        "original_url": "not-a-valid-url"
    })
    assert response.status_code == 400


def test_redirection_ip_hashing_and_analytics_count(client):
    # Create short link
    short_res = client.post("/api/urls/shorten", json={
        "original_url": "https://example.com/target",
        "custom_alias": "target-link"
    })
    assert short_res.status_code == 201

    # Test HTTP 302 Redirection
    redirect_res = client.get("/r/target-link", environ_base={"REMOTE_ADDR": "192.168.1.50"})
    assert redirect_res.status_code == 302
    assert redirect_res.location == "https://example.com/target"

    # Verify IP was anonymized/hashed in database
    analytics_record = ClickAnalytics.query.filter_by(short_code="target-link").first()
    assert analytics_record is not None
    assert analytics_record.user_ip != "192.168.1.50"
    assert analytics_record.user_ip == hash_ip_address("192.168.1.50")

    # Test Analytics JSON endpoint returns accurate count directly from ClickAnalytics
    analytics_res = client.get("/api/urls/target-link/analytics")
    assert analytics_res.status_code == 200
    analytics_data = analytics_res.get_json()
    assert analytics_data["success"] is True
    assert analytics_data["analytics"]["total_clicks"] == 1
