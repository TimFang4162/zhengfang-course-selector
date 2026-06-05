import ssl
import threading
import time
import queue
import json
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
        self.default_course_ids = {}
        self.course_search_cache = {}
        self.class_cache = {}
        self.timetable_cache = None
        self.academic_status_cache = None
        self.grab_tasks = {}
        self.next_grab_task_id = 1
        self.scheduler_started = False
        self.disable_ssl_verify = not bool(self.mod.sess.verify)
        self.log_subscribers = []
        self.event_subscribers = []
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
                self._log_system(f"抢课调度异常: {exc}", level="error")

    def _plain(self, renderable) -> str:
        if isinstance(renderable, dict):
            return str(renderable.get("message") or "")
        if hasattr(renderable, "plain"):
            return str(renderable.plain)
        return str(renderable)

    def _append_log(self, payload):
        entry = {
            "id": self.next_log_id,
            "timestamp": time.strftime("%H:%M:%S", time.localtime()),
            "message": self._plain(payload),
            "type": "business",
            "level": "info",
            "detail": None,
        }
        if isinstance(payload, dict):
            entry.update(
                {
                    "type": payload.get("type", "business"),
                    "level": payload.get("level", "info"),
                    "phase": payload.get("phase"),
                    "requestId": payload.get("requestId"),
                    "message": payload.get("message") or entry["message"],
                    "method": payload.get("method"),
                    "path": payload.get("path"),
                    "status": payload.get("status"),
                    "ok": payload.get("ok"),
                    "ms": payload.get("ms"),
                    "detail": payload.get("detail"),
                }
            )
        self.logs.append(entry)
        self._publish_log_event(entry)
        self.next_log_id += 1
        if len(self.logs) > 500:
            self.logs = self.logs[-500:]

    def _publish_log_event(self, entry: dict):
        alive = []
        for subscriber in self.log_subscribers:
            try:
                subscriber.put_nowait(entry)
                alive.append(subscriber)
            except Exception:
                continue
        self.log_subscribers = alive

    def subscribe_logs(self):
        q = queue.Queue()
        with self.lock:
            self.log_subscribers.append(q)
            snapshot = self.logs[-200:]
        return q, snapshot

    def unsubscribe_logs(self, subscriber):
        with self.lock:
            self.log_subscribers = [
                item for item in self.log_subscribers if item is not subscriber
            ]

    def _publish_event(self, event_type: str, payload: dict):
        with self.lock:
            alive = []
            for subscriber in self.event_subscribers:
                try:
                    subscriber.put_nowait({"type": event_type, "payload": payload})
                    alive.append(subscriber)
                except Exception:
                    pass
            self.event_subscribers = alive

    def subscribe_events(self):
        q = queue.Queue(maxsize=500)
        with self.lock:
            self.event_subscribers.append(q)
            snapshot = self.event_snapshot()
        return q, snapshot

    def unsubscribe_events(self, subscriber):
        with self.lock:
            self.event_subscribers = [
                item for item in self.event_subscribers if item is not subscriber
            ]

    def event_snapshot(self):
        snapshot = {"grabTasks": self.list_grab_tasks()}
        if self.mod.is_authenticated:
            snapshot["tree"] = self.tree_state()
            snapshot["timetable"] = self.fetch_timetable(refresh=False)
        return snapshot

    def _log_renderable(self, renderable):
        with self.lock:
            self._append_log(renderable)

    def _log_debug(self, message: str):
        self._log_renderable({"type": "debug", "level": "debug", "message": message})

    def _log_info(self, message: str):
        self._log_business(message)

    def _log_business(self, message: str, level: str = "info"):
        self._log_renderable({"type": "business", "level": level, "message": message})

    def _log_warn(self, message: str):
        self._log_business(message, level="warn")

    def _log_system(self, message: str, level: str = "info"):
        self._log_renderable({"type": "system", "level": level, "message": message})

    def bootstrap(self):
        with self.lock:
            saved = self.mod.load_saved_credentials()
            authenticated = bool(self.mod.is_authenticated)
            categories = (
                self.fetch_categories(refresh=False) if authenticated else {"items": []}
            )
            timetable = self.fetch_timetable(refresh=False) if authenticated else None
            tree = self.tree_state() if authenticated else {"items": []}
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
                "tree": tree,
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
                self._log_business(
                    f"登录失败 {self.mod.mask_student_number(student_number)}",
                    level="error",
                )
                return {"ok": False, "message": "登录失败"}
            if save_credentials:
                self.mod.save_credentials(student_number, password)
                self._log_info("凭据已保存")
            categories = self.fetch_categories(refresh=True)
            timetable = self.fetch_timetable(refresh=True)
            tree = self.tree_state()
            self._log_info(
                f"登录成功 {self.mod.mask_student_number(student_number)}，已加载 {len(categories.get('items', []))} 个课程大类"
            )
            return {
                "ok": True,
                "message": "登录成功",
                "categories": categories,
                "tree": tree,
                "timetable": timetable,
            }

    def test_addresses(self, payload: dict):
        addresses = payload.get("addresses") or []
        self._log_info(f"开始教务地址测速: {len(addresses)} 个地址")
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
        ok_count = sum(1 for item in results if item.get("ok"))
        level = "info" if ok_count else "warn"
        self._log_business(
            f"教务地址测速完成: {ok_count}/{len(results)} 可达", level=level
        )
        return {"items": results}

    def update_settings(self, payload: dict):
        with self.lock:
            if "disableSslVerify" in payload:
                self.disable_ssl_verify = bool(payload.get("disableSslVerify"))
                self.mod.sess.verify = not self.disable_ssl_verify
                self._log_info(
                    f"SSL 验证设置: {'禁用' if self.disable_ssl_verify else '启用'}"
                )
            return {"ok": True, "disableSslVerify": self.disable_ssl_verify}

    def fetch_categories(self, refresh: bool = False):
        with self.lock:
            self._require_auth()
            if refresh or not self.big_list_cache:
                self._log_info(
                    "刷新课程大类列表" if refresh else "课程大类缓存未命中，开始加载"
                )
                self.big_list_cache = self.mod.fetch_big_list(
                    self._log_renderable, self._log_debug
                )
                self.course_info_cache = {}
                self.course_page_state = {}
                self.default_course_ids = {}
                self.course_search_cache = {}
                self.class_cache = {}
                self.timetable_cache = None
                self.academic_status_cache = None
                self._log_info(f"课程大类列表已加载: {len(self.big_list_cache)} 个")
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

    def _course_result_item(
        self, category_id: int, kch_id: str, course_info_list: list
    ):
        first = course_info_list[0] if course_info_list else {}
        credit_text = self.mod.get_course_credit_text(course_info_list)
        return {
            "categoryId": category_id,
            "courseNo": kch_id,
            "kchId": kch_id,
            "courseName": first.get("kcmc", kch_id),
            "creditText": credit_text,
            "creditValue": self._to_float_or_none(credit_text),
            "classCount": len(course_info_list),
        }

    def _merge_course_info(self, category_id: int, kch_id: str, course_info_list: list):
        course_bucket = self.course_info_cache.setdefault(category_id, {})
        existing = course_bucket.get(kch_id, [])
        merged_by_jxb_id = {
            self._course_item_key(item, index, "existing"): item
            for index, item in enumerate(existing)
        }
        for index, item in enumerate(course_info_list):
            merged_by_jxb_id[self._course_item_key(item, index, "new")] = item
        merged = list(merged_by_jxb_id.values())
        course_bucket[kch_id] = merged
        return merged

    def _query_courses(
        self,
        category_id: int,
        page: int,
        filters: dict | None,
        log_prefix: str,
        page_state: dict | None = None,
        record_default: bool = False,
    ):
        target = self._get_target(category_id)
        filter_key, normalized_filters = self._filter_key(filters or {})
        self._log_info(f"{log_prefix}: {target[0]} 第 {page} 页")
        result = self.mod.fetch_small_list(
            target,
            self._log_renderable,
            self._log_debug,
            page,
            remote_filters=normalized_filters,
        )
        items = []
        course_ids = []
        for kch_id, course_info_list in result.get("courses", {}).items():
            merged = self._merge_course_info(category_id, kch_id, course_info_list)
            course_ids.append(kch_id)
            items.append(self._course_result_item(category_id, kch_id, merged))
        if record_default:
            default_ids = self.default_course_ids.setdefault(category_id, [])
            for kch_id in course_ids:
                if kch_id not in default_ids:
                    default_ids.append(kch_id)
        if page_state is not None:
            if page not in page_state["loadedPages"]:
                page_state["loadedPages"].append(page)
            page_state["hasMore"] = result.get("has_more", False)
            page_state["nextPage"] = result.get("next_page", page + 1)
        self._log_info(
            f"{log_prefix}完成: {target[0]} 第 {result.get('page', page)} 页，{len(items)} 门课程"
        )
        return {
            "categoryId": category_id,
            "page": result.get("page", page),
            "count": result.get("count", 0),
            "hasMore": result.get("has_more", False),
            "nextPage": result.get("next_page", page + 1),
            "filterKey": filter_key,
            "courseIds": course_ids,
            "courses": items,
        }

    def fetch_courses(self, category_id: int, page: int):
        with self.lock:
            self._require_auth()
            target = self._get_target(category_id)
            page_state = self.course_page_state.setdefault(
                category_id, {"loadedPages": [], "hasMore": True, "nextPage": 1}
            )
            return self._query_courses(
                category_id,
                page,
                {"majorIds": [target[4]]} if target[4] else {},
                "加载默认课程分页",
                page_state,
                record_default=True,
            )

    def _filter_key(self, filters: dict):
        list_fields = [
            "collegeIds",
            "majorIds",
            "teachingCollegeIds",
            "gradeIds",
            "courseCategoryIds",
            "courseNatureIds",
            "courseOwnershipIds",
            "teachingModeIds",
            "weekdayIds",
            "periodIds",
            "credits",
            "classNames",
            "recommended",
            "hasCapacity",
            "timeConflict",
            "retake",
        ]
        normalized: dict = {
            "keyword": str(filters.get("keyword") or "").strip(),
        }
        for field in list_fields:
            normalized[field] = [
                str(item).strip()
                for item in filters.get(field) or []
                if str(item).strip()
            ]
        return json.dumps(normalized, ensure_ascii=False, sort_keys=True), normalized

    def search_courses(self, category_id: int, page: int, filters: dict):
        with self.lock:
            self._require_auth()
            filter_key, normalized_filters = self._filter_key(filters or {})
            cache_key = (category_id, filter_key)
            search_bucket = self.course_search_cache.setdefault(
                cache_key,
                {"loadedPages": [], "hasMore": True, "nextPage": 1},
            )
            return self._query_courses(
                category_id, page, normalized_filters, "远程搜索课程", search_bucket
            )

    def fetch_filter_options(
        self,
        option_type: str,
        page: int = 1,
        query: str = "",
        parent: dict | None = None,
    ):
        with self.lock:
            self._require_auth()
            extra = {}
            if option_type == "major" and parent and parent.get("collegeId"):
                extra["jg_id_list[0]"] = str(parent["collegeId"])
            self._log_debug(f"加载筛选选项: {option_type} 第 {page} 页")
            data = self.mod.fetch_filter_options(
                option_type, page=page, query=query, extra=extra
            )
            items = data.get("items") if isinstance(data, dict) else []
            normalized_items = [
                self._normalize_filter_option(option_type, item) for item in items or []
            ]
            if query and normalized_items:
                needle = query.lower()
                normalized_items = [
                    item
                    for item in normalized_items
                    if needle in item["label"].lower()
                    or needle in item["value"].lower()
                ]
            return {
                "type": option_type,
                "page": page,
                "hasMore": bool(items) and len(items) >= 20,
                "items": normalized_items,
            }

    def _normalize_filter_option(self, option_type: str, item: dict):
        mappings = {
            "college": ("jg_id", "jgmc"),
            "major": ("zyh_id", "zymc"),
            "teachingCollege": ("jg_id", "jgmc"),
            "courseCategory": ("kclbdm", "kclbmc"),
            "courseNature": ("dm", "mc"),
            "courseOwnership": ("kcgsdm", "kcgsmc"),
            "teachingMode": ("dm", "mc"),
            "weekday": ("dm", "mc"),
            "period": ("dm", "dm"),
        }
        key_field, text_field = mappings.get(option_type, ("key", "text"))
        value = str(item.get(key_field) or "")
        label = str(item.get(text_field) or value)
        display_label = label
        if option_type == "major":
            display_label = str(item.get("zymc1") or item.get("zyjc") or label)
        return {
            "value": value,
            "label": label,
            "displayLabel": display_label,
            "raw": item,
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
                items.append(
                    {
                        **category,
                        # Frontend tabs own their query filters; on reload we only
                        # restore category metadata and let each tab fetch courses
                        # again when the user expands a category.
                        "coursesLoaded": False,
                        "hasMore": True,
                        "nextPage": 1,
                        "loadedPages": [],
                        "courses": [],
                    }
                )
            return {"items": items, "updatedAt": time.time()}

    def fetch_classes(self, category_id: int, kch_id: str, refresh: bool = False):
        with self.lock:
            self._require_auth()
            if refresh:
                self.class_cache.pop((category_id, kch_id), None)
                self._log_info(f"刷新教学班详情: {kch_id}")
            else:
                self._log_info(f"加载教学班详情: {kch_id}")
            self._ensure_course_info(category_id, kch_id)
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
            self._log_info(
                f"教学班详情加载完成: {course_name}，{len(final_data)} 个教学班"
            )
            return {
                "categoryId": category_id,
                "kchId": kch_id,
                "courseName": course_name,
                "classes": [
                    self._normalize_class(index, course_name, clz, detail)
                    for index, (clz, detail) in enumerate(final_data, start=1)
                ],
            }

    def _ensure_course_info(self, category_id: int, kch_id: str):
        course_bucket = self.course_info_cache.setdefault(category_id, {})
        if course_bucket.get(kch_id):
            return
        self._log_debug(f"课程基础信息缓存未命中: category={category_id} kch={kch_id}")
        target = self._get_target(category_id)
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
        if not class_list_req:
            self._log_warn(f"课程基础信息为空: category={category_id} kch={kch_id}")
            return
        course_bucket[kch_id] = class_list_req

    def load_all_courses(self, category_id: int):
        with self.lock:
            page = self.course_page_state.get(category_id, {}).get("nextPage", 1)
            if self.course_info_cache.get(
                category_id
            ) and not self.course_page_state.get(category_id, {}).get("hasMore", False):
                self._log_debug(f"课程大类已完整加载: category={category_id}")
                return self.tree_state()
            self._log_info(f"开始加载大类全部课程: category={category_id}")
            while True:
                result = self.fetch_courses(category_id, page)
                if not result.get("hasMore"):
                    count = len(self.course_info_cache.get(category_id, {}))
                    self._log_info(
                        f"大类全部课程加载完成: category={category_id}，{count} 门课程"
                    )
                    return self.tree_state()
                page = result.get("nextPage", page + 1)

    def fetch_timetable(self, refresh: bool = False):
        with self.lock:
            self._require_auth()
            if not refresh and self.timetable_cache is not None:
                self._log_debug("课表缓存命中")
                return self.timetable_cache
            self._log_info("刷新已选课程" if refresh else "课表缓存未命中，开始加载")
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
            self.timetable_cache = {
                "entries": entries,
                "selectedCourseIds": sorted(selected_course_ids),
                "selectedClassIds": sorted(selected_class_ids),
                "selectedDoJxbIds": sorted(selected_do_jxb_ids),
                "maxCredit": max_credit,
                "currentCredit": current_credit,
            }
            self._log_info(
                f"已选课程加载完成: {len(entries)} 门，学分 {current_credit:.1f}/{max_credit:.1f}"
            )
            return self.timetable_cache

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
                nodes = data.get("nodes") or []
                self._log_info(f"学业情况加载完成: {len(nodes)} 个根节点")
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
            self._log_info(f"提交选课: {course_name or kch_id} / {do_jxb_id or '-'}")
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
            return self._response_with_timetable(
                res, action="选课", subject=course_name or kch_id
            )

    def withdraw_class(self, payload: dict):
        with self.lock:
            self._require_auth()
            kch_id = str(payload.get("kchId", ""))
            do_jxb_id = str(payload.get("doJxbId", ""))
            self._log_info(f"提交退课: {kch_id or '-'} / {do_jxb_id or '-'}")
            res = self.mod.execute_withdraw(do_jxb_id, kch_id, self._log_debug)
            return self._response_with_timetable(res, action="退课", subject=kch_id)

    def _response_with_timetable(self, res, action: str = "操作", subject: str = ""):
        if res is None:
            self._log_business(
                f"{action}失败: {subject or '-'} / 请求失败", level="error"
            )
            return {
                "ok": False,
                "message": "请求失败",
                "payload": {"error": "请求失败"},
                "timetable": self.fetch_timetable(refresh=True),
            }
        try:
            payload = res.json()
        except Exception:
            payload = {"raw": res.text}
        ok, message = self._parse_operation_result(payload, res)
        if ok:
            self._log_info(f"{action}成功: {subject or '-'}")
        else:
            self._log_business(
                f"{action}失败: {subject or '-'} / {message}", level="warn"
            )
        return {
            "ok": ok,
            "message": message,
            "payload": payload,
            "timetable": self.fetch_timetable(refresh=True),
        }

    def _parse_operation_result(self, payload, res):
        if isinstance(payload, dict):
            flag = str(payload.get("flag", "")).strip()
            message = str(
                payload.get("msg") or payload.get("message") or payload.get("raw") or ""
            ).strip()
            if flag == "1":
                return True, message or "操作成功"
            if flag == "3":
                return True, message or "操作成功"
            if flag:
                return False, message or f"操作失败(flag={flag})"
        if res.ok:
            return True, "操作成功"
        return False, f"HTTP {res.status_code}"

    def get_logs(self, since: int):
        with self.lock:
            items = [item for item in self.logs if item["id"] > since]
            if since <= 0 and not items:
                items = self.logs[-200:]
            return {"items": items}

    def clear_logs(self):
        with self.lock:
            self.logs = []
            self.next_log_id = 1
            self._log_info("日志已清空")
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
        teacher_jgh_id = self.mod.parse_teacher_jgh_id(
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
            "teacherJghId": teacher_jgh_id,
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

    def _course_item_key(self, item: dict, index: int, prefix: str):
        return str(
            item.get("jxb_id")
            or item.get("do_jxb_id")
            or item.get("jxbh")
            or item.get("jxbmc")
            or f"{prefix}:{index}"
        )
