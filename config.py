import os

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-12345")
    
    # PostgreSQL URI from environment or SQLite fallback
    DB_USER = os.environ.get("POSTGRES_USER", "postgres")
    DB_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "postgres")
    DB_HOST = os.environ.get("POSTGRES_HOST", "localhost")
    DB_PORT = os.environ.get("POSTGRES_PORT", "5432")
    DB_NAME = os.environ.get("POSTGRES_DB", "url_shortener_db")
    
    USE_POSTGRES = os.environ.get("USE_POSTGRES", "false").lower() in ["true", "1"]
    
    if USE_POSTGRES:
        SQLALCHEMY_DATABASE_URI = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    else:
        # SQLite fallback for quick local testing without PostgreSQL setup
        BASE_DIR = os.path.abspath(os.path.dirname(__file__))
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'url_shortener.db')}"
        
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Redis configuration
    REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
    REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
    REDIS_DB = int(os.environ.get("REDIS_DB", 0))
    REDIS_CACHE_TTL = 3600  # 1 hour cache TTL
    
    # Rate limit: 20 requests per minute
    RATE_LIMIT_PER_MINUTE = 20
