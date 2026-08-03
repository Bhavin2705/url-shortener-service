import os
import re
import secrets
import string
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from flask import Flask, request, jsonify, redirect, session, send_from_directory, abort
from sqlalchemy.exc import IntegrityError
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import redis

from config import Config
from models import db, User, Link, Click

BASE62 = string.digits + string.ascii_lowercase + string.ascii_uppercase
RESERVED_ALIASES = {"admin", "api", "app", "login", "logout", "register", "me", "shorten", "static", "analytics", "health", "status", "dashboard", "r"}
logger = logging.getLogger(__name__)


def generate_short_code(length=6):
    return "".join(secrets.choice(BASE62) for _ in range(length))


def hash_ip(ip):
    if not ip or ip in ["127.0.0.1", "localhost", "::1"]:
        return "Anonymized-Local"
    return hashlib.sha256(f"{ip}:{Config.IP_HASH_SECRET}".encode()).hexdigest()[:32]


def is_valid_url(url):
    if not url:
        return False
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ["http", "https"]:
            return False
        if not parsed.netloc:
            return False
        if "@" in parsed.netloc:
            return False
        return True
    except Exception:
        return False


def is_valid_custom_alias(alias):
    alias = alias.lower()
    if alias in RESERVED_ALIASES:
        return False
    return bool(re.match(r'^[a-zA-Z0-9_-]{3,16}$', alias))


