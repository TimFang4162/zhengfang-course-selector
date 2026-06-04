import ssl
import threading
import time
from urllib.request import Request, urlopen

from jwxt import core
from jwxt.web.grab import GrabTaskMixin


class JWXTWebService(GrabTaskMixin):
    def __init__(self):
        self.mod = core
        self.lock = threading.RLock()
        self.logs = []
        self.next_log_id = 1
        self.big_list_cache = []
        self.course_info_cache = {}
        self.course_page_state = {}
        self.class_cache = {}
        self.academic_status_cache = None
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
                "sessionManagedByBackend": True,
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
                self.academic_status_cache = None
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

    def fetch_academic_status(self, refresh: bool = False):
        with self.lock:
            self._require_auth()
            cache_status = "hit"
            if refresh or self.academic_status_cache is None:
                cache_status = "refresh" if refresh else "miss"
                self._log_debug(
                    "学业情况缓存刷新" if refresh else "学业情况缓存未命中，开始拉取"
                )
                data = self.mod.fetch_academic_status(
                    self._log_renderable, self._log_debug
                )
                data["updatedAt"] = time.time()
                self.academic_status_cache = data
            else:
                self._log_debug("学业情况缓存命中")
            cached = self.academic_status_cache or {"params": {}, "nodes": []}
            return {
                **cached,
                "fromCache": cache_status == "hit",
                "cacheStatus": cache_status,
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
