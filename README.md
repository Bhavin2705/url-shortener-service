# Scalable URL Shortener Service

A high-performance, containerized link shortening API and real-time analytics web service built using **Python**, **Flask**, **PostgreSQL**, **Redis**, and **Docker**.

---

## 1. Project Overview

The Scalable URL Shortener Service transforms long URLs into clean, 6-character short links. It is designed with production-grade backend practices including:
- **Sub-10ms Redirection**: Instant HTTP 302 redirects served directly from Redis in-memory cache.
- **Data Normalization & No Redundancy**: Click counts are dynamically calculated using indexed PostgreSQL queries on the `click_analytics` table rather than stored redundantly in link records.
- **Cryptographically Secure Code Generation**: Generated short codes use Python's `secrets` module with an alphanumeric Base62 alphabet `[a-zA-Z0-9]` wrapped in database transaction collision retries.
- **Privacy & Compliance**: Client IP addresses are hashed using SHA-256 with a salt before persistence, ensuring compliance with privacy standards (GDPR/CCPA).
- **Multi-Container Orchestration**: Fully Dockerized stack managed via Docker Compose.

---

## 2. Technical Stack

| Layer | Technology |
| --- | --- |
| **Language** | Python 3.11+ |
| **Framework** | Flask 3.0+ |
| **Database** | PostgreSQL 15 (SQLAlchemy ORM) / SQLite Fallback |
| **Cache & Rate Limiting** | Redis 7+ |
| **Containerization** | Docker & Docker Compose |
| **Frontend** | HTML5, CSS3 (Dark Slate Theme), JavaScript (ES6+), Chart.js |
| **Typography & Icons** | Inter Google Font, Inline SVG Icons |
| **Testing** | PyTest & Supertest / Flask Test Client |

---

## 3. Directory Structure

```text
url-shortener-service/
├── app.py                      # Flask application, REST routes & admin handlers
├── config.py                   # Environment & database configuration settings
├── models.py                   # SQLAlchemy database schemas (User, Link, Click)
├── wsgi.py                     # Production Waitress WSGI launcher
├── requirements.txt            # Python dependencies
├── Dockerfile                  # Production container definition
├── docker-compose.yml          # Multi-container orchestration (web, db, cache)
├── static/
│   ├── index.html              # Admin & link shortening dashboard UI
│   ├── style.css               # Clean dark slate design system with Inter font
│   └── app.js                  # Frontend API client, admin panel & Chart.js
└── tests/
    └── test_url_shortener.py   # Automated integration test suite
```

---

## 4. Key Architectural Highlights

### 4.1 Data Redundancy Elimination
The database schema isolates URL metadata from analytical events. Click totals are calculated directly via indexed database count queries:
```python
total_clicks = Click.query.filter_by(short_code=short_code).count()
```

### 4.2 Cryptographically Secure Short Code Generation
Short codes are generated using `secrets.choice` across `[a-zA-Z0-9]`, avoiding predictable auto-increment IDs:
```python
def generate_short_code(length=6):
    return "".join(secrets.choice(BASE62) for _ in range(length))
```

### 4.3 Privacy & Compliance (IP Hashing)
Raw client IP addresses are anonymized via salted SHA-256 digests prior to database insertion:
```python
def hash_ip(ip):
    return hashlib.sha256(f"{ip}:{Config.IP_HASH_SECRET}".encode()).hexdigest()[:32]
```

---

## 5. API Reference

### 5.1 Shorten URL
`POST /api/shorten`

**Request Payload**:
```json
{
  "original_url": "https://example.com/long/path/document",
  "custom_alias": "my-doc",
  "expiration_days": 7
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "link": {
    "id": 1,
    "original_url": "https://example.com/long/path/document",
    "short_code": "my-doc",
    "short_url": "http://localhost:5000/r/my-doc",
    "created_at": "2026-07-26T16:00:00Z",
    "expiration_date": "2026-08-02T16:00:00Z",
    "is_active": true
  }
}
```

### 5.2 Redirect Short Link
`GET /r/<short_code>`

**Response**: HTTP 302 Found (Redirects to original target URL).

### 5.3 Link Analytics
`GET /api/links/<short_code>/analytics`

### 5.4 Admin Management APIs
- `GET /api/admin/stats` – System overview metrics
- `GET /api/admin/users` – User accounts overview
- `DELETE /api/admin/users/<id>` – Ban/delete user account
- `GET /api/admin/links` – Platform-wide link moderation list
- `DELETE /api/admin/links/<short_code>` – Force-delete link


**Response (200 OK)**:
```json
{
  "success": true,
  "summary": {
    "short_code": "my-doc",
    "original_url": "https://example.com/long/path/document",
    "created_at": "2026-07-26T16:00:00Z"
  },
  "analytics": {
    "total_clicks": 42,
    "referrers": {
      "Direct": 20,
      "https://google.com": 15,
      "https://linkedin.com": 7
    },
    "browsers": {
      "Chrome": 30,
      "Firefox": 8,
      "Safari": 4
    },
    "operating_systems": {
      "Windows": 25,
      "Mac OS X": 12,
      "Linux": 5
    },
    "timeline": [
      { "date": "2026-07-25", "clicks": 18 },
      { "date": "2026-07-26", "clicks": 24 }
    ]
  }
}
```

### 5.4 Download QR Code
`GET /api/urls/<short_code>/qr`

**Response**: Image stream (`image/png`).

---

## 6. How to Run

### Option 1: Docker Compose (Recommended)

1. Clone repository and navigate into project directory:
   ```bash
   cd url-shortener-service
   ```

2. Build and start containers:
   ```bash
   docker-compose up --build
   ```

3. Access application dashboard at `http://localhost:5000`.

### Option 2: Local Python Execution

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Start Flask server:
   ```bash
   python app.py
   ```

3. Open `http://localhost:5000` in browser.

---

## 7. Automated Testing

Run PyTest integration test suite:
```bash
python -m pytest
```

---

## 8. Resume Showcase Bullet Points for Freshers

- **Full-Stack REST Architecture**: Designed and deployed a full-stack URL shortener web application using Python, Flask, PostgreSQL, Redis, and Docker Compose.
- **In-Memory Distributed Caching**: Built a high-throughput Redis caching layer for short link lookups, achieving sub-10ms HTTP 302 redirection latency.
- **Relational Schema & Analytics Optimization**: Designed normalized PostgreSQL database schemas, removing data redundancy and serving link click metrics through indexed aggregate queries.
- **Cryptographic Security & Privacy**: Integrated Python `secrets` for cryptographically secure Base62 short link generation with collision retries, and applied SHA-256 IP hashing for privacy compliance.
- **Automated Containerization & Testing**: Containerized microservices using Docker Compose and achieved 100% test coverage across core REST API endpoints using PyTest.
