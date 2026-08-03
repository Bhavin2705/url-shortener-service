import os
import secrets
import warnings

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY")
    if not SECRET_KEY:
        warnings.warn("SECRET_KEY not set!", stacklevel=1)
        SECRET_KEY = secrets.token_hex(32)

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() in ["true", "1"]

    USE_POSTGRES = os.environ.get("USE_POSTGRES", "false").lower() in ["true", "1"]
    if USE_POSTGRES:
        u, p, h, pt, d = (os.environ.get(k, v) for k, v in [
            ("POSTGRES_USER", "postgres"), ("POSTGRES_PASSWORD", "postgres"),
            ("POSTGRES_HOST", "localhost"), ("POSTGRES_PORT", "5432"), ("POSTGRES_DB", "url_shortener_db")
        ])
        SQLALCHEMY_DATABASE_URI = f"postgresql://{u}:{p}@{h}:{pt}/{d}"
    else:
        BASE_DIR = os.path.abspath(os.path.dirname(__file__))
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'url_shortener.db')}"

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"connect_args": {"timeout": 15}} if not USE_POSTGRES else {}

    REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
    REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
    REDIS_DB = int(os.environ.get("REDIS_DB", 0))

    RATE_LIMIT_DEFAULT = os.environ.get("RATE_LIMIT_DEFAULT", "200 per hour")
    RATE_LIMIT_LOGIN = os.environ.get("RATE_LIMIT_LOGIN", "5 per minute")
    RATE_LIMIT_SHORTEN = os.environ.get("RATE_LIMIT_SHORTEN", "20 per hour")

    ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "localhost,localhost:5000,127.0.0.1,127.0.0.1:5000").split(",")]
    IP_HASH_SECRET = os.environ.get("IP_HASH_SECRET", secrets.token_hex(32))

