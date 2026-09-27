import os
import sys

# Ensure project root and server directories are on sys.path for Vercel Serverless Function runtime
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CURRENT_DIR)
SERVER_DIR = os.path.join(ROOT_DIR, "server")

for path in [ROOT_DIR, SERVER_DIR]:
    if path not in sys.path:
        sys.path.insert(0, path)

from server.app.main import app

# Export app for Vercel ASGI runner
__all__ = ["app"]
