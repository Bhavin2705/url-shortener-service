import os
from flask import Flask, send_from_directory
from config import Config
from models import db
from routes import api_blueprint

def create_app():
    app = Flask(__name__, static_folder="static", static_url_path="")
    app.config.from_object(Config)

    # Initialize SQLAlchemy database
    db.init_app(app)

    # Register API blueprint
    app.register_blueprint(api_blueprint)

    # Serve static frontend root
    @app.route("/")
    def serve_frontend():
        return send_from_directory(app.static_folder, "index.html")

    # Create tables automatically inside application context
    with app.app_context():
        db.create_all()

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
