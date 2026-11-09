"""Preview the site locally with caching turned off.

    python tools/serve.py          -> http://127.0.0.1:5173
    python tools/serve.py 8080     -> http://127.0.0.1:8080
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".webp": "image/webp", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
                      ".mjs": "text/javascript", ".js": "text/javascript", ".svg": "image/svg+xml"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    handler = functools.partial(NoCache, directory=ROOT)
    print(f"Serving {ROOT} at http://127.0.0.1:{port}  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
