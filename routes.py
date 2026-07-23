import io
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
import qrcode
from sqlalchemy.exc import IntegrityError

from flask import Blueprint, request, jsonify, redirect, send_file
from models import db, UrlMapping, ClickAnalytics
from services import (
    generate_short_code,
    hash_ip_address,
    cache_manager,
    parse_user_agent_details,
    get_country_from_ip
)

api_blueprint = Blueprint("api", __name__)

def is_valid_url(url_string):
    if not url_string:
        return False
    try:
        parsed = urlparse(url_string)
        return bool(parsed.scheme in ["http", "https"] and parsed.netloc)
    except Exception:
        return False


@api_blueprint.route("/api/urls/shorten", methods=["POST"])
def shorten_url():
    # IP Rate limit check
    raw_ip = request.remote_addr or "127.0.0.1"
    hashed_ip_for_rate_limit = hash_ip_address(raw_ip)
    
    if cache_manager.is_rate_limited(hashed_ip_for_rate_limit):
        return jsonify({"success": False, "error": "Rate limit exceeded. Maximum 20 requests per minute."}), 429

    data = request.get_json() or {}
    original_url = data.get("original_url", "").strip()
    custom_alias = data.get("custom_alias", "").strip()
    expiration_days = data.get("expiration_days")

    if not original_url:
        return jsonify({"success": False, "error": "original_url is required"}), 400

    if not is_valid_url(original_url):
        return jsonify({"success": False, "error": "Invalid URL format. Must start with http:// or https://"}), 400

    # Expiration date calculation
    expiration_date = None
    if expiration_days and str(expiration_days).isdigit():
        days_int = int(expiration_days)
        if days_int > 0:
            expiration_date = datetime.now(timezone.utc) + timedelta(days=days_int)

    # Secure short code generation with database transaction wrapper
    short_code = custom_alias if custom_alias else None
    max_retries = 5
    created_mapping = None

    for attempt in range(max_retries):
        try:
            current_code = short_code if short_code else generate_short_code()
            new_mapping = UrlMapping(
                original_url=original_url,
                short_code=current_code,
                expiration_date=expiration_date
            )
            db.session.add(new_mapping)
            db.session.commit()
            created_mapping = new_mapping
            break
        except IntegrityError:
            db.session.rollback()
            if custom_alias:
                return jsonify({"success": False, "error": "Custom alias is already in use"}), 409
            short_code = None
    else:
        return jsonify({"success": False, "error": "Failed to generate unique short code due to collisions"}), 500

    # Cache mapping in Redis with expiration synchronization
    cache_manager.set_url(created_mapping.short_code, original_url, expiration_date=expiration_date)

    host_url = request.host_url.rstrip("/")
    return jsonify({
        "success": True,
        "data": created_mapping.to_dict(base_url=host_url)
    }), 201


@api_blueprint.route("/r/<short_code>", methods=["GET"])
def redirect_to_url(short_code):
    raw_ip = request.remote_addr or "127.0.0.1"
    hashed_ip = hash_ip_address(raw_ip)
    referrer_url = request.referrer or "Direct"
    user_agent_string = request.headers.get("User-Agent", "")

    # Expiration-aware Redis cache lookup
    target_url = cache_manager.get_url(short_code)

    if not target_url:
        mapping = UrlMapping.query.filter_by(short_code=short_code, is_active=True).first()
        if not mapping:
            return jsonify({"success": False, "error": "Short URL not found"}), 404
            
        if mapping.expiration_date and mapping.expiration_date < datetime.now(timezone.utc):
            return jsonify({"success": False, "error": "Short URL has expired"}), 410
            
        target_url = mapping.original_url
        cache_manager.set_url(short_code, target_url, expiration_date=mapping.expiration_date)
    else:
        mapping = UrlMapping.query.filter_by(short_code=short_code, is_active=True).first()

    # Log analytics asynchronously without data redundancy
    if mapping:
        browser, os_type = parse_user_agent_details(user_agent_string)
        country_code = get_country_from_ip(raw_ip)

        analytics_entry = ClickAnalytics(
            short_code=short_code,
            referrer_url=referrer_url[:255] if referrer_url else "Direct",
            user_ip=hashed_ip,
            browser_type=browser,
            os_type=os_type,
            country_code=country_code
        )
        
        db.session.add(analytics_entry)
        db.session.commit()

    return redirect(target_url, code=302)


@api_blueprint.route("/api/urls/<short_code>/analytics", methods=["GET"])
def get_analytics(short_code):
    mapping = UrlMapping.query.filter_by(short_code=short_code).first()
    if not mapping:
        return jsonify({"success": False, "error": "Short URL not found"}), 404

    # Optimized indexed count query directly on ClickAnalytics
    total_clicks = ClickAnalytics.query.filter_by(short_code=short_code).count()

    click_records = ClickAnalytics.query.filter_by(short_code=short_code).all()

    referrer_counts = {}
    browser_counts = {}
    os_counts = {}
    country_counts = {}
    date_timeline = {}

    for record in click_records:
        ref = record.referrer_url or "Direct"
        referrer_counts[ref] = referrer_counts.get(ref, 0) + 1

        b = record.browser_type or "Unknown"
        browser_counts[b] = browser_counts.get(b, 0) + 1

        o = record.os_type or "Unknown"
        os_counts[o] = os_counts.get(o, 0) + 1

        c = record.country_code or "Unknown"
        country_counts[c] = country_counts.get(c, 0) + 1

        if record.timestamp:
            date_str = record.timestamp.strftime("%Y-%m-%d")
            date_timeline[date_str] = date_timeline.get(date_str, 0) + 1

    timeline_list = [{"date": k, "clicks": v} for k, v in sorted(date_timeline.items())]

    host_url = request.host_url.rstrip("/")
    return jsonify({
        "success": True,
        "summary": mapping.to_dict(base_url=host_url),
        "analytics": {
            "total_clicks": total_clicks,
            "referrers": referrer_counts,
            "browsers": browser_counts,
            "operating_systems": os_counts,
            "countries": country_counts,
            "timeline": timeline_list
        }
    }), 200


@api_blueprint.route("/api/urls/<short_code>/qr", methods=["GET"])
def get_qr_code(short_code):
    mapping = UrlMapping.query.filter_by(short_code=short_code).first()
    if not mapping:
        return jsonify({"success": False, "error": "Short URL not found"}), 404

    host_url = request.host_url.rstrip("/")
    target_short_url = f"{host_url}/r/{short_code}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(target_short_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="#6366f1", back_color="#0f172a")
    img_buffer = io.BytesIO()
    img.save(img_buffer, "PNG")
    img_buffer.seek(0)

    return send_file(img_buffer, mimetype="image/png")
