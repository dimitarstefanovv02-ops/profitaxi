# Локален сървър като във Vercel: /app → app.html, /admin → admin.html
import http.server, os, sys
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.split('?')[0].split('#')[0].rstrip('/') == '/app/onetaxi': path = '/onetaxi.html'
        p = super().translate_path(path)
        if not os.path.exists(p) and os.path.exists(p + '.html'): return p + '.html'
        return p
    def log_message(self, *a): pass
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
http.server.ThreadingHTTPServer(('', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
