#!/usr/bin/env python3
"""Loopback-only offline app. Python standard library; no network dependencies."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
import sys,webbrowser,threading
ROOT=Path(__file__).resolve().parent/'site'
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','public, max-age=31536000, immutable' if '.json.gz?v=' in self.path else 'no-cache')
        super().end_headers()
    def log_message(self,*args):
        pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
url='http://127.0.0.1:%s/options.html'%server.server_port
print('NIFTY Offline is ready: '+url,flush=True)
print('Keep this window open. Press Control+C to stop. Internet is not required.',flush=True)
if '--no-browser' not in sys.argv:
    threading.Timer(0.3,lambda:webbrowser.open(url)).start()
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
