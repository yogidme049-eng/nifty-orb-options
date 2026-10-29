#!/usr/bin/env python3
"""Local-only server and persistent launcher; Python standard library only."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
from urllib.request import urlopen
import argparse, json, subprocess, sys, time, webbrowser

ROOT = Path(__file__).resolve().parent / 'site'
PORT = 8879

def running(port):
    try:
        with urlopen('http://127.0.0.1:%s/__nifty_health' % port, timeout=0.5) as r:
            return json.load(r).get('root') == str(ROOT)
    except Exception:
        return False

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/__nifty_health':
            data = json.dumps({'app': 'NIFTY Offline', 'root': str(ROOT)}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if '.json.gz?v=' in self.path else 'no-cache')
        super().end_headers()
    def log_message(self, *args):
        pass

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--launch', action='store_true')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=PORT)
    args = parser.parse_args()
    url = 'http://127.0.0.1:%s/options.html' % args.port
    if not (ROOT / 'options.html').is_file():
        raise SystemExit('Missing site folder. Keep the NIFTY Offline folder together.')
    if args.launch:
        if not running(args.port):
            log = Path(__file__).resolve().parent / 'server.log'
            with log.open('a') as stream:
                proc = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--no-browser', '--port', str(args.port)], stdin=subprocess.DEVNULL, stdout=stream, stderr=stream, start_new_session=True)
            for _ in range(60):
                if running(args.port):
                    break
                if proc.poll() is not None:
                    raise SystemExit('Could not start local server. See %s (port %s may be in use).' % (log, args.port))
                time.sleep(0.1)
            else:
                raise SystemExit('Local server did not respond. See %s' % log)
        print('NIFTY Offline ready: ' + url, flush=True)
        print('You can close Terminal. After restarting your Mac, double-click the launcher again.', flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        return
    if running(args.port):
        print('NIFTY Offline is already running: ' + url, flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        return
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT)))
    except OSError as e:
        raise SystemExit('Cannot open local port %s: %s' % (args.port, e))
    print('NIFTY Offline ready: ' + url, flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
