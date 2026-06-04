import importlib.util
import json
import re
import ssl
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen


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
        self.course_page_state = {}
        self.class_cache = {}
        self.grab_tasks = {}
        self.next_grab_task_id = 1
        self.scheduler_started = False
        self.disable_ssl_verify = not bool(self.mod.sess.verify)
        self.mod.set_request_logger(self._log_renderable)
        self._start_scheduler()

    def _start_scheduler(self):
        if self.scheduler_started:
            return
        self.scheduler_started = True
        thread = threading.Thread(target=self._scheduler_loop, daemon=True)
        thread.start()

    def _scheduler_loop(self):
        while True:
            time.sleep(1)
            try:
                self._scheduler_tick()
            except Exception as exc:
                self._log_debug(f"抢课调度异常: {exc}")

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
                "disableSslVerify": self.disable_ssl_verify,
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
            self.disable_ssl_verify = bool(payload.get("disableSslVerify"))
            self.mod.sess.verify = not self.disable_ssl_verify
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

    def test_addresses(self, payload: dict):
        addresses = payload.get("addresses") or []
        disable_ssl_verify = bool(
            payload.get("disableSslVerify", self.disable_ssl_verify)
        )
        context = ssl._create_unverified_context() if disable_ssl_verify else None
        results = []
        for item in addresses:
            url = str(item.get("url") or "").strip().rstrip("/")
            label = str(item.get("label") or url)
            if not url:
                continue
            if not url.startswith(("http://", "https://")):
                url = "https://" + url
            started = time.perf_counter()
            result = {
                "label": label,
                "url": url,
                "ok": False,
                "ms": None,
                "status": None,
                "message": "",
            }
            try:
                req = Request(url, headers={"User-Agent": "JWXT-WebUI/1.0"})
                with urlopen(req, timeout=5, context=context) as response:
                    result["status"] = response.status
                    result["ok"] = 200 <= response.status < 500
                    result["message"] = response.reason or "OK"
            except Exception as exc:
                result["message"] = str(exc)
            finally:
                result["ms"] = int((time.perf_counter() - started) * 1000)
            results.append(result)
        results.sort(key=lambda item: (not item["ok"], item["ms"] or 999999))
        return {"items": results}

    def update_settings(self, payload: dict):
        with self.lock:
            if "disableSslVerify" in payload:
                self.disable_ssl_verify = bool(payload.get("disableSslVerify"))
                self.mod.sess.verify = not self.disable_ssl_verify
            return {"ok": True, "disableSslVerify": self.disable_ssl_verify}

    def fetch_categories(self, refresh: bool = False):
        with self.lock:
            self._require_auth()
            if refresh or not self.big_list_cache:
                self.big_list_cache = self.mod.fetch_big_list(
                    self._log_renderable, self._log_debug
                )
                self.course_info_cache = {}
                self.course_page_state = {}
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
            page_state = self.course_page_state.setdefault(
                category_id, {"loadedPages": [], "hasMore": True, "nextPage": 1}
            )
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
            if page not in page_state["loadedPages"]:
                page_state["loadedPages"].append(page)
            page_state["hasMore"] = result.get("has_more", False)
            page_state["nextPage"] = result.get("next_page", page + 1)
            return {
                "categoryId": category_id,
                "page": result.get("page", page),
                "count": result.get("count", 0),
                "hasMore": result.get("has_more", False),
                "nextPage": result.get("next_page", page + 1),
                "courses": items,
            }

    def _course_summary(self, category_id: int, kch_id: str, course_info_list: list):
        first = course_info_list[0] if course_info_list else {}
        credit_text = self.mod.get_course_credit_text(course_info_list)
        classes = []
        if (category_id, kch_id) in self.class_cache:
            course_name = first.get("kcmc", kch_id)
            classes = [
                self._normalize_class(index, course_name, clz, detail)
                for index, (clz, detail) in enumerate(
                    self.class_cache[(category_id, kch_id)], start=1
                )
            ]
        return {
            "kchId": kch_id,
            "courseName": first.get("kcmc", kch_id),
            "creditText": credit_text,
            "creditValue": self._to_float_or_none(credit_text),
            "classCount": len(course_info_list),
            "classesLoaded": (category_id, kch_id) in self.class_cache,
            "classes": classes,
        }

    def tree_state(self):
        with self.lock:
            self._require_auth()
            items = []
            categories = self.fetch_categories(refresh=False)["items"]
            for category in categories:
                category_id = category["id"]
                page_state = self.course_page_state.get(category_id, {})
                course_bucket = self.course_info_cache.get(category_id, {})
                items.append(
                    {
                        **category,
                        "coursesLoaded": bool(course_bucket),
                        "hasMore": page_state.get(
                            "hasMore", bool(course_bucket) is False
                        ),
                        "nextPage": page_state.get("nextPage", 1),
                        "loadedPages": page_state.get("loadedPages", []),
                        "courses": [
                            self._course_summary(category_id, kch_id, course_info_list)
                            for kch_id, course_info_list in course_bucket.items()
                        ],
                    }
                )
            return {"items": items, "updatedAt": time.time()}

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

    def load_all_courses(self, category_id: int):
        with self.lock:
            page = self.course_page_state.get(category_id, {}).get("nextPage", 1)
            if self.course_info_cache.get(
                category_id
            ) and not self.course_page_state.get(category_id, {}).get("hasMore", False):
                return self.tree_state()
            while True:
                result = self.fetch_courses(category_id, page)
                if not result.get("hasMore"):
                    return self.tree_state()
                page = result.get("nextPage", page + 1)

    def _expr_needs_classes(self, expression: str) -> bool:
        return bool(
            re.search(
                r"\bclass\.|\bteachers\b|\bconflicts\b|\bhas_capacity\b", expression
            )
        )

    def _extract_course_ids(self, expression: str):
        return re.findall(r"course\.id\s*==\s*[\"']([^\"']+)[\"']", expression)

    def _extract_category_ids(self, expression: str):
        return re.findall(
            r"course\.categoryId\s*==\s*[\"']?([^\"'\s)]+)[\"']?", expression
        )

    def _eval_grab_expression(
        self, expression: str, category: dict, course: dict, class_item: dict | None
    ):
        selected = self._to_int(class_item.get("selectedCount")) if class_item else 0
        capacity = self._to_int(class_item.get("capacity")) if class_item else 0
        course_obj = {
            "id": str(course.get("kchId", "")),
            "name": course.get("courseName", ""),
            "credit": course.get("creditValue"),
            "categoryId": str(category.get("id", "")),
        }
        class_obj = None
        if class_item:
            class_obj = {
                "id": str(class_item.get("doJxbId") or class_item.get("jxbId") or ""),
                "no": class_item.get("classNo", ""),
                "teacher": class_item.get("teacherName", ""),
                "time": class_item.get("sksj", ""),
                "location": class_item.get("location", ""),
                "selected": selected,
                "capacity": capacity,
                "capacityLeft": max(0, capacity - selected),
            }
        expr = expression.replace("class.", "class_.")
        env = {
            "course": self._AttrDict(course_obj),
            "class_": self._AttrDict(class_obj or {}),
            "teachers": [
                class_item.get("teacherName", ""),
                class_item.get("teacherTitle", ""),
            ]
            if class_item
            else [],
            "conflicts": False,
            "has_capacity": bool(class_item and capacity > selected),
        }
        try:
            return bool(eval(expr, {"__builtins__": {}}, env))
        except Exception:
            return False

    class _AttrDict(dict):
        def __getattr__(self, key):
            return self.get(key)

    def _to_int(self, value):
        try:
            return int(value)
        except Exception:
            return 0

    def preview_grab(self, payload: dict):
        with self.lock:
            self._require_auth()
            context = payload.get("context") or {}
            expression = str(payload.get("expression") or "True")
            match_limit = int(payload.get("matchLimit") or 200)
            state = self.tree_state()
            category_ids = set(self._extract_category_ids(expression))
            course_ids = set(self._extract_course_ids(expression))
            if context.get("type") == "category":
                category_ids.add(str(context.get("categoryId")))
            elif context.get("categoryId") not in (None, ""):
                category_ids.add(str(context.get("categoryId")))
            if context.get("kchId"):
                course_ids.add(str(context.get("kchId")))
            needs_classes = self._expr_needs_classes(expression)
            missing = {"courseLoads": [], "classLoads": []}
            matches = []
            scan_course_count = 0
            candidate_course_keys = set()
            candidate_class_count = 0
            request_count = 0
            for category in state["items"]:
                category_id = str(category["id"])
                if category_ids and category_id not in category_ids:
                    continue
                if not category.get("coursesLoaded") or category.get("hasMore"):
                    missing["courseLoads"].append(
                        {
                            "categoryId": category["id"],
                            "name": category["name"],
                            "mode": "all",
                        }
                    )
                    request_count += 1
                    continue
                for course in category.get("courses", []):
                    if course_ids and str(course["kchId"]) not in course_ids:
                        continue
                    scan_course_count += 1
                    if needs_classes and not course.get("classesLoaded"):
                        missing["classLoads"].append(
                            {
                                "categoryId": category["id"],
                                "kchId": course["kchId"],
                                "courseName": course["courseName"],
                            }
                        )
                        request_count += 1
                        continue
                    class_items = course.get("classes") or [None]
                    for class_item in class_items:
                        if self._eval_grab_expression(
                            expression, category, course, class_item
                        ):
                            matches.append(
                                {
                                    "category": {
                                        "id": category["id"],
                                        "name": category["name"],
                                    },
                                    "course": course,
                                    "classItem": class_item,
                                }
                            )
                            candidate_course_keys.add((category["id"], course["kchId"]))
                            if class_item:
                                candidate_class_count += 1
            ready = not missing["courseLoads"] and not missing["classLoads"]
            return {
                "ready": ready,
                "missing": missing,
                "matches": matches[:match_limit],
                "scanCourseCount": scan_course_count,
                "candidateCourseCount": len(candidate_course_keys),
                "candidateClassCount": candidate_class_count,
                "estimatedRequestsPerTick": len(candidate_course_keys)
                if ready
                else request_count,
            }

    def load_missing(self, payload: dict):
        with self.lock:
            missing = payload.get("missing") or {}
            for item in missing.get("courseLoads", []):
                self.load_all_courses(int(item["categoryId"]))
            for item in missing.get("classLoads", []):
                self.fetch_classes(int(item["categoryId"]), str(item["kchId"]))
            return {"ok": True, "tree": self.tree_state()}

    def create_grab_task(self, payload: dict):
        with self.lock:
            self._require_auth()
            expression = str(payload.get("expression") or "True")
            context = payload.get("context") or {}
            preview = self.preview_grab(
                {"context": context, "expression": expression, "matchLimit": 100000}
            )
            if not preview.get("ready"):
                raise ValueError("抢课任务仍有缺失数据，请先加载缺失数据")
            candidates = {}
            for item in preview.get("matches", []):
                class_item = item.get("classItem")
                if not class_item:
                    continue
                key = (int(item["category"]["id"]), str(item["course"]["kchId"]))
                bucket = candidates.setdefault(
                    key,
                    {
                        "categoryId": key[0],
                        "kchId": key[1],
                        "courseName": item["course"].get("courseName", key[1]),
                        "classIds": set(),
                    },
                )
                bucket["classIds"].add(
                    str(
                        class_item.get("doJxbId")
                        or class_item.get("jxbId")
                        or class_item.get("classNo")
                    )
                )
            task_id = f"grab-{self.next_grab_task_id}"
            self.next_grab_task_id += 1
            now = time.time()
            start_mode = str(payload.get("startMode") or "now")
            start_at = (
                self._parse_timestamp(payload.get("startAt"))
                if start_mode == "scheduled"
                else now
            )
            status = "running" if start_at <= now else "waiting"
            task = {
                "id": task_id,
                "name": payload.get("name") or "抢课任务",
                "expression": expression,
                "context": context,
                "status": status,
                "progress": "等待 tick" if status == "running" else "等待启动时间",
                "tickInterval": float(payload.get("tickInterval") or 3),
                "timeoutSeconds": float(payload.get("timeoutSeconds") or 600),
                "stopOnFirstSuccess": bool(payload.get("stopOnFirstSuccess", True)),
                "errorPolicy": str(payload.get("errorPolicy") or "retry_once"),
                "startMode": start_mode,
                "startAt": start_at,
                "createdAt": now,
                "startedAt": now if status == "running" else None,
                "lastTickAt": 0,
                "tickCount": 0,
                "successCount": 0,
                "lastError": "",
                "lastResult": "",
                "events": [],
                "candidateCourses": [
                    {**value, "classIds": sorted(value["classIds"])}
                    for value in candidates.values()
                ],
                "candidateCourseCount": len(candidates),
                "candidateClassCount": sum(
                    len(value["classIds"]) for value in candidates.values()
                ),
            }
            self.grab_tasks[task_id] = task
            self._log_info(
                f"创建抢课任务 {task_id}: {task['candidateCourseCount']} 门候选课程"
            )
            return {"ok": True, "task": self._public_grab_task(task)}

    def _parse_timestamp(self, value):
        if not value:
            return time.time()
        if isinstance(value, (int, float)):
            return float(value)
        text = str(value)
        try:
            return float(text)
        except Exception:
            pass
        try:
            from datetime import datetime

            return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
        except Exception:
            return time.time()

    def list_grab_tasks(self):
        with self.lock:
            return {
                "items": [
                    self._public_grab_task(task) for task in self.grab_tasks.values()
                ]
            }

    def stop_grab_task(self, payload: dict):
        with self.lock:
            task = self._get_grab_task(payload)
            task["status"] = "stopped"
            task["progress"] = "已手动停止"
            self._add_task_event(task, "手动停止")
            return {"ok": True, "task": self._public_grab_task(task)}

    def start_grab_task(self, payload: dict):
        with self.lock:
            task = self._get_grab_task(payload)
            task["status"] = "running"
            task["progress"] = "手动启动"
            task["lastTickAt"] = 0
            task["startedAt"] = time.time()
            self._add_task_event(task, "手动启动")
            return {"ok": True, "task": self._public_grab_task(task)}

    def _get_grab_task(self, payload: dict):
        task_id = str(payload.get("id") or "")
        task = self.grab_tasks.get(task_id)
        if not task:
            raise ValueError("无效抢课任务")
        return task

    def _add_task_event(self, task: dict, message: str):
        task.setdefault("events", []).append(
            {"time": time.strftime("%H:%M:%S"), "message": message}
        )
        task["events"] = task["events"][-50:]

    def _public_grab_task(self, task: dict):
        return {
            "id": task["id"],
            "name": task["name"],
            "status": task["status"],
            "progress": task["progress"],
            "tickCount": task["tickCount"],
            "successCount": task["successCount"],
            "candidateCourseCount": task["candidateCourseCount"],
            "candidateClassCount": task["candidateClassCount"],
            "startMode": task.get("startMode"),
            "startAt": task.get("startAt"),
            "tickInterval": task.get("tickInterval"),
            "timeoutSeconds": task.get("timeoutSeconds"),
            "stopOnFirstSuccess": task.get("stopOnFirstSuccess"),
            "errorPolicy": task.get("errorPolicy"),
            "expression": task.get("expression"),
            "lastError": task.get("lastError"),
            "lastResult": task.get("lastResult"),
            "events": task.get("events", [])[-20:],
        }

    def _scheduler_tick(self):
        with self.lock:
            if not self.mod.is_authenticated:
                return
            now = time.time()
            for task in list(self.grab_tasks.values()):
                if task.get("status") != "running":
                    if task.get("status") == "waiting" and now >= task.get(
                        "startAt", now
                    ):
                        task["status"] = "running"
                        task["progress"] = "到达启动时间"
                        task["startedAt"] = now
                        self._add_task_event(task, "到达启动时间，开始运行")
                    continue
                if (
                    now - (task.get("startedAt") or task["createdAt"])
                    > task["timeoutSeconds"]
                ):
                    task["status"] = "timeout"
                    task["progress"] = "已超时"
                    self._add_task_event(task, "任务超时")
                    continue
                if now - task["lastTickAt"] < task["tickInterval"]:
                    continue
                self._run_grab_task_tick(task, now)

    def _run_grab_task_tick(self, task: dict, now: float):
        task["lastTickAt"] = now
        task["tickCount"] += 1
        task["progress"] = (
            f"tick {task['tickCount']} / 刷新 {task['candidateCourseCount']} 门课程"
        )
        for course_target in task["candidateCourses"]:
            try:
                data = self._fetch_classes_for_task(task, course_target)
            except Exception as exc:
                task["lastError"] = str(exc)
                if task.get("errorPolicy") == "stop":
                    task["status"] = "failed"
                    task["progress"] = f"错误停止: {exc}"
                    self._add_task_event(task, task["progress"])
                    return
                task["progress"] = f"请求失败，跳过: {course_target['courseName']}"
                self._add_task_event(task, task["progress"])
                continue
            class_ids = set(course_target["classIds"])
            for class_item in data.get("classes", []):
                item_id = str(
                    class_item.get("doJxbId")
                    or class_item.get("jxbId")
                    or class_item.get("classNo")
                )
                if item_id not in class_ids:
                    continue
                course = self._course_summary(
                    course_target["categoryId"],
                    course_target["kchId"],
                    self.course_info_cache[course_target["categoryId"]][
                        course_target["kchId"]
                    ],
                )
                category = {"id": course_target["categoryId"], "name": ""}
                if not self._eval_grab_expression(
                    task["expression"], category, course, class_item
                ):
                    continue
                if self._to_int(class_item.get("capacity")) <= self._to_int(
                    class_item.get("selectedCount")
                ):
                    continue
                res = self.choose_class(
                    {
                        "categoryId": course_target["categoryId"],
                        "kchId": course_target["kchId"],
                        "doJxbId": class_item.get("doJxbId"),
                        "courseName": course_target["courseName"],
                    }
                )
                task["successCount"] += 1
                task["lastResult"] = str(res.get("payload", ""))[:300]
                task["progress"] = (
                    f"已尝试选课 {course_target['courseName']} / {class_item.get('classNo')}"
                )
                self._add_task_event(task, task["progress"])
                self.fetch_timetable()
                if task.get("stopOnFirstSuccess"):
                    task["status"] = "success"
                    task["progress"] = (
                        f"成功后停止: {course_target['courseName']} / {class_item.get('classNo')}"
                    )
                    self._add_task_event(task, task["progress"])
                    return
        task["progress"] = f"tick {task['tickCount']} 完成，未命中余量"

    def _fetch_classes_for_task(self, task: dict, course_target: dict):
        try:
            return self.fetch_classes(
                course_target["categoryId"], course_target["kchId"]
            )
        except Exception:
            if task.get("errorPolicy") != "retry_once":
                raise
            self._add_task_event(
                task, f"请求失败，重试一次: {course_target['courseName']}"
            )
            return self.fetch_classes(
                course_target["categoryId"], course_target["kchId"]
            )

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
                        "jxbId": jxb_id,
                        "doJxbId": do_jxb_id,
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
            if parsed.path == "/api/tree/state":
                self._write_json(SERVICE.tree_state())
                return
            if parsed.path == "/api/logs":
                since = int(query.get("since", ["0"])[0])
                self._write_json(SERVICE.get_logs(since))
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


def main():
    server = ThreadingHTTPServer((HOST, PORT), RequestHandler)
    print(f"Web UI running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
