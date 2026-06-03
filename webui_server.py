import importlib.util
import json
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "webui"
HOST = "127.0.0.1"
PORT = 8765


def load_tui_module():
    spec = importlib.util.spec_from_file_location("jwxt_tui", ROOT / "2.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("无法加载 2.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class JWXTWebService:
    def __init__(self):
        self.mod = load_tui_module()
        self.lock = threading.RLock()
        self.logs = []
        self.next_log_id = 1
        self.big_list_cache = []
        self.course_info_cache = {}
        self.class_cache = {}
        self.mod.set_request_logger(self._log_renderable)

    def _plain(self, renderable) -> str:
        if hasattr(renderable, "plain"):
            return str(renderable.plain)
        return str(renderable)

    def _append_log(self, message: str):
        self.logs.append(
            {
                "id": self.next_log_id,
                "timestamp": time.strftime("%H:%M:%S", time.localtime()),
                "message": message,
            }
        )
        self.next_log_id += 1
        if len(self.logs) > 500:
            self.logs = self.logs[-500:]

    def _log_renderable(self, renderable):
        with self.lock:
            self._append_log(self._plain(renderable))

    def _log_debug(self, message: str):
        self._log_renderable(message)

    def _log_info(self, message: str):
        self._log_renderable(message)

    def bootstrap(self):
        with self.lock:
            saved = self.mod.load_saved_credentials()
            authenticated = bool(self.mod.is_authenticated)
            categories = (
                self.fetch_categories(refresh=False) if authenticated else {"items": []}
            )
            timetable = self.fetch_timetable() if authenticated else None
            return {
                "addressChoices": [
                    {"id": choice_id, "url": url, "description": desc}
                    for choice_id, url, desc in self.mod.ADDRESS_CHOICES
                ],
                "savedCredentials": {
                    "available": bool(saved),
                    "studentNumber": saved.get("student_number", "") if saved else "",
                    "masked": self.mod.mask_student_number(saved["student_number"])
                    if saved
                    else "",
                },
                "authenticated": authenticated,
                "baseUrl": self.mod.base_url,
                "categories": categories,
                "timetable": timetable,
            }

    def _require_auth(self):
        if not self.mod.is_authenticated:
            raise PermissionError("尚未登录")

    def login(self, payload: dict):
        with self.lock:
            use_saved = bool(payload.get("useSaved"))
            creds = self.mod.load_saved_credentials() if use_saved else None
            if use_saved and not creds:
                raise ValueError("没有可用的已保存凭据")
            student_number = (
                creds["student_number"]
                if creds
                else str(payload.get("studentNumber", "")).strip()
            )
            password = creds["password"] if creds else str(payload.get("password", ""))
            base_url = (
                str(payload.get("baseUrl") or self.mod.base_url).strip().rstrip("/")
            )
            save_credentials = bool(payload.get("saveCredentials")) and not use_saved
            if not student_number or not password:
                raise ValueError("学号和密码不能为空")
            if not base_url:
                raise ValueError("base_url 不能为空")
            setattr(self.mod, "base_url", base_url)
            setattr(self.mod, "STUDENT_NUMBER", student_number)
            setattr(self.mod, "PASSWORD", password)
            self.mod.reset_runtime_state()
            self.mod.sess.cookies.clear()
            self._log_info(
                f"尝试登录 {self.mod.mask_student_number(student_number)} @ {base_url}"
            )
            ok = self.mod.do_login(self._log_renderable, self._log_debug)
            setattr(self.mod, "is_authenticated", ok)
            if not ok:
                return {"ok": False, "message": "登录失败"}
            if save_credentials:
                self.mod.save_credentials(student_number, password)
                self._log_info("凭据已保存")
            categories = self.fetch_categories(refresh=True)
            timetable = self.fetch_timetable()
            return {
                "ok": True,
                "message": "登录成功",
                "categories": categories,
                "timetable": timetable,
            }

    def fetch_categories(self, refresh: bool = False):
        with self.lock:
            self._require_auth()
            if refresh or not self.big_list_cache:
                self.big_list_cache = self.mod.fetch_big_list(
                    self._log_renderable, self._log_debug
                )
                self.course_info_cache = {}
                self.class_cache = {}
            return {
                "items": [
                    {
                        "id": idx,
                        "name": target[0],
                        "kklxdm": target[1],
                        "xkkzId": target[2],
                        "grade": target[3],
                        "zyhId": target[4],
                    }
                    for idx, target in enumerate(self.big_list_cache)
                ]
            }

    def _get_target(self, category_id: int):
        try:
            return self.big_list_cache[category_id]
        except Exception as exc:
            raise ValueError("无效分类") from exc

    def fetch_courses(self, category_id: int, page: int):
        with self.lock:
            self._require_auth()
            target = self._get_target(category_id)
            result = self.mod.fetch_small_list(
                target, self._log_renderable, self._log_debug, page
            )
            course_bucket = self.course_info_cache.setdefault(category_id, {})
            items = []
            for kch_id, course_info_list in result.get("courses", {}).items():
                existing = course_bucket.get(kch_id, [])
                merged = existing + list(course_info_list)
                course_bucket[kch_id] = merged
                first = merged[0] if merged else {}
                credit_text = self.mod.get_course_credit_text(merged)
                items.append(
                    {
                        "kchId": kch_id,
                        "courseName": first.get("kcmc", kch_id),
                        "creditText": credit_text,
                        "creditValue": self._to_float_or_none(credit_text),
                        "classCount": len(merged),
                    }
                )
            return {
                "categoryId": category_id,
                "page": result.get("page", page),
                "count": result.get("count", 0),
                "hasMore": result.get("has_more", False),
                "nextPage": result.get("next_page", page + 1),
                "courses": items,
            }

    def fetch_classes(self, category_id: int, kch_id: str):
        with self.lock:
            self._require_auth()
            target = self._get_target(category_id)
            course_info_list = self.course_info_cache.get(category_id, {}).get(kch_id)
            if not course_info_list:
                raise ValueError("请先加载该分类下的课程")
            rwlx = "1" if target[0] == "主修课程" else "2"
            class_list_req = self.mod.fetch_class_detail_and_plan(
                target[1],
                kch_id,
                target[4],
                target[2],
                rwlx,
                self._log_renderable,
                self._log_debug,
            )
            final_data = (
                []
                if not class_list_req
                else self.mod.merge_class_data(class_list_req, course_info_list)
            )
            final_data.sort(
                key=lambda x: int(x[0].get("jxbrl", 0)) - int(x[1].get("yxzrs", 0)),
                reverse=True,
            )
            self.class_cache[(category_id, kch_id)] = final_data
            course_name = course_info_list[0].get("kcmc", kch_id)
            return {
                "categoryId": category_id,
                "kchId": kch_id,
                "courseName": course_name,
                "classes": [
                    self._normalize_class(index, course_name, clz, detail)
                    for index, (clz, detail) in enumerate(final_data, start=1)
                ],
            }

    def fetch_timetable(self):
        with self.lock:
            self._require_auth()
            choosed = self.mod.fetch_choosed_list(self._log_renderable, self._log_debug)
            selected_course_ids = set()
            selected_class_ids = set()
            selected_do_jxb_ids = set()
            entries = []
            summed_credit = 0.0
            for item in choosed:
                jxbmc = item.get("jxbmc", "")
                course_name = item.get("kcmc") or jxbmc
                sksj = item.get("sksj", "").replace("<br/>", ", ")
                teacher_name, teacher_title = self.mod.parse_teacher_display(
                    item.get("jsxx", "")
                )
                location = item.get("jxdd", "").replace("<br/>", ", ")
                kch_id = str(item.get("t_kch_id") or item.get("kch_id") or "")
                jxb_id = str(item.get("jxb_id") or "")
                do_jxb_id = str(
                    item.get("do_jxb_id") or item.get("right_do_jxb_id") or ""
                )
                class_no = self.mod.extract_class_no(jxbmc) or str(
                    item.get("jxbh") or item.get("right_jxb_id") or jxb_id
                )
                if kch_id:
                    selected_course_ids.add(kch_id)
                if jxb_id:
                    selected_class_ids.add(jxb_id)
                if do_jxb_id:
                    selected_do_jxb_ids.add(do_jxb_id)
                credit_text = self.mod.format_credit_text(
                    item.get("xf") or item.get("jxbxf") or 0
                )
                try:
                    summed_credit += float(credit_text or 0)
                except Exception:
                    pass
                entries.append(
                    {
                        "name": course_name,
                        "kchId": kch_id,
                        "classNo": class_no,
                        "creditText": credit_text,
                        "creditValue": self._to_float_or_none(credit_text),
                        "teacherName": teacher_name,
                        "teacherTitle": teacher_title,
                        "location": location,
                        "sksj": sksj,
                        "slots": self.mod.parse_sksj_to_slots(sksj),
                    }
                )
            max_credit = self.mod.max_credit_limit or 32.0
            current_credit = self.mod.current_credit_display or summed_credit
            return {
                "entries": entries,
                "selectedCourseIds": sorted(selected_course_ids),
                "selectedClassIds": sorted(selected_class_ids),
                "selectedDoJxbIds": sorted(selected_do_jxb_ids),
                "maxCredit": max_credit,
                "currentCredit": current_credit,
            }

    def choose_class(self, payload: dict):
        with self.lock:
            self._require_auth()
            category_value = payload.get("categoryId")
            if category_value in (None, ""):
                raise ValueError("缺少 categoryId")
            category_id = int(category_value)
            kch_id = str(payload.get("kchId", ""))
            do_jxb_id = str(payload.get("doJxbId", ""))
            course_name = str(payload.get("courseName", ""))
            target = self._get_target(category_id)
            rwlx = "1" if target[0] == "主修课程" else "2"
            res = self.mod.execute_choose(
                do_jxb_id,
                kch_id,
                course_name,
                rwlx,
                target[2],
                target[3],
                target[4],
                target[1],
                self._log_debug,
            )
            return self._response_with_timetable(res)

    def withdraw_class(self, payload: dict):
        with self.lock:
            self._require_auth()
            kch_id = str(payload.get("kchId", ""))
            do_jxb_id = str(payload.get("doJxbId", ""))
            res = self.mod.execute_withdraw(do_jxb_id, kch_id, self._log_debug)
            return self._response_with_timetable(res)

    def _response_with_timetable(self, res):
        if res is None:
            return {
                "ok": False,
                "payload": {"error": "请求失败"},
                "timetable": self.fetch_timetable(),
            }
        try:
            payload = res.json()
        except Exception:
            payload = {"raw": res.text}
        return {"ok": True, "payload": payload, "timetable": self.fetch_timetable()}

    def get_logs(self, since: int):
        with self.lock:
            return {"items": [item for item in self.logs if item["id"] > since]}

    def clear_logs(self):
        with self.lock:
            self.logs = []
            self.next_log_id = 1
            self._append_log("日志已清空")
            return {"ok": True}

    def _normalize_class(self, index: int, course_name: str, clz: dict, detail: dict):
        class_no = self.mod.extract_class_no(
            self.mod.first_non_empty(clz.get("jxbmc"), detail.get("jxbmc"), course_name)
        ) or self.mod.first_non_empty(
            clz.get("jxbh"), detail.get("jxbh"), clz.get("jxb_id"), detail.get("jxb_id")
        )
        teacher_name, teacher_title = self.mod.parse_teacher_display(
            self.mod.first_non_empty(clz.get("jsxx"), detail.get("jsxx"))
        )
        sksj = self.mod.first_non_empty(clz.get("sksj"), detail.get("sksj")).replace(
            "<br/>", ", "
        )
        location = self.mod.first_non_empty(
            clz.get("jxdd"), detail.get("jxdd")
        ).replace("<br/>", ", ")
        selected_count = (
            self.mod.first_non_empty(detail.get("yxzrs"), clz.get("yxzrs")) or "?"
        )
        capacity = (
            self.mod.first_non_empty(
                clz.get("jxbrl"),
                detail.get("jxbrl"),
                clz.get("jxbrs"),
                detail.get("jxbrs"),
            )
            or "?"
        )
        return {
            "index": index,
            "courseName": course_name,
            "kchId": str(detail.get("kch_id") or clz.get("kch_id") or ""),
            "jxbId": str(clz.get("jxb_id") or detail.get("jxb_id") or ""),
            "doJxbId": str(clz.get("do_jxb_id") or detail.get("do_jxb_id") or ""),
            "classNo": str(class_no),
            "teacherName": teacher_name,
            "teacherTitle": teacher_title,
            "sksj": sksj,
            "slots": self.mod.parse_sksj_to_slots(sksj),
            "location": location,
            "selectedCount": str(selected_count),
            "capacity": str(capacity),
            "courseProperty": self.mod.first_non_empty(
                clz.get("kcxzmc"),
                detail.get("kcxzmc"),
                clz.get("kclbmc"),
                detail.get("kclbmc"),
                clz.get("kcxz"),
                detail.get("kcxz"),
            )
            or "未标注性质",
            "academy": self.mod.first_non_empty(
                clz.get("kkxymc"), detail.get("kkxymc")
            ),
            "remark": self.mod.first_non_empty(clz.get("xkbz"), detail.get("xkbz")),
        }

    def _to_float_or_none(self, value):
        if value in (None, ""):
            return None
        try:
            return float(value)
        except Exception:
            return None


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
            if parsed.path == "/api/logs":
                since = int(query.get("since", ["0"])[0])
                self._write_json(SERVICE.get_logs(since))
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
            if parsed.path == "/api/choose":
                self._write_json(SERVICE.choose_class(payload))
                return
            if parsed.path == "/api/withdraw":
                self._write_json(SERVICE.withdraw_class(payload))
                return
            if parsed.path == "/api/logs/clear":
                self._write_json(SERVICE.clear_logs())
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


def main():
    server = ThreadingHTTPServer((HOST, PORT), RequestHandler)
    print(f"Web UI running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
