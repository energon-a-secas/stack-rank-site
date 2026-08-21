#!/usr/bin/env python3
"""
Simple HTTP server with SPA routing support.
Serves index.html for all routes except static assets.
"""
import http.server
import socketserver
import os
from pathlib import Path

PORT = 8828

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Dev server only. Without this the browser caches js/*.js heuristically
        # and keeps serving a stale ES module after an edit, so the page under
        # test is not the code on disk. Silent, and very expensive to debug.
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_GET(self):
        # Get the requested path
        path = self.translate_path(self.path)

        # If it's a file that exists, serve it normally
        if os.path.isfile(path):
            return http.server.SimpleHTTPRequestHandler.do_GET(self)

        # If it's a directory and has index.html, serve that
        if os.path.isdir(path):
            index_path = os.path.join(path, 'index.html')
            if os.path.exists(index_path):
                return http.server.SimpleHTTPRequestHandler.do_GET(self)

        # For all other routes (SPA paths), serve index.html
        # but only if the path doesn't look like a static asset
        if not any(self.path.endswith(ext) for ext in ['.js', '.css', '.png', '.jpg', '.ico', '.svg', '.json', '.woff', '.woff2']):
            self.path = '/index.html'

        return http.server.SimpleHTTPRequestHandler.do_GET(self)

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), SPAHandler) as httpd:
        print(f"Server running at http://localhost:{PORT}/")
        print("Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.shutdown()
