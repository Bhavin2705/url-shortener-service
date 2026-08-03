from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = "users"
    
    email = db.Column(db.String(120), primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    links = db.relationship("Link", backref="user", lazy=True, cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "email": self.email,
            "username": self.username,
            "is_admin": self.is_admin,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Link(db.Model):
    __tablename__ = "links"
    
    id = db.Column(db.Integer, primary_key=True)
    original_url = db.Column(db.Text, nullable=False)
    short_code = db.Column(db.String(16), unique=True, index=True, nullable=False)
    user_email = db.Column(db.String(120), db.ForeignKey("users.email"), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    expiration_date = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    
    def to_dict(self, base_url=""):
        return {
            "id": self.id,
            "original_url": self.original_url,
            "short_code": self.short_code,
            "short_url": f"{base_url}/r/{self.short_code}" if base_url else f"/r/{self.short_code}",
            "user_email": self.user_email,
            "user_id": self.user_email,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expiration_date": self.expiration_date.isoformat() if self.expiration_date else None,
            "is_active": self.is_active
        }



class Click(db.Model):
    __tablename__ = "clicks"
    
    id = db.Column(db.BigInteger().with_variant(db.Integer, "sqlite"), primary_key=True)

    short_code = db.Column(db.String(16), index=True, nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    referrer = db.Column(db.String(255), nullable=True)
    user_ip = db.Column(db.String(64), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    
    def to_dict(self):
        return {
            "id": self.id,
            "short_code": self.short_code,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "referrer": self.referrer,
            "user_ip": self.user_ip,
            "user_agent": self.user_agent
        }