def create_app(test_config=None):
    app = Flask(__name__, static_folder="static", static_url_path="")
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)
    db.init_app(app)

    # --- Rate limiter with Redis backend and in-memory fallback ---
    redis_ssl = Config.REDIS_HOST.endswith(".upstash.io") or os.environ.get("REDIS_SSL", "false").lower() in ["true", "1"]
    redis_pwd = Config.REDIS_PASSWORD or None

    proto = "rediss" if redis_ssl else "redis"
    pwd_part = f":{redis_pwd}@" if redis_pwd else ""
    storage_uri = f"{proto}://{pwd_part}{Config.REDIS_HOST}:{Config.REDIS_PORT}/{Config.REDIS_DB}"

    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=[Config.RATE_LIMIT_DEFAULT],
        storage_uri=storage_uri,
        in_memory_fallback_enabled=True,
    )

    # --- Redis connection pool (created once at startup) ---
    redis_pool = None
    try:
        redis_pool = redis.ConnectionPool(
            host=Config.REDIS_HOST,
            port=Config.REDIS_PORT,
            db=Config.REDIS_DB,
            password=redis_pwd,
            ssl=redis_ssl,
            ssl_cert_reqs=None,
            socket_timeout=2,
            max_connections=20,
        )
        test_conn = redis.Redis(connection_pool=redis_pool)
        test_conn.ping()
        logger.info("Redis connection pool established")
    except Exception as e:
        logger.warning("Redis unavailable at startup, caching disabled: %s", e)
        redis_pool = None


    def get_redis():
        """Return a Redis client from the pool, or None if unavailable."""
        if redis_pool is None:
            return None
        try:
            return redis.Redis(connection_pool=redis_pool)
        except Exception as e:
            logger.warning("Redis connection error: %s", e)
            return None

    def cache_set(key, val, ttl=3600):
        c = get_redis()
        if c:
            try: c.setex(key, ttl, val)
            except Exception: pass

    def cache_del(key):
        c = get_redis()
        if c:
            try: c.delete(key)
            except Exception: pass

    @app.before_request
    def validate_host():
        if "*" in Config.ALLOWED_HOSTS:
            return
        h = request.host.split(":")[0]
        if h.endswith(".vercel.app") or h.endswith(".onrender.com"):
            return
        if request.host not in Config.ALLOWED_HOSTS and h not in Config.ALLOWED_HOSTS:
            abort(400, description="Invalid Host header")


    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response

    def check_admin():
        uid = session.get("user_id")
        if not uid:
            return None
        u = db.session.get(User, uid)
        return u if (u and u.is_admin) else None

    @app.route("/")
    def serve_frontend():
        return send_from_directory(app.static_folder, "index.html")

    @app.route("/api/register", methods=["POST"])
    @limiter.limit("10 per minute")
    def register():
        data = request.get_json() or {}
        username = data.get("username", "").strip()
        password = data.get("password", "").strip()
        if not username or not password:
            return jsonify({"success": False, "error": "Username and password required"}), 400
        if len(password) < 8:
            return jsonify({"success": False, "error": "Password must be at least 8 characters"}), 400
        if not re.match(r'^[a-zA-Z0-9_]{3,50}$', username):
            return jsonify({"success": False, "error": "Username must be 3-50 alphanumeric characters or underscores"}), 400
        if User.query.filter_by(username=username).first():
            return jsonify({"success": False, "error": "Username already exists"}), 409
        user = User(username=username)
        user.set_password(password)
        if User.query.count() == 0:
            user.is_admin = True
        db.session.add(user)
        db.session.commit()
        session["user_id"] = user.id
        return jsonify({"success": True, "user": user.to_dict()}), 201

    @app.route("/api/login", methods=["POST"])
    @limiter.limit(Config.RATE_LIMIT_LOGIN)
    def login():
        data = request.get_json() or {}
        username = data.get("username", "").strip()
        password = data.get("password", "").strip()
        user = User.query.filter_by(username=username).first()
        if not user or not user.check_password(password):
            return jsonify({"success": False, "error": "Invalid credentials"}), 401
        session["user_id"] = user.id
        return jsonify({"success": True, "user": user.to_dict()}), 200

    @app.route("/api/logout", methods=["POST"])
    def logout():
        session.pop("user_id", None)
        return jsonify({"success": True}), 200

    @app.route("/api/admin/stats", methods=["GET"])
    def admin_stats():
        admin = check_admin()
        if not admin:
            return jsonify({"success": False, "error": "Admin required"}), 403
        return jsonify({
            "success": True,
            "stats": {
                "total_users": User.query.count(),
                "total_links": Link.query.count(),
                "active_links": Link.query.filter_by(is_active=True).count(),
                "total_clicks": Click.query.count()
            }
        }), 200

    @app.route("/api/admin/users", methods=["GET"])
    def admin_users():
        admin = check_admin()
        if not admin:
            return jsonify({"success": False, "error": "Admin required"}), 403
        users_data = []
        for u in User.query.all():
            d = u.to_dict()
            d["link_count"] = Link.query.filter_by(user_id=u.id, is_active=True).count()
            users_data.append(d)
        return jsonify({"success": True, "users": users_data}), 200

    @app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
    def admin_delete_user(user_id):
        admin = check_admin()
        if not admin:
            return jsonify({"success": False, "error": "Admin required"}), 403
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"success": False, "error": "User not found"}), 404
        if user.id == admin.id:
            return jsonify({"success": False, "error": "Cannot delete self"}), 400
        db.session.delete(user)
        db.session.commit()
        return jsonify({"success": True}), 200

    @app.route("/api/admin/links", methods=["GET"])
    def admin_links():
        admin = check_admin()
        if not admin:
            return jsonify({"success": False, "error": "Admin required"}), 403
        host_url = request.host_url.rstrip("/")
        links = [l.to_dict(base_url=host_url) for l in Link.query.all()]
        return jsonify({"success": True, "links": links}), 200

    @app.route("/api/admin/links/<short_code>", methods=["DELETE"])
    def admin_delete_link(short_code):
        admin = check_admin()
        if not admin:
            return jsonify({"success": False, "error": "Admin required"}), 403
        short_code = short_code.lower()
        link = Link.query.filter_by(short_code=short_code).first()
        if not link:
            return jsonify({"success": False, "error": "Link not found"}), 404
        link.is_active = False
        link.short_code = f"_adm_{link.id}"[:16]
        db.session.commit()
        cache_del(f"url:{short_code}")
        return jsonify({"success": True}), 200

    @app.route("/api/me", methods=["GET"])
    def get_me():
        user_id = session.get("user_id")
        if not user_id:
            return jsonify({"success": True, "user": None, "links": []}), 200
        user = db.session.get(User, user_id)
        if not user:
            session.pop("user_id", None)
            return jsonify({"success": True, "user": None, "links": []}), 200
        host_url = request.host_url.rstrip("/")
        user_links = [link.to_dict(base_url=host_url) for link in Link.query.filter_by(user_id=user_id, is_active=True).all()]
        return jsonify({"success": True, "user": user.to_dict(), "links": user_links}), 200

    @app.route("/api/shorten", methods=["POST"])
    @limiter.limit(Config.RATE_LIMIT_SHORTEN)
    def shorten():
        data = request.get_json() or {}
        original_url = data.get("original_url", "").strip()
        custom_alias = data.get("custom_alias", "").strip().lower()
        expiration_days = data.get("expiration_days")

        if not original_url:
            return jsonify({"success": False, "error": "original_url is required"}), 400
        if not is_valid_url(original_url):
            return jsonify({"success": False, "error": "Invalid URL format. Ensure it starts with http:// or https://"}), 400

        if custom_alias:
            if not is_valid_custom_alias(custom_alias):
                return jsonify({"success": False, "error": "Alias must be 3-16 characters: letters, numbers, hyphens, or underscores only and not reserved"}), 400
            existing = Link.query.filter_by(short_code=custom_alias).first()
            if existing:
                now = datetime.now(timezone.utc)
                exp = existing.expiration_date
                if exp and exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
                if existing.is_active and not (exp and exp < now):
                    return jsonify({"success": False, "error": "Custom alias already taken"}), 409
                existing.short_code = f"_old_{existing.id}"[:16]
                existing.is_active = False
                db.session.commit()

        expiration_date = None
        if expiration_days and str(expiration_days).isdigit():
            days = int(expiration_days)
            if days > 0:
                expiration_date = datetime.now(timezone.utc) + timedelta(days=days)

        short_code = custom_alias if custom_alias else None
        user_id = session.get("user_id")
        created_link = None

        for _ in range(5):
            try:
                code = short_code if short_code else generate_short_code()
                new_link = Link(original_url=original_url, short_code=code, user_id=user_id, expiration_date=expiration_date)
                db.session.add(new_link)
                db.session.commit()
                created_link = new_link
                break
            except IntegrityError:
                db.session.rollback()
                if custom_alias:
                    return jsonify({"success": False, "error": "Custom alias already taken"}), 409
                short_code = None
        else:
            return jsonify({"success": False, "error": "Failed to generate short code"}), 500

        cache_set(f"url:{created_link.short_code}", original_url)
        host_url = request.host_url.rstrip("/")
        return jsonify({"success": True, "link": created_link.to_dict(base_url=host_url)}), 201

    @app.route("/r/<short_code>", methods=["GET"])
    def do_redirect(short_code):
        short_code = short_code.lower()
        raw_ip = request.remote_addr or "127.0.0.1"
        hashed_ip = hash_ip(raw_ip)
        referrer = (request.referrer or "Direct")[:255]
        user_agent = re.sub(r'[<>"\'&]', '', request.headers.get("User-Agent", "Unknown"))[:255]

        link = Link.query.filter_by(short_code=short_code, is_active=True).first()
        if not link:
            return jsonify({"success": False, "error": "Short link not found"}), 404

        now = datetime.now(timezone.utc)
        exp_date = link.expiration_date
        if exp_date and exp_date.tzinfo is None:
            exp_date = exp_date.replace(tzinfo=timezone.utc)

        if exp_date and exp_date < now:
            link.is_active = False
            db.session.commit()
            cache_del(f"url:{short_code}")
            return jsonify({"success": False, "error": "Link expired"}), 410

        target_url = link.original_url
        cache_set(f"url:{short_code}", target_url)

        click = Click(short_code=short_code, referrer=referrer, user_ip=hashed_ip, user_agent=user_agent)
        db.session.add(click)
        db.session.commit()

        return redirect(target_url, code=302)


    @app.route("/api/links/<short_code>/analytics", methods=["GET"])
    def get_analytics(short_code):
        short_code = short_code.lower()
        link = Link.query.filter_by(short_code=short_code).first()
        if not link:
            return jsonify({"success": False, "error": "Short link not found"}), 404

        user_id = session.get("user_id")
        if link.user_id is None:
            return jsonify({"success": False, "error": "Analytics unavailable for anonymous links"}), 403
        if link.user_id != user_id:
            return jsonify({"success": False, "error": "Unauthorized access to analytics"}), 403

        total_clicks = Click.query.filter_by(short_code=short_code).count()
        click_records = Click.query.filter_by(short_code=short_code).all()

        referrers, user_agents, timeline = {}, {}, {}
        for rec in click_records:
            ref = rec.referrer or "Direct"
            referrers[ref] = referrers.get(ref, 0) + 1
            ua = rec.user_agent or "Unknown"
            user_agents[ua] = user_agents.get(ua, 0) + 1
            if rec.timestamp:
                day = rec.timestamp.strftime("%Y-%m-%d")
                timeline[day] = timeline.get(day, 0) + 1

        timeline_list = [{"date": k, "clicks": v} for k, v in sorted(timeline.items())]
        host_url = request.host_url.rstrip("/")

        return jsonify({
            "success": True,
            "summary": link.to_dict(base_url=host_url),
            "analytics": {"total_clicks": total_clicks, "referrers": referrers, "user_agents": user_agents, "timeline": timeline_list},
        }), 200

    @app.route("/api/links/<short_code>", methods=["DELETE"])
    def delete_link(short_code):
        short_code = short_code.lower()
        link = Link.query.filter_by(short_code=short_code).first()
        if not link:
            return jsonify({"success": False, "error": "Short link not found"}), 404

        user_id = session.get("user_id")
        if not user_id or link.user_id != user_id:
            return jsonify({"success": False, "error": "Unauthorized"}), 403

        link.is_active = False
        link.short_code = f"_del_{link.id}"[:16]
        db.session.commit()
        cache_del(f"url:{short_code}")

        return jsonify({"success": True}), 200



    with app.app_context():
        db.create_all()

    return app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in ["true", "1"]
    app.run(host="0.0.0.0", port=port, debug=debug)
