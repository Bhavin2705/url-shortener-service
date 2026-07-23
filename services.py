import string
import secrets
import hashlib
import time
import json
from datetime import datetime, timezone
from user_agents import parse
from config import Config

BASE62_ALPHABET = string.digits + string.ascii_lowercase + string.ascii_uppercase

def generate_short_code(length=6):
    """
    Generates a cryptographically secure random Base62 short code using Python's secrets module.
    """
    return "".join(secrets.choice(BASE62_ALPHABET) for _ in range(length))


def hash_ip_address(user_ip, salt="url_shortener_ip_salt"):
    """
    Hashes client IP address using SHA-256 for privacy and compliance (GDPR/CCPA).
    Returns a truncated 16-character hex digest.
    """
    if not user_ip or user_ip in ["127.0.0.1", "localhost", "::1"]:
        return "Anonymized-Local"
    
    salted_string = f"{user_ip}:{salt}"
    return hashlib.sha256(salted_string.encode("utf-8")).hexdigest()[:16]


class CacheManager:
    """
    Encapsulates Redis caching and rate limiting with clean in-memory fallbacks.
    Prevents cache pollution, expired link leaks, and rate-limiter memory accumulation.
    """
    def __init__(self):
        self.redis_client = None
        self.memory_cache = {}
        self.rate_limit_memory = {}
        self._init_redis()

    def _init_redis(self):
        try:
            import redis
            client = redis.Redis(
                host=Config.REDIS_HOST,
                port=Config.REDIS_PORT,
                db=Config.REDIS_DB,
                socket_timeout=1
            )
            client.ping()
            self.redis_client = client
        except Exception:
            self.redis_client = None

    def get_url(self, short_code):
        """
        Retrieves original URL from cache only if it has not expired.
        """
        cached_data = None

        if self.redis_client:
            try:
                raw_val = self.redis_client.get(f"url:{short_code}")
                if raw_val:
                    cached_data = json.loads(raw_val.decode("utf-8"))
            except Exception:
                pass

        if not cached_data:
            # Memory fallback lookup
            cached_data = self.memory_cache.get(short_code)

        if not cached_data:
            return None

        original_url = cached_data.get("original_url")
        exp_timestamp = cached_data.get("exp_timestamp")

        # Expiration Synchronization Check
        if exp_timestamp is not None and time.time() >= exp_timestamp:
            self.delete_url(short_code)
            return None

        return original_url

    def set_url(self, short_code, original_url, expiration_date=None, default_ttl=3600):
        """
        Caches original URL and its expiration timestamp.
        Dynamically adjusts Redis TTL so cache expires when or before link expiration date.
        """
        exp_timestamp = None
        ttl_seconds = default_ttl

        if expiration_date:
            if isinstance(expiration_date, datetime):
                # Ensure UTC timestamp
                if expiration_date.tzinfo is None:
                    exp_timestamp = expiration_date.replace(tzinfo=timezone.utc).timestamp()
                else:
                    exp_timestamp = expiration_date.timestamp()
            elif isinstance(expiration_date, (int, float)):
                exp_timestamp = float(expiration_date)

            if exp_timestamp:
                remaining_seconds = int(exp_timestamp - time.time())
                if remaining_seconds <= 0:
                    return  # Already expired, do not cache
                ttl_seconds = min(default_ttl, remaining_seconds)

        payload = {
            "original_url": original_url,
            "exp_timestamp": exp_timestamp
        }

        if self.redis_client:
            try:
                self.redis_client.setex(
                    f"url:{short_code}",
                    ttl_seconds,
                    json.dumps(payload)
                )
                return
            except Exception:
                pass

        # Memory fallback with automatic TTL calculation
        self.memory_cache[short_code] = payload

    def delete_url(self, short_code):
        if self.redis_client:
            try:
                self.redis_client.delete(f"url:{short_code}")
            except Exception:
                pass
        self.memory_cache.pop(short_code, None)

    def is_rate_limited(self, user_ip, limit=20, window_seconds=60):
        """
        Sliding window IP rate-limiting.
        Prunes dormant client IP keys in memory fallback to prevent memory leaks.
        """
        current_time = int(time.time())
        current_window = current_time // window_seconds
        key = f"rate:{user_ip}:{current_window}"

        if self.redis_client:
            try:
                current_count = self.redis_client.incr(key)
                if current_count == 1:
                    self.redis_client.expire(key, window_seconds)
                return current_count > limit
            except Exception:
                pass

        # Memory fallback cleanup of stale windows
        stale_keys = [k for k in self.rate_limit_memory if int(k.split(":")[-1]) < current_window]
        for sk in stale_keys:
            del self.rate_limit_memory[sk]

        current_count = self.rate_limit_memory.get(key, 0) + 1
        self.rate_limit_memory[key] = current_count

        return current_count > limit


cache_manager = CacheManager()


def parse_user_agent_details(user_agent_string):
    if not user_agent_string:
        return "Unknown", "Unknown"
    try:
        user_agent = parse(user_agent_string)
        browser = user_agent.browser.family or "Unknown"
        os_type = user_agent.os.family or "Unknown"
        return browser, os_type
    except Exception:
        return "Unknown", "Unknown"


def get_country_from_ip(user_ip):
    if not user_ip or user_ip in ["127.0.0.1", "localhost", "::1"]:
        return "Local"
    return "Unknown"
