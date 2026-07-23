from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class UrlMapping(db.Model):
    __tablename__ = "url_mappings"
    
    id = db.Column(db.Integer, primary_key=True)
    original_url = db.Column(db.Text, nullable=False)
    short_code = db.Column(db.String(16), unique=True, index=True, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    expiration_date = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    
    def to_dict(self, base_url=""):
        return {
            "id": self.id,
            "original_url": self.original_url,
            "short_code": self.short_code,
            "short_url": f"{base_url}/r/{self.short_code}" if base_url else f"/r/{self.short_code}",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expiration_date": self.expiration_date.isoformat() if self.expiration_date else None,
            "is_active": self.is_active
        }


class ClickAnalytics(db.Model):
    __tablename__ = "click_analytics"
    
    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)
    short_code = db.Column(db.String(16), index=True, nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    referrer_url = db.Column(db.String(255), nullable=True)
    user_ip = db.Column(db.String(64), nullable=True)  # Store hashed IP string
    browser_type = db.Column(db.String(50), nullable=True)
    os_type = db.Column(db.String(50), nullable=True)
    country_code = db.Column(db.String(10), nullable=True)
    
    def to_dict(self):
        return {
            "id": self.id,
            "short_code": self.short_code,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "referrer_url": self.referrer_url,
            "user_ip": self.user_ip,
            "browser_type": self.browser_type,
            "os_type": self.os_type,
            "country_code": self.country_code
        }
