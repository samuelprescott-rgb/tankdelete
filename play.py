"""Serve one extracted playtest on loopback; Python 3.7+, no dependencies."""
import argparse
import functools
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class GameFiles(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map,
                          **{".js": "text/javascript", ".mjs": "text/javascript",
                             ".glb": "model/gltf-binary", ".wav": "audio/wav"})

    def list_directory(self, path):
        self.send_error(404)

    def log_message(self, fmt, *args):
        if args and len(args) > 1 and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)

    def send_head(self):
        # Build 1613 references a Vite icon that never shipped. No artwork
        # or game file is substituted; tell the browser there's no icon.
        if self.path.split("?", 1)[0] == "/vite.svg":
            self.send_response(204)
            self.end_headers()
            return None
        return super().send_head()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent / "web"
    if not (root / "index.html").is_file():
        parser.exit(1, "Extract the whole playtest first; web/index.html is missing.\n")
    handler = functools.partial(GameFiles, directory=str(root))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        url = "http://127.0.0.1:{}/".format(server.server_port)
        print("TankDelete: {}  (Ctrl+C to stop)".format(url), flush=True)
        if not args.no_open:
            threading.Timer(0.15, webbrowser.open, args=(url,)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
