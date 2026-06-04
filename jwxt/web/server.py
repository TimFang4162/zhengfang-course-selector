import json
import queue
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from jwxt.web.service import JWXTWebService


ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = Path(__file__).resolve().parent / "static"
HOST = "127.0.0.1"
PORT = 8765
SERVICE = JWXTWebService()


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "JWXTWebUI/0.1"

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api_get(parsed)
            return
        self._serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self._handle_api_post(parsed)

    def log_message(self, format, *args):
        return

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def _write_json(self, data, status=HTTPStatus.OK):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_api_get(self, parsed):
        try:
            query = parse_qs(parsed.query)
            if parsed.path == "/api/bootstrap":
                self._write_json(SERVICE.bootstrap())
                return
            if parsed.path == "/api/categories":
                refresh = query.get("refresh", ["0"])[0] == "1"
                self._write_json(SERVICE.fetch_categories(refresh=refresh))
                return
            if parsed.path == "/api/courses":
                category_id = int(query.get("category_id", ["0"])[0])
                page = int(query.get("page", ["1"])[0])
                self._write_json(SERVICE.fetch_courses(category_id, page))
                return
            if parsed.path == "/api/classes":
                category_id = int(query.get("category_id", ["0"])[0])
                kch_id = str(query.get("kch_id", [""])[0])
                self._write_json(SERVICE.fetch_classes(category_id, kch_id))
                return
            if parsed.path == "/api/timetable":
                self._write_json(SERVICE.fetch_timetable())
                return
            if parsed.path == "/api/academic-status":
                refresh = query.get("refresh", ["0"])[0] == "1"
                self._write_json(SERVICE.fetch_academic_status(refresh=refresh))
                return
            if parsed.path == "/api/tree/state":
                self._write_json(SERVICE.tree_state())
                return
            if parsed.path == "/api/logs":
                since = int(query.get("since", ["0"])[0])
                self._write_json(SERVICE.get_logs(since))
                return
            if parsed.path == "/api/logs/stream":
                self._stream_logs()
                return
            if parsed.path == "/api/grab/tasks":
                self._write_json(SERVICE.list_grab_tasks())
                return
            self.send_error(HTTPStatus.NOT_FOUND)
        except PermissionError as exc:
            self._write_json({"error": str(exc)}, status=HTTPStatus.UNAUTHORIZED)
        except Exception as exc:
            self._write_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _handle_api_post(self, parsed):
        try:
            payload = self._read_json()
            if parsed.path == "/api/login":
                self._write_json(SERVICE.login(payload))
                return
            if parsed.path == "/api/addresses/test":
                self._write_json(SERVICE.test_addresses(payload))
                return
            if parsed.path == "/api/settings":
                self._write_json(SERVICE.update_settings(payload))
                return
            if parsed.path == "/api/choose":
                self._write_json(SERVICE.choose_class(payload))
                return
            if parsed.path == "/api/withdraw":
                self._write_json(SERVICE.withdraw_class(payload))
                return
            if parsed.path == "/api/logs/clear":
                self._write_json(SERVICE.clear_logs())
                return
            if parsed.path == "/api/grab/preview":
                self._write_json(SERVICE.preview_grab(payload))
                return
            if parsed.path == "/api/grab/load-missing":
                self._write_json(SERVICE.load_missing(payload))
                return
            if parsed.path == "/api/grab/tasks":
                self._write_json(SERVICE.create_grab_task(payload))
                return
            if parsed.path == "/api/grab/tasks/stop":
                self._write_json(SERVICE.stop_grab_task(payload))
                return
            if parsed.path == "/api/grab/tasks/start":
                self._write_json(SERVICE.start_grab_task(payload))
                return
            self.send_error(HTTPStatus.NOT_FOUND)
        except PermissionError as exc:
            self._write_json({"error": str(exc)}, status=HTTPStatus.UNAUTHORIZED)
        except Exception as exc:
            self._write_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def _serve_static(self, path: str):
        rel = path.lstrip("/") or "index.html"
        target = (STATIC_DIR / rel).resolve()
        if (
            not str(target).startswith(str(STATIC_DIR.resolve()))
            or not target.is_file()
        ):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = "text/plain; charset=utf-8"
        if target.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif target.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif target.suffix == ".js":
            content_type = "application/javascript; charset=utf-8"
        body = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _stream_logs(self):
        subscriber, snapshot = SERVICE.subscribe_logs()
        try:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            for entry in snapshot:
                self._write_sse("log", entry)
            self._write_sse("ready", {"ok": True})
            while True:
                try:
                    entry = subscriber.get(timeout=15)
                    self._write_sse("log", entry)
                except queue.Empty:
                    self._write_sse("ping", {"ts": int(time.time())})
        except BrokenPipeError, ConnectionResetError:
            return
        finally:
            SERVICE.unsubscribe_logs(subscriber)

    def _write_sse(self, event: str, data):
        body = (
            f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode(
                "utf-8"
            )
        )
        self.wfile.write(body)
        self.wfile.flush()


def main():
    server = ThreadingHTTPServer((HOST, PORT), RequestHandler)
    print(f"Web UI running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
