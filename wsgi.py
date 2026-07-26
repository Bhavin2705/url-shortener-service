import os
from app import create_app
from waitress import serve

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Serving production Flask service on http://localhost:{port}")
    serve(app, host="0.0.0.0", port=port)
